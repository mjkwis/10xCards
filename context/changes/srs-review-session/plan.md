# SRS Review Session Implementation Plan

## Overview

Implements roadmap slice S-06 / PRD FR-009: a study session where the user's flashcards are presented in an order driven by a spaced-repetition scheduling algorithm (not chronological or random), and each answer feeds the schedule for future reviews. This was the one hard-blocked roadmap item pending a library/algorithm choice; that choice is resolved as part of this plan (see "Key Discoveries").

## Current State Analysis

- `public.flashcards` (`supabase/migrations/20260913091216_create_flashcards_table.sql`) has no scheduling columns — `id, user_id, front, back, source, created_at, updated_at` only.
- `src/types.ts` has no review/SRS types; `Flashcard` is derived directly from the generated `Database["public"]["Tables"]["flashcards"]["Row"]` type.
- All flashcard DB logic lives inline in API route handlers (`src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`) — there is no `src/lib/services/flashcards.ts`. The only precedent for a dedicated service module is `src/lib/services/openrouter.ts` (non-trivial external-facing logic gets its own service; simple CRUD stays inline).
- `src/pages/dashboard.astro` SSR-fetches the full flashcard list and passes it to the `FlashcardsDashboard` React island (`client:load`). Auth/session comes from `context.locals.user`, set in `src/middleware.ts`, which redirects unauthenticated visitors away from routes in `PROTECTED_ROUTES` (currently `["/dashboard"]`).
- Every mutation route double-checks ownership with `.eq("user_id", context.locals.user.id)` even though RLS (owner-scoped `using`/`with check` on all 4 operations) already enforces it — established defense-in-depth pattern to follow.
- 404 detection convention: Postgres `PGRST116` on `.single()`, or `data.length === 0` after `.select()` on delete/update.
- Validation is layered redundantly: DB check constraints + server-side zod schema + client `maxLength`/type constraints. New SRS fields should follow the same layering where applicable (DB constraint + zod).
- No test suite is configured in this repo (per `CLAUDE.md`) — automated verification for this plan is limited to typecheck/lint/build; behavioral checks are manual.

## Desired End State

A logged-in user can navigate to a protected `/review` page, see flashcards that are currently due (or, for cards never reviewed, immediately due by default), reveal each answer, grade their recall on a 4-point scale (Again/Hard/Good/Easy), and have that grade update the card's schedule via `ts-fsrs`. The dashboard surfaces a due-count and an entry point into the session. When no cards are due, the page says so instead of showing an empty list silently.

Verification: log in, land on `/dashboard`, see "N due" and a "Start review" link, click through to `/review`, grade every due card, land on a "nothing due" completion state, and confirm (via a second visit or a fresh `GET /api/flashcards/due`) that just-graded cards no longer appear until their new `due_at`.

### Key Discoveries

- **SRS library decision (resolves the roadmap hard blocker):** `ts-fsrs` — TypeScript implementation of FSRS, the algorithm Anki ships as its modern default. Chosen over `supermemo` (SM-2): both are edge-safe with minimal/no dependencies, but `ts-fsrs` is more actively maintained and its native 4-point Again/Hard/Good/Easy rating is a better UX fit than SM-2's 6-point 0-5 grade. It ships with zero runtime dependencies (verified via package metadata) and no Node-core or filesystem access — safe in the Cloudflare Workers (`workerd`) runtime this app deploys to.
- **New-card defaults must mirror the library's own "empty card" shape.** `ts-fsrs`'s `createEmptyCard()` produces `{ due: now, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0 (New), last_review: undefined }`. The new migration's column defaults must match this exactly, or the first scheduling calculation for a brand-new card will diverge from what the library assumes.
- **Editing must not touch scheduling.** `PATCH /api/flashcards/[id]` (`src/pages/api/flashcards/[id].ts`) only ever sets `front`, `back`, `source` — it must keep doing exactly that. Nothing in this plan changes that handler.
- **No `db:types` script exists** (`package.json` has no such entry) — regenerating `src/db/database.types.ts` after the migration is a manual step (`npx supabase gen types typescript --local`), not a scripted one.

## What We're NOT Doing

- No separate review-history/log table — only current scheduling state is persisted on `flashcards` itself. FR-009 requires scheduling, not analytics or review history.
- No same-session re-queuing of a card graded "Again." Once a card is graded, it is removed from the current session's queue regardless of how soon `ts-fsrs` sets its new `due_at`; it reappears on a future visit. Avoids re-polling the due-list mid-session and keeps the queue static and simple.
- No per-session or per-day review cap — a session shows every currently-due card, however many that is.
- No changes to `POST /api/flashcards` or `PATCH /api/flashcards/[id]` insert/update logic — new columns rely entirely on DB-level defaults, so existing insert/update payloads are untouched.
- No optimistic-concurrency/locking on grading — consistent with the rest of the app, which has none.
- No custom-built scheduling algorithm — FR-009 and the PRD's Non-Goals explicitly call for integrating a ready-made algorithm, not building one.

## Implementation Approach

Extend the existing `flashcards` table in place with FSRS scheduling columns (all with DB defaults matching `createEmptyCard()`), add a small `src/lib/services/srs.ts` wrapper around `ts-fsrs` to keep the scheduling math isolated and testable, expose it through two new API routes (`GET /api/flashcards/due`, `POST /api/flashcards/[id]/review`) that follow the existing auth → zod → owner-scoped-query → typed-response conventions, and build a new protected `/review` page + React island reusing the existing `Button`/`ServerError` components and fetch/zod/AbortController pattern from `src/lib/flashcards.ts`.

## Phase 1: Data model & scheduling service

### Overview

Add the FSRS scheduling columns to `flashcards`, install `ts-fsrs`, and wrap it in a small service module that translates between DB rows and the library's `Card` shape.

### Changes Required:

#### 1. Migration — add SRS columns

**File**: `supabase/migrations/20260914120000_add_srs_fields_to_flashcards.sql`

**Intent**: Add the per-card FSRS scheduling state directly to `public.flashcards`, defaulted so every existing row (and every future insert) starts as an immediately-due "New" card — matching `ts-fsrs`'s `createEmptyCard()` output exactly.

**Contract**: New columns, all `not null` with defaults except the nullable last-reviewed timestamp:
- `due_at timestamptz not null default now()`
- `stability double precision not null default 0`
- `difficulty double precision not null default 0`
- `elapsed_days integer not null default 0`
- `scheduled_days integer not null default 0`
- `reps integer not null default 0`
- `lapses integer not null default 0`
- `state smallint not null default 0` (0=New, 1=Learning, 2=Review, 3=Relearning)
- `last_reviewed_at timestamptz` (nullable, no default)
- Add `create index flashcards_due_idx on public.flashcards (user_id, due_at);` to support the due-list query.
- No RLS policy changes — existing owner-scoped policies (`using`/`with check` on `auth.uid() = user_id`) already cover all columns on the row.

#### 2. Regenerate generated types

**File**: `src/db/database.types.ts`

**Intent**: Reflect the new columns so `Flashcard` (derived from `Database["public"]["Tables"]["flashcards"]["Row"]`) picks them up automatically.

**Contract**: Run `npx supabase gen types typescript --local > src/db/database.types.ts` (or the project's equivalent local/remote generation command) after the migration is applied locally. No manual edits to this file.

#### 3. Add `ts-fsrs` dependency

**File**: `package.json`

**Intent**: Bring in the chosen scheduling library.

**Contract**: `npm install ts-fsrs` (latest `5.x`). No other dependency or script changes.

#### 4. SRS types

**File**: `src/types.ts`

**Intent**: Add the review-facing types other layers depend on, following the existing `Command`/`Dto` naming split.

**Contract**:
- `export type FlashcardRating = 1 | 2 | 3 | 4;` with a co-located label map (`Again`/`Hard`/`Good`/`Easy`) for reuse by both the API validator and the UI buttons.
- `export interface ReviewFlashcardCommand { rating: FlashcardRating }`
- `Flashcard` continues to be derived from the (now-extended) generated `Row` type — no manual widening needed there.
- **`flashcardSchema` in `src/lib/flashcards.ts` must also gain the 9 new columns.** This is a separate hand-written zod schema (not derived from `Flashcard`), and `z.object()` strips unknown keys by default — without this update, `saveFlashcard`/`updateFlashcard` (typed `Promise<Flashcard>`) would return a value silently missing the new SRS fields.

#### 5. Scheduling service

**File**: `src/lib/services/srs.ts`

**Intent**: Isolate all `ts-fsrs` usage behind two functions so route handlers never touch the library directly — mirrors the precedent set by `src/lib/services/openrouter.ts` for non-trivial logic getting its own service module.

**Contract**: Export `scheduleReview(current: FlashcardSrsFields, rating: FlashcardRating, now: Date): FlashcardSrsFields`, where `FlashcardSrsFields` is the subset of `Flashcard` covering the 9 new columns. Internally: construct a `ts-fsrs` `Card` from `current` (mapping `state` to the library's `State` enum, `due`/`last_review` to `Date`s), call `fsrs(generatorParameters()).next(card, now, rating)`, and map the returned `Card` back to the same field shape for a direct Supabase `.update(...)`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or equivalent local migrate command)
- Type checking passes: `npx astro check` (uses the already-installed `@astrojs/check`; `npm run build` alone does not type-check — it transpiles via esbuild without surfacing type errors)
- Build succeeds: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Inspect the local Supabase table (Studio or `psql`) after migration: existing rows now have `due_at` = their migration-time timestamp (effectively "now"), `state = 0`, all other new columns at their defaults
- `src/db/database.types.ts` contains the 9 new columns after regeneration
- `flashcardSchema` in `src/lib/flashcards.ts` lists all 9 new SRS columns alongside the original 7

---

## Phase 2: API endpoints

### Overview

Expose the due queue and the grading action as two new routes, following the codebase's existing auth/zod/ownership conventions.

### Changes Required:

#### 1. Due-cards endpoint

**File**: `src/pages/api/flashcards/due.ts`

**Intent**: Return the current user's due cards (own new route rather than overloading `GET /api/flashcards`, which returns the unfiltered full list for the dashboard).

**Contract**: `GET` only. Auth-check → `createClient` null-check (502 pattern) → query `flashcards` where `user_id = locals.user.id` and `due_at <= now()`, `.order("due_at", { ascending: true }).order("id", { ascending: true })` → `Response.json(data, { status: 200 })`. Response shape is `Flashcard[]`, same as the existing list endpoint — no new DTO needed.

#### 2. Grade-review endpoint

**File**: `src/pages/api/flashcards/[id]/review.ts`

**Intent**: Apply one graded review to one card and persist the resulting schedule.

Note: the existing `set_updated_at` trigger fires unconditionally on any `UPDATE`, so grading a card also bumps `updated_at` — broadening its meaning from "content last edited" to "content last edited OR last reviewed." No current feature reads `updated_at` for display/sort, so this is an accepted side effect, not a bug to fix.

**Contract**: `POST` only, nested under the existing `[id]` dynamic segment (Astro file-based routing: `src/pages/api/flashcards/[id]/review.ts`). Auth-check → validate `id` as UUID → validate body against `z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })` (400 on failure) → fetch the current row scoped to `id` + `user_id` (404 via `PGRST116`, same as `PATCH [id].ts`) → call `scheduleReview` from `src/lib/services/srs.ts` with the current SRS fields, the validated rating, and `new Date()` → `.update(...)` the 9 fields scoped to `id` + `user_id` → return the updated `Flashcard` row (200), 404 if the scoped update matches zero rows.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl`/REST client against a logged-in session: `GET /api/flashcards/due` returns only cards with `due_at <= now`, ordered ascending
- `POST /api/flashcards/{id}/review` with `{"rating": 3}` on a due card returns 200 with an updated `due_at` in the future and `reps` incremented; the same card no longer appears in a subsequent `GET /api/flashcards/due` call
- `POST` with an invalid rating (e.g. `{"rating": 5}`) returns 400
- `POST` against another user's card id, or a nonexistent id, returns 404
- `PATCH /api/flashcards/[id]` (existing edit endpoint) on a card still only changes `front`/`back`/`source` — confirm scheduling fields are untouched after an edit

---

## Phase 3: Review session UI

### Overview

Add the protected `/review` page, the session/grading React island, and a dashboard entry point.

### Changes Required:

#### 1. Protect the new route

**File**: `src/middleware.ts`

**Intent**: `/review` requires auth, same as `/dashboard`.

**Contract**: Add `"/review"` to `PROTECTED_ROUTES`.

#### 2. Review page

**File**: `src/pages/review.astro`

**Intent**: SSR-fetch the due queue (same pattern as `dashboard.astro`'s SSR flashcard fetch) and hand it to a client-hydrated review island.

**Contract**: Mirror `dashboard.astro`'s `createClient` + null/error handling, querying the same due-filter as `GET /api/flashcards/due` (or fetching that endpoint directly — implementer's call, consistent with how `dashboard.astro` currently queries Supabase directly rather than calling its own API). Renders `<ReviewSession initialDueCards={...} initialError={...} client:load />` inside the existing `Layout`.

#### 3. Review session island

**File**: `src/components/flashcards/ReviewSession.tsx`

**Intent**: Own the session queue: track remaining due cards client-side, show one at a time, submit grades, and remove graded cards from the local queue without re-fetching (per "What We're NOT Doing" — no same-session re-queuing).

**Contract**: State: `queue: Flashcard[]`, `error`. On grade success, `POST /api/flashcards/{id}/review`, then splice the graded card out of `queue` locally. Renders `ReviewCard` for `queue[0]` when non-empty, an empty-state message ("Nothing to review right now") when the queue is empty, and a `ServerError` (reusing `src/components/auth/ServerError.tsx`) on fetch/grade failure — same error-banner convention as the rest of the dashboard.

#### 4. Review card component

**File**: `src/components/flashcards/ReviewCard.tsx`

**Intent**: Presentational single-card review UI — front, a reveal action, then the back plus the 4 grading buttons.

**Contract**: Props: `flashcard: Flashcard`, `onGrade(rating: FlashcardRating): void`. Local `revealed` boolean state gates showing `back` and the grading buttons. Grading buttons use the existing `Button` component/variants (e.g. `destructive` for Again, `success` for Easy) for visual consistency with existing Accept/Reject/Delete styling — exact variant-to-rating mapping is an implementer styling call, not a functional one.

#### 5. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Surface a due-count and a link into the new session so the feature is discoverable without a nav overhaul.

**Contract**: Alongside the existing SSR flashcard-list query, run a second lightweight due-count query (`.select("id", { count: "exact", head: true }).lte("due_at", now)`), and render a plain `<a href="/review">Start review session ({dueCount} due)</a>` near the existing "Sign out" button — no new React component required for this link since it's static server-rendered content.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Visiting `/review` while logged out redirects to `/auth/signin`
- Dashboard shows the correct due count and a working "Start review session" link
- On `/review`: due cards appear one at a time, front-only until "Show answer," then back + 4 grading buttons appear
- Grading a card removes it from the current session immediately (no flash of a re-fetched list)
- Grading every due card ends the session on an empty-state message
- Returning to `/dashboard` and back to `/review` after grading shows only newly-due cards (or the empty state if none), confirming persistence across page loads

---

## Testing Strategy

### Unit Tests:

- No test suite is configured in this repo (`CLAUDE.md`); none is being introduced by this plan. If one is added later, `src/lib/services/srs.ts` (pure function, no I/O) is the natural first unit-test target: given a known `FlashcardSrsFields` + rating + fixed `now`, assert the returned `due_at`/`state`/`reps` match `ts-fsrs`'s documented behavior.

### Integration Tests:

- None configured; covered by the manual verification steps per phase.

### Manual Testing Steps:

1. Apply the migration locally, regenerate types, confirm existing flashcards (from prior slices) show up as immediately due.
2. Create a new manual flashcard — confirm it also appears in `GET /api/flashcards/due` immediately (DB defaults apply to inserts with no code changes).
3. Run a full review session end-to-end via the UI as described in Phase 3's manual verification.
4. Grade the same card "Again" repeatedly across multiple separate visits and confirm `due_at` intervals stay short (relearning behavior) versus grading "Good"/"Easy" repeatedly, which should lengthen the interval — sanity-checks that the FSRS mapping is wired correctly in both directions.

## Performance Considerations

Due-list query is indexed (`flashcards_due_idx` on `(user_id, due_at)`); no pagination is needed at MVP scale (`target_scale` is explicitly "small" per `prd.md`).

## Migration Notes

The new columns' defaults make every pre-existing flashcard immediately due the moment the migration runs — this is intentional (there is no prior review history to backfill from), not a bug to guard against.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-06 (`srs-review-session`)
- PRD: `context/foundation/prd.md` FR-009
- Existing edit/delete conventions: `src/pages/api/flashcards/[id].ts`
- Existing service-module precedent: `src/lib/services/openrouter.ts`
- Existing SSR-list + island pattern: `src/pages/dashboard.astro`, `src/components/flashcards/FlashcardsDashboard.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model & scheduling service

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase
- [x] 1.2 Type checking passes (`npx astro check`)
- [x] 1.2b Build succeeds (`npm run build`)
- [x] 1.3 Linting passes (`npm run lint`)

#### Manual

- [ ] 1.4 Existing rows have correct SRS defaults after migration
- [ ] 1.5 `database.types.ts` contains the 9 new columns
- [ ] 1.6 `flashcardSchema` in `src/lib/flashcards.ts` lists all 9 new SRS columns

### Phase 2: API endpoints

#### Automated

- [ ] 2.1 Type checking passes (`npx astro check`)
- [ ] 2.1b Build succeeds (`npm run build`)
- [ ] 2.2 Linting passes (`npm run lint`)

#### Manual

- [ ] 2.3 `GET /api/flashcards/due` returns only due cards, correctly ordered
- [ ] 2.4 `POST /api/flashcards/{id}/review` updates schedule and removes card from due list
- [ ] 2.5 Invalid rating returns 400
- [ ] 2.6 Wrong-owner/nonexistent id returns 404
- [ ] 2.7 Editing a card via `PATCH [id]` leaves SRS fields untouched

### Phase 3: Review session UI

#### Automated

- [ ] 3.1 Type checking passes (`npx astro check`)
- [ ] 3.1b Build succeeds (`npm run build`)
- [ ] 3.2 Linting passes (`npm run lint`)

#### Manual

- [ ] 3.3 `/review` redirects unauthenticated visitors
- [ ] 3.4 Dashboard shows due count and working entry link
- [ ] 3.5 Review session reveal/grade flow works end-to-end
- [ ] 3.6 Grading removes card from current session without re-fetch flash
- [ ] 3.7 Empty-queue completion state displays correctly
- [ ] 3.8 Persistence across page loads confirmed

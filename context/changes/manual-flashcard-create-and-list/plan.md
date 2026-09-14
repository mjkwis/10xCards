# Manual Flashcard Create + List Implementation Plan

## Overview

Implement roadmap slice S-03: a logged-in user can manually create a flashcard (front/back) and see it, alongside every flashcard they've ever created (manual or AI), in a list on `/dashboard`. This closes FR-004 and FR-005. The two capabilities are shipped together because a create action with no visible collection has no standalone user value.

## Current State Analysis

S-02 (AI generation & review) already built more of the foundation than its own scope required:

- `supabase/migrations/20260913091216_create_flashcards_table.sql` — `flashcards` table with owner-scoped RLS (`select`/`insert`/`update`/`delete` all restricted to `auth.uid() = user_id`), `front` (≤200 chars), `back` (≤500 chars), `source` (`manual` | `ai-full` | `ai-edited`), `created_at`/`updated_at` with an auto-update trigger.
- `src/pages/api/flashcards/index.ts` — `POST` only. Auth-checks `context.locals.user`, validates `{ front, back, source }` with zod (same limits as the DB check constraints), inserts via the authenticated Supabase client, returns the inserted row as JSON (201) or an error JSON (401/400/502).
- `src/types.ts` — `Flashcard` type (derived from `Database["public"]["Tables"]["flashcards"]["Row"]`), `FlashcardSource`, `CreateFlashcardCommand` already exist and are reusable as-is.
- `src/pages/dashboard.astro` — renders only `<GenerateReviewIsland client:load />` (the AI paste/generate/review flow). No manual-create UI, no list UI exist anywhere in the app.
- `src/components/flashcards/{GenerateReviewIsland,CandidateCard,GenerationError}.tsx` — the AI review flow. `CandidateCard.saveFlashcard()` POSTs to `/api/flashcards` and discards the response body; `onAccepted()` fires with no arguments once the save succeeds.
- No `GET /api/flashcards` endpoint exists — nothing in the app can currently read back a user's flashcard collection.

### Key Discoveries:

- The `POST /api/flashcards` route, its zod schema, and the RLS policies already satisfy everything manual-create needs — this plan adds a `GET` handler to the same file rather than a new file (`src/pages/api/flashcards/index.ts:1`).
- `CandidateCard`'s `saveFlashcard` (`src/components/flashcards/CandidateCard.tsx:14`) needs its return type changed from `Promise<void>` to the parsed `Flashcard`, and `onAccepted`'s signature needs a `(flashcard: Flashcard) => void` parameter, so an AI-accepted card can be threaded up to the shared list — this is the one contract other phases in this plan depend on.
- `middleware.ts`'s `PROTECTED_ROUTES` only covers `/dashboard`, not `/api/*` — the new `GET` handler must self-check `context.locals.user`, same as the existing `POST` handler already does.
- The dashboard's existing UI convention (glassmorphism cards, `Button` variants, `ServerError`/`GenerationError` for failure states) is well-established and should be reused rather than introduced anew.

## Desired End State

A logged-in user on `/dashboard` sees three sections: AI generate/review (unchanged), a manual "Create flashcard" form, and "Your flashcards" — a list of every flashcard they own, newest first, each showing front/back and a small source badge (Manual / AI). Creating a card manually, or accepting an AI candidate, makes the new card appear at the top of the list immediately, with no page reload. A user with no flashcards yet sees a friendly empty-state message instead of a blank section. If the list fails to load, an inline error with a retry action is shown instead of a blank or broken-looking section.

**Verification**: sign in, confirm the list reflects existing DB rows on load (newest first); create a manual flashcard and confirm it appears at the top instantly and survives a page refresh; accept an AI-generated candidate and confirm it also appears at the top instantly; confirm rejected AI candidates never appear.

## What We're NOT Doing

- Editing or deleting flashcards from the list (S-04, S-05 — separate roadmap slices).
- Pagination, infinite scroll, or any cap on the number of cards returned by `GET /api/flashcards` — fetch-all, matching `target_scale.users: small`.
- SRS/review session (S-06).
- Deduplication of flashcards (explicit PRD non-goal).
- Any change to the AI generation call itself (`/api/flashcards/generate`, `openrouter.ts`) — only the post-accept wiring changes.
- A dedicated route or nav for flashcards — everything lives on the existing `/dashboard`.

## Implementation Approach

Introduce one new parent React island, `FlashcardsDashboard`, that owns the canonical `flashcards: Flashcard[]` state for the page: it fetches the list once on mount via the new `GET /api/flashcards`, and exposes a single "prepend new card" callback that both the manual-create form and the (modified) AI-review flow call after a successful save. `dashboard.astro` renders `FlashcardsDashboard` in place of the current direct `GenerateReviewIsland` usage; `FlashcardsDashboard` in turn renders `GenerateReviewIsland` (passed the prepend callback), a new `ManualCreateForm`, and a new `FlashcardsList`. This keeps `GenerateReviewIsland`/`CandidateCard`'s own responsibilities (candidate state, accept/edit/reject) unchanged except for bubbling the saved row upward instead of discarding it.

## Phase 1: List API & Read-Only List UI

### Overview

Add the ability to read back a user's flashcard collection: the API endpoint, the shared-state shell, and the list display (including empty and error states). AI generation and manual create are untouched in this phase — the list only reflects whatever already exists in the DB.

### Changes Required:

#### 1. `GET /api/flashcards` endpoint

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Let an authenticated user fetch their own flashcards, newest first, so the dashboard can render them.

**Contract**: Add a `GET: APIRoute` export alongside the existing `POST`. Same auth-check pattern as `POST` (401 JSON if `!context.locals.user`), same Supabase-not-configured guard (502 JSON). Query: `supabase.from("flashcards").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })` — the `id` tiebreaker keeps ordering deterministic if two rows share an identical `created_at`; no explicit `user_id` filter needed since RLS's `flashcards_select_own` policy already scopes rows to the authenticated user. On query error, return `{ error: "Failed to load flashcards" }` with 502. On success, return the row array as JSON with 200 (no wrapper object — consistent with `POST`'s bare-row response).

#### 2. `FlashcardsDashboard` shared-state island

**File**: `src/components/flashcards/FlashcardsDashboard.tsx` (new)

**Intent**: Own the single source of truth for "this user's flashcards" so every write path (manual create, AI accept) can update the same list without a reload, and own the initial fetch/loading/error state for the list itself.

**Contract**: A component with no required props beyond what `dashboard.astro` currently passes to `GenerateReviewIsland` (`openRouterConfigured: boolean`). Internal state: `flashcards: Flashcard[]`, `listState: "loading" | "ready" | "error"`, `listError: string`. On mount, `GET /api/flashcards`; parse with a zod array schema of the existing `Flashcard` shape (matching the `generateResponseSchema` validation convention already used in `GenerateReviewIsland`). Exposes a `handleCardSaved(flashcard: Flashcard)` function — passed down to children — that prepends the new row to `flashcards` (no re-sort needed, since prepending to an already newest-first list preserves order). If a card is saved before the mount fetch resolves, the fetch's success handler must not clobber it: merge the fetched rows with any already-prepended cards (e.g. concatenate and de-duplicate by `id`) rather than unconditionally overwriting `flashcards`. Renders, in order: `GenerateReviewIsland` (passing through `openRouterConfigured` only — `onSaved` is not added until Phase 3, since it has nothing real to call until `CandidateCard` returns a saved row), `ManualCreateForm` (passing `onCreated={handleCardSaved}` — a Phase 1 stub per item 4 below; fully implemented in Phase 2), `FlashcardsList` (passing `flashcards`, `listState`, `listError`, and a `onRetry` that re-runs the fetch).

#### 3. `FlashcardsList` presentational component

**File**: `src/components/flashcards/FlashcardsList.tsx` (new)

**Intent**: Render the "Your flashcards" section: the cards themselves, the empty state, the loading state, and the load-error state, all matching existing dashboard visual conventions.

**Contract**: Props: `flashcards: Flashcard[]`, `state: "loading" | "ready" | "error"`, `error: string`, `onRetry: () => void`. When `state === "loading"`, render a simple text placeholder ("Loading your flashcards…") matching the dashboard's existing plain-text style. When `state === "error"`, render the existing `ServerError`/`GenerationError`-style inline banner with a retry button (reuse `GenerationError` or a props-compatible sibling). When `state === "ready"` and `flashcards.length === 0`, render a friendly empty message pointing at the create/generate sections above. Otherwise render each flashcard's `front`/`back` plus a small source badge: map `source === "manual"` → "Manual" label, `"ai-full" | "ai-edited"` → "AI" label (both AI variants collapse to one badge — no PRD requirement to distinguish edited-vs-unedited in the list view). List ordering is exactly what the API returns — no client-side re-sort.

#### 4. `ManualCreateForm` stub

**File**: `src/components/flashcards/ManualCreateForm.tsx` (new)

**Intent**: Reserve the layout slot and prop contract now so Phase 2 only has to fill in behavior, not structure — this lets Phase 1's `FlashcardsDashboard` render its full intended tree (and pass `npm run build`/`npm run lint`) without waiting on Phase 2.

**Contract**: `interface ManualCreateFormProps { onCreated: (flashcard: Flashcard) => void }`. Render a disabled placeholder card ("Create flashcard — coming soon") in the established glassmorphism style. `onCreated` is accepted but intentionally unused at this stage — reference it (e.g. via a disabled button's `onClick={() => onCreated(...)}` that never fires, since the button is disabled) so `@typescript-eslint/no-unused-vars` doesn't flag it. Phase 2 replaces the body with the full form described in Phase 2 item 1; the prop signature does not change.

#### 5. Wire into the dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the direct `GenerateReviewIsland` usage with the new `FlashcardsDashboard` shell so the page gains the list (and, once later phases land, manual create) without changing the page's auth/layout scaffolding.

**Contract**: Swap the `<GenerateReviewIsland openRouterConfigured={...} client:load />` line for `<FlashcardsDashboard openRouterConfigured={...} client:load />`. No other change to the `.astro` file.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro's build runs `astro check`-equivalent type checking via the SSR build)
- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-in user with existing flashcards (from prior S-02 testing) sees them all listed, newest first, on `/dashboard` load
- A fresh account (or one with its flashcards deleted via Supabase Studio) sees the empty-state message instead of a blank section
- Source badges correctly read "Manual" vs "AI" for existing rows of each `source` value
- AI generate/review flow still works exactly as before (this phase doesn't touch its internals)
- The "Create flashcard — coming soon" placeholder renders in its slot between the AI section and the list, and is inert (no working create action yet)

---

## Phase 2: Manual Create

### Overview

Add the "Create flashcard" form and wire it into the shared list state from Phase 1, so a manually created card appears at the top of the list immediately.

### Changes Required:

#### 1. `ManualCreateForm` component

**File**: `src/components/flashcards/ManualCreateForm.tsx` (replaces the Phase 1 stub — same file, same prop signature)

**Intent**: Let the user type a front/back pair and save it as a `source: "manual"` flashcard, giving immediate feedback and staying open for rapid multi-card entry.

**Contract**: Props: `onCreated: (flashcard: Flashcard) => void` (unchanged from the Phase 1 stub). Local state: `front`, `back`, `saveState: "idle" | "saving" | "error"`, `errorMessage`. Enforce the same limits as the DB/API (`front` ≤200 chars, `back` ≤500 chars) via `maxLength` on the inputs, mirroring `CandidateCard`'s textarea pattern. Submit disabled when `front` or `back` is empty, or while `saveState === "saving"`. On submit: `POST /api/flashcards` with `{ front, back, source: "manual" }`; on success, parse the returned row, call `onCreated(flashcard)`, and clear `front`/`back` (form stays rendered/open — no collapse). On failure, show an inline `ServerError` message (matching `CandidateCard`'s "Couldn't save this flashcard. Please try again." convention) and leave the entered text in place so the user can retry without retyping. No change needed in `FlashcardsDashboard.tsx` — it already renders `<ManualCreateForm onCreated={handleCardSaved} />` in its slot since Phase 1.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting a valid front/back creates a flashcard that appears at the top of the list instantly, with a "Manual" badge
- The form clears and stays visible after a successful save, ready for another entry
- Refreshing the page shows the newly created card persisted (confirms it round-tripped through the DB, not just local state)
- Submit is disabled when front or back is empty; typing beyond 200/500 chars is blocked by the input's `maxLength`
- Temporarily forcing a save failure (e.g. sign out in another tab first, or stop the dev Supabase instance) shows the inline error message and leaves the typed text intact

---

## Phase 3: AI-Accept Sync

### Overview

Thread an accepted AI candidate's saved row up through `CandidateCard` → `GenerateReviewIsland` → `FlashcardsDashboard`, so AI-accepted cards also land in the same shared list instantly, without a reload.

### Changes Required:

#### 1. `CandidateCard` returns and forwards the saved row

**File**: `src/components/flashcards/CandidateCard.tsx`

**Intent**: Stop discarding the API response on save — the caller needs the persisted row (with its DB-assigned `id`/`created_at`) to prepend into the shared list.

**Contract**: Change `saveFlashcard`'s return type from `Promise<void>` to `Promise<Flashcard>`, parsing and returning `response.json()` on success instead of just checking `response.ok`. Change `CandidateCardProps.onAccepted` from `() => void` to `(flashcard: Flashcard) => void`, and call it with the saved row in `handleAccept`:

```ts
async function saveFlashcard(front: string, back: string, source: FlashcardSource): Promise<Flashcard> {
  // ...existing fetch...
  if (!response.ok) {
    throw new Error("Failed to save flashcard");
  }
  return response.json();
}
```

#### 2. `GenerateReviewIsland` forwards saves upward

**File**: `src/components/flashcards/GenerateReviewIsland.tsx`

**Intent**: Let the parent (`FlashcardsDashboard`) learn about every accepted card without `GenerateReviewIsland` needing to know about the shared list itself.

**Contract**: Add an `onSaved: (flashcard: Flashcard) => void` prop to `GenerateReviewIslandProps`. Pass it to each `CandidateCard` as `onAccepted={(flashcard) => { onSaved(flashcard); removeCandidate(candidate.id); }}` (preserving the existing removal-from-local-candidates behavior).

#### 3. Wire into `FlashcardsDashboard`

**File**: `src/components/flashcards/FlashcardsDashboard.tsx`

**Intent**: Complete the shared-state loop — both write paths now feed the same list.

**Contract**: Pass `onSaved={handleCardSaved}` to `GenerateReviewIsland` (the prop plumbing was anticipated in Phase 1's component contract; this phase is where `GenerateReviewIsland` actually gains the prop to receive it).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Generating AI candidates and clicking "Accept" on one makes it appear at the top of the list instantly, with an "AI" badge
- Editing a candidate before accepting, then accepting, shows the edited text (not the original) in the list
- Rejecting a candidate never adds anything to the list
- Refreshing the page shows the AI-accepted card persisted
- Full end-to-end regression: manual create + AI accept both still correctly update the same list in the same session, newest-first order preserved across both paths

---

## Testing Strategy

No automated test suite exists in this repo (`CLAUDE.md`: "There is no test suite configured yet"). Verification is via `npm run build` + `npm run lint` (type safety and static checks) plus the manual steps enumerated per phase.

### Manual Testing Steps:

1. Sign in with an account that has existing flashcards from S-02 testing; confirm they all appear, newest first, with correct source badges.
2. Create a manual flashcard; confirm instant list update, persistence after refresh, and form-clears-and-stays-open behavior.
3. Generate AI candidates, accept one, edit-then-accept another, reject a third; confirm only the two accepted ones appear, with correct content and "AI" badges, and the manual card from step 2 is still present above them (newest-first).
4. Test empty state on an account with zero flashcards (or after manually clearing the table for a test user in Supabase Studio).
5. Test the list's error+retry path by simulating a failed `GET` (e.g. briefly revoke the session or point at a misconfigured Supabase client) and confirming the retry button re-fetches successfully once the condition clears.

## Performance Considerations

None beyond what's already noted as explicitly out of scope (pagination) — fetch-all is acceptable at `target_scale.users: small`.

## Migration Notes

No schema changes — the `flashcards` table, RLS policies, and check constraints from S-02's migration are reused unchanged.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- Prior implementation: `context/archive/2026-09-14-ai-flashcard-generation-review/plan.md`
- Existing endpoint: `src/pages/api/flashcards/index.ts:1`
- Existing AI review flow: `src/components/flashcards/GenerateReviewIsland.tsx:1`, `src/components/flashcards/CandidateCard.tsx:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: List API & Read-Only List UI

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — be10b6c
- [x] 1.2 Linting passes: `npm run lint` — be10b6c

#### Manual

- [x] 1.3 Signed-in user with existing flashcards sees them all listed, newest first, on `/dashboard` load — be10b6c
- [x] 1.4 Fresh/empty account sees the empty-state message instead of a blank section — be10b6c
- [x] 1.5 Source badges correctly read "Manual" vs "AI" for existing rows of each `source` value — be10b6c
- [x] 1.6 AI generate/review flow still works exactly as before — be10b6c
- [x] 1.7 The "Create flashcard — coming soon" placeholder renders in its slot and is inert — be10b6c

### Phase 2: Manual Create

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — da38523
- [x] 2.2 Linting passes: `npm run lint` — da38523

#### Manual

- [x] 2.3 Submitting a valid front/back creates a flashcard that appears at the top of the list instantly, with a "Manual" badge — da38523
- [x] 2.4 The form clears and stays visible after a successful save — da38523
- [x] 2.5 Refreshing the page shows the newly created card persisted — da38523
- [x] 2.6 Submit is disabled when front or back is empty; length limits enforced — da38523
- [x] 2.7 A forced save failure shows the inline error message and leaves typed text intact — da38523

### Phase 3: AI-Accept Sync

#### Automated

- [x] 3.1 Type checking passes: `npm run build`
- [x] 3.2 Linting passes: `npm run lint`

#### Manual

- [x] 3.3 Accepting an AI candidate makes it appear at the top of the list instantly, with an "AI" badge
- [x] 3.4 Editing a candidate before accepting shows the edited text in the list
- [x] 3.5 Rejecting a candidate never adds anything to the list
- [x] 3.6 Refreshing the page shows the AI-accepted card persisted
- [x] 3.7 Full end-to-end regression: manual create + AI accept both update the same list, newest-first order preserved

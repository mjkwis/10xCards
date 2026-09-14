# AI Flashcard Generation & Review Implementation Plan

## Overview

Implement the product's north-star flow (roadmap S-02): a logged-in user pastes source text, an LLM (via OpenRouter, using the user's own API key) generates flashcard proposals, and the user accepts, edits, or rejects each one before it lands in their `flashcards` collection.

## Current State Analysis

The codebase has auth (Supabase, working) and a `flashcards` table (`supabase/migrations/20260913091216_create_flashcards_table.sql`) with owner-scoped RLS, but nothing related to AI generation exists yet:

- No LLM/AI SDK dependency in `package.json`, no `zod` dependency either (despite CLAUDE.md's "validate input with zod" convention).
- No `OPENROUTER_*` entries in `astro.config.mjs`'s `env.schema` (only `SUPABASE_URL`/`SUPABASE_KEY`).
- No `/api/flashcards/*` routes — only `/api/auth/*`.
- `src/pages/dashboard.astro` is a placeholder with just a welcome message and sign-out button; no flashcard UI exists at all.
- `src/middleware.ts`'s `PROTECTED_ROUTES` only guards page routes (via redirect-on-missing-user) and does not cover `/api/*` paths.

The roadmap (`context/foundation/roadmap.md`, S-02) explicitly flagged the LLM provider/key-management choice as an open decision to make during this planning session. That decision is now made: **OpenRouter, using a server-side API key the user already holds.**

## Desired End State

A logged-in user can paste up to 5,000 characters of source text on the dashboard, click generate, see an immediate "Generating…" state, and within a few seconds see up to 10 flashcard proposals. For each proposal they can accept it as-is, edit it and accept, or reject it. Accepted cards are written to `flashcards` with the correct `source` (`ai-full` or `ai-edited`); rejected ones are simply discarded client-side. Failures (timeout, OpenRouter error, invalid input) surface as an inline error with a manual retry action, never a blank screen or a raw platform error.

Verify by: pasting real documentation/Stack-Overflow-style text on `/dashboard`, generating, reviewing, and confirming the resulting rows in Supabase's `flashcards` table match what was accepted/edited.

### Key Discoveries:

- `flashcards.source` is already constrained to `'ai-full' | 'ai-edited' | 'manual'` and `front`/`back` already have `char_length` check constraints (200/500) — the generation service must respect these same bounds so accepted rows never violate the DB constraint.
- There is no candidates/proposals table — proposals are meant to live only in UI state until accepted (confirmed with the user; matches what the schema already implies).
- `infrastructure.md`'s risk register already names the exact risk this plan must mitigate: a slow LLM call can trip Cloudflare Workers' subrequest/request timeout and surface as an opaque platform error instead of the PRD-required progress/error UX.
- `src/lib/config-status.ts` + `src/layouts/Layout.astro` already have a working pattern for surfacing missing configuration (Supabase) as an error banner — adding an OpenRouter entry to `configStatuses` is enough to reuse it, no template changes needed.

## What We're NOT Doing

- Persisting AI proposals to the database before review (client-side state only, per decision above).
- Streaming/SSE responses from OpenRouter — a single non-streaming call with a client-side "Generating…" state satisfies the NFR without the added complexity.
- Automatic server-side retry on OpenRouter failure — errors surface immediately with a manual "Try again" action.
- Multi-model fallback chains — a single model, configured via a server secret/env var.
- User-configurable flashcard count or model choice — the model decides how many cards to produce (capped at 10).
- Per-user rate limiting — only a `max_tokens` cap on the LLM response.
- Manual flashcard creation, editing, or deletion of already-saved cards (S-03/S-04/S-05), and the SRS review session (S-06) — separate roadmap slices.
- Deduplication of similar/duplicate flashcards (PRD Non-Goal).

## Implementation Approach

Add a small `src/lib/services/openrouter.ts` service that owns the OpenRouter call, prompt, structured-output request, and zod validation, keeping `src/pages/api/flashcards/generate.ts` thin. Reuse the existing `src/lib/config-status.ts` / `Banner.astro` pattern for missing-config visibility, and the existing auth-forms' visual language (`ServerError.tsx`) for the review UI's error state. The review flow is a single React island on `dashboard.astro` holding candidates in local state; accepting a candidate calls a new minimal `POST /api/flashcards` endpoint that writes one row via the authenticated Supabase client (RLS-enforced).

## Critical Implementation Details

### Timing & lifecycle: two different "timeouts"

The Workers subrequest-timeout risk (`infrastructure.md`) is mitigated in the **service**, not the browser. `src/lib/services/openrouter.ts` must wrap its `fetch` call to OpenRouter in an `AbortController` with an explicit timeout clearly shorter than Cloudflare's platform request limit for the deployed plan (confirm the current exact limit against Cloudflare's docs at implementation time; start from a conservative value such as 20s). If this fires, the service throws a typed error the route maps to a clean JSON error response — this is what actually prevents the "opaque platform error" failure mode, not anything done in the browser. The browser-side fetch (from the React island to `/api/flashcards/generate`) only needs to handle *that* JSON error response and show the inline "Try again" UI; it does not need its own separate abort timeout to satisfy the NFR.

### Auth boundary: API routes are not covered by `PROTECTED_ROUTES`

`src/middleware.ts`'s `PROTECTED_ROUTES` array only guards page routes and responds with a redirect — unsuitable for a JSON API. The new `/api/flashcards/generate` and `/api/flashcards` routes must each check `context.locals.user` themselves and return `401` JSON (not rely on middleware) when absent.

## Phase 1: OpenRouter integration & generate API

### Overview

Add the OpenRouter service, its configuration, and the `POST /api/flashcards/generate` route that turns pasted text into validated flashcard candidates.

### Changes Required:

#### 1. Dependency: zod

**File**: `package.json`

**Intent**: Enable schema validation for API input/output per CLAUDE.md's "validate input with zod" convention — not currently a dependency.

**Contract**: Add `zod` to `dependencies`; run `npm install`.

#### 2. Server config: OpenRouter secrets

**File**: `astro.config.mjs`

**Intent**: Make the OpenRouter API key and model id available server-side, following the exact pattern already used for `SUPABASE_URL`/`SUPABASE_KEY`.

**Contract**: Add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to `env.schema`, both `envField.string({ context: "server", access: "secret", optional: true })`. `OPENROUTER_MODEL` being unset falls back to a hardcoded default model constant in the service (pick a current, cost-effective OpenRouter model — confirm against OpenRouter's live catalog/pricing at implementation time, since model availability changes).

#### 3. Shared types

**File**: `src/types.ts`

**Intent**: Define the request/response contract shared between the API route and the review UI.

**Contract**: Add `GenerateFlashcardsCommand { sourceText: string }`, `FlashcardCandidateDto { front: string; back: string }`, `GenerateFlashcardsResponseDto { candidates: FlashcardCandidateDto[] }`.

#### 4. OpenRouter service

**File**: `src/lib/services/openrouter.ts`

**Intent**: Own the OpenRouter call end-to-end — prompt construction, structured-output request, timeout, and response validation — so the API route stays thin.

**Contract**: Export `generateFlashcardCandidates(sourceText: string): Promise<FlashcardCandidateDto[]>`. Calls OpenRouter's chat completions endpoint with `response_format` set to a JSON-schema structured output (array of `{front, back}`, front ≤200 chars, back ≤500 chars, max 10 items — mirroring the DB check constraints), `max_tokens` capped (e.g. ~2048, sized for up to 10 cards plus JSON overhead), and the `AbortController` timeout described in Critical Implementation Details. Validates the parsed response with a zod schema before returning; throws a typed error (e.g. `GenerationTimeoutError` / `GenerationFailedError`) on timeout, HTTP failure, or schema-invalid response.

#### 5. Generate API route

**File**: `src/pages/api/flashcards/generate.ts`

**Intent**: Validate the pasted text, invoke the service, and return candidates or a clean error — this is the north-star entry point (FR-001).

**Contract**: `POST`, JSON body `{ sourceText: string }`. Explicit `context.locals.user` check → `401` JSON if absent (see Critical Implementation Details). zod-validates `sourceText` is non-empty and ≤5,000 characters → `400` JSON on violation. On success, `200` with `GenerateFlashcardsResponseDto`. On a thrown service error, maps to a `502`/`504`-style JSON `{ error: string }` response — never lets the raw platform error reach the client.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- With a valid `OPENROUTER_API_KEY` in `.dev.vars`, POSTing real source text to `/api/flashcards/generate` returns candidates matching the DTO shape and length bounds.
- Text over 5,000 characters is rejected with `400`.
- An unauthenticated request (no session) returns `401`.
- A deliberately broken config (e.g. invalid `OPENROUTER_MODEL`) results in a clean JSON error response, not an opaque platform/server error.

---

## Phase 2: Review UI & accept persistence

### Overview

Give the user a way to trigger generation and review each candidate, and persist accepted cards.

### Changes Required:

#### 1. Create-flashcard API route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Persist one accepted (or accepted-after-edit) flashcard, respecting the same auth boundary as the generate route.

**Contract**: `POST`, JSON body `{ front: string; back: string; source: FlashcardSource }`. `401` if no `context.locals.user`; zod-validates `front` ≤200, `back` ≤500, `source` in the existing enum → `400` on violation; inserts via the authenticated Supabase client (RLS scopes it to `auth.uid()`) and returns `201` with the created row.

#### 2. Review island

**File**: `src/components/flashcards/GenerateReviewIsland.tsx`

**Intent**: Orchestrate the paste → generate → review → save flow entirely in local component state (candidates are never persisted until accepted, per the client-side-only decision).

**Contract**: Holds `sourceText`, `candidates: (FlashcardCandidateDto & { status: "pending" | "edited" })[]`, and `generationState: "idle" | "generating" | "error"`. Submitting calls `POST /api/flashcards/generate`; the "Generating…" state is set synchronously on submit (not gated on any network round-trip) so it satisfies the ≤200ms-ack / visible-progress-past-2s NFR by construction. On error, renders the reused error-banner treatment (see below) with a manual retry action.

#### 3. Candidate card

**File**: `src/components/flashcards/CandidateCard.tsx`

**Intent**: Render one candidate with accept/edit/reject actions (FR-002).

**Contract**: Accepting an unedited candidate calls `POST /api/flashcards` with `source: "ai-full"`; entering edit mode and saving calls it with `source: "ai-edited"` and the edited text; rejecting removes the candidate from local state with no API call.

#### 4. Error display

**File**: `src/components/flashcards/GenerationError.tsx`

**Intent**: Reuse the existing visual pattern from `src/components/auth/ServerError.tsx` for the generation flow's inline error, plus a retry action it doesn't currently have.

**Contract**: Same alert styling as `ServerError`, plus a "Try again" button that re-triggers the last generation request.

#### 5. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Make the review flow reachable — this is the only authenticated page today, so it hosts the island directly rather than introducing a new route.

**Contract**: Mount `<GenerateReviewIsland client:load />` on the dashboard, alongside (or replacing) the current placeholder content.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Pasting text and generating produces a visible candidate list.
- Accepting an unedited candidate creates a `flashcards` row with `source = 'ai-full'`.
- Editing then accepting a candidate creates a row with `source = 'ai-edited'` and the edited content.
- Rejecting a candidate removes it from the list and creates no row.
- Refreshing mid-review clears unreviewed candidates (expected, per the client-state-only decision) without leaving any partial/orphaned data in the database.

---

## Phase 3: Guardrails, config wiring & manual verification

### Overview

Make missing OpenRouter configuration visible the same way missing Supabase configuration already is, and verify the NFR/timeout behavior end-to-end.

### Changes Required:

#### 1. Config status

**File**: `src/lib/config-status.ts`

**Intent**: Surface an unconfigured `OPENROUTER_API_KEY` the same way Supabase is surfaced today, reusing the existing `Layout.astro`/`Banner.astro` wiring with no template changes needed.

**Contract**: Add an `"OpenRouter"` entry to `configStatuses`, `configured: Boolean(OPENROUTER_API_KEY)`.

#### 2. Local env documentation

**File**: `.env.example` (and/or `.dev.vars` guidance, matching CLAUDE.md's existing Node/Cloudflare split)

**Intent**: Document the new secret so local setup matches the existing `SUPABASE_URL`/`SUPABASE_KEY` pattern.

**Contract**: Add `OPENROUTER_API_KEY=` (and `OPENROUTER_MODEL=` if set) with a short comment pointing to where to obtain a key.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- CI workflow passes on push (`.github/workflows/ci.yml`: `astro sync`, lint, build)

#### Manual Verification:

- With `OPENROUTER_API_KEY` unset, the dashboard shows an error banner for OpenRouter (mirroring the existing Supabase one).
- Submitting a generation request shows the "Generating…" state effectively instantly, and it remains visible (not a blank screen) if the call runs past ~2s.
- With a deliberately slow/broken OpenRouter response (e.g. wrong model id), the app shows the inline error + "Try again" UI rather than a raw platform error.
- `wrangler secret put OPENROUTER_API_KEY` is run before the first production deploy that relies on this feature (mirrors the existing Supabase secrets flow in `infrastructure.md`).

---

## Testing Strategy

### Unit Tests:

No test suite is configured yet in this repo (per CLAUDE.md) — not introducing one is out of scope for this plan; verification here is manual + lint/build.

### Integration Tests:

None automated (no test runner configured); covered by the manual end-to-end steps per phase.

### Manual Testing Steps:

1. Paste a real ~1,000-word documentation excerpt on `/dashboard`, generate, and review the resulting candidates for plausibility.
2. Accept one candidate unedited, edit-and-accept another, and reject a third; confirm the `flashcards` table in Supabase matches exactly.
3. Attempt to submit >5,000 characters and confirm the UI blocks/the API rejects it.
4. Temporarily break the OpenRouter config (bad key or model id) and confirm the error/retry UX, not a raw platform error.
5. Unset `OPENROUTER_API_KEY` entirely and confirm the dashboard shows the missing-config banner instead of a crash.

## Performance Considerations

`max_tokens` is capped on the OpenRouter request to bound cost and latency per call. The explicit service-side timeout (Critical Implementation Details) is the primary latency guardrail against Cloudflare Workers' subrequest limit.

## Migration Notes

No schema changes — the existing `flashcards` migration already supports this flow (`source` enum, `front`/`back` length constraints).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (US-01, FR-001–FR-003)
- Infra risk register: `context/foundation/infrastructure.md` (LLM subrequest timeout risk)
- Existing schema: `supabase/migrations/20260913091216_create_flashcards_table.sql`
- Config-status pattern: `src/lib/config-status.ts:1`, `src/layouts/Layout.astro:23`
- Auth API route pattern: `src/pages/api/auth/signin.ts:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: OpenRouter integration & generate API

#### Automated

- [ ] 1.1 Linting passes: `npm run lint`
- [ ] 1.2 Build passes: `npm run build`

#### Manual

- [ ] 1.3 Valid source text returns candidates matching DTO shape and length bounds
- [ ] 1.4 Text over 5,000 characters is rejected with 400
- [ ] 1.5 Unauthenticated request returns 401
- [ ] 1.6 Broken config results in a clean JSON error, not an opaque platform error

### Phase 2: Review UI & accept persistence

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`

#### Manual

- [ ] 2.3 Generating produces a visible candidate list
- [ ] 2.4 Accepting an unedited candidate creates a row with source = 'ai-full'
- [ ] 2.5 Editing then accepting creates a row with source = 'ai-edited' and edited content
- [ ] 2.6 Rejecting removes the candidate and creates no row
- [ ] 2.7 Refresh mid-review clears unreviewed candidates with no orphaned data

### Phase 3: Guardrails, config wiring & manual verification

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 CI workflow passes on push

#### Manual

- [ ] 3.4 Missing OPENROUTER_API_KEY shows an error banner on the dashboard
- [ ] 3.5 "Generating…" state appears effectively instantly and persists past ~2s without a blank screen
- [ ] 3.6 Broken OpenRouter response shows inline error + "Try again", not a raw platform error
- [ ] 3.7 `wrangler secret put OPENROUTER_API_KEY` run before first relevant production deploy

# Edit Existing Flashcard Implementation Plan

## Overview

Add the ability to edit an already-saved flashcard from the dashboard list, satisfying FR-006 (roadmap slice S-04). Users click Edit on a card in `FlashcardsList`, the card switches in place to an editable form, and Save persists the change via a new `PATCH /api/flashcards/[id]` endpoint.

## Current State Analysis

- `flashcards` table, RLS policies, and the `updated_at` trigger already exist (`supabase/migrations/20260913091216_create_flashcards_table.sql`) — including an owner-scoped `update` policy that has been unused since it was created alongside S-02.
- `src/pages/api/flashcards/index.ts` exposes `GET` (list) and `POST` (create) only. There is no per-id route yet.
- `src/lib/flashcards.ts` exposes `flashcardSchema` (zod) and `saveFlashcard(front, back, source)` — a shared create-and-validate helper with a 10s abort timeout, extracted during S-03's impl-review specifically so all save flows share one implementation.
- `src/components/flashcards/CandidateCard.tsx` establishes the only "edit" convention in the codebase: a local `isEditing` boolean toggles between read-only text and textareas in the same card, no modal. It only ever creates a new row on save (`saveFlashcard` → `POST`), never updates an existing one.
- `src/components/flashcards/FlashcardsList.tsx` renders each flashcard inline in a `.map()` with no per-item state and no action buttons.
- `src/components/flashcards/FlashcardsDashboard.tsx` owns the canonical `flashcards: Flashcard[]` state and passes a `handleCardSaved` callback into child components that create cards; there is no equivalent callback for updates yet.
- No modal/dialog primitive exists anywhere in `src/components/ui/` or `src/components/flashcards/`.

### Key Discoveries:

- RLS already enforces per-owner `update` access (`flashcards_update_own` policy, migration lines referenced above) — no migration needed for this change.
- The `updated_at` column auto-updates via a DB trigger — the update endpoint must not set it manually.
- `Button` (`src/components/ui/button.tsx`) has `success`/`destructive`/`outline` variants already used for save/reject/edit actions in `CandidateCard.tsx:69-104` — reuse these rather than introducing new styling.
- `ServerError` (`src/components/auth/ServerError.tsx`) accepts an optional `action?: ReactNode` specifically so callers compose a follow-up action (e.g. a retry or dismiss button) instead of duplicating error markup.
- PostgREST (the Supabase client) has no conditional `CASE`-style update — deciding the new `source` value based on the current one requires reading the current row before writing.

## Desired End State

A user viewing their flashcard list can click "Edit" on any card, change its front/back text in place, and click "Save" to persist the change; "Cancel" reverts instantly. If the card was deleted elsewhere in the meantime, the user sees an inline message and can remove the stale card from their own view. `source` is preserved across edits except that editing an `ai-full` card marks it `ai-edited`, matching the meaning that value already has for AI-review edits.

Verification: manually edit a flashcard in the dashboard, reload the page, and confirm the change persisted; attempt to edit a flashcard that another session deleted and confirm the inline "not found" handling.

## What We're NOT Doing

- No modal/dialog component — sticking with the established in-place edit pattern.
- No delete functionality (that's S-05, a separate roadmap slice).
- No schema/migration changes — RLS and the `updated_at` trigger already support this.
- No optimistic-concurrency/version checks beyond the not-found (404) case — no precedent or requirement for finer-grained conflict detection in this single-user-per-account app.
- No automated test suite — this repo has none yet (per CLAUDE.md), and this slice follows S-01–S-03's precedent of manual verification only.
- No partial-field updates via the API — the endpoint always requires both `front` and `back` together, matching what the in-place edit UI always sends.

## Implementation Approach

Mirror the existing create flow end-to-end: a zod-validated API route scoped to the authenticated owner, a shared client-side service function with the same timeout/validation shape as `saveFlashcard`, and a per-card local-state UI component modeled on `CandidateCard`. `FlashcardsList` extracts its per-item markup into a new `FlashcardListItem` component so each card can hold its own edit/saving/error state (React hooks can't live inside a `.map()` callback directly).

## Critical Implementation Details

**Source-transition requires read-before-write.** Because PostgREST has no conditional `CASE` update, the `PATCH` handler must first `select` the current row's `source` (scoped by `id` + `user_id`), decide the new value (`ai-full` → `ai-edited`; `manual` and `ai-edited` unchanged), and only then issue the `update` with that computed value. This is two round trips, not one — an RPC/stored procedure would avoid that but is unnecessary complexity for this scope.

**404 detection is a query-result check, not a separate lookup.** The initial `select().eq("id", id).eq("user_id", user.id).single()` returns a "no rows" error (Supabase/PostgREST code `PGRST116`) both when the id doesn't exist and when it belongs to another user (RLS already filters it out) — that specific error must map to `404 { error: "Flashcard not found" }`, distinct from a genuine `502` query failure.

**The client needs to distinguish 404 from other failures.** `FlashcardsList`'s not-found handling (remove the card from the list) only applies to a 404 response; timeouts, 400s, and 502s must leave the card in edit mode with a retryable error instead. `updateFlashcard` should throw a distinguishable `FlashcardNotFoundError` for the 404 case, mirroring the existing `GenerationTimeoutError`/`GenerationFailedError` pattern in `src/lib/services/openrouter.ts` / `src/pages/api/flashcards/generate.ts`.

## Phase 1: Update endpoint and service function

### Overview

Add the data-layer and API pieces needed to persist an edit: a DTO, the `PATCH` route, and the client-side service function.

### Changes Required:

#### 1. Update command DTO

**File**: `src/types.ts`

**Intent**: Add the shape callers use to request a flashcard update, mirroring `CreateFlashcardCommand` but without `source` (which the server computes, not the client).

**Contract**: `export interface UpdateFlashcardCommand { front: string; back: string; }`

#### 2. PATCH endpoint

**File**: `src/pages/api/flashcards/[id].ts` (new)

**Intent**: Let the owner of a flashcard update its `front`/`back`, applying the same validation as create and the source-transition rule from "Critical Implementation Details".

**Contract**: Exports `PATCH: APIRoute`. Auth check (`context.locals.user`) → `401 { error: "Unauthorized" }`. Body validated with `z.object({ front: z.string().trim().min(1).max(200), back: z.string().trim().min(1).max(500) })` → `400 { error: "Invalid request body" }` on failure. Supabase-not-configured → `502 { error: "Supabase is not configured" }`. Select current row by `id` (from `context.params.id`) + `user_id`. For both this select and the later update, apply the same error-code rule: `error.code === "PGRST116"` → `404 { error: "Flashcard not found" }`; any other error → `502`. On the initial select, a non-`PGRST116` error (e.g. a malformed `id`) → `502 { error: "Failed to load flashcard" }`. Compute new `source` per the transition rule, then `update({ front, back, source }).eq("id", id).eq("user_id", user.id).select().single()` — `PGRST116` here (row deleted between the read and the write) → `404 { error: "Flashcard not found" }`; any other error → `502 { error: "Failed to update flashcard" }`. Success → `200` with the updated row (same bare-row shape as the existing `POST` handler).

#### 3. Client service function

**File**: `src/lib/flashcards.ts`

**Intent**: Give UI components a single validated way to call the update endpoint, matching `saveFlashcard`'s timeout and response-validation behavior, plus a way to signal "not found" distinctly from other failures.

**Contract**: Add `export class FlashcardNotFoundError extends Error {}` and `export async function updateFlashcard(id: string, front: string, back: string): Promise<Flashcard>` — same `AbortController`/`SAVE_TIMEOUT_MS` pattern as `saveFlashcard`, `PATCH` to `` `/api/flashcards/${id}` ``. If `response.status === 404`, throw `FlashcardNotFoundError`; if the response isn't ok or fails `flashcardSchema` validation, throw a generic `Error`; otherwise return the parsed flashcard.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `PATCH /api/flashcards/{own-id}` with valid front/back returns 200 with the updated row and a bumped `updated_at`.
- `PATCH /api/flashcards/{other-user-id-or-nonexistent}` returns 404.
- `PATCH` with an empty `front` or an over-length `back` returns 400.
- Editing a flashcard whose current `source` is `ai-full` results in `source: "ai-edited"` after the update; editing a `manual` or already-`ai-edited` card leaves `source` unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: In-place edit UI

### Overview

Give each flashcard list item Edit/Save/Cancel controls that use the Phase 1 endpoint, following `CandidateCard`'s in-place edit convention.

### Changes Required:

#### 1. Per-item component with local edit state

**File**: `src/components/flashcards/FlashcardListItem.tsx` (new)

**Intent**: Extract the current inline card markup from `FlashcardsList` into its own component so each card can hold independent `isEditing`/`front`/`back`/`isSaving`/`error` state (required since hooks can't be used inside a `.map()` callback). Reuse the existing card container, textarea, and button styling from `CandidateCard.tsx` verbatim for visual consistency.

**Contract**: Props `{ flashcard: Flashcard; onUpdated: (flashcard: Flashcard) => void; onNotFound: (id: string) => void }`. Read mode shows the source badge + front/back text (current `FlashcardsList` markup) plus an "Edit" button (`variant="outline"`). Edit mode shows the two textareas (seeded from `flashcard.front`/`flashcard.back`, same `maxLength`/`rows` as `CandidateCard`) plus "Save" (`variant="success"`, disabled while `isSaving` or while `front === flashcard.front && back === flashcard.back`) and "Cancel" (`variant="outline"`, resets `front`/`back` to the original props and exits edit mode immediately, no confirmation). Save calls `updateFlashcard(flashcard.id, front, back)`: on success, call `onUpdated(result)` and exit edit mode; on `FlashcardNotFoundError`, render `<ServerError message="This flashcard no longer exists." action={<Button size="sm" variant="outline" onClick={() => onNotFound(flashcard.id)}>Remove</Button>} />` and stay in edit mode until the user clicks Remove; on any other error, render `<ServerError message="Couldn't save changes. Please try again." />` and stay in edit mode.

#### 2. Wire the new item component into the list

**File**: `src/components/flashcards/FlashcardsList.tsx`

**Intent**: Replace the inline card markup with `FlashcardListItem`, threading through the new callbacks.

**Contract**: `FlashcardsListProps` gains `onUpdated: (flashcard: Flashcard) => void` and `onNotFound: (id: string) => void`. The `.map()` renders `<FlashcardListItem key={flashcard.id} flashcard={flashcard} onUpdated={onUpdated} onNotFound={onNotFound} />` in place of the current inline `<div>`.

#### 3. Dashboard state wiring

**File**: `src/components/flashcards/FlashcardsDashboard.tsx`

**Intent**: Keep the canonical `flashcards` list in sync when an item is edited or found to be stale, mirroring the existing `handleCardSaved` pattern.

**Contract**: Add `handleCardUpdated` (replaces the matching item in `flashcards` state by `id`) and `handleCardNotFound` (filters the matching `id` out of `flashcards` state). Pass both to `FlashcardsList` as `onUpdated`/`onNotFound`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Clicking Edit on a card shows editable textareas seeded with its current text; clicking Cancel reverts instantly with no confirmation prompt.
- Save is disabled until the text actually differs from the original.
- Saving a valid edit updates the card in place (read mode, new text) without a page reload, and the change survives a manual page refresh.
- Simulating a 404 (e.g. deleting the row directly in Supabase while the edit form is open, then saving) shows the "no longer exists" message with a Remove action, and clicking Remove takes the card out of the list.
- A network/timeout failure during save keeps the card in edit mode with a generic retryable error, without losing the user's typed text.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Edit a manually-created flashcard: change front/back, save, reload the page, confirm the change persisted.
2. Edit an AI-generated (`ai-full`) flashcard and confirm its badge/source becomes `ai-edited` after saving.
3. Open edit on a card, click Cancel without saving, confirm the original text is unchanged and no network request fires.
4. Open edit, don't change anything, confirm Save stays disabled.
5. Delete a flashcard's row directly (e.g. via Supabase Studio) while its edit form is open in the browser, then click Save — confirm the 404 message and Remove flow.
6. Throttle/disconnect the network during a save and confirm the card stays editable with a retry-friendly error and no data loss.

## Performance Considerations

None beyond what's already in place — this is a single-row read + single-row update on an indexed (`user_id`) table.

## Migration Notes

No schema changes. The `flashcards_update_own` RLS policy and `updated_at` trigger already exist from the S-02 migration.

## References

- Prior slice: `context/archive/2026-09-14-manual-flashcard-create-and-list/`
- Prior slice: `context/archive/2026-09-14-ai-flashcard-generation-review/`
- In-place edit precedent: `src/components/flashcards/CandidateCard.tsx`
- Shared save helper to extend: `src/lib/flashcards.ts`
- Existing create endpoint to mirror: `src/pages/api/flashcards/index.ts`
- RLS policies already in place: `supabase/migrations/20260913091216_create_flashcards_table.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Update endpoint and service function

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — 73a9aa7
- [x] 1.2 Linting passes: `npm run lint` — 73a9aa7

#### Manual

- [x] 1.3 PATCH with valid front/back returns 200 with updated row and bumped updated_at — 73a9aa7
- [x] 1.4 PATCH on another user's or nonexistent id returns 404 — 73a9aa7
- [x] 1.5 PATCH with invalid front/back returns 400 — 73a9aa7
- [x] 1.6 Source transition rule verified (ai-full → ai-edited; manual/ai-edited unchanged) — 73a9aa7

### Phase 2: In-place edit UI

#### Automated

- [x] 2.1 Type checking passes: `npm run build`
- [x] 2.2 Linting passes: `npm run lint`

#### Manual

- [x] 2.3 Edit shows seeded textareas; Cancel reverts instantly with no confirmation
- [x] 2.4 Save disabled until text actually changes
- [x] 2.5 Valid save updates card in place and persists across reload
- [x] 2.6 404 case shows not-found message with working Remove action
- [x] 2.7 Network/timeout failure keeps card editable with retryable error and no data loss

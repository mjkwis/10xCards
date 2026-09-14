# Delete Flashcard With Confirmation Implementation Plan

## Overview

Add the ability to permanently delete a saved flashcard from the dashboard list, satisfying FR-007 (roadmap slice S-05) and its guardrail requiring explicit confirmation before permanent deletion. Users click Delete on a card in `FlashcardsList`, the card shows an inline confirmation, and confirming persists the deletion via a new `DELETE /api/flashcards/[id]` endpoint.

## Current State Analysis

- `flashcards` table and RLS policies already exist (`supabase/migrations/20260913091216_create_flashcards_table.sql`) — including an owner-scoped `flashcards_delete_own` policy that has been unused since it was created alongside S-02.
- `src/pages/api/flashcards/[id].ts` exposes `PATCH` only (added by S-04). There is no delete route yet.
- `src/lib/flashcards.ts` exposes `flashcardSchema`, `saveFlashcard`, `updateFlashcard`, and `FlashcardNotFoundError` — all sharing the same `AbortController`/`SAVE_TIMEOUT_MS` pattern.
- `src/components/flashcards/FlashcardListItem.tsx` (added by S-04) holds per-card `isEditing`/`front`/`back`/`isSaving`/`error`/`notFound` state and renders Edit/Save/Cancel controls. There is no delete action yet, and no confirmation UI pattern exists anywhere in the codebase.
- `src/components/flashcards/FlashcardsList.tsx` renders each flashcard via `FlashcardListItem`, threading `onUpdated`/`onNotFound` callbacks down from `FlashcardsDashboard`.
- `src/components/flashcards/FlashcardsDashboard.tsx` owns the canonical `flashcards: Flashcard[]` state with `handleCardSaved`/`handleCardUpdated`/`handleCardNotFound` callbacks; there is no equivalent callback for deletion yet.
- No modal/dialog primitive exists anywhere in `src/components/ui/` or `src/components/flashcards/` — S-04 deliberately stuck to an in-place, no-modal pattern for the same reason.

### Key Discoveries:

- RLS already enforces per-owner `delete` access (`flashcards_delete_own` policy, `supabase/migrations/20260913091216_create_flashcards_table.sql:32-35`) — no migration needed for this change.
- Unlike `PATCH` (which needs a read-before-write to compute the new `source`), a delete needs no prior read: `supabase.from("flashcards").delete().eq("id", id).eq("user_id", user.id).select("id")` returns the deleted row(s) in `data` in a single round trip. An empty `data` array (with no `error`) means no row matched (either wrong id or RLS filtered it out) — that's the 404 case, distinguished from an actual query failure without needing PostgREST's `PGRST116` single-row-not-found code (which only applies to `.single()`).
- `Button` (`src/components/ui/button.tsx`) already has a `destructive` variant, unused so far — this is the natural fit for the delete/confirm action.
- `ServerError` (`src/components/auth/ServerError.tsx`) accepts an optional `action?: ReactNode`, reusable here the same way S-04 reused it for the not-found case.

## Desired End State

A user viewing their flashcard list can click "Delete" on any card to see an inline confirmation ("Delete this flashcard? This can't be undone." with Confirm/Cancel buttons) in place of the card's normal actions — no modal, no page navigation. Confirming removes the card from the list immediately and permanently from storage; Cancel reverts instantly with no request sent. If the delete request fails (network/server error), the card stays in the confirmation state with a retryable inline error. If the card was already deleted elsewhere in the meantime, confirming still removes it from the user's view without showing an error, since the end state the user wanted (card gone) is already true.

Verification: manually delete a flashcard from the dashboard, reload the page, and confirm it no longer appears; click Delete then Cancel and confirm no request fires and the card is untouched.

## What We're NOT Doing

- No modal/dialog component — sticking with the in-place, no-modal pattern established by S-04.
- No schema/migration changes — the `flashcards_delete_own` RLS policy already supports this.
- No soft-delete, trash, or undo/restore after confirming — FR-007 requires confirmation *before* permanent deletion, not recovery after it.
- No bulk/multi-select delete — this is a per-card action only.
- No automated test suite — this repo has none yet (per CLAUDE.md), and this slice follows S-01–S-04's precedent of manual verification only.

## Implementation Approach

Mirror the existing update flow end-to-end: a zod-validated API route scoped to the authenticated owner, a client-side service function following the same timeout pattern as `saveFlashcard`/`updateFlashcard`, and an extension of `FlashcardListItem`'s local state to add an in-place delete-confirmation mode alongside its existing edit mode. The card's per-item state becomes a single `mode` (`"view" | "editing" | "confirming-delete"`) instead of a lone `isEditing` boolean, so the two actions stay mutually exclusive without extra guard conditions.

## Critical Implementation Details

**Delete needs no read-before-write, unlike `PATCH`.** `PATCH`'s source-transition logic required reading the current row first because PostgREST has no conditional `CASE` update. A delete has no such dependency: issue the delete with `.select("id")` chained on it in one call, and use whether the returned array is empty (not a `PGRST116` error) to detect "no matching row" — RLS means a wrong owner also produces an empty array here, not an error, since the row is invisible to begin with rather than existing-but-rejected.

**404 is treated as client-side success, not an error — this differs from the edit flow's `FlashcardNotFoundError`.** For `updateFlashcard`, a 404 mid-edit is a real problem (the user's in-progress edits can't be saved, so they need to see it). For `deleteFlashcard`, the user's goal — this card being gone — is already satisfied if it's already gone. So `deleteFlashcard` resolves normally (no throw) on both a real 204 and a 404 response; only other failures (400/401/502/network/timeout) throw and surface a retryable inline error.

## Phase 1: Delete endpoint and service function

### Overview

Add the data-layer and API pieces needed to persist a deletion: the `DELETE` route and the client-side service function.

### Changes Required:

#### 1. DELETE endpoint

**File**: `src/pages/api/flashcards/[id].ts`

**Intent**: Let the owner of a flashcard permanently delete it, scoped by `user_id` the same way `PATCH` already is in this file.

**Contract**: Add `export const DELETE: APIRoute`. Auth check (`context.locals.user`) → `401 { error: "Unauthorized" }`. `id` param validated with `z.uuid()` → `400 { error: "Invalid flashcard id" }` on failure (same check already used by `PATCH` in this file). Supabase-not-configured → `502 { error: "Supabase is not configured" }`. Run `supabase.from("flashcards").delete().eq("id", id).eq("user_id", user.id).select("id")`: a query `error` → `502 { error: "Failed to delete flashcard" }`; a successful query with an empty `data` array → `404 { error: "Flashcard not found" }`; otherwise → `204` with no response body (use `new Response(null, { status: 204 })`, not `Response.json`, since a 204 must not have a body).

#### 2. Client service function

**File**: `src/lib/flashcards.ts`

**Intent**: Give UI components a single validated way to call the delete endpoint, matching the existing timeout pattern, and resolving successfully whether the card was actually deleted now or was already gone (per "Critical Implementation Details").

**Contract**: Add `export async function deleteFlashcard(id: string): Promise<void>` — same `AbortController`/`SAVE_TIMEOUT_MS` pattern as `saveFlashcard`/`updateFlashcard`, issuing `DELETE` to `` `/api/flashcards/${id}` ``. Resolve (no return value) when `response.ok` (204) or `response.status === 404`. For any other status, or a thrown/aborted fetch, throw a generic `Error`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `DELETE /api/flashcards/{own-id}` returns 204 with no body, and the row is gone from the `flashcards` table.
- `DELETE /api/flashcards/{other-user-id}` (a real id owned by a different user) returns 404.
- `DELETE /api/flashcards/{nonexistent-id}` returns 404.
- `DELETE /api/flashcards/not-a-uuid` returns 400.
- Calling `DELETE` twice in a row on the same id returns 204 then 404, and `deleteFlashcard()` resolves without throwing both times.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: In-place delete confirmation UI

### Overview

Give each flashcard list item a Delete action that shows an inline confirmation before calling the Phase 1 endpoint, following the same in-place, no-modal convention as the existing Edit action.

### Changes Required:

#### 1. Delete-confirmation mode on the list item

**File**: `src/components/flashcards/FlashcardListItem.tsx`

**Intent**: Replace the current `isEditing: boolean` state with a `mode: "view" | "editing" | "confirming-delete"` state so editing and delete-confirmation are mutually exclusive on the same card, and add the confirm/cancel/delete flow itself.

**Contract**: In `mode === "view"`, the actions row shows "Edit" (existing, switches to `"editing"`) and a new "Delete" button (`variant="destructive"`, `size="sm"`, switches to `"confirming-delete"`). In `mode === "confirming-delete"`, render a message ("Delete this flashcard? This can't be undone.") in place of the card body's read view, plus "Confirm" (`variant="destructive"`, calls `deleteFlashcard(flashcard.id)`) and "Cancel" (`variant="outline"`, returns to `"view"` with no request sent) — both disabled while a delete request is in flight, with "Confirm" showing "Deleting…" during that time. On success, call a new `onDeleted: (id: string) => void` prop. On failure, render `<ServerError message="Couldn't delete this flashcard. Please try again." />` and stay in `"confirming-delete"` so the user can retry. `mode === "editing"` keeps its current markup and behavior unchanged, just renamed from the old `isEditing` boolean.

#### 2. Wire the new callback through the list

**File**: `src/components/flashcards/FlashcardsList.tsx`

**Intent**: Thread the new deletion callback down to each item, matching the existing `onUpdated`/`onNotFound` wiring.

**Contract**: `FlashcardsListProps` gains `onDeleted: (id: string) => void`. The `.map()` passes `onDeleted={onDeleted}` to `FlashcardListItem`.

#### 3. Dashboard state wiring

**File**: `src/components/flashcards/FlashcardsDashboard.tsx`

**Intent**: Keep the canonical `flashcards` list in sync when an item is deleted, mirroring the existing `handleCardNotFound` pattern (both remove a card from state by id).

**Contract**: Add `handleCardDeleted` (filters the matching `id` out of `flashcards` state — identical body to `handleCardNotFound`). Pass it to `FlashcardsList` as `onDeleted`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Clicking Delete on a card in view mode shows the inline confirmation with Confirm/Cancel, replacing the normal action buttons.
- Clicking Cancel reverts to the normal card view instantly, with no network request sent.
- Clicking Confirm removes the card from the list without a page reload, and the deletion survives a manual page refresh (card stays gone).
- While Edit is open on a card, no Delete button is available (and vice versa) — the two actions never overlap on the same card.
- A network/timeout failure during Confirm keeps the card in the confirmation state with a retryable inline error, and clicking Confirm again succeeds once the network is restored.
- Deleting a card whose row was already removed elsewhere (e.g. deleted directly in Supabase Studio while the confirmation is open) still removes it from the list with no error shown.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Click Delete on a flashcard, then Cancel — confirm the card is untouched and no request was sent (check network tab).
2. Click Delete, then Confirm — confirm the card disappears from the list immediately and stays gone after a page reload.
3. Open Edit on one card and confirm the Delete button isn't shown for that card while editing; cancel the edit and confirm Delete reappears.
4. Click Delete, then Confirm, while offline/throttled — confirm the card stays in the confirmation state with a retryable error and no data loss elsewhere on the page.
5. Delete a flashcard's row directly (e.g. via Supabase Studio) while its confirmation is open in the browser, then click Confirm — confirm the card is removed from the list with no error shown.
6. Confirm a manually-created flashcard and an AI-generated flashcard both delete correctly regardless of `source`.

## Performance Considerations

None beyond what's already in place — this is a single-row delete on an indexed (`user_id`) table.

## Migration Notes

No schema changes. The `flashcards_delete_own` RLS policy already exists from the S-02 migration.

## References

- Prior slice (pattern to mirror): `context/archive/2026-09-14-edit-existing-flashcard/`
- Prior slice: `context/archive/2026-09-14-manual-flashcard-create-and-list/`
- RLS policy already in place: `supabase/migrations/20260913091216_create_flashcards_table.sql:32-35`
- Endpoint to extend: `src/pages/api/flashcards/[id].ts`
- Service module to extend: `src/lib/flashcards.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Delete endpoint and service function

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — 569d062
- [x] 1.2 Linting passes: `npm run lint` — 569d062

#### Manual

- [x] 1.3 DELETE on own id returns 204 with no body and the row is gone — 569d062
- [x] 1.4 DELETE on another user's id returns 404 — 569d062
- [x] 1.5 DELETE on a nonexistent id returns 404 — 569d062
- [x] 1.6 DELETE with an invalid (non-uuid) id returns 400 — 569d062
- [x] 1.7 Calling DELETE twice returns 204 then 404, and `deleteFlashcard()` resolves both times without throwing — 569d062

### Phase 2: In-place delete confirmation UI

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — 15f354e
- [x] 2.2 Linting passes: `npm run lint` — 15f354e

#### Manual

- [x] 2.3 Delete button shows inline Confirm/Cancel, replacing normal actions — 15f354e
- [x] 2.4 Cancel reverts instantly with no request sent — 15f354e
- [x] 2.5 Confirm removes the card from the list and the deletion persists across reload — 15f354e
- [x] 2.6 Edit and Delete are mutually exclusive on the same card — 15f354e
- [x] 2.7 Network/timeout failure during Confirm keeps the card in confirmation state with a retryable error — 15f354e
- [x] 2.8 Deleting an already-removed card still clears it from the list with no error shown — 15f354e

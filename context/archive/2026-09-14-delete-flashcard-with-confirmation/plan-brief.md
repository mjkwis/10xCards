# Delete Flashcard With Confirmation — Plan Brief

> Full plan: `context/changes/delete-flashcard-with-confirmation/plan.md`

## What & Why

Users can currently create and edit flashcards, but there's no way to remove one. This adds a Delete action to each flashcard in the dashboard list, gated by an explicit inline confirmation, closing FR-007 (roadmap slice S-05). The confirmation step exists specifically to satisfy the PRD's guardrail against losing a user's flashcards without warning.

## Starting Point

The `flashcards` table and its owner-scoped RLS policies — including an unused `flashcards_delete_own` policy — already exist from the S-02 migration. The API exposes `GET`/`POST /api/flashcards` and `PATCH /api/flashcards/[id]` (added by S-04's edit feature); there's no delete route. `FlashcardListItem` (also from S-04) already holds per-card local state for editing, but no confirmation UI pattern exists anywhere in the codebase — S-04 established the precedent of in-place, no-modal interactions.

## Desired End State

Clicking "Delete" on any flashcard swaps its action row to an inline "Delete this flashcard? This can't be undone." message with Confirm/Cancel buttons — no modal, no navigation. Confirming removes the card immediately and permanently; Cancel reverts instantly with no request sent. A failed delete leaves the card in the confirmation state with a retryable error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Confirmation UX pattern | In-place two-step confirm (Delete → Confirm/Cancel) on the card itself | Matches the no-modal convention S-04 already established; no Dialog primitive exists to build a modal on. | Plan |
| Endpoint response | `204 No Content` on success | Standard REST convention for delete; no body is needed once the resource is gone. | Plan |
| Already-deleted race | Treat a 404 as client-side success (card just disappears, no error) | The user's actual goal — this card being gone — is already true; showing an error for a card that no longer exists would be confusing rather than informative. | Plan |
| Edit/Delete exclusivity | A single `mode` (`view`/`editing`/`confirming-delete`) replaces the old `isEditing` boolean | Prevents a card from being in both edit and delete-confirm states at once without extra guard conditions. | Plan |
| Delete detection | Single round-trip `.delete().select("id")`, empty array = not found | No read-before-write needed (unlike `PATCH`'s source-transition logic) — simpler and faster than a two-query approach. | Plan |
| Failure handling | Inline `ServerError`, stays in confirming state for retry | Reuses the existing `ServerError` component and keeps the user's intent (delete this card) active instead of dropping them back to a neutral state. | Plan |
| Scope of "confirmation" | Confirm-before-delete only; no undo/restore after | FR-007 requires confirmation before permanent deletion, not recovery after it — building undo would be speculative scope beyond the requirement. | Plan |
| Testing approach | Manual verification only | Matches S-01–S-04 precedent; this repo has no test framework yet. | Plan |

## Scope

**In scope:**
- `DELETE /api/flashcards/[id]` endpoint (owner-scoped, 400/404/502 handling, 204 success)
- `deleteFlashcard()` in `src/lib/flashcards.ts`
- In-place Delete/Confirm/Cancel UI on each flashcard list item, mutually exclusive with the existing Edit mode, wired into `FlashcardsDashboard`'s shared state

**Out of scope:**
- Any modal/dialog component
- Schema/migration changes (delete RLS policy already exists)
- Soft-delete, trash, or undo/restore after confirming
- Bulk/multi-select delete
- Automated tests (no framework in this repo yet)

## Architecture / Approach

Mirror the existing update flow: a zod-validated Astro API route scoped to `context.locals.user`, a client-side service function with the same timeout/error shape as `saveFlashcard`/`updateFlashcard`, and an extension of `FlashcardListItem`'s local state from a boolean to a three-way `mode` so Edit and Delete-confirm stay mutually exclusive on the same card.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Delete endpoint and service function | `DELETE /api/flashcards/[id]`, `deleteFlashcard()` client helper | Must distinguish "no row matched" (404) from a real query error using the delete's own `.select()` result, not a separate lookup |
| 2. In-place delete confirmation UI | Delete/Confirm/Cancel on each list card, mutually exclusive with Edit, dashboard state wiring | Refactoring `isEditing` to a three-way `mode` must not regress existing edit behavior |

**Prerequisites:** S-03 (list) and S-04 (edit, provides `FlashcardListItem` and the `[id].ts` route to extend) are both done; no other blockers.
**Estimated effort:** ~1 session across 2 phases — same shape and size as S-04.

## Open Risks & Assumptions

- Assumes single-user-per-account deletion (no real-time collaboration), so a 404 during confirm is the only "someone else changed it" scenario, and it's treated as a benign already-done case rather than a conflict to surface.
- FR-004–FR-007 (manual CRUD, including delete) have no formal Given/When/Then acceptance criteria in the PRD; this plan treats the FR-007 description and its guardrail note (confirmation required) as the acceptance bar, consistent with how S-04 treated FR-006.
- This plan was written with all design decisions defaulted to the recommended option per explicit user request, skipping the usual interactive question round — the "Key Decisions Made" table above is the full record of what was decided and why, in place of a Q&A transcript.

## Success Criteria (Summary)

- A user can delete any of their flashcards after an explicit inline confirmation, and the deletion persists across a page reload.
- Canceling a delete confirmation never sends a request and never alters the card.
- A user can never end up in both edit mode and delete-confirmation mode on the same card at once.

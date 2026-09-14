# Edit Existing Flashcard — Plan Brief

> Full plan: `context/changes/edit-existing-flashcard/plan.md`

## What & Why

Users can currently create flashcards (manually or via AI) and browse them in a list, but there's no way to fix a typo or refine wording after saving. This adds an in-place edit action to each flashcard in the dashboard list, closing FR-006 (roadmap slice S-04).

## Starting Point

The `flashcards` table, its owner-scoped RLS policies (including an unused `update` policy), and an `updated_at` auto-trigger already exist from the S-02 migration. The API only exposes `GET`/`POST /api/flashcards`; there's no update endpoint. The only "edit" convention in the codebase today is `CandidateCard`'s in-place textarea toggle, but it only ever creates new rows — it doesn't update a persisted flashcard.

## Desired End State

Clicking "Edit" on any flashcard in the list swaps it to an editable card in place (no modal, no page navigation). Saving persists the change immediately and updates the list without a reload; Cancel reverts instantly. If the card was deleted elsewhere in the meantime, the user sees a clear message and a way to remove the stale card from their view.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Edit UI pattern | In-place edit toggle (no modal) | Matches the only editing convention already in this codebase (`CandidateCard`); no Dialog primitive exists to build a modal on. |
| `source` field on edit | `ai-full` → `ai-edited`; `manual`/`ai-edited` unchanged | Mirrors existing pre-save semantics and keeps `ai-edited` cards counted as AI-originated for the PRD's AI-acceptance success metric. |
| Not-found handling | Inline error + explicit Remove action | Reuses `ServerError`'s existing `action` prop; avoids silently vanishing cards or leaving unreachable "ghost" cards in the list. |
| Validation limits | Identical to create (`front` ≤200, `back` ≤500, trimmed non-empty) | Matches the DB check constraints exactly — no other limit is actually viable. |
| API request shape | Requires both `front` and `back` together | The UI always edits both fields at once; partial-update support would be speculative flexibility. |
| Cancel behavior | Instant revert, no confirmation | Matches the app's existing lack of confirm dialogs (e.g. `CandidateCard`'s Reject) and keeps the interaction fast. |
| Save button guard | Disabled when unchanged | Cheap to add, avoids pointless PATCH requests and needless `updated_at` bumps. |
| Testing approach | Manual verification only | Matches S-01–S-03 precedent; this repo has no test framework yet and introducing one is out of scope for a single CRUD slice. |

## Scope

**In scope:**
- `PATCH /api/flashcards/[id]` endpoint (owner-scoped, source-transition logic, 404/400/502 handling)
- `UpdateFlashcardCommand` DTO and `updateFlashcard()`/`FlashcardNotFoundError` in `src/lib/flashcards.ts`
- In-place Edit/Save/Cancel UI on each flashcard list item, wired into `FlashcardsDashboard`'s shared state

**Out of scope:**
- Delete functionality (S-05, separate slice)
- Any modal/dialog component
- Schema/migration changes (RLS + trigger already support this)
- Optimistic-concurrency/versioning beyond the 404 case
- Automated tests (no framework in this repo yet)

## Architecture / Approach

Mirror the existing create flow: a zod-validated Astro API route scoped to `context.locals.user`, a shared client-side service function with the same timeout/validation shape as `saveFlashcard`, and a new `FlashcardListItem` component (extracted from `FlashcardsList`) holding its own local edit state — modeled directly on `CandidateCard`'s toggle pattern.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Update endpoint and service function | `PATCH /api/flashcards/[id]`, DTO, `updateFlashcard()` client helper | Source-transition logic needs a read-before-write (no CASE-update in PostgREST); 404 must be distinguished from real query failures |
| 2. In-place edit UI | Edit/Save/Cancel on each list card, dashboard state wiring | Extracting per-item state requires a new component (hooks can't live inside `.map()`) |

**Prerequisites:** S-03 (manual create + list) is done; no other blockers.
**Estimated effort:** ~1 session across 2 phases — this is a straightforward CRUD addition on top of well-established patterns.

## Open Risks & Assumptions

- Assumes single-user-per-account editing (no real-time collaboration), so the 404 case is the only conflict scenario worth handling — no optimistic-locking/versioning.
- FR-004–FR-007 (manual CRUD, including edit) have no formal Given/When/Then acceptance criteria in the PRD; this plan treats the FR-006 description itself as sufficient given the roadmap's own note that this is "a simple CRUD operation."

## Success Criteria (Summary)

- A user can edit any of their flashcards in place and see the change persist across a page reload.
- Editing an AI-generated card correctly flips its source to `ai-edited`; manual cards stay manual.
- Editing a flashcard that no longer exists surfaces a clear, recoverable error instead of a silent failure or crash.

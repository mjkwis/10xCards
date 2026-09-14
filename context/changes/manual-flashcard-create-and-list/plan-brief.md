# Manual Flashcard Create + List — Plan Brief

> Full plan: `context/changes/manual-flashcard-create-and-list/plan.md`

## What & Why

Implement roadmap slice S-03: a logged-in user can manually create a flashcard (front/back) and see it — alongside every flashcard they've created, manual or AI — in a list on `/dashboard`. This closes FR-004 (manual create) and FR-005 (list). The two are shipped as one slice because creating a card with no way to see the result has no standalone value.

## Starting Point

S-02 (AI generation & review) already built more than its own scope needed: the `flashcards` table with owner-scoped RLS, and `POST /api/flashcards` (validates `{front, back, source}`, 200/500 char limits, inserts, returns the row). What's missing is everything on the read side and the manual-entry UI: no `GET /api/flashcards`, no manual-create form, no list view anywhere in the app. `/dashboard` currently renders only the AI paste/generate/review flow.

## Desired End State

A user on `/dashboard` sees three sections: AI generate/review (unchanged), a "Create flashcard" form, and "Your flashcards" — newest first, each card showing front/back and a Manual/AI badge. Creating a card manually or accepting an AI candidate makes it appear at the top of the list instantly, no reload. Empty collections and list-load failures both get a clear in-app message instead of a blank section.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Layout | Same `/dashboard` page, new sections (no new route/tabs) | Matches the existing single-page dashboard pattern, no routing changes for a 1-week MVP. | Plan |
| Cross-component sync | Shared parent state (`FlashcardsDashboard` island) | Instant list updates from both manual-create and AI-accept with no extra network round-trip. | Plan |
| List ordering | Newest first (`created_at desc`) | Just-created/just-accepted cards are visible immediately without scrolling. | Plan |
| Empty state | Friendly message, not hidden | Confirms the list loaded correctly rather than looking broken. | Plan |
| Pagination | None — fetch all | Matches `target_scale.users: small`; no evidence more is needed for MVP. | Plan |
| Source distinction | Small badge (Manual / AI) | Cheap given `source` is already on the row; gives the user transparency into their collection. | Plan |
| Manual-create form UX | Clear fields, stay open, on success | Supports adding several cards in a row without extra clicks. | Plan |
| List load errors | Inline error + retry (reuses `GenerationError`/`ServerError` pattern) | Consistent with the AI flow's existing error convention in this codebase. | Plan |

## Scope

**In scope:**
- `GET /api/flashcards` (list, newest-first, owner-scoped via existing RLS)
- Manual create form (`POST /api/flashcards`, already existing route, `source: "manual"`)
- List UI: empty state, source badges, error+retry
- Wiring accepted AI cards into the same shared list (no reload needed for either write path)

**Out of scope:**
- Edit (S-04), delete-with-confirmation (S-05), SRS review session (S-06)
- Pagination/infinite scroll, deduplication
- Any change to the AI generation call itself (`/api/flashcards/generate`, `openrouter.ts`)
- New routes/nav — everything stays on `/dashboard`

## Architecture / Approach

A new parent island, `FlashcardsDashboard`, owns the canonical flashcards list state: fetches it once via `GET /api/flashcards` on mount, and exposes a single `handleCardSaved` callback that both the new `ManualCreateForm` and the (lightly modified) existing `GenerateReviewIsland` call after a successful save, prepending the new row. `dashboard.astro` renders `FlashcardsDashboard` in place of the current direct `GenerateReviewIsland` call; existing AI-review internals (candidate state, accept/edit/reject) are otherwise untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. List API & read-only list UI | `GET /api/flashcards`, shared-state shell, list with empty/error states | Getting the RLS-implicit query right (no explicit `user_id` filter needed, but easy to second-guess) |
| 2. Manual create | Create form wired into the shared list | Keeping validation/limits consistent with the existing API's zod schema |
| 3. AI-accept sync | Thread saved AI cards from `CandidateCard` up into the shared list | Changing `CandidateCard`'s `onAccepted` signature without breaking its existing accept/edit/reject behavior |

**Prerequisites:** F-01 (Supabase connection) and S-01 (signup/signin) are done; S-02's `flashcards` table and `POST` route are done and reused as-is.
**Estimated effort:** ~1 session across 3 phases, consistent with the project's 1-week/after-hours MVP timeline.

## Open Risks & Assumptions

- Assumes RLS's `flashcards_select_own` policy alone is sufficient for the `GET` query (no explicit `.eq("user_id", ...)` filter) — this matches how `POST` already relies on RLS for `insert`, but should be double-checked against a real Supabase project during implementation.
- Assumes the existing zod validation/character limits in `POST /api/flashcards` don't need any changes for manual create — they were already generic (not AI-specific) when built in S-02.

## Success Criteria (Summary)

- A user's full flashcard collection (any source) is visible on `/dashboard`, newest first, immediately reflecting new manual creates and AI accepts without a page reload.
- Empty collections and list-load failures both show a clear, non-blank UI state.
- No regression to the existing AI generate/review flow.

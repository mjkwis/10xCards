# SRS Review Session — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`

## What & Why

Lets a logged-in user run a study session where flashcards appear in an order set by an integrated spaced-repetition algorithm, and each answer feeds the schedule for future reviews (PRD FR-009). This is roadmap slice S-06 — the only item in `context/foundation/roadmap.md` marked `blocked`, pending a choice of SRS library/algorithm. That choice is resolved in this plan.

## Starting Point

`flashcards` (from prior slices S-02–S-05) has no scheduling state at all — just `front`, `back`, `source`, timestamps. There is no review/session code anywhere in the app. This is a greenfield feature built entirely on top of the existing table and API conventions.

## Desired End State

From `/dashboard`, the user sees a due-card count and a "Start review session" link. On `/review`, due cards appear one at a time; the user reveals the answer, grades their recall (Again/Hard/Good/Easy), and the card's next-due date updates accordingly. When nothing is due, the page says so.

## Key Decisions Made

All decisions below were made without an interactive question round, per explicit user request ("use all recommendations and continue without confirming"). Each follows the recommended option from research.

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SRS library (the roadmap's hard blocker) | `ts-fsrs` (FSRS) | Actively maintained, edge-safe (one pure-JS dep), 4-point rating fits a review UI better than SM-2's 6-point scale | Plan |
| Schema shape | Extend `flashcards` in place, no history table | FR-009 needs scheduling, not analytics; simplest option matches `main_goal: speed` | Plan |
| Service layer | New `src/lib/services/srs.ts` | Scheduling math deserves isolation/testability, mirroring the existing `openrouter.ts` service precedent, unlike simple CRUD which stays inline | Plan |
| Due-queue delivery | Fetch full due list upfront, advance client-side | Simplest under the time budget; mirrors the existing full-list `GET /api/flashcards` pattern | Plan |
| Re-grading within a session | No same-session re-queuing of "Again" cards | Avoids re-polling due-state mid-session; card returns on a future visit instead | Plan |
| Session cap | None — show all due cards | No PRD requirement for a daily cap; keep it minimal | Plan |
| New/edited card due state | DB column defaults make every row immediately due, matching `ts-fsrs`'s `createEmptyCard()` | Existing and future cards must enter the queue without manual seeding | Plan |
| New endpoints | `GET /api/flashcards/due` + `POST /api/flashcards/[id]/review` (new routes) | Keeps single responsibility per endpoint instead of overloading `index.ts`/`[id].ts` | Plan |
| Entry point | Due-count + link on the existing dashboard | Discoverable without a nav overhaul | Plan |

## Scope

**In scope:**
- Migration adding 9 FSRS scheduling columns to `flashcards`
- `ts-fsrs` dependency + a scheduling service module
- `GET /api/flashcards/due` and `POST /api/flashcards/[id]/review`
- `/review` page + `ReviewSession`/`ReviewCard` React components
- Dashboard due-count + entry link
- Route protection for `/review`

**Out of scope:**
- Review history/analytics table
- Same-session re-queuing of failed cards
- Daily/session review caps
- Any change to existing create/edit/delete flashcard endpoints beyond leaving them untouched
- A custom-built scheduling algorithm (explicit PRD non-goal)

## Architecture / Approach

Existing `flashcards` table gains scheduling columns rather than a new table. A thin service (`src/lib/services/srs.ts`) wraps `ts-fsrs` so route handlers stay declarative. Two new API routes expose the due queue and the grading action, following the app's established auth → zod → owner-scoped-query pattern. A new protected page + two React components (session orchestrator + presentational card) deliver the UI, reusing existing `Button`/`ServerError` components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model & scheduling service | Migration, `ts-fsrs` dep, types, `srs.ts` service | New-card column defaults must exactly match `ts-fsrs`'s `createEmptyCard()` output |
| 2. API endpoints | `GET /api/flashcards/due`, `POST /api/flashcards/[id]/review` | Owner-scoping and 404/400 handling must mirror the existing `[id].ts` conventions exactly |
| 3. Review session UI | `/review` page, `ReviewSession`, `ReviewCard`, dashboard entry point | Client-side queue must not re-fetch mid-session (would contradict the no-re-queuing decision) |

**Prerequisites:** S-03 (manual create + list) is done, providing the `flashcards` table and list conventions this builds on.
**Estimated effort:** ~2-3 sessions across 3 phases, consistent with prior single-slice implementations (S-04, S-05) in this project.

## Open Risks & Assumptions

- Assumes `npx supabase gen types typescript --local` (or the project's equivalent) is available for regenerating `database.types.ts` — no scripted `db:types` command exists in `package.json` today.
- Assumes FSRS's default parameters (`generatorParameters()` with no customization) are acceptable for MVP; tuning is out of scope.
- Roadmap's S-06 "Unknowns" text (library choice) is now resolved by this plan but is left as-is in `roadmap.md` per the sync convention that only touches the `Status` field — a future pass could clean up that stale text when the slice is archived.

## Success Criteria (Summary)

- A due card graded through the UI updates its `due_at`/scheduling state and disappears from the due queue until that new date
- Dashboard accurately reflects due count and links into a working session
- Unauthenticated visitors cannot reach `/review`

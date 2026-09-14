<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit Existing Flashcard Implementation Plan

- **Plan**: context/changes/edit-existing-flashcard/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan — both phases complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned global change to shared Button `outline` variant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/components/ui/button.tsx` (commit `37fb2b2`)
- **Detail**: Phase 2's commit also rewrote the shared `outline` button variant, outside the plan's file list and contrary to the plan's own instruction to "reuse these [variants] rather than introducing new styling":
  ```diff
  - outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
  + outline: "border border-white/20 bg-white/10 text-white shadow-xs hover:bg-white/25 hover:text-white",
  ```
  Both review sub-agents independently confirmed this fixes a real, pre-existing contrast bug: the app never toggles Tailwind's `.dark` class anywhere (no `ThemeProvider`, no `classList`/`matchMedia` usage), so `bg-background` always resolved to the light token (white) — meaning the old `outline` "Edit"/"Try again" buttons rendered as white-on-white against the app's fixed dark "cosmic" background, at `CandidateCard.tsx` and `GenerationError.tsx`. No current call site regresses from this change (all three `variant="outline"` usages — `CandidateCard.tsx`, `GenerationError.tsx`, and the new `FlashcardListItem.tsx` — sit on the same dark card background). But it permanently bakes a dark-only assumption into a shared shadcn primitive, discarding the `dark:` variants that existed for theme-aware rendering, with no plan/change-doc record of the decision. A future light-background consumer of `<Button variant="outline">` would silently inherit unreadable white-on-white styling.
- **Fix B ⭐ Recommended**: Revert `button.tsx`'s `outline` variant to its prior definition; instead scope the dark-card styling via `className`/`cn()` overrides at the three flashcard call sites (or introduce a dedicated variant, e.g. `outline-dark`, if the pattern recurs).
  - Strength: Matches CLAUDE.md's own convention — use `cn()` for conditional/merged class names at the call site rather than editing shared primitive internals for one context; keeps the shared `Button` component theme-agnostic for future consumers.
  - Tradeoff: Touches 3 call sites (or adds a new variant to maintain) instead of one line in `button.tsx`.
  - Confidence: HIGH — directly matches this repo's documented styling convention.
  - Blind spot: Haven't checked whether other in-flight/future slices intend more "outline on dark card" usage, which would make a dedicated variant cleaner than repeated per-site overrides.
- **Fix A**: Keep the global change as-is and record it in the plan/change.md as an accepted addendum.
  - Strength: Zero additional code changes; fixes the bug at both pre-existing call sites today.
  - Tradeoff: Shared primitive is now dark-theme-only with no documented rationale; risk surfaces only when/if a light-background consumer appears.
  - Confidence: MED — safe today, but the future-proofing gap is real and undocumented.
  - Blind spot: No visibility into whether a light-background UI is on the roadmap.
- **Decision**: PENDING

### F2 — Malformed flashcard `id` yields misleading 502 instead of 400

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/flashcards/[id].ts:36-47`
- **Detail**: `context.params.id` is used directly in the initial `.eq("id", id)` select without format validation. A malformed (non-UUID) id produces a genuine Postgres error rather than PostgREST's "no rows" code `PGRST116`, so it falls through to `502 { error: "Failed to load flashcard" }` instead of a more accurate `400`. No injection risk (PostgREST parameterizes the value) — just an imprecise status code for a malformed-input case.
- **Fix**: Validate `id` with `z.string().uuid()` (or equivalent) before querying, returning `400 { error: "Invalid flashcard id" }` on failure.
- **Decision**: PENDING

### F3 — Save/Cancel remain clickable after a 404 is shown

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/flashcards/FlashcardListItem.tsx:102-137`
- **Detail**: When `updateFlashcard` throws `FlashcardNotFoundError`, the component stays in edit mode with `ServerError` + a "Remove" action rendered, but Save and Cancel remain enabled alongside it — matching the plan's literal wording ("stay in edit mode until the user clicks Remove"), but a user could click Save again and just re-issue a PATCH against an already-deleted row (harmless — it 404s again — but avoidable churn).
- **Fix**: Disable Save/Cancel once `notFound` is true, so Remove is the only available action.
- **Decision**: PENDING


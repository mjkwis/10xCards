<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard Create + List Implementation Plan

- **Plan**: context/changes/manual-flashcard-create-and-list/plan.md
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — CandidateCard skips response validation that sibling save paths apply

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/components/flashcards/CandidateCard.tsx:30
- **Detail**: `saveFlashcard` returns `(await response.json()) as Flashcard` — an unchecked type assertion with no runtime validation. `ManualCreateForm.tsx:38` and `FlashcardsDashboard.tsx` both validate the identical `/api/flashcards` response shape with a zod `flashcardSchema` before trusting it. Two call sites hitting the same endpoint use different trust models for the same external boundary. Additionally, `CandidateCard` applies a 10s `AbortController` timeout to its save fetch that `ManualCreateForm` does not — the reverse inconsistency. The zod schema itself is also duplicated verbatim between `FlashcardsDashboard.tsx` and `ManualCreateForm.tsx`.
- **Fix A ⭐ Recommended**: Extract a shared `saveFlashcard(front, back, source)` helper (e.g. `src/lib/flashcards.ts`) with one zod schema and the 10s abort/timeout behavior, used by both `CandidateCard` and `ManualCreateForm`.
  - Strength: Eliminates schema drift risk and inconsistent trust/timeout behavior in one pass; matches the project's convention of extracted helpers in `src/lib/`.
  - Tradeoff: Touches two components instead of one; slightly more edit surface for a non-critical issue.
  - Confidence: HIGH — both call sites' current logic is simple enough to consolidate without behavior change.
  - Blind spot: None significant.
- **Fix B**: Add zod validation only to `CandidateCard.saveFlashcard`, leave the schema duplication and timeout asymmetry as-is.
  - Strength: Minimal, single-file change; closes the actual trust gap.
  - Tradeoff: Leaves the schema duplicated in two places (drift risk if the `Flashcard` shape changes later) and leaves the timeout inconsistency unresolved.
  - Confidence: HIGH — trivial patch.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A applied (extracted src/lib/flashcards.ts with shared flashcardSchema + saveFlashcard(), used by CandidateCard and ManualCreateForm; FlashcardsDashboard now imports the same schema). Build and lint verified clean.

### F2 — Loading state hides already-present flashcards during a retry fetch

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UX)
- **Location**: src/components/flashcards/FlashcardsList.tsx:16-18
- **Detail**: `retryLoadFlashcards` (FlashcardsDashboard.tsx:39-64) sets `listState("loading")` before refetching. While loading, `FlashcardsList` renders only a "Loading your flashcards…" placeholder and ignores the `flashcards` prop entirely — so any manually-created or AI-accepted cards already in state (added while the initial SSR load had failed) are visually hidden until the retry resolves, even though they're never lost from state.
- **Fix**: In `FlashcardsList`, only show the loading placeholder when `flashcards.length === 0`; otherwise keep rendering the existing list while a retry is in flight.
- **Decision**: FIXED — condition changed to `state === "loading" && flashcards.length === 0`. Build and lint verified clean.

### F3 — No client-side abort/timeout on AI generation request

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/GenerateReviewIsland.tsx:45-49
- **Detail**: The `/api/flashcards/generate` fetch has no `AbortController`/timeout, unlike `CandidateCard`'s 10s timeout on save. Generation is the most latency-prone call in this feature (LLM round-trip via OpenRouter). Server-side `generate.ts` already has its own `GenerationTimeoutError` handling, so this is a UX nicety, not a correctness gap.
- **Fix**: Add the same `AbortController` + timeout pattern used in `CandidateCard.saveFlashcard` to `handleGenerate`.
- **Decision**: FIXED — added `AbortController` with a 30s timeout (`GENERATE_TIMEOUT_MS`) to `handleGenerate`. Build and lint verified clean.

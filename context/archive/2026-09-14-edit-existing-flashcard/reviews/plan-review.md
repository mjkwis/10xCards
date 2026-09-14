<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Edit Existing Flashcard Implementation Plan

- **Plan**: context/changes/edit-existing-flashcard/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

11/11 paths ✓ (supabase/migrations/20260913091216_create_flashcards_table.sql, src/pages/api/flashcards/index.ts, src/lib/flashcards.ts, src/components/flashcards/CandidateCard.tsx, src/components/flashcards/FlashcardsList.tsx, src/components/flashcards/FlashcardsDashboard.tsx, src/components/ui/button.tsx, src/components/auth/ServerError.tsx, src/lib/services/openrouter.ts, src/pages/api/flashcards/generate.ts, src/types.ts), 6/6 symbols ✓ (flashcardSchema, saveFlashcard, GenerationTimeoutError/GenerationFailedError, ServerError `action` prop, Button `success`/`outline`/`destructive` variants, flashcards_update_own RLS policy), brief↔plan ✓

## Findings

### F1 — Error-mapping contract contradicts its own Critical Details

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, item #2 (PATCH endpoint) — Contract text vs. "Critical Implementation Details"
- **Detail**: "Critical Implementation Details" (plan.md:48, pre-fix) said the initial select's `PGRST116` (no-rows) error must map to 404, "distinct from a genuine 502 query failure." The Phase 1 Contract (plan.md:74, pre-fix) instead collapsed this into "no row / query error → 404" for *any* error on the initial select — so a malformed/invalid `id` (a real Postgres error, not `PGRST116`) would have been misreported as "Flashcard not found" instead of a genuine failure. Separately, the second query (update+select+single) mapped *all* errors to 502 — but if the row is deleted in the narrow window between the read and the write, that query also gets `PGRST116`, which per the plan's own stated intent should be 404, not 502.
- **Fix ⭐ Recommended (Applied)**: Tightened the Phase 1 Contract to spell out the check explicitly for both queries: `error.code === "PGRST116"` → 404; any other error → 502 — applied identically to the initial select and the update+select+single call.
  - Strength: Matches what "Critical Implementation Details" already decided; closes the gap between prose and contract.
  - Tradeoff: One more line of contract text; no code-complexity cost.
  - Confidence: HIGH — wording fix, not a design change.
  - Blind spot: The read-then-write race stays untestable manually (too tight a window) — worth a code comment at implementation time, not a plan-level fix.
- **Decision**: FIXED (via Fix — applied directly to plan.md)

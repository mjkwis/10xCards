<!-- PLAN-REVIEW-REPORT -->
# Plan Review: SRS Review Session

- **Plan**: context/changes/srs-review-session/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: SOUND (after fixes; REVISE before triage)
- **Findings**: 1 critical, 1 warning, 2 observations — all triaged and fixed

## Verdicts

| Dimension | Verdict (pre-fix) |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

11/11 paths ✓, 4/4 symbols ✓, brief↔plan ✓

Paths checked: `src/types.ts`, `src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`, `src/lib/services/openrouter.ts`, `src/pages/dashboard.astro`, `src/middleware.ts`, `src/components/auth/ServerError.tsx`, `src/components/ui/button.tsx`, `src/lib/flashcards.ts`, `supabase/migrations/20260913091216_create_flashcards_table.sql`, `package.json`.
Symbols checked: `PROTECTED_ROUTES`, `createClient`, `nextSource`, `set_updated_at` trigger.

## Findings

### F1 — Client-side flashcardSchema will silently drop the 9 new SRS columns

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 4 ("SRS types") — plan.md:96
- **Detail**: `flashcardSchema` in `src/lib/flashcards.ts` (confirmed: only lists the original 7 columns) is a separate hand-written zod schema, not derived from `Flashcard`. zod's `z.object()` strips unknown keys by default (v4.6.5, confirmed in `package.json`), and `saveFlashcard`/`updateFlashcard` both return `parsed.data` typed as `Promise<Flashcard>`. Once `Flashcard` requires the 9 new SRS columns, this becomes a real structural mismatch that no phase addressed.
- **Fix**: Add the 9 new SRS columns to `flashcardSchema` in `src/lib/flashcards.ts` as part of Phase 1 item 4, alongside the `src/types.ts` update.
- **Decision**: FIXED — added to Phase 1 item 4's contract, Phase 1 Manual Verification, and Progress item 1.6.

### F2 — "Type checking passes: npm run build" doesn't actually type-check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Success Criteria, all 3 phases (plan.md:111, 149, 214 pre-fix)
- **Detail**: Plan explicitly claimed `npm run build` runs "Astro's `astro check`/`astro sync` step" — verified false. `npm run build` = `astro build`, which transpiles via esbuild and does not type-check. `.github/workflows/ci.yml` confirmed: runs `astro sync` → `lint` → `build` only, never `astro check`. `@astrojs/check` is installed but wired into no script.
- **Fix**: Replace "Type checking passes: `npm run build`" with "Type checking passes: `npx astro check`" (plus a separate "Build succeeds: `npm run build`" line) in all 3 phases.
- **Decision**: FIXED — updated all 3 phases' Automated Verification and matching Progress checkboxes (1.2/1.2b, 2.1/2.1b, 3.1/3.1b).

### F3 — ts-fsrs dependency claim is factually wrong

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries, plan.md:26 (also change.md:13)
- **Detail**: Plan claimed ts-fsrs's "single runtime dependency (`seedrandom`)" made it edge-safe. Verified via `npm pack ts-fsrs@5.4.2`: the published package has zero runtime dependencies (only devDependencies for its own build/test tooling). Edge-safety conclusion is unaffected (even stronger), but the stated rationale was wrong.
- **Fix**: Correct plan.md and change.md to say ts-fsrs has zero runtime dependencies.
- **Decision**: FIXED — both files corrected.

### F4 — Review grading will also bump updated_at via existing trigger

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 — grade-review endpoint
- **Detail**: The existing `set_updated_at` trigger fires unconditionally on any `UPDATE`. Grading a card updates the 9 SRS columns, which also resets `updated_at` — silently broadening its meaning. No current feature reads `updated_at` for display/sort, so no active breakage.
- **Fix**: Add a one-line note in Phase 2 acknowledging the trigger will also fire on review grading; no functional change needed.
- **Decision**: FIXED — note added to Phase 2 item 2's Intent.

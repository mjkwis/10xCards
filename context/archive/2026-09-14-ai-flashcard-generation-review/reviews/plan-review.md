<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Flashcard Generation & Review Implementation Plan

- **Plan**: context/changes/ai-flashcard-generation-review/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: REVISE (all findings fixed during triage — see Decisions below)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

9/10 paths ✓ (`.env.example` does not exist — see F5), 5/5 symbols ✓, brief↔plan ✓

Deep-mode sub-agent verification (Step 3): confirmed middleware auth-boundary behavior (locals.user set unconditionally before route logic), confirmed no existing services/LLM files or naming collisions, confirmed ESLint/tsconfig alias compatibility, confirmed no existing `src/hooks/` despite the declared `@/hooks` alias (informational only, not a blocking finding), and surfaced the `Layout.astro` blast-radius issue used in F2.

## Findings

### F1 — PRD privacy guardrail on pasted content is unaddressed

- **Severity**: CRITICAL
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Overview / Phase 1 (OpenRouter service)
- **Detail**: `prd.md`'s guardrail requires pasted content (possibly code/company documents) to never leak or be used outside the user's context. The plan sent this text to OpenRouter with no data-retention control or disclosure.
- **Fix A ⭐ Recommended**: Restrict OpenRouter routing to zero-data-retention (ZDR) providers + disable prompt logging in the OpenRouter account.
  - Strength: technically enforces the guardrail.
  - Tradeoff: narrows model pool; exact API shape needs confirming at implementation time.
  - Confidence: MED.
  - Blind spot: whether ZDR restriction can silently fail open (fall back to a non-ZDR provider).
- **Fix B**: Add a plain-language disclosure near the paste box only.
  - Strength: trivial to build.
  - Tradeoff: doesn't technically enforce the guardrail; depends on provider defaults.
  - Confidence: HIGH to build, LOW that it satisfies intent.
- **Decision**: FIXED (Fix A) — added a "Data privacy" Critical Implementation Detail, wired `provider` ZDR restriction + logging-off requirement into the Phase 1 OpenRouter service contract, added manual verification + Progress item 1.7, and a new decision row in plan-brief.md.

### F2 — Missing-config banner will leak onto public signin/signup pages

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — config wiring
- **Detail**: `Layout.astro` renders a `Banner` for every `configStatuses` entry and is shared by `dashboard.astro`, `auth/signin.astro`, and `auth/signup.astro`. Adding OpenRouter to `configStatuses` would show an "OpenRouter not configured" banner to logged-out visitors.
- **Fix A ⭐ Recommended**: Don't add OpenRouter to the shared `configStatuses`; scope the notice to `dashboard.astro` only.
  - Strength: keeps the banner limited to the one page where it's actionable.
  - Tradeoff: a second, slightly different way of surfacing missing config alongside the Supabase pattern.
  - Confidence: HIGH.
- **Fix B**: Extend `Layout.astro`/`config-status.ts` with a per-page scope filter.
  - Strength: keeps one unified mechanism.
  - Tradeoff: touches the shared `Layout.astro` used by every page for a two-entry list.
  - Confidence: MED.
- **Decision**: FIXED (Fix A) — Phase 3 item 1 reworked to pass an `openRouterConfigured` boolean prop from `dashboard.astro` into `GenerateReviewIsland` instead of touching `configStatuses`; updated Implementation Approach, Key Discoveries, Phase 2 dashboard-wiring item, success criteria, Progress 3.4, and plan-brief.md accordingly.

### F3 — Single schema-invalid candidate fails the entire generation request

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — openrouter.ts / zod validation
- **Detail**: The plan validated the LLM's structured JSON response as a single batch and threw if any candidate failed schema validation, risking frequent total failures against the PRD's 75%-acceptance metric.
- **Fix**: Validate candidates individually in `openrouter.ts`; drop invalid ones and return the valid subset, only erroring if zero candidates survive validation.
- **Decision**: FIXED — Phase 1 OpenRouter service contract updated to validate per-candidate and drop invalid ones; added manual verification bullet and Progress item 1.8.

### F4 — Two concrete values deferred to "confirm at implementation time"

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan-brief.md Open Risks; plan.md Critical Implementation Details / Phase 1
- **Detail**: The plan left the Workers timeout constant and default `OPENROUTER_MODEL` id as "confirm at implementation time" placeholders.
- **Fix**: Pick concrete values now, noted as revisable constants.
- **Decision**: FIXED — pinned `DEFAULT_TIMEOUT_MS = 20_000` and `DEFAULT_MODEL = "openai/gpt-4o-mini"` in plan.md's Critical Implementation Details and Phase 1 config item; updated plan-brief.md's Open Risks to note both are revisable rather than undecided.

### F5 — `.env.example` doesn't exist; Phase 3 treats it as editable

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — env docs
- **Detail**: Confirmed via Glob: no `.env.example` exists in the repo despite CLAUDE.md documenting it. Phase 3 phrased the change as editing an existing file.
- **Fix**: Reword Phase 3's item to "create `.env.example`" documenting all four current env vars.
- **Decision**: FIXED — Phase 3 item 2 reworded to create the file, documenting `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`.

## Triage Summary

- Fixed: F1 (Fix A), F2 (Fix A), F3, F4, F5 — 5
- Skipped: none
- Accepted: none
- Dismissed: none

**Verdict after fixes: SOUND** — all findings addressed directly in plan.md and plan-brief.md.

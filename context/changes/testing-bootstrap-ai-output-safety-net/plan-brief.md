# Testing Bootstrap + AI-Output Safety Net — Plan Brief

> Full plan: `context/changes/testing-bootstrap-ai-output-safety-net/plan.md`

## What & Why

Stand up Vitest in a repo with zero test tooling, and write unit tests proving two guardrails already in the codebase actually work: the LLM-output validation pipeline in `openrouter.ts` (Risk #1) and the server-side pasted-text length limit in the generate API route (Risk #5). This is Phase 1 of `context/foundation/test-plan.md`'s 5-phase test rollout.

## Starting Point

No test runner, config, or test files exist anywhere in the repo. The guardrails under test are not new — `generate.ts` already enforces a 5000-char limit via zod before calling the LLM, and `openrouter.ts` already has a 3-layer schema validation chain, a candidate filter/cap loop, and typed `GenerationTimeoutError`/`GenerationFailedError` errors. This phase proves that existing behavior, it doesn't build it.

## Desired End State

`npm run test` runs a Vitest suite covering every failure branch in the LLM-response validation chain and the length-guardrail/error-mapping logic in the API route — with zero real network calls (fetch always mocked). `npm run lint` still passes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test runner | Vitest | Already recorded in test-plan.md §4; fits the existing Vite-based Astro toolchain. | Research (test-plan.md) |
| Vitest/Astro integration | `getViteConfig` from `astro/config` | Inherits Astro's real Vite pipeline so the `@/*` alias and `astro:env/server` virtual module resolve for free, vs. hand-maintaining a duplicate config. | Plan (user-directed) |
| Production-code cleanup (duplicated constant, redundant catch branch) | Leave untouched | Keeps this change scoped to test infrastructure only, matching test-plan.md's Phase 1 goal. | Plan (user-directed) |
| Code coverage tooling | Skip for now | test-plan.md's Phase 1 scope is "unit" tests only, no coverage gate mentioned; avoids picking a threshold with 3 of 5 risk areas still uncovered. | Plan (user-directed) |
| Mocking strategy | Native `fetch` mocking (`vi.stubGlobal`), no MSW | Already recorded in test-plan.md §4 — no need for a mocking library at this scale. | Research (test-plan.md) |

## Scope

**In scope:**
- `vitest.config.ts` bootstrap via `getViteConfig`, `npm run test` / `test:watch` scripts
- Full branch coverage of `generateFlashcardCandidates` (`src/lib/services/openrouter.ts`)
- Length-guardrail and error-mapping coverage of the generate API route (`src/pages/api/flashcards/generate.ts`)

**Out of scope:**
- CI wiring (test-plan.md Phase 5), cross-user authorization tests (Phase 2), SRS scheduler tests (Phase 3), LLM-failure UI/component tests (Phase 4)
- Fixing the duplicated `MAX_SOURCE_TEXT_LENGTH` constant or the redundant catch branch in `generate.ts`
- Code coverage reporting, testing `GenerateReviewIsland.tsx`/`CandidateCard.tsx`/`saveFlashcard`, or verifying real Cloudflare Workers timeout behavior

## Architecture / Approach

`vitest.config.ts` calls `getViteConfig()` so tests run inside Astro's own Vite pipeline. Two new test files exercise the code directly (no HTTP server, no Astro dev runtime): `openrouter.test.ts` calls `generateFlashcardCandidates` with a mocked `fetch` and a mocked `astro:env/server`; `generate.test.ts` calls the exported `POST` handler with a minimal fake `APIContext` and a mocked `openrouter.ts` module.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest + Astro/Vite bootstrap | Working `npm run test`, config resolves `@/*` and `astro:env/server` | The `astro:env/server` virtual-module resolution gotcha |
| 2. LLM-output validation tests (Risk #1) | Full branch coverage of `openrouter.ts`'s validation/filter/cap/error logic | Module-load-time env binding makes "API key present vs. missing" tricky to test without `vi.resetModules()` |
| 3. Length-guardrail + error-mapping tests (Risk #5) | Proof the LLM is never called for oversized/empty/unauthenticated requests; error-status mapping verified | Asserting call-count, not just status code, for the guardrail |

**Prerequisites:** None — `ai-flashcard-generation-review` (the code under test) is already implemented and archived as done.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- The exact Vitest major version compatible with the repo's `vite: ^7.3.2` override isn't pinned in this plan — confirm during `npm install`.

## Success Criteria (Summary)

- `npm run test` and `npm run lint` both pass.
- Every contract cell in test-plan.md's Risk Response Guidance rows #1 and #5 has a corresponding, specifically-asserting test case (not just "does not throw").

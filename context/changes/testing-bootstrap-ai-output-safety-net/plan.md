# Testing Bootstrap + AI-Output Safety Net Implementation Plan

## Overview

Stand up Vitest in a repo that currently has zero test tooling, and write unit tests that prove the two guardrails Risk #1 and Risk #5 (from `context/foundation/test-plan.md` §2) already behave correctly: the flashcard-generation pipeline rejects malformed/invalid LLM output without crashing or persisting garbage, and the API route rejects an oversized/empty pasted-text payload before ever calling the LLM. This is Phase 1 of the project's 5-phase test rollout (`context/foundation/test-plan.md:90`).

## Current State Analysis

No test runner, test config, or test files exist anywhere in the repo (`package.json` has no `vitest`/`jest` dependency or `test` script; no `*.test.*`/`*.spec.*` file exists; `.github/workflows/ci.yml` runs `astro sync`, lint, and build only — no test step).

The guardrails this phase must defend are already implemented in production code, not new features:

- **Risk #5 (unenforced length limit)**: `src/pages/api/flashcards/generate.ts:6-10` defines `MAX_SOURCE_TEXT_LENGTH = 5000` and validates the request body with `z.object({ sourceText: z.string().min(1).max(5000) })` (`generateCommandSchema`). This zod check runs at line 18, before `generateFlashcardCandidates` is ever called at line 24 — so an oversized or empty payload is already rejected without an LLM call. There is no test proving this today.
- **Risk #1 (malformed/invalid LLM output)**: `src/lib/services/openrouter.ts` already has three layers of defense: an envelope schema (`openRouterResponseSchema`, lines 36-44), a structured-content schema (`structuredResponseSchema`, lines 32-34), and a per-candidate schema (`candidateSchema`, lines 27-30). The candidate-filtering loop (lines 153-162) discards invalid items and stops once it has collected `MAX_CANDIDATES = 10` (line 8) valid ones; if zero candidates survive filtering, it throws `GenerationFailedError("No valid flashcard candidates were returned")` (lines 164-166). A separate `GenerationTimeoutError` (lines 13-18) covers the `AbortController`-based timeout (lines 96-99, 118-121). None of this is under test today.

### Key Discoveries:

- `src/lib/services/openrouter.ts:2` imports `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from the virtual module `astro:env/server`. A bare Vitest config cannot resolve this import; it only exists inside Astro's Vite pipeline. Astro 6 exposes `getViteConfig` from `astro/config` specifically to let Vitest inherit that pipeline (confirmed choice below).
- `astro:env/server` bindings are read once, at module-import time, via top-level `import { ... } from "astro:env/server"` — see "Critical Implementation Details" below for why this matters for testing both the "API key present" and "API key missing" branches.
- The route's `POST` handler (`src/pages/api/flashcards/generate.ts:12-35`) is a plain exported async function taking an Astro `APIContext`-shaped argument — it can be unit-tested directly by calling `POST(fakeContext)` without spinning up the Astro dev server, as long as `generateFlashcardCandidates` is mocked out (`vi.mock("@/lib/services/openrouter")`) to isolate the route's own guardrail/error-mapping logic.
- `tsconfig.json:9-10` defines the `@/*` → `./src/*` alias used throughout the generation code; `getViteConfig` inherits this automatically since it reuses Astro's real Vite config.
- `zod@^4.6.5` is already a direct (non-dev) dependency — no new validation library is needed.
- Two minor pre-existing code smells surfaced during research — a duplicated `MAX_SOURCE_TEXT_LENGTH` constant (`generate.ts:6` and `GenerateReviewIsland.tsx:9`) and a redundant duplicate catch-all branch in `generate.ts:27-35` that produces the same outcome as the `GenerationFailedError` branch above it. Per user decision, these are left untouched — see "What We're NOT Doing."

## Desired End State

`npm run test` runs a Vitest suite covering `src/lib/services/openrouter.ts` and `src/pages/api/flashcards/generate.ts`, with zero network calls (fetch is always mocked). The suite passes locally and demonstrates, with an assertion for each, every contract cell in test-plan.md's Risk Response Guidance rows #1 and #5. `npm run lint` continues to pass with the new files included.

Verification: run `npm run test` and `npm run lint` — both exit 0; open the two new `*.test.ts` files and confirm each Response Guidance contract item has a corresponding `it(...)` block.

## What We're NOT Doing

- Wiring the test suite into CI (`test-plan.md` Phase 5 — "Quality-gates wiring" — owns this).
- The cross-user authorization suite (test-plan.md Phase 2, Risk #2).
- SRS scheduler correctness tests (test-plan.md Phase 3, Risk #3).
- Integration/component tests for the slow/failed-LLM-call UI path (test-plan.md Phase 4, Risk #4) — this phase only proves the route maps service errors to the right HTTP status; it does not test any UI component.
- Fixing the duplicated `MAX_SOURCE_TEXT_LENGTH` constant or the redundant catch branch in `generate.ts` — user decision: keep this change scoped to test infrastructure, not a production-code refactor.
- Code coverage reporting/thresholds — user decision: keep the bootstrap minimal; revisit at test-plan Phase 5 if needed.
- Testing `GenerateReviewIsland.tsx`, `CandidateCard.tsx`, or `src/lib/flashcards.ts` (`saveFlashcard`) — none of these sit inside Risk #1 or #5's scope for this phase.
- Verifying actual Cloudflare Workers subrequest-timeout behavior in a real deployment — that's Risk #4 / Phase 4 territory; this phase only tests that the code path reacts correctly to a mocked `AbortError`.

## Implementation Approach

Use Astro's `getViteConfig` helper (from `astro/config`) as the Vitest config, so tests inherit Astro's real Vite pipeline — the `@/*` alias and the `astro:env/server` virtual module resolve without hand-rolled aliasing or module stubs at the config level. Within test files that need to control `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` per test case, use `vi.mock("astro:env/server", ...)` — this coexists with `getViteConfig` because `vi.mock` intercepts at the module-registry level regardless of how the module was originally resolvable. All external I/O (the OpenRouter `fetch` call) is mocked with `vi.stubGlobal("fetch", vi.fn())`; no MSW, no real network access, matching test-plan.md §4's stack choice.

## Critical Implementation Details

**Module-load-time env binding.** `openrouter.ts` binds `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` once, at import time, via a top-level `import` statement — not a function call read on each invocation. A test that needs the "missing API key" branch (`GenerationFailedError` thrown when the key is absent) and another test that needs a "key present" branch cannot both run against the same already-imported module instance with `vi.stubEnv` after the fact. Use `vi.resetModules()` plus a fresh dynamic `await import("@/lib/services/openrouter")` in each test (or split across two `describe` blocks that each reset modules in `beforeEach`) so the mocked `astro:env/server` value is re-read on each import.

**Minimal fake `APIContext`.** Building a full real Astro `APIContext` for the route test is unnecessary. Construct only what `POST` actually reads: `{ locals: { user: <truthy|undefined> }, request: { json: () => Promise<unknown> } }`, cast to satisfy the `APIRoute` handler's parameter type. This keeps the route test focused on the route's own logic (auth check, schema validation, error mapping) rather than Astro's request machinery.

## Phase 1: Vitest + Astro/Vite Bootstrap

### Overview

Add Vitest as a dev dependency, configure it via `getViteConfig` so it inherits Astro's alias and env-virtual-module resolution, and wire `npm run test` / `npm run test:watch` scripts. Prove the config works with one minimal smoke test that imports the real `openrouter.ts` module (exercising both the `@/*` alias and the `astro:env/server` import) before writing the full test matrix in Phase 2.

### Changes Required:

#### 1. Add Vitest dependency and scripts

**File**: `package.json`

**Intent**: Add the test runner and expose it via standard npm scripts, matching the tool choice already recorded in `context/foundation/test-plan.md` §4.

**Contract**: New devDependency `vitest` (latest major compatible with the `vite: ^7.3.2` override already pinned in `package.json` — confirm resolution during `npm install`, since Vitest majors track specific Vite peer ranges). New scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Configure Vitest through Astro's own Vite pipeline so the `@/*` alias and the `astro:env/server` virtual module resolve without a hand-maintained duplicate of Astro's Vite config.

**Contract**: Uses `getViteConfig` from `astro/config`, the API Astro 6 ships specifically for this integration:

```ts
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

#### 3. Smoke test proving the config resolves

**File**: `src/lib/services/openrouter.test.ts` (new — Phase 2 expands this same file with the full test matrix)

**Intent**: Confirm, before writing real test cases, that importing `openrouter.ts` under Vitest succeeds — i.e., both the `@/*`-aliased import in the module under test and its `astro:env/server` import resolve.

**Contract**: A single `it("resolves the module under test", () => { expect(typeof generateFlashcardCandidates).toBe("function"); })`-style assertion, imported via the real `@/lib/services/openrouter` path (no mocking needed for this one check).

### Success Criteria:

- `npm install` completes and Vitest resolves against the `vite: ^7.3.2` override without a peer-dependency conflict
- `npm run test` runs and passes the Phase 1 smoke test
- `npm run lint` passes with the new files included

#### Manual Verification:

- Run `npm run test:watch` locally and confirm watch mode starts cleanly (no config or resolution errors reported)

---

## Phase 2: LLM-Output Validation Tests (Risk #1)

### Overview

Expand `src/lib/services/openrouter.test.ts` into the full test matrix for `generateFlashcardCandidates`, covering every failure branch test-plan.md's Risk Response Guidance row #1 calls out, plus the happy path.

### Changes Required:

#### 1. Full test matrix for `generateFlashcardCandidates`

**File**: `src/lib/services/openrouter.test.ts`

**Intent**: Prove the service treats the LLM's response as adversarial input — rejecting malformed/invalid JSON without crashing, filtering invalid candidates instead of persisting garbage, capping accepted candidates at 10, and throwing the typed `GenerationFailedError` when zero valid candidates remain — matching test-plan.md's stated proof criteria for this risk.

**Contract**: One `describe` block per failure mode, each asserting the specific thrown error type/message or returned value (not just "does not throw"):

- Missing `OPENROUTER_API_KEY` (mocked absent via `astro:env/server`) → `GenerationFailedError`
- `fetch` rejects with a non-abort error → `GenerationFailedError("Failed to reach OpenRouter")`
- `fetch` rejects with `{ name: "AbortError" }` (no need to wait out the real 20s timeout — reject the mocked promise directly) → `GenerationTimeoutError`
- `fetch` resolves with a non-OK status → `GenerationFailedError`
- `response.json()` rejects (malformed JSON from OpenRouter's HTTP layer) → `GenerationFailedError`
- Response body fails `openRouterResponseSchema` (missing `choices`/`message`/`content`) → `GenerationFailedError`
- `content` field present but not a string → `GenerationFailedError`
- `content` is a string but not valid JSON (`JSON.parse` throws) → `GenerationFailedError`
- Parsed content fails `structuredResponseSchema` (no `flashcards` array) → `GenerationFailedError`
- `flashcards` array has a mix of valid and invalid items (empty string, missing field, wrong type, over-length `front`/`back`) → invalid items are filtered out; valid ones are returned
- `flashcards` array has more than 10 valid items → result is capped at exactly 10, and no more items than necessary are validated after the cap is hit
- All items in `flashcards` fail candidate validation → `GenerationFailedError("No valid flashcard candidates were returned")`
- Well-formed response with 1-10 valid candidates → resolves to the matching `FlashcardCandidateDto[]`, and the `fetch` call's method/URL/`Authorization` header reflect the mocked API key

### Success Criteria:

- `npm run test -- src/lib/services/openrouter.test.ts` passes, exercising every branch listed above
- `npm run lint` passes

#### Manual Verification:

- Re-read the test file against test-plan.md's Risk #1 Response Guidance row and confirm each of its four proof criteria (reject malformed/invalid JSON, filter invalid candidates, cap at 10, throw typed error at zero valid) has a corresponding assertion

---

## Phase 3: Input-Length Guardrail + Error-Mapping Tests (Risk #5)

### Overview

Add a test file for the API route itself, proving the server-side length/emptiness guardrail runs — and rejects — before any LLM call, and that the route maps service-layer errors to the correct HTTP status without crashing on an unexpected error type.

### Changes Required:

#### 1. Route-level tests

**File**: `src/pages/api/flashcards/generate.test.ts` (new)

**Intent**: Prove the cost/time guardrail from test-plan.md Risk #5 actually bounds LLM invocation — not just that a response code changes, but that `generateFlashcardCandidates` is never called for a request that should be rejected — and that the route's error mapping degrades gracefully.

**Contract**: `vi.mock("@/lib/services/openrouter")` to replace `generateFlashcardCandidates` with a controllable mock; build a minimal fake `APIContext` (see Critical Implementation Details) per call. Cases:

- No `locals.user` → 401; mocked `generateFlashcardCandidates` never called
- Missing `sourceText` / non-JSON body → 400; service never called
- `sourceText` empty string → 400; service never called
- `sourceText` at exactly 5000 chars → passes validation, service is called, 200 with the mocked candidates returned
- `sourceText` at 5001 chars (one over the limit) → 400; service never called
- Mocked service throws `GenerationTimeoutError` → 504
- Mocked service throws `GenerationFailedError` → 502
- Mocked service throws a plain unexpected `Error` → 502, not an unhandled crash

### Success Criteria:

- `npm run test -- src/pages/api/flashcards/generate.test.ts` passes
- Full suite passes: `npm run test`
- `npm run lint` passes

#### Manual Verification:

- Confirm via the mock's call-count assertions that `generateFlashcardCandidates` is never invoked for the oversized/empty/unauthenticated cases — the exact anti-pattern test-plan.md's Risk #5 row warns against (a passing status-code check alone doesn't prove the LLM was never called)

---

## Testing Strategy

### Unit Tests:

- `src/lib/services/openrouter.test.ts` — see Phase 2's full branch list
- `src/pages/api/flashcards/generate.test.ts` — see Phase 3's full case list

### Integration Tests:

- None in this phase — test-plan.md scopes Phase 1 to `unit` only (§3, §4).

### Manual Testing Steps:

1. Run `npm run test` and confirm all tests pass with zero real network calls made (no external requests should appear in any local proxy/logging if one is active).
2. Run `npm run lint` and confirm no new lint errors from the added files.

## Performance Considerations

None — no production code changes in this phase; the test suite itself uses only mocked `fetch`, so it runs fast and adds no network dependency to CI or local dev.

## Migration Notes

Not applicable — no data or schema changes.

## References

- Test plan and risk map: `context/foundation/test-plan.md` (§2 Risk Map rows #1, #5; §3 Phase 1; Risk Response Guidance table)
- Prior implementation plan for the code under test: `context/archive/2026-09-14-ai-flashcard-generation-review/plan-brief.md`
- Code under test: `src/pages/api/flashcards/generate.ts`, `src/lib/services/openrouter.ts`, `src/types.ts:9-20`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest + Astro/Vite Bootstrap

#### Automated

- [x] 1.1 npm install completes and Vitest resolves against the vite override without conflict
- [x] 1.2 npm run test runs and passes the Phase 1 smoke test
- [x] 1.3 npm run lint passes with the new files included

#### Manual

- [x] 1.4 npm run test:watch starts cleanly with no config/resolution errors

### Phase 2: LLM-Output Validation Tests (Risk #1)

#### Automated

- [x] 2.1 npm run test -- src/lib/services/openrouter.test.ts passes all branches
- [x] 2.2 npm run lint passes

#### Manual

- [x] 2.3 Test file reviewed against test-plan.md Risk #1 Response Guidance row — all four proof criteria covered

### Phase 3: Input-Length Guardrail + Error-Mapping Tests (Risk #5)

#### Automated

- [ ] 3.1 npm run test -- src/pages/api/flashcards/generate.test.ts passes all cases
- [ ] 3.2 npm run test (full suite) passes
- [ ] 3.3 npm run lint passes

#### Manual

- [ ] 3.4 Mock call-count assertions confirm generateFlashcardCandidates is never invoked for oversized/empty/unauthenticated requests

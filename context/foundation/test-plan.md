# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding
`node_modules`, `dist`, `.astro`, `supabase/migrations`).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Malformed, oversized, or empty LLM output produces invalid flashcards or breaks generation entirely | High | Medium | user brief; interview Q3 (AI generation/review flow named as the lowest-confidence area) |
| 2 | Authorization gap lets a user view, list, update, or delete another user's flashcards (IDOR) | High | Medium | user brief; PRD Access Control section ("flat model, one role, users only have rights to their own cards") |
| 3 | SRS scheduling logic produces the wrong review order or corrupts scheduling state | High | Medium | roadmap S-06 status (in-progress, sole hard-blocked slice) + risk note; PRD Socratic FR-009 ("sedno produktu") |
| 4 | A slow or failing LLM call surfaces an opaque platform error instead of the required progress/error UI | Medium | Medium | infrastructure.md Risk Register (Workers subrequest timeout); PRD NFR (200ms/2s visible-progress requirement) |
| 5 | Server does not independently enforce the pasted-text length limit, risking uncontrolled LLM cost/time if the client-side limit is bypassed | Medium | Medium | PRD FR-001 Socratic note (length limit added specifically as a cost/time guardrail); abuse lens — untrusted input |

**Impact × Likelihood rubric.**

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

**Abuse / security lens.** The product has auth and accepts free-text user
input, so the risk map includes two abuse scenarios: authorization/IDOR
(#2) and untrusted-input/resource-abuse via an unenforced length limit
(#5). No secret/PII-leakage or rate-limit-bypass row was added — no
evidence surfaced either concern (see Challenger findings below); revisit
if a future interview or PRD update raises one.

**Challenger findings:** a separate risk ("pasted content leaks outside
the user's context via third-party LLM-provider logging") was considered
and dropped — the third-party-logging angle is not testable from this
codebase, and the app-controlled portion of that concern (a user's
generation output or list view leaking to another user) was folded into
Risk #2, which was widened from "update/delete" to "view/list/update/
delete".

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | The generation pipeline rejects malformed/invalid JSON without crashing or persisting garbage, filters invalid candidates, caps accepted candidates at 10, and throws a typed `GenerationFailedError` when zero valid candidates remain | "The LLM usually returns valid JSON so happy-path parsing is enough" — untrusted external API output must be treated as adversarial, not a trusted contract | The response contract the OpenRouter service expects; what "invalid candidate" means (missing/empty fields, wrong types); how the failure error propagates to the API route and UI | unit (mocked fetch, no network) | Asserting against a valid-looking fixture only (oracle problem) — expected shape must come from the declared candidate contract, not from copying the parser's own logic |
| #2 | A second, independently authenticated Supabase user cannot list, view, update, or delete flashcards owned by the first user, at the API-route boundary | "RLS is on so the app layer doesn't need its own check" — RLS mitigates but an app-layer query missing an explicit ownership filter, or an ID-only lookup, can still leak via response body, count, or error-code side channels | Whether API routes filter by authenticated user_id explicitly or rely solely on RLS; response shape on a cross-user 403/404 (must not silently return another user's data or distinguish existence via error code) | integration (two seeded Supabase test users hitting the real API routes) | Testing only "unauthenticated request is rejected" — that proves authentication, not authorization; must use two authenticated accounts and assert cross-account denial specifically |
| #3 | Given a known review-history input, the scheduler orders/selects the next-due card and updates scheduling fields (interval, due date, stability, etc.) matching an independently-derived expected outcome | "If the function returns without throwing, the schedule is correct" — a scheduler can run cleanly while producing a wrong order, and no test catches that without an independent oracle | Which SRS library/algorithm was actually integrated (roadmap flagged this as unresolved at planning time); the FSRS fields introduced in the recent schema migration; a documented spec (library docs, or a hand-worked example) to derive expected values from | unit (fixed input review histories, independently-computed expected outputs) | Oracle problem — deriving "expected" interval/order values by reading the scheduler implementation and asserting it reproduces itself |
| #4 | When the LLM call is slow or fails, the user sees the PRD-required progress/error UI state, not a raw platform error or a blank screen, within the NFR's stated timing | "A try/catch around the fetch is enough" — a platform-level subrequest timeout can abort execution in ways a normal try/catch doesn't observe; the test must simulate a slow/aborted response, not just an immediately-rejected promise | How the generation route currently handles fetch errors/timeouts; what UI state the error/review components render on failure; whether a client-side timeout shorter than the platform limit exists | integration/component (mocked delayed or aborted fetch response) | Testing only the instant-failure case (fetch rejects immediately) — the real risk is a slow response that exceeds a timeout, not a fast error |
| #5 | The generation API route rejects oversized pasted text server-side, before any LLM call is made, independent of any client-side check | "The textarea has a maxlength so we're covered" — client-side limits are trivially bypassed by a direct API call; the guardrail exists specifically to bound LLM cost/time | The agreed length-limit value (PRD Open Question #1, owner: user, due before implementation); where in the request path validation should occur | unit/integration (oversized payload against the API route) | Asserting only that a response code changed, without asserting the LLM was never called — letting the request through and discarding the output doesn't prove the cost guardrail |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap + AI-output safety net | Stand up Vitest and defend against invalid/oversized LLM output and an unenforced input-length guardrail | #1, #5 | unit | change opened | context/changes/testing-bootstrap-ai-output-safety-net/ |
| 2 | Cross-user authorization suite | Prove one Supabase user cannot view/list/update/delete another user's flashcards | #2 | integration | not started | — |
| 3 | SRS scheduling correctness | Verify scheduler output against an independently-derived expected result | #3 | unit | not started | — |
| 4 | Graceful LLM failure handling | Verify a slow/failed LLM call surfaces the required progress/error UI, not a raw platform error | #4 | integration/component | not started | — |
| 5 | Quality-gates wiring | Wire the test suite into CI so it actually gates merges | cross-cutting | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. No test runner is configured yet
(test-base profile: `none` — zero `*.test.*`/`*.spec.*` files, no
`vitest`/`jest`/`playwright` config found in the repo).

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | latest | none yet — see §3 Phase 1; fits the existing Vite-based Astro toolchain with no extra bundler config |
| API mocking | native `fetch` mocking (`vi.fn()` / `vi.stubGlobal`) | n/a | none yet — see §3 Phase 1; no MSW needed at this scale, OpenRouter and Supabase calls are the only external edges |
| e2e | none planned | n/a | not proposed by this rollout — the risk map's highest-priority scenarios are cheaper to catch at unit/integration; revisit at `--refresh` if a risk emerges that only e2e can catch |
| accessibility | none planned | n/a | not raised by any source in this rollout; revisit at `--refresh` if it surfaces |
| (optional) AI-native | not proposed | n/a | no risk in this rollout's map needs a layer classic tests can't cover more cheaply |

**Stack grounding tools (current session):**
- Docs: none available — no Context7 or framework-docs MCP exposed in this session; checked: 2026-09-14
- Search: none available — no Exa.ai or web-search MCP exposed in this session; checked: 2026-09-14
- Runtime/browser: none used — no browser/Playwright MCP consulted; checked: 2026-09-14
- Provider/platform: none used — no GitHub/Cloudflare/Supabase MCP consulted for this rollout; checked: 2026-09-14

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI (`.github/workflows/ci.yml`) | required (already wired) | syntactic / type drift |
| unit tests | local + CI | planned, required after §3 Phase 1 | invalid LLM-output handling, input-length guardrail regressions |
| integration tests (Supabase) | local + CI | planned, required after §3 Phase 2 | cross-user authorization regressions |
| unit tests (SRS) | local + CI | planned, required after §3 Phase 3 | scheduling-logic regressions |
| integration/component tests (LLM failure paths) | local + CI | planned, required after §3 Phase 4 | opaque-error regressions on slow/failed generation |
| CI test gate | CI on PR | planned, wired by §3 Phase 5 | any of the above regressions reaching `master` unblocked |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 for the LLM-output validation and input-length
  guardrail pattern (mocked-fetch unit tests, no network).

### 6.2 Adding an integration test

- TBD — see §3 Phase 2 for the two-Supabase-user cross-user authorization
  pattern.

### 6.3 Adding an e2e test

- Not planned by this rollout — see §4 Stack.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 2 for the authorization-check pattern new flashcard
  endpoints should follow.

### 6.5 Adding a test for the SRS scheduler

- TBD — see §3 Phase 3 for the independent-oracle unit-test pattern.

### 6.6 Per-rollout-phase notes

(Empty — fills in as phases land.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption
changes.

- **Astro static pages/layout** — marketing/landing content and page
  shells; low blast radius, changes rarely. Re-evaluate if these pages
  gain interactive or business-critical logic. (Source: Phase 2 interview
  Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-14
- Stack versions last verified: 2026-09-14
- AI-native tool references last verified: n/a — none proposed

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

# AI Flashcard Generation & Review — Plan Brief

> Full plan: `context/changes/ai-flashcard-generation-review/plan.md`

## What & Why

Implement the product's north-star flow (roadmap S-02): a user pastes source text, an LLM generates flashcard proposals via OpenRouter (using the user's own API key), and the user accepts, edits, or rejects each one before it's saved. This is the only flow that lets the team measure the PRD's two primary success metrics (75% AI-card acceptance, 75% of cards created via AI).

## Starting Point

Auth and the `flashcards` table already exist and work. Nothing AI-related exists yet: no LLM dependency, no OpenRouter config, no `/api/flashcards/*` routes, no flashcard UI at all — `dashboard.astro` is still a placeholder. The roadmap explicitly left the LLM provider/key-management choice open for this planning session.

## Desired End State

A logged-in user pastes up to 5,000 characters on the dashboard, clicks generate, sees an immediate "Generating…" state, and gets up to 10 flashcard proposals to accept/edit/reject. Accepted cards land in `flashcards` with the correct `source`. Failures show an inline error with manual retry — never a blank screen or raw platform error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| LLM provider | OpenRouter, user's own API key | Explicitly the open decision this planning session existed to resolve. | Plan (user-directed) |
| Model selection | Single model, id set via server secret | Simple, swappable without redeploy, no fallback-chain complexity for a 1-week MVP. | Plan |
| Structured output | JSON schema `response_format` + zod validation | Matches this repo's zod convention; validation is a safety net even when the provider mostly honors the schema. | Plan |
| Source text limit | 5,000 characters | Covers a real doc page/SO thread while bounding cost/latency (resolves PRD FR-001 open question). | Plan |
| Card count per generation | Model decides, capped at 10 | Scales with input richness; avoids padding/cramming from a fixed count. | Plan |
| Timeout handling | Explicit service-side `AbortController` timeout + inline error, manual retry | Implements the exact mitigation `infrastructure.md`'s risk register already named for Workers' subrequest-timeout risk. | Plan |
| Progress UX (NFR) | Non-streaming call + client-side spinner set synchronously on submit | Satisfies the ≤200ms-ack / visible-progress-past-2s NFR without streaming infra. | Plan |
| Candidate persistence | Client-side state only until accepted | Matches the existing `flashcards` schema, which has no candidates/proposals table. | Plan |
| Cost guardrail | `max_tokens` cap on the LLM response | Cheap, direct bound on cost per call; rate limiting is overkill at `target_scale.users: small`. | Plan |
| Data privacy | Restrict OpenRouter routing to zero-data-retention providers + disable prompt logging | Enforces the PRD's "pasted content must not leak or be used outside the user's context" guardrail (plan review F1). | Plan review |

## Scope

**In scope:**
- `POST /api/flashcards/generate` (OpenRouter call, validation, timeout/error handling)
- `POST /api/flashcards` (persist one accepted/edited card)
- Review UI on `/dashboard` (paste, generate, accept/edit/reject per candidate)
- OpenRouter secret config + missing-config banner (reusing existing pattern)

**Out of scope:**
- Persisting proposals before review, streaming responses, server-side auto-retry, multi-model fallback, user-configurable model/count, per-user rate limiting, manual CRUD (S-03/S-04/S-05), SRS session (S-06), deduplication.

## Architecture / Approach

A new `src/lib/services/openrouter.ts` owns the OpenRouter call (prompt, structured output, timeout, zod validation, zero-data-retention provider restriction), keeping the API route thin. A single React island (`GenerateReviewIsland`) on `dashboard.astro` holds candidates in local state; each accept/edit calls `POST /api/flashcards` to write one row via the authenticated Supabase client (RLS-scoped). Missing OpenRouter config is surfaced with a dashboard-scoped notice, not the shared `config-status.ts` → `Banner.astro` wiring (that stays Supabase-only, since it also renders on the public sign-in/sign-up pages).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. OpenRouter integration & generate API | Service + `/api/flashcards/generate`, config, types | Getting the service-side timeout genuinely shorter than Workers' platform limit |
| 2. Review UI & accept persistence | Dashboard review flow + `/api/flashcards` create route | API routes aren't covered by `PROTECTED_ROUTES` — must self-check auth |
| 3. Guardrails, config wiring & manual verification | Missing-config banner, env docs, end-to-end NFR/error verification | Confirming actual Cloudflare timeout/latency behavior only observable in a real deploy |

**Prerequisites:** F-01 (Supabase connection) and S-01 (signup/signin) are already done. User needs an OpenRouter API key (already have one).
**Estimated effort:** ~1 session across 3 phases, consistent with the project's 1-week/after-hours MVP timeline.

## Open Risks & Assumptions

- The exact OpenRouter API field/value for restricting to zero-data-retention providers isn't verified in this plan — the implementer should confirm the current request shape against OpenRouter's live docs, and check whether the restriction can silently fall back to a non-ZDR provider.
- Default constants are now pinned in the plan (`DEFAULT_TIMEOUT_MS = 20_000`, `DEFAULT_MODEL = "openai/gpt-4o-mini"`) but both are explicitly revisable — reconfirm the timeout against Cloudflare's current documented limit and the model against OpenRouter's live catalog/pricing before relying on them long-term.
- Assumes a single shared server-side OpenRouter key is fine (matches the app's flat, single-tenant-like auth model per the PRD) rather than per-user keys.

## Success Criteria (Summary)

- A user can paste text, generate candidates, and accept/edit/reject each one, with accepted cards correctly persisted (`source` matches action taken).
- Failures (timeout, bad config, invalid input) always show a clear in-app message and retry path — never a blank screen or raw platform error.
- Missing `OPENROUTER_API_KEY` is visibly surfaced the same way missing Supabase config already is.

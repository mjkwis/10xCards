---
project: 10xcards
researched_at: 2026-09-11
recommended_platform: Cloudflare Workers
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the only platform in the candidate pool that passed all four heavily-weighted criteria (CLI-first, managed/serverless, agent-readable docs, stable deploy API) with no partials, while matching the developer's existing Cloudflare familiarity (interview Q3) and requiring no persistent connections (interview Q1) that would justify Fly.io's heavier container-ops model. Its free tier (100k requests/day) fully covers this MVP's expected traffic at $0, and `@astrojs/cloudflare` is already the adapter implied by the project's tech stack. The anti-bias cross-check surfaced real but manageable risks (`nodejs_compat` gaps, Pages/Workers naming drift, LLM subrequest timeouts, code/data rollback mismatch) — the developer chose to proceed with these noted in the risk register below.

## Platform Comparison

| Platform | CLI-first | Managed/serverless | Agent docs | Stable deploy API | MCP/integration |
|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Partial |
| **Fly.io** | Pass | Partial | Pass | Pass | Partial |
| **Netlify** | Partial | Pass | Pass | Partial | Partial |
| Vercel | Pass | Pass | Partial | Partial | Partial |
| Railway | Partial | Pass | Pass | Partial | Pass |
| Render | Partial | Pass | Partial | Partial | Pass |

**Cloudflare Workers** — `wrangler deploy`/`wrangler rollback`/`wrangler tail` cover the full operational loop from a terminal with no dashboard step. Workers is pure edge serverless: no Dockerfile, no VM lifecycle, no OS to patch. Docs are published as GA `llms.txt` and per-page markdown via content negotiation. Deploys and rollbacks are version-ID based and fully deterministic. MCP support exists for building/deploying MCP servers on Workers, but the docs don't label a clear GA/beta maturity for platform-management MCP itself.

**Fly.io** — `flyctl deploy`, `fly releases rollback`, and `fly logs` are equally rigorous and deterministic, and docs are mirrored on GitHub (`superfly/docs`). It drops to Partial on "managed/serverless" because it runs Fly Machines (Firecracker VMs) requiring a Dockerfile and machine-lifecycle awareness (auto-stop/auto-start, cold starts on wake) — a real but manageable step up in operational surface versus Workers' zero-infra model. Fly also removed its standing free tier in 2024 (now a time-boxed trial only), so realistic cost is ~$2–15/month versus Cloudflare's $0.

**Netlify** — Strong serverless fit (functions are GA, docs are `.md`-suffixed with a confirmed `llms.txt`) and the free tier's request-credit budget likely covers this app's traffic. It scores Partial on CLI-first and stable deploy API because **rollback has no CLI command** — it's a dashboard-only "Publish Deploy" action on a prior atomic deploy, which blocks a fully unattended agent operational loop.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Won on the four heavily-weighted criteria with no partials, zero added infrastructure to manage (no containers, no VMs), a $0 cost at this traffic level, and direct alignment with the developer's existing platform familiarity.

#### 2. Fly.io

Matches Cloudflare on CLI rigor, docs, and deploy-API stability, but requires managing a Dockerfile and VM lifecycle (auto-stop/start, cold starts) that this stateless request/response app doesn't need, and costs more per month with no standing free tier.

#### 3. Netlify

Comparable serverless fit and equally strong agent-readable docs, but the missing CLI rollback path is a genuine gap for unattended agent-driven operations — the clearest differentiator against Cloudflare and Fly.io.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`nodejs_compat` is not full Node parity** — Supabase's JS SDK and its dependencies can fail only at runtime on Cloudflare's V8-isolate model, in ways `npm run build` won't catch locally.
2. **Pages vs. Workers mismatch** — `tech-stack.md` hints `deployment_target: cloudflare-pages`, but Cloudflare now steers new projects to Workers, not Pages. Following the stale hint literally risks building against de-emphasized tutorials/config instead of the current Workers-based Astro integration.
3. **Three different env-var mechanisms** for the same `SUPABASE_URL`/`SUPABASE_KEY` — `.env` (Node), `.dev.vars` (local Workers), `wrangler secret put` (production) — an easy "works locally, breaks in prod" trap under time pressure.
4. **Subrequest timeouts on slow LLM calls** — the AI flashcard-generation endpoint proxies to an external LLM provider; a slow response can hit Workers' fixed request/subrequest timeout, surfacing as an opaque platform error rather than a graceful in-app failure.
5. **Code rollback ≠ data rollback** — `wrangler rollback` reverts the Worker's code instantly, but any Supabase migration shipped alongside a bad deploy doesn't roll back with it, leaving schema drift ahead of the reverted code.

### Pre-Mortem — How This Could Fail

The team deployed the Astro 6 SSR flashcard app to Cloudflare Workers using the `cloudflare-pages` hint from the tech-stack doc, missing that Cloudflare had already de-emphasized Pages. Early on, `nodejs_compat` was omitted because local `astro dev` worked fine (workerd emulation masked the gap), and Supabase auth silently failed only in production. Debugging ate two of the seven available days. Once fixed, the LLM call for flashcard generation was wired directly into a Worker fetch handler; occasional slow LLM responses tripped the subrequest timeout, and users saw blank AI-generation states with no retry — directly undermining the PRD's "visible progress signal within 200ms" requirement, since failures surfaced as opaque platform errors instead of app-level UI. A rushed hotfix shipped a Supabase migration alongside a Worker deploy; a later `wrangler rollback` reverted the code but not the migration, leaving the app briefly querying columns that no longer existed.

### Unknown Unknowns

- `nodejs_compat` gaps surface only at runtime, not at build time — a green `npm run build` is a weaker signal of prod-readiness here than on a traditional Node host.
- Worker preview URLs are public by default unless explicitly locked down with Cloudflare Access — easy to miss when focused on shipping fast.
- Billing is CPU-time, not wall-clock — awaiting a slow external LLM call isn't charged for the wait, which is a pleasant surprise but makes naive duration-based cost estimates wrong.
- Outbound calls from Workers to Supabase route through Cloudflare's dynamic edge IPs — Supabase connection-pooling/IP-allowlist assumptions that work from a traditional server can behave differently here; worth checking Supabase's connection settings before relying on them.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with its own URL without shifting production traffic; promote with `wrangler versions deploy`. No automatic PR-linked preview URLs are built in the way Vercel/Netlify offer — wiring GitHub Actions to call `wrangler versions upload` per PR is a manual setup step, out of scope for this skill (see Non-Goals) but needed before relying on it.
- **Secrets**: Local dev reads `.dev.vars` (gitignored); production secrets are set via `wrangler secret put SUPABASE_URL` / `wrangler secret put SUPABASE_KEY`, stored encrypted in Cloudflare's account and readable only by account members with Workers edit access. Rotate by re-running `wrangler secret put` with a new value — takes effect on next deploy/restart, no separate rotation flow.
- **Rollback**: `wrangler rollback [<VERSION_ID>]` reverts the Worker's deployed code to a prior version in seconds. Caveat: any Supabase migration applied alongside the bad deploy does **not** roll back automatically — a code rollback can leave the DB schema ahead of what the reverted code expects (see Devil's Advocate #5).
- **Approval**: A human should approve production secret rotation and any Supabase migration paired with a deploy. An agent may run `wrangler deploy`, `wrangler rollback`, and `wrangler tail` unattended once the above are staged, since both are deterministic and reversible within Workers' own versioning.
- **Logs**: `wrangler tail` streams live production logs from the terminal (supports `--format`, `--status`, `--search` filters) — no dashboard required. Cloudflare also exposes Workers Logs/Analytics in the dashboard for historical queries beyond the live tail window.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` gap breaks Supabase SDK only in production | Devil's advocate | M | H | Enable `nodejs_compat` flag from day one; smoke-test auth flow against a real deployed Worker (not just `astro dev`) before relying on local testing |
| Team follows stale Cloudflare Pages docs/config instead of current Workers path | Devil's advocate | M | M | Update `tech-stack.md`'s `deployment_target` hint to `cloudflare-workers`; use `npx astro add cloudflare` and the current Workers + Astro guide, not Pages-specific tutorials |
| Env var mismatch between `.env`, `.dev.vars`, and `wrangler secret` causes "works locally, fails in prod" | Devil's advocate | M | M | Document the three-mechanism mapping in the project README; verify secrets are set via `wrangler secret put` before first production deploy |
| Slow LLM response trips Workers subrequest timeout, surfacing as opaque error instead of graceful UI failure | Devil's advocate / Pre-mortem | M | H | Set an explicit client-side timeout shorter than the Workers limit around the LLM call; show the PRD-required progress/error state instead of a raw platform error |
| Worker code rollback leaves Supabase schema ahead of reverted code | Devil's advocate / Pre-mortem | L | H | Avoid bundling schema migrations with feature deploys where possible; if bundled, document the required manual migration-rollback step alongside `wrangler rollback` |
| Worker preview/version URLs are publicly reachable by default | Unknown unknowns | M | L | Use Cloudflare Access on any preview URL exposed before the MVP's user-facing launch, or avoid creating preview versions for sensitive testing |
| Supabase connection assumptions (IP allowlisting, pooling) behave differently from Cloudflare's dynamic edge IPs | Unknown unknowns | L | M | Confirm Supabase connection settings don't rely on static IP allowlisting before going live; use Supabase's connection pooler if issues arise |
| Cloudflare's MCP/agent-management tooling has unclear GA/beta status | Research finding | L | L | Treat MCP-based Cloudflare management as supplementary; keep `wrangler` CLI as the primary, verified operational path |

## Getting Started

1. Confirm the Cloudflare adapter is installed and configured: `npx astro add cloudflare` (sets `output: "server"` and the `@astrojs/cloudflare` integration in `astro.config.mjs`).
2. Ensure `compatibility_flags: ["nodejs_compat"]` is set in `wrangler.jsonc`/`wrangler.toml` — required for the Supabase SDK to work at runtime, not just at build time.
3. Set local dev secrets in `.dev.vars` (gitignored) matching `SUPABASE_URL` / `SUPABASE_KEY` from `astro.config.mjs`'s `env.schema`.
4. Authenticate and deploy: `npx wrangler login`, then `npm run build && npx wrangler deploy`.
5. Set production secrets before the first real deploy: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
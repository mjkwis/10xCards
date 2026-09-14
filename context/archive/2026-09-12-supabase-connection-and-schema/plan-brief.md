# Supabase Connection & Flashcards Schema — Plan Brief

> Full plan: `context/changes/supabase-connection-and-schema/plan.md`

## What & Why

Connect the app to a real, working Supabase project across every runtime it runs in — local dev, Cloudflare Workers (preview and production), and CI — and add the minimal `flashcards` table with per-user RLS. This is roadmap item F-01: the foundation every other MVP slice (login, AI generation, manual CRUD) depends on, and today none of it has ever run against a live backend.

## Starting Point

Auth _code_ already exists (`src/lib/supabase.ts`, `src/middleware.ts`, `/auth/signin|signup|signout`) but has never been executed against a real Supabase project — there's no `.env`, `.dev.vars`, or live project. `supabase/` only has `config.toml`; there's no migration, no `flashcards` table, no `src/types.ts`.

## Desired End State

A developer runs `npm run dev` against a local Supabase Docker stack and can sign up/sign in for real. The same code deployed to Cloudflare Workers (preview or production) does the same against a live Supabase project. A `flashcards` table exists with RLS that prevents one user from ever seeing another's rows.

## Key Decisions Made

| Decision            | Choice                                                                                 | Why (1 sentence)                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Supabase project    | Create a new live project now                                                          | No project existed; needed for Workers/prod/CI.                                                                           |
| Local dev backend   | Local Supabase CLI stack (Docker)                                                      | Matches `supabase/config.toml` already in repo; safe to reset without touching live data.                                 |
| Env var handling    | Populate `.env` + `.dev.vars` + `wrangler secret`, with `.env.example` as the template | Matches the starter's documented dual dev path and `infrastructure.md`'s explicit mitigation for env-var drift.           |
| `flashcards` schema | `id, user_id, front, back, source, created_at, updated_at` with length caps            | `source` lets S-02's accept/edit/reject flow and the PRD's "75% AI-created" metric be measured without a later migration. |
| Schema scope        | Only `flashcards` now; defer `generations`/`generation_error_logs`                     | Matches F-01's "minimal schema" wording; S-02's LLM provider isn't chosen yet.                                            |
| RLS granularity     | Four separate per-operation policies                                                   | Matches CLAUDE.md's documented convention.                                                                                |
| On user delete      | `ON DELETE CASCADE` on `flashcards.user_id`                                            | Matches the PRD's flat, single-owner model; no account-deletion FR exists to need otherwise.                              |
| Verification        | Manual smoke test in local dev **and** a Cloudflare preview deploy                     | Exercises both env-var runtimes and RLS before S-01 builds on top.                                                        |

## Scope

**In scope:**

- Live Supabase project creation and linking
- `.env` / `.env.example` / `.dev.vars` / `wrangler secret` / CI repo secrets, all pointing at the right project
- `flashcards` table + RLS + `updated_at` trigger, applied locally and pushed live
- Generated `Database` types + `src/types.ts` entity types + typed Supabase client
- Manual verification across local dev, Workers preview (`npm run preview`), and a real Cloudflare preview deploy

**Out of scope:**

- `generations` / `generation_error_logs` tables (S-02)
- Any change to the signup/signin/signout UI or flow (S-01)
- Automated tests (none exist yet; nothing here has app logic to test)
- CI-wired PR preview deploys (flagged as manual setup in `infrastructure.md`)
- Account deletion flow

## Architecture / Approach

Local dev runs against the Supabase CLI's local Docker Postgres (`supabase start`); the live project is linked (`supabase link`) so migrations tested locally are pushed with `supabase db push`. The live project's credentials feed Cloudflare Workers (`wrangler secret`) and CI (GitHub repo secrets); local Docker credentials feed `.env`/`.dev.vars` for day-to-day dev.

## Phases at a Glance

| Phase                                         | What it delivers                                                  | Key risk                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Live Supabase Project & Environment Wiring | Real signup/signin working in local dev and Workers-local-preview | Three env-var mechanisms (`.env`/`.dev.vars`/`wrangler secret`) drifting out of sync     |
| 2. Flashcards Schema & RLS Migration          | `flashcards` table + RLS live locally and on the remote project   | Pushing an untested migration to the only live project                                   |
| 3. Cross-Environment Verification & Docs      | Confirmed working on a real Cloudflare deploy; docs corrected     | Workers-runtime-only failures (`nodejs_compat`, edge IP behavior) invisible in local dev |

**Prerequisites:** A Supabase account and Docker (for the local stack).
**Estimated effort:** One evening session, 3 phases.

## Open Risks & Assumptions

- Assumes the developer can complete Supabase account/project creation themselves (an external action no agent can perform).
- `infrastructure.md` flags `nodejs_compat` gaps as surfacing only at runtime, not build time — Phase 3's Cloudflare preview check is the mitigation, not a build-time guarantee.

## Success Criteria (Summary)

- Signup/signin works for real in local dev, Workers-local-preview, and a live Cloudflare preview deploy.
- A `flashcards` row created by one user is invisible to a different user's session, both locally and on the live project.

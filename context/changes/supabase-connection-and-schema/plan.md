# Supabase Connection & Flashcards Schema Implementation Plan

## Overview

Connect the app to a real, working Supabase project across every runtime it executes in (local `astro dev`, Cloudflare Workers preview/production, GitHub Actions CI), and add the minimal `flashcards` table with per-user RLS policies. This is roadmap item F-01 — the foundation that `working-signup-signin` (S-01), `ai-flashcard-generation-review` (S-02), and `manual-flashcard-create-and-list` (S-03) all depend on.

## Current State Analysis

The repo is the `10x-astro-starter` scaffold with auth _code_ in place but never executed against a real backend:

- `src/lib/supabase.ts` creates a Supabase SSR client from `SUPABASE_URL`/`SUPABASE_KEY` (both `optional: true` in `astro.config.mjs:19-20`), returning `null` when unset.
- `src/middleware.ts` resolves `context.locals.user` and redirects unauthenticated users away from `PROTECTED_ROUTES` (`/dashboard`).
- `src/pages/api/auth/{signin,signup,signout}.ts` and `src/pages/auth/*.astro` are fully wired but have never run against a live project.
- No `.env`, `.dev.vars`, or `.env.example` exist in the repo (despite `README.md` and `CLAUDE.md` both instructing `cp .env.example .env` / `.dev.vars`).
- `supabase/` contains only `config.toml` (from a prior `supabase init`) — no `supabase/migrations/`, no `src/types.ts`, no `flashcards` table anywhere.
- `.github/workflows/ci.yml:22-24,38-40` already reads `SUPABASE_URL`/`SUPABASE_KEY` from GitHub repo secrets for the build step; the `deploy` job runs `wrangler deploy` on every push to `master`.

## Desired End State

A developer can run `npm run dev` locally against a disposable local Supabase stack, sign up and sign in for real, and a Cloudflare Workers deployment of the same code (local preview or production) does the same against a live Supabase project — with a `flashcards` table that enforces per-user row isolation via RLS. Verified by: local signup/signin succeeds, `npm run preview` (Workers runtime) signup/signin succeeds, a `wrangler versions upload` preview signup/signin succeeds, and a second user's session cannot read a first user's `flashcards` row.

### Key Discoveries:

- `astro.config.mjs:17-22` already declares the env schema — no schema changes needed there, only populating the actual values.
- `README.md:73-149` documents the intended dual local/cloud Supabase workflow in detail (local Docker stack via `supabase start`, or a hosted project) — this plan follows that documented path rather than inventing a new one, and updates the one line that's now stale ("No database tables or migrations are required").
- `CLAUDE.md`'s conventions require migrations named `YYYYMMDDHHmmss_short_description.sql` and RLS with "granular per-operation, per-role policies" — both are binding for the Phase 2 migration.
- `infrastructure.md`'s risk register (rows 1–3) explicitly names the three-env-var-mechanism drift and the code/schema rollback mismatch as the top risks for exactly this task — Phase 1 and the Migration Notes below address them directly.

## What We're NOT Doing

- Not creating `generations` / `generation_error_logs` tables — deferred to S-02, once the LLM provider (an open S-02 unknown) is chosen.
- Not changing the signup/signin/signout UI or flow — that's S-01's scope; this plan only makes the existing code actually work against a live backend.
- Not adding an automated test suite — none exists yet (per `CLAUDE.md`), and this foundation has no application logic to unit-test, only schema/config.
- Not wiring PR-linked Cloudflare preview deploys into CI — `infrastructure.md` flags this as manual, out-of-scope setup.
- Not building an account-deletion flow — no such FR exists; the `ON DELETE CASCADE` decision below has no UI trigger yet.
- Not deciding the AI provider or generation-review data model — S-02 concerns.

## Implementation Approach

Local development runs against the Supabase CLI's local Docker stack (`supabase start`), keeping the live project isolated from day-to-day experimentation. The live project is linked (`supabase link`) so migrations authored and tested locally are pushed to it with `supabase db push`, and its credentials are the ones used for Cloudflare Workers (`wrangler secret`) and CI (GitHub repo secrets). `.env`, `.dev.vars`, and `wrangler secret` all get populated explicitly rather than left to drift, per the answered questions above and the infra doc's own mitigation for that exact risk.

## Critical Implementation Details

**Timing & lifecycle**: `supabase link` must succeed before `supabase db push` will work, and the migration should be applied locally (`supabase db reset`) and confirmed clean _before_ pushing to the live project — pushing an untested migration to the only live project this plan creates has no rollback path other than a hand-written down-migration.

**State sequencing**: Generate TypeScript types (`supabase gen types typescript --local`) only after `supabase db reset` has applied the migration locally — generating against a stale local schema silently produces types that don't match what gets pushed to the live project.

## Phase 1: Live Supabase Project & Environment Wiring

### Overview

Get a real Supabase project and a local Docker-based stack both reachable from the app, with `SUPABASE_URL`/`SUPABASE_KEY` correctly populated in `.env` (Node/`astro dev`), `.dev.vars` (Cloudflare local runtime), and Cloudflare's `wrangler secret` (production) — no schema changes yet, just proving the connection works end-to-end.

### Changes Required:

#### 1. Live Supabase project

**File**: n/a — external Supabase account/dashboard action

**Intent**: Create the live Supabase project that Cloudflare Workers (preview + production) and CI will use.

**Contract**: Run `npx supabase login`, then create a project via the Supabase dashboard (or `npx supabase projects create`). Record the project ref, the project URL (`https://<project-ref>.supabase.co`), the `anon` public key (Settings → API), and the database password (needed for `supabase link`).

#### 2. Local Docker Supabase stack

**File**: n/a — uses the existing `supabase/config.toml`

**Intent**: Start the already-initialized local stack so migrations and day-to-day dev run against a disposable local Postgres instance.

**Contract**: `npx supabase start` (requires Docker). Do not re-run `supabase init` — `supabase/config.toml` already exists. The CLI prints a local `API URL` (`http://127.0.0.1:54321`) and `anon key`.

#### 3. Link the repo to the live project

**File**: n/a — CLI-managed local state under `supabase/.temp/` (already gitignored via `supabase/.gitignore`)

**Intent**: Associate this repo's migrations with the live project so `supabase db push` has a target.

**Contract**: `npx supabase link --project-ref <project-ref>`.

#### 4. Environment variable template and local files

**File**: `.env.example` (new)

**Intent**: Provide the canonical template `README.md` and `CLAUDE.md` already instruct developers to copy.

**Contract**:

```
SUPABASE_URL=
SUPABASE_KEY=
```

**File**: `.env` (new, gitignored) and `.dev.vars` (new, gitignored)

**Intent**: Populate both with the _local Docker stack's_ URL/anon key so `npm run dev` and `npm run preview` both work day-to-day without touching the live project.

**Contract**: Identical `SUPABASE_URL`/`SUPABASE_KEY` pairs in both files, pointing at `http://127.0.0.1:54321` and the local anon key.

#### 5. Production secrets

**File**: n/a — Cloudflare account state

**Intent**: Make the live project's credentials available to the deployed Worker.

**Contract**: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`, using the **live** project's values (not the local Docker ones).

#### 5a. Disable email confirmation on the live project

**File**: n/a — Supabase dashboard action

**Intent**: Mirror the local-dev decision (`supabase/config.toml`'s `enable_confirmations = false`) on the live project, so Phase 3's signup/sign-in smoke test doesn't block on a confirmation email whose link would redirect to the wrong (default `localhost`) Site URL against an ephemeral Cloudflare preview URL. Without this, a throwaway test account created via `signup.ts` (which calls `auth.signUp()` with no `emailRedirectTo`) cannot sign in until confirmed.

**Contract**: In the live project's Supabase dashboard → Authentication → Email → toggle **Confirm email** off, same as `README.md:130-138` documents for local dev. Revisit before any real user-facing launch, if confirmed-email is later required.

#### 6. CI repository secrets

**File**: n/a — GitHub repo settings

**Intent**: Confirm the existing `SUPABASE_URL`/`SUPABASE_KEY` secret references in `.github/workflows/ci.yml:22-24,38-40` resolve to the live project.

**Contract**: Set/verify repository secrets in GitHub → Settings → Secrets and variables → Actions to match the live project's values.

### Success Criteria:

#### Automated Verification:

- `npx supabase status` reports the local stack healthy
- `npm run build` succeeds with `.env` populated
- `npm run lint` passes

#### Manual Verification:

- Sign up a throwaway account at `/auth/signin`'s sibling `/auth/signup` in local dev (`npm run dev`); confirm redirect to `/auth/confirm-email`, then sign in and land on `/dashboard` showing the account's email
- Repeat the same signup/signin flow after `npm run preview` (Cloudflare Workers runtime locally)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Flashcards Schema & RLS Migration

### Overview

Add the minimal `flashcards` table — ownership, content bounds, AI-provenance tracking, and per-operation RLS — apply it locally and to the live project, and give the Supabase client compile-time knowledge of the new shape.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_create_flashcards_table.sql` (new — filename generated by `npx supabase migration new create_flashcards_table`, not hand-picked, so the timestamp matches CLAUDE.md's `YYYYMMDDHHmmss_short_description.sql` convention exactly)

**Intent**: Define `flashcards` with owner-scoped RLS and the provenance field the PRD's "75% AI-created" success metric needs, per this plan's answered questions.

**Contract**: Table `flashcards`:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `front text not null check (char_length(front) <= 200)`
- `back text not null check (char_length(back) <= 500)`
- `source text not null check (source in ('ai-full', 'ai-edited', 'manual'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Index on `user_id`. RLS enabled with four separate policies (one each for `select`/`insert`/`update`/`delete`), per CLAUDE.md's "granular per-operation, per-role policies" convention:

- `select`, `delete` → `using (auth.uid() = user_id)`
- `insert` → `with check (auth.uid() = user_id)`
- `update` → both `using (auth.uid() = user_id)` and `with check (auth.uid() = user_id)`

`updated_at` does not auto-update in Postgres by default — needs an explicit trigger:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row execute function public.set_updated_at();
```

#### 2. Apply locally

**Intent**: Verify the migration applies cleanly before touching the live project.

**Contract**: `npx supabase db reset` (re-applies all local migrations + seed).

#### 3. Push to the live project

**Intent**: Bring the linked live project's schema in sync with local.

**Contract**: `npx supabase db push`.

#### 4. Generate typed database types

**File**: `src/db/database.types.ts` (new, generated — do not hand-edit)

**Intent**: Give the Supabase client compile-time knowledge of the `flashcards` table shape.

**Contract**: `npx supabase gen types typescript --local > src/db/database.types.ts`, run only after the local `db reset` above.

#### 5. Shared entity types

**File**: `src/types.ts` (new)

**Intent**: Expose `Flashcard` and its `source` union as the shared types future slices (S-01–S-06) import, per CLAUDE.md's "Shared types... go in `src/types.ts`" convention.

**Contract**: Derive from `Database["public"]["Tables"]["flashcards"]["Row"]` (imported from `src/db/database.types.ts`) rather than hand-duplicating the field list.

#### 6. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Make `createServerClient` aware of the generated `Database` type so future `.from("flashcards")` calls are type-checked.

**Contract**: Import `Database` from `src/db/database.types.ts` and parametrize `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, ...)`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration with no errors
- `npx supabase db push` succeeds against the linked live project
- `npm run build` succeeds (typed client compiles)
- `npm run lint` passes

#### Manual Verification:

- In local Supabase Studio (`http://localhost:54323`), insert one `flashcards` row for a test user (SQL editor, bypasses RLS since it runs as the Postgres superuser). Then, as a _different_ user, confirm zero rows are visible — either via Studio's Table Editor RLS policy testing/impersonation feature, or by `curl`ing the local REST endpoint (`http://127.0.0.1:54321/rest/v1/flashcards`) with that second user's access token (from `supabase.auth.getSession()`) in the `Authorization: Bearer <token>` header
- Update that test row and confirm `updated_at` changes automatically (trigger fired)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cross-Environment Verification & Docs

### Overview

Confirm the live project + Cloudflare Workers runtime combination (env vars via `wrangler secret`, `nodejs_compat`, RLS) actually works outside local dev, and correct the one now-stale line in `README.md`.

### Changes Required:

#### 1. Cloudflare preview verification

**Intent**: Exercise the full stack (live project, Workers runtime, RLS) via a non-production preview before any downstream slice (S-01, S-02, S-03) depends on this foundation.

**Contract**: `npm run build && npx wrangler versions upload` to get a preview URL without shifting production traffic; run the signup/signin flow against it.

#### 2. README update

**File**: `README.md`

**Intent**: Remove the now-inaccurate "No database tables or migrations are required" line (`README.md:114`) now that `supabase/migrations/` holds the `flashcards` schema.

**Contract**: Update the "Supabase Configuration" section to mention `supabase/migrations/` and point at `npx supabase db reset` / `npx supabase db push` for applying them.

### Success Criteria:

#### Automated Verification:

- `npx wrangler versions upload` completes without error

#### Manual Verification:

- Full signup → sign-in → `/dashboard` flow works against the Cloudflare preview URL
- A second throwaway account, signed in via the same preview URL, cannot see the first account's test `flashcards` row (cross-user RLS check repeated against the live project, not just local)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test suite exists yet, and this phase has no application logic to unit-test (schema/config only).

### Integration Tests:

- None automated — covered by the manual signup/signin/RLS smoke tests in each phase's Manual Verification.

### Manual Testing Steps:

1. Sign up and sign in locally (`npm run dev`), against Workers-in-preview (`npm run preview`), and against a real Cloudflare preview (`wrangler versions upload`).
2. Insert a `flashcards` row for one user and confirm a different user's session cannot read it, in both local Studio and the live project.
3. Update a `flashcards` row and confirm `updated_at` changes.

## Performance Considerations

None beyond the `user_id` index — the PRD's `target_scale.users: small` means no partitioning, pagination-specific indexing, or connection pooling changes are warranted at this stage.

## Migration Notes

This is a greenfield database — no existing data to migrate. The one asymmetry to flag for future deploys (per `infrastructure.md`'s risk register): `wrangler rollback` reverts Worker code instantly but does **not** revert a Supabase migration pushed alongside it. If a future deploy needs to be rolled back after a schema change shipped with it, the schema rollback (a hand-written down-migration, e.g. `drop table flashcards cascade;`) must be applied manually via `supabase db push` — it does not happen automatically.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01: `supabase-connection-and-schema`)
- Infra risk register: `context/foundation/infrastructure.md` (env-var drift, code/schema rollback mismatch)
- Starter's own documented setup path: `README.md:73-149`
- Existing auth scaffolding: `src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Live Supabase Project & Environment Wiring

#### Automated

- [x] 1.1 `npx supabase status` reports the local stack healthy — 379e4ca
- [x] 1.2 `npm run build` succeeds with `.env` populated — 379e4ca
- [x] 1.3 `npm run lint` passes — 379e4ca

#### Manual

- [x] 1.4 Local signup/signin flow works (`npm run dev`) — 379e4ca
- [x] 1.5 Signup/signin flow works under `npm run preview` (Workers runtime) — 379e4ca

### Phase 2: Flashcards Schema & RLS Migration

#### Automated

- [ ] 2.1 `npx supabase db reset` applies the migration with no errors
- [ ] 2.2 `npx supabase db push` succeeds against the linked live project
- [ ] 2.3 `npm run build` succeeds (typed client compiles)
- [ ] 2.4 `npm run lint` passes

#### Manual

- [ ] 2.5 Cross-user RLS check passes locally (Supabase Studio)
- [ ] 2.6 `updated_at` trigger fires on update

### Phase 3: Cross-Environment Verification & Docs

#### Automated

- [ ] 3.1 `npx wrangler versions upload` completes without error

#### Manual

- [ ] 3.2 Full signup/signin flow works against the Cloudflare preview URL
- [ ] 3.3 Cross-user RLS check passes against the live project via the preview URL

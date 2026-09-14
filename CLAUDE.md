# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

10xCards is an AI-assisted flashcard app (generate flashcards from pasted text, edit/manage them, review via spaced repetition). The codebase currently reflects the `10x-astro-starter` template — auth scaffolding is in place; flashcard features are not yet built (see `idea-notes.md` and `context/foundation/` for product intent).

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

There is no test suite configured yet.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages and API routes are server-rendered by default — no `prerender` export needed. Use `export const prerender = true` to opt a specific page into static generation.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`, both `optional: true`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- `src/lib/config-status.ts` — reports whether Supabase is configured; the app runs (with auth disabled) even without env vars set, since the schema fields are optional.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant, neutral base color. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/hooks/` (see `@/hooks` alias in components.json).
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Git rules for agents

- **Never stage or commit anything under `.claude/`.** The user tracks that scaffolding (skills, prompts, manifest) separately from `context/changes/<change-id>` work. This holds even when `.claude/` files show up already staged/dirty alongside a change's own files (e.g. during `/10x-implement`'s phase-end commit ritual) — treat `.claude/**` as permanently out of scope for implementation commits.
  - **Technical gotcha**: if `.claude/` files are already staged in the index, a plain `git add <intended files>` followed by `git commit` will still sweep in everything already staged, including `.claude/`. Use the pathspec form instead — `git commit -m "..." -- <intended files>` — which commits only those paths regardless of what else is staged, and leaves the rest of the index untouched. Always verify with `git show --stat HEAD` after committing that only the intended files landed.
- **Never unilaterally run corrective git history operations** (`reset`, `amend`, force-push, etc.) to fix a mistake — including your own. If a commit went wrong, stop, explain exactly what happened, and ask before touching git state again.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs `astro sync`, lint, and build on every push and PR to `master`. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.
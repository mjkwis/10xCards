<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Working Signup/Signin Implementation Plan

- **Plan**: context/changes/working-signup-signin/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

7/7 paths verified to exist (`src/pages/index.astro`, `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/pages/api/auth/signup.ts`, `src/pages/auth/confirm-email.astro`, `src/pages/dashboard.astro`, `src/components/ui/LibBadge.astro`). README.md:146 (confirm-email row) and README.md:149 (PROTECTED_ROUTES note) confirmed. CLAUDE.md:36 (Auth pages bullet) confirmed. Brief↔plan consistent. Cross-checked `Welcome`/`Topbar`/`confirm-email` references app-wide — no missed callers; `dashboard.astro`'s "Welcome," text was a grep false positive; `CLAUDE.md.scaffold` is an intentionally-frozen starter snapshot (per `.claude/skills/10x-bootstrapper/references/scaffold-merge.md`'s `<filename>.scaffold` sibling convention), not a doc meant to track `CLAUDE.md` going forward — correctly out of the plan's doc-update scope.

## Findings

### F1 — AUTH_ROUTES exact-match misses trailing-slash variant

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Middleware routing rules (contract)
- **Detail**: The plan's contract compares `context.url.pathname` against `AUTH_ROUTES = ["/auth/signin", "/auth/signup"]` (and against the literal `"/"`) with exact equality. `astro.config.mjs` sets no `trailingSlash` option, so Astro defaults to `"ignore"` — it accepts both `/auth/signin` and `/auth/signin/` as the same route, but does not normalize `context.url.pathname` itself. An authenticated user who directly navigates to `/auth/signin/` (trailing slash) would fail the `AUTH_ROUTES.includes(pathname)` check and see the signin form again — silently violating the stated success criterion "Visiting /auth/signin or /auth/signup while already authenticated redirects to /dashboard." All of the app's own links (`href="/auth/signup"`, `href="/auth/signin"`) omit the trailing slash, so this only surfaces on manual/direct navigation and won't be caught by the plan's manual verification steps (which click through the UI rather than hand-typing URLs).
- **Fix**: In `src/middleware.ts`, normalize the pathname once before both comparisons, e.g. `const pathname = context.url.pathname.replace(/\/+$/, "") || "/";` and use `pathname` for the `"/"` check and the `AUTH_ROUTES.includes(pathname)` check.
- **Decision**: FIXED — added pathname normalization (`.replace(/\/+$/, "") || "/"`) to the Phase 1 middleware contract in plan.md
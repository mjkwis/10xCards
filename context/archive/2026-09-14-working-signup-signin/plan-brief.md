# Working Signup/Signin — Plan Brief

> Full plan: `context/changes/working-signup-signin/plan.md`

## What & Why

Close the gap between "the auth API calls work" (already true, verified in F-01) and "the app behaves like a logged-in product" (not yet true). Right now `/` shows the unmodified starter demo page to everyone, an authenticated user can still land back on the signup/signin forms, and the post-signup redirect routes through a "check your email" page that doesn't apply to this project's actual Supabase settings.

## Starting Point

F-01 already wired `signUp`/`signInWithPassword`/`signOut` against a live Supabase project via `src/lib/supabase.ts` and `src/middleware.ts`, and manually verified the flow works locally and on a Cloudflare preview. `src/middleware.ts` only protects `/dashboard` today (`PROTECTED_ROUTES`); it has no awareness of `/` or the auth pages themselves.

## Desired End State

`/` redirects based on auth state instead of showing demo content. Auth pages bounce an already-logged-in user to `/dashboard`. Signup lands the user directly on `/dashboard` (no interstitial), because the live Supabase project has email confirmation OFF and a successful `signUp()` already produces an active session.

## Key Decisions Made

| Decision                              | Choice                                              | Why (1 sentence)                                                                  | Source |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| Homepage (`/`) behavior                | Redirect: unauth → signin, auth → dashboard         | Matches PRD Access Control ("no access beyond login/register" for unauth users)   | Plan   |
| Auth pages while logged in             | Redirect `/auth/signin`, `/auth/signup` → dashboard | Prevents confusing re-signup/re-signin attempts; standard auth UX                  | Plan   |
| Post-signup routing                    | Straight to `/dashboard`, remove confirm-email page | Live project has email confirmation OFF — signUp already returns an active session | Plan   |
| Forgot-password flow                   | Out of scope                                        | Not in PRD FR-008; keeps this slice small under the 1-week MVP budget              | Plan   |
| Shared nav/sign-out outside dashboard  | Out of scope, stays dashboard-only                  | No real app shell exists yet — premature before S-02/S-03 define page structure   | Plan   |
| Duplicate-email signup handling        | Pass through Supabase's own error message            | Matches existing signin error-handling pattern; low ROI to customize for MVP      | Plan   |
| Automated test coverage                | None — manual verification only                     | No test suite exists yet in the repo; introducing one is its own project          | Plan   |
| Expired/invalid session at `/dashboard`| No change — current silent redirect is correct       | Already implemented correctly via `getUser()` returning null                      | Plan   |

## Scope

**In scope:**
- Auth-aware redirect for `/`
- Auth-aware redirect for `/auth/signin` and `/auth/signup`
- Simplified post-signup redirect (drop the confirm-email interstitial)
- Removing now-dead starter demo files (`Welcome.astro`, `Topbar.astro`, `index.astro`'s old content)
- README.md / CLAUDE.md route-documentation updates

**Out of scope:**
- Forgot-password / reset-password flow
- Shared nav / sign-out affordance outside `/dashboard`
- Custom duplicate-email error messaging
- New automated test tooling
- Session-expiry UX changes

## Architecture / Approach

All auth-based routing decisions live in one place: `src/middleware.ts`, extending the existing `PROTECTED_ROUTES` pattern with a root-path redirect and a reverse redirect for the two auth-only pages. No second routing mechanism (e.g., per-page `Astro.redirect`) is introduced.

## Phases at a Glance

| Phase                                | What it delivers                                                        | Key risk                                                        |
| ------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Auth-Aware Routing                | `/` and auth pages redirect correctly; starter demo page removed         | Deleting `index.astro` relies on middleware always intercepting `/` before route resolution — verify against Workers preview, not just `astro dev` |
| 2. Simplify Post-Signup Flow         | Signup lands directly on `/dashboard`; confirm-email page removed        | Depends on the live project's "confirmation OFF" setting staying true — if it's ever turned on, this flow breaks silently |

**Prerequisites:** F-01 (`supabase-connection-and-schema`) — done.
**Estimated effort:** ~1 session, 2 small phases.

## Open Risks & Assumptions

- Assumes the live Supabase project's "Confirm email" setting (OFF) doesn't change without a corresponding update to this flow.
- Assumes Astro middleware runs (and can redirect) even when no page exists at a path — Phase 1 removes `index.astro` on this assumption; manual verification against `npm run preview` (Workers runtime) confirms it, not just `astro dev`.

## Success Criteria (Summary)

- A new user can sign up and land on `/dashboard` in one motion, with no dead-end pages in between.
- No unauthenticated visitor can see anything except the signin/signup screens.
- No authenticated visitor sees the signup/signin forms again by accident.

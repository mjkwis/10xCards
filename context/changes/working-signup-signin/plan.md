# Working Signup/Signin Implementation Plan

## Overview

F-01 (`supabase-connection-and-schema`) already wired signup, signin, signout, and session-cookie handling against a live Supabase project, and manually verified the flow works both locally and on a Cloudflare preview deploy. What's missing is the app *behaving* like the PRD's Access Control model actually requires: today `/` renders the unmodified `10x-astro-starter` demo page regardless of who's looking at it, an already-authenticated user can still land on `/auth/signin` or `/auth/signup`, and the post-signup flow still routes through a "check your email" interstitial that doesn't apply because the live Supabase project has email confirmation OFF. This plan closes those three gaps so S-01's roadmap outcome ("user can create an account and sign in, accessing their own collection from any device") is actually true end-to-end, not just true of the underlying API calls.

## Current State Analysis

- `src/middleware.ts` resolves `context.locals.user` on every request and redirects unauthenticated users away from `PROTECTED_ROUTES = ["/dashboard"]`. It has no logic for `/` or for the auth pages themselves.
- `src/pages/index.astro` renders `src/components/Welcome.astro` (the starter template's marketing page, via `src/components/Topbar.astro`) unconditionally — it is not auth-aware and isn't part of the product.
- `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp()` and unconditionally redirects to `/auth/confirm-email` on success.
- `src/pages/auth/confirm-email.astro` shows one of two messages based on `import.meta.env.DEV` — "Registration successful" in dev, "Check your email" otherwise. The production branch assumes email confirmation is required.
- The live Supabase project has **email confirmation OFF** (confirmed by user against the dashboard's Authentication → Providers → Email settings). This means `signUp()` already returns an active session and the SSR client already writes session cookies during the signup request — the user is authenticated the moment signup succeeds, in both dev and production.
- `src/pages/dashboard.astro` is the only page that reads `Astro.locals.user` and is otherwise a fully separate, working "you're in" screen with a sign-out form.

## Desired End State

- Visiting `/` while unauthenticated redirects to `/auth/signin`; visiting `/` while authenticated redirects to `/dashboard`. The starter's Welcome/Topbar demo content no longer exists.
- Visiting `/auth/signin` or `/auth/signup` while already authenticated redirects to `/dashboard` instead of re-showing the form.
- Successful signup redirects straight to `/dashboard` (the user is already logged in) instead of through `/auth/confirm-email`.
- Verify: sign up a new throwaway account, land on `/dashboard` immediately with the account's email showing; sign out, confirm `/` now redirects to `/auth/signin`; sign back in from `/auth/signin`, confirm redirect to `/dashboard`; while signed in, visit `/auth/signin` and `/auth/signup` directly and confirm both bounce to `/dashboard`.

### Key Discoveries:

- `src/pages/auth/confirm-email.astro`'s `isAutoConfirmed = import.meta.env.DEV` branch was written to anticipate confirmation being required in production — that assumption is now known to be false, so the whole page becomes unreachable dead code once signup redirects to `/dashboard` directly.
- `src/components/Topbar.astro` is used only by `src/components/Welcome.astro` (`Grep` confirms no other references) — removing `Welcome.astro` orphans it too.
- `src/components/ui/LibBadge.astro` is already unreferenced by anything (pre-existing dead code, unrelated to this change) — left untouched; not this plan's scope to clean up.
- `README.md`'s auth routes table (`README.md:143-149`) and `CLAUDE.md`'s "Auth pages" bullet (`CLAUDE.md:36`) both document `confirm-email` as a real route — both need updating once it's removed.

## What We're NOT Doing

- No forgot-password / reset-password flow (explicitly deferred to a future slice).
- No shared nav/header with sign-out outside `/dashboard` — that stays a dashboard-only affordance until a real app shell exists (S-02/S-03).
- No custom duplicate-email detection or messaging — Supabase's own `error.message` continues to pass straight through on the signup form, unchanged.
- No new automated test tooling/framework — verification for this slice is manual, consistent with the rest of the codebase (no test suite exists yet).
- No change to how `/dashboard` handles an expired/invalid session — the existing silent redirect-to-signin behavior (via `getUser()` returning null) is already correct and untouched.
- No re-verification of email confirmation settings for other environments — this plan takes the user-confirmed "OFF" setting as given for the live project.

## Implementation Approach

Extend the existing middleware-based routing pattern (`PROTECTED_ROUTES`) with two more route classifications — the root path and the auth-only pages — rather than introducing a second routing mechanism (e.g., per-page `Astro.redirect` calls). This keeps all auth-based routing decisions in one file. Then simplify the signup success path now that the target environment's actual auth-confirmation setting is known, removing the page and copy that assumed otherwise.

## Phase 1: Auth-Aware Routing

### Overview

Make `/` and the two auth-only pages (`/auth/signin`, `/auth/signup`) respect `context.locals.user`, and retire the unused starter demo page they currently show.

### Changes Required:

#### 1. Middleware routing rules

**File**: `src/middleware.ts`

**Intent**: Redirect `/` based on auth state (unauthenticated → `/auth/signin`, authenticated → `/dashboard`), and redirect an authenticated user away from `/auth/signin` / `/auth/signup` to `/dashboard`, alongside the existing `PROTECTED_ROUTES` handling for `/dashboard`.

**Contract**: Add an `AUTH_ROUTES = ["/auth/signin", "/auth/signup"]` array alongside `PROTECTED_ROUTES`. After resolving `context.locals.user`, before the existing `PROTECTED_ROUTES` check: normalize the pathname to strip a trailing slash (e.g. `const pathname = context.url.pathname.replace(/\/+$/, "") || "/";`) so `/auth/signin/` matches the same as `/auth/signin`, consistent with Astro's default `trailingSlash: "ignore"` behavior. Using that normalized `pathname`: if it is `"/"`, redirect to `/dashboard` when a user is present, otherwise to `/auth/signin`; if it is in `AUTH_ROUTES` and a user is present, redirect to `/dashboard`.

#### 2. Retire the starter homepage and its demo components

**Files**: `src/pages/index.astro`, `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: `/` is now fully owned by the middleware redirect in change 1 — there is no case where this page's own content would render — so delete the page and the demo components that existed solely to render it.

**Contract**: Delete all three files. `src/components/ui/LibBadge.astro` is left in place (already-orphaned, pre-existing, unrelated to this change).

#### 3. Documentation updates

**File**: `README.md`

**Intent**: Keep the routes table and route-protection note accurate now that redirect logic covers more than just `PROTECTED_ROUTES`.

**Contract**: Update the note below the routes table (`README.md:149`) to mention that `/` and the auth pages also redirect based on auth state, not just `PROTECTED_ROUTES` entries.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Visiting `/` while signed out redirects to `/auth/signin`
- Visiting `/` while signed in redirects to `/dashboard`
- Visiting `/auth/signin` or `/auth/signup` while signed in redirects to `/dashboard`
- `/auth/signin` and `/auth/signup` remain reachable and functional while signed out

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Simplify Post-Signup Flow

### Overview

Since the live Supabase project has email confirmation OFF, a successful `signUp()` call already produces an authenticated session. Route straight to `/dashboard` and remove the now-inapplicable "check your email" interstitial.

### Changes Required:

#### 1. Signup success redirect

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Send a newly signed-up (and now-authenticated) user directly to their dashboard instead of through an intermediate confirmation page.

**Contract**: Change the success-path redirect target from `/auth/confirm-email` to `/dashboard`.

#### 2. Remove the confirm-email page

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: This page is unreachable once nothing links to it — delete it rather than leave dead code behind.

**Contract**: Delete the file.

#### 3. Documentation updates

**Files**: `README.md`, `CLAUDE.md`

**Intent**: Keep both docs' route listings accurate now that `/auth/confirm-email` no longer exists.

**Contract**: Remove the `/auth/confirm-email` row from `README.md`'s routes table (`README.md:146`) and drop `confirm-email` from `CLAUDE.md`'s "Auth pages" bullet (`CLAUDE.md:36`), leaving `src/pages/auth/{signin,signup}.astro`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Signing up with a new throwaway email lands directly on `/dashboard`, showing that account's email
- No route in the app links to or references `/auth/confirm-email` anymore

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test suite exists yet in this repo, and this change is routing/redirect logic with no complex business rules to isolate.

### Integration Tests:

- None automated — covered by the manual verification steps in each phase.

### Manual Testing Steps:

1. `npm run dev`; sign up a new throwaway account and confirm landing on `/dashboard` with the account's email shown.
2. Sign out from `/dashboard`; confirm `/` now redirects to `/auth/signin`.
3. Sign back in from `/auth/signin`; confirm redirect to `/dashboard`.
4. While signed in, navigate directly to `/auth/signin` and `/auth/signup`; confirm both redirect to `/dashboard`.
5. Sign out again; navigate directly to `/auth/signup`, `/auth/signin`, and `/dashboard`; confirm the first two render their forms and the third redirects to `/auth/signin`.
6. Repeat step 1 against `npm run preview` (Workers runtime) at least once, since this is the first change to touch request-level redirect behavior since F-01's Workers-runtime verification.

## Performance Considerations

None — this is redirect logic evaluated once per request in existing middleware; no new I/O or computation.

## Migration Notes

Not applicable — no data model changes.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01: `working-signup-signin`)
- Prior foundation work: `context/changes/supabase-connection-and-schema/plan.md` (F-01 — live Supabase wiring, already verified signup/signin end-to-end)
- Existing auth scaffolding: `src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*.ts`, `src/pages/auth/*.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth-Aware Routing

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` succeeds

#### Manual

- [ ] 1.3 Visiting `/` while signed out redirects to `/auth/signin`
- [ ] 1.4 Visiting `/` while signed in redirects to `/dashboard`
- [ ] 1.5 Visiting `/auth/signin` or `/auth/signup` while signed in redirects to `/dashboard`
- [ ] 1.6 `/auth/signin` and `/auth/signup` remain reachable and functional while signed out

### Phase 2: Simplify Post-Signup Flow

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` succeeds

#### Manual

- [ ] 2.3 Signing up with a new throwaway email lands directly on `/dashboard`, showing that account's email
- [ ] 2.4 No route in the app links to or references `/auth/confirm-email` anymore

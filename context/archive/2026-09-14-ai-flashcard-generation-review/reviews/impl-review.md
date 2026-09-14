<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Flashcard Generation & Review Implementation Plan

- **Plan**: context/changes/ai-flashcard-generation-review/plan.md
- **Scope**: Full plan (Phase 1, 2, 3 — all complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — CandidateCard hardcodes raw colors, making variant props dead code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/flashcards/CandidateCard.tsx:84, 95, 107, 119
- **Detail**: `src/components/ui/button.tsx` already defines a full shadcn `cva` variant system (`default/destructive/secondary/outline/ghost/link`), each with correct light/dark handling. Commit `6267ce7` (landed after `change.md` was already marked `implemented`) added literal Tailwind overrides instead: `className="bg-green-500 text-black hover:bg-green-600"` (Accept, Save edit), `className="bg-black text-white hover:bg-black/80"` (Edit, alongside `variant="outline"`), `className="bg-red-600 text-white hover:bg-red-700"` (Reject, alongside `variant="ghost"`). Because `Button` merges via `cn(buttonVariants({variant, size, className}))`, the `className` override fully replaces the variant's background/text/hover — so `variant="outline"` and `variant="ghost"` are now dead props that render nothing of what they specify. This bypasses the project's shadcn "new-york" design-system pattern and drops built-in dark-mode handling for these three buttons.
- **Fix**: Remove the hardcoded `className` overrides; use `variant="destructive"` for Reject (matches its purpose exactly), and add a semantic variant (e.g. `success`) to `buttonVariants` for Accept/Save edit instead of literal colors.
- **Decision**: FIXED — added a `success` variant to `buttonVariants` (button.tsx), switched Accept/Save edit to `variant="success"`, Reject to `variant="destructive"`, and removed all hardcoded `className` color overrides (including the stray one on Edit).

### F2 — GenerationError duplicates ServerError's markup instead of composing it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/flashcards/GenerationError.tsx:9-21 (vs src/components/auth/ServerError.tsx:7-16)
- **Detail**: The plan's Phase 2 item 4 contract says to "reuse the existing visual pattern from `ServerError.tsx`." The implementation copy-pastes the exact class string (`border-red-500/30 bg-red-900/30 text-red-300` + `CircleAlert size-4 shrink-0`) into a new markup block rather than rendering `<ServerError message={message} />` inside a flex wrapper alongside the retry button. Visually identical today, but a future restyle of the error alert now needs to touch two files instead of one.
- **Fix**: Refactor `GenerationError` to render `<ServerError message={message} />` next to the "Try again" `Button` in a flex container, instead of duplicating ServerError's className string.
- **Decision**: FIXED — added an optional `action` prop to `ServerError` (backward-compatible; unused by the auth forms), and `GenerationError` now renders `<ServerError message={message} action={<Button>Try again</Button>} />` instead of duplicating the alert markup.

### F3 — GenerateReviewIsland's candidate state omits the plan's `status` field

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/flashcards/GenerateReviewIsland.tsx (Candidate type), src/components/flashcards/CandidateCard.tsx (isEditing state)
- **Detail**: Phase 2 item 2's contract specifies the island holds `candidates: (FlashcardCandidateDto & { status: "pending" | "edited" })[]`. The actual implementation types candidates as `FlashcardCandidateDto & { id: string }` — no `status` field — and instead keeps edit-mode state (`isEditing`, edited `front`/`back`) local inside `CandidateCard`. Observable behavior is correct (accept/edit/reject/persist all work, verified by both automated build/lint and the manual Progress checklist), but this is a different state-ownership architecture than the plan specified, not just a naming difference.
- **Fix A ⭐ Recommended**: Update plan.md's Phase 2 item 2 contract to describe the actual architecture (edit state owned by `CandidateCard`, no `status` field on the island's `Candidate` type) — the plan becomes the accurate source of truth without touching working code.
  - Strength: Zero regression risk; the current architecture is arguably simpler (each card is self-contained) than lifting edit state to the parent.
  - Tradeoff: The plan's original design intent (centralized candidate state) is abandoned without discussion.
  - Confidence: HIGH — behavior matches every manual/automated success criterion already checked.
  - Blind spot: Haven't checked whether any planned future phase depends on the island having centralized visibility into per-candidate edit state.
- **Fix B**: Refactor to lift `status`/edited-text into `GenerateReviewIsland`'s state as originally planned, passing them down as props to `CandidateCard`.
  - Strength: Matches the plan's original design exactly; centralizes state for easier future features (e.g. "accept all").
  - Tradeoff: Non-trivial refactor of working, tested code for a state-ownership preference with no current functional bug.
  - Confidence: MEDIUM — mechanically straightforward, but touches two files with correct passing behavior today.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — plan.md Phase 2 item 2 contract updated to describe the actual `{ id: string }`-only Candidate type and CandidateCard-owned edit state, with a note pointing back to this finding.

### F4 — OpenRouter service wraps candidates in an object, not the plan's literal "top-level array"

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/openrouter.ts:32-34, 148-151
- **Detail**: Phase 1 item 4's contract says the service "parses the top-level response shape (must be an array) with zod." The actual JSON-schema structured-output root is `{ flashcards: [...] }` — an object wrapping the array (`structuredResponseSchema = z.object({ flashcards: z.array(z.unknown()) })`) — because OpenRouter/OpenAI-style `json_schema` structured-output mode requires an object root, not a bare array. This is a justified technical necessity, not a bug, but the plan text is now stale relative to the implementation.
- **Fix**: Update Phase 1 item 4's contract wording to describe the actual `{ flashcards: [...] }` object-root shape.
- **Decision**: FIXED — plan.md Phase 1 item 4 wording updated to describe the object-root `{ flashcards: [...] }` shape and why (structured-output schema roots must be objects).

### F5 — Account-level "prompt logging off" step can't be verified from the repo

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: Progress item 1.7 (plan.md:286)
- **Detail**: Progress item 1.7 is checked `[x]` and cites commit `3c40cb5`, but "prompt/completion logging disabled in the OpenRouter account dashboard" is an operational action outside the git history — the commit only proves the code-side ZDR `provider: { zdr: true }` restriction (confirmed correct in F-agent review against OpenRouter's current API). The account-dashboard half of this requirement has no observable evidence in the diff.
- **Fix**: Manually re-confirm in the OpenRouter account dashboard that prompt/completion logging is disabled before the first production request; no code change needed.
- **Decision**: ACCEPTED — acknowledged as a manual action item outside the repo; user to re-confirm the OpenRouter dashboard setting before first production traffic.

### F6 — No client-side timeout on the flashcard-save fetch

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/CandidateCard.tsx:12-21 (`saveFlashcard`)
- **Detail**: `saveFlashcard`'s `fetch` to `/api/flashcards` has no `AbortController`/timeout, unlike `generateFlashcardCandidates`'s explicit 20s timeout in `openrouter.ts`. A stalled network leaves `isSaving` true indefinitely, disabling the card's buttons with no recovery path.
- **Fix**: Add an `AbortController` with a short timeout (e.g. 10s) around the `saveFlashcard` fetch, surfacing the existing error state on abort.
- **Decision**: FIXED — `saveFlashcard` now wraps its fetch in an `AbortController` with a 10s timeout (`SAVE_TIMEOUT_MS`); the abort throws, which is caught by the existing `handleAccept` try/catch and surfaces the existing error message.

### F7 — Front/back zod schemas accept whitespace-only text

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/index.ts:6-9, src/lib/services/openrouter.ts:27-30
- **Detail**: `z.string().min(1).max(200)` (and `.max(500)` for back) passes for whitespace-only strings like `"   "` since there's no `.trim()`. A user editing a candidate down to spaces could persist a blank-looking flashcard.
- **Fix**: Add `.trim()` before `.min(1)` in `createFlashcardSchema` (index.ts) and `candidateSchema` (openrouter.ts).
- **Decision**: FIXED — added `.trim()` to `front`/`back` in both `createFlashcardSchema` and `candidateSchema`.

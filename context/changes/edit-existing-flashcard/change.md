---
change_id: edit-existing-flashcard
title: Edit existing flashcard
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-04. Prerequisite S-03 (manual create + list) is done. Data model and RLS already support this: `flashcards_update_own` policy and the `updated_at` trigger exist unused since the S-02 migration — no schema changes needed. Reuses the in-place edit convention already established by `CandidateCard.tsx` and the shared `saveFlashcard`/`flashcardSchema` helper extracted during S-03's impl-review. See plan-brief.md "Key Decisions Made" for the 8 decisions resolved during `/10x-plan`.

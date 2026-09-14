---
change_id: delete-flashcard-with-confirmation
title: Delete flashcard with confirmation
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T19:49:59Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-05. Prerequisite S-03 (manual create + list) is done; parallel with S-04 (edit-existing-flashcard, done). Data model and RLS already support this: `flashcards_delete_own` policy exists unused since the S-02 migration — no schema changes needed. Mirrors the file layout and API conventions established by S-04's `PATCH /api/flashcards/[id]` + `FlashcardListItem`. Planned with all decisions defaulted to the recommended option (no interactive question round) per explicit user request; see plan-brief.md "Key Decisions Made" for the 8 decisions and their rationale.

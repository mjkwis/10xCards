---
change_id: manual-flashcard-create-and-list
title: Manual flashcard create + list view
status: implementing
created: 2026-09-14
updated: 2026-09-14
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-03. Data model and `POST /api/flashcards` already existed going into this plan (built as a side-effect of S-02) — this change adds the missing `GET /api/flashcards` list endpoint, the manual-create UI, and the list UI, plus wires the existing AI-review flow into the same shared list state so accepted AI cards also appear without a reload. See plan-brief.md "Key Decisions Made" for the 8 UX/architecture decisions resolved during `/10x-plan`.

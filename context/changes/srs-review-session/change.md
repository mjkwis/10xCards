---
change_id: srs-review-session
title: SRS review session
status: implementing
created: 2026-09-14
updated: 2026-09-14
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-06 — was the only `blocked` item in `context/foundation/roadmap.md` pending a choice of SRS library/algorithm. Prerequisite S-03 (manual create + list) is done. Resolved the blocker by picking `ts-fsrs` (FSRS — Anki's current default algorithm) as the "gotowy, zintegrowany algorytm powtórek" required by FR-009: actively maintained, zero runtime dependencies (edge/workerd-safe), and its 4-point Again/Hard/Good/Easy rating maps cleanly onto a review UI (see plan-brief.md "Key Decisions Made" for the full comparison against SM-2).

Planned with all decisions defaulted to the recommended option (no interactive question round) per explicit user request — see plan-brief.md "Key Decisions Made" for all decisions and rationale.

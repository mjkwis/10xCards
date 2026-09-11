---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo learner shipping a flashcard MVP in a one-week, after-hours-only timeline needs a
battle-tested, agent-friendly starter that handles auth and a database out of the box rather
than assembling them from scratch. 10x Astro Starter is the recommended default for
(web-app, js): Astro + React + TypeScript gives explicit, agent-legible contracts throughout,
Supabase bundles PostgreSQL and email/password auth (covering FR-008) with a TypeScript SDK,
and Cloudflare Pages/Workers is a low-ops edge deploy that fits the tight schedule. The AI
flashcard-generation flow (FR-001–FR-003) is implemented as a normal API call from an Astro
API route to an LLM provider — no dedicated AI starter feature is required. Payments,
realtime, and background jobs are out of scope per the PRD's Non-Goals and current FRs.
CI runs on GitHub Actions with auto-deploy on merge to main, matching the starter's default
shape for a solo project.

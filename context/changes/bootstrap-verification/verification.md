---
bootstrapped_at: 2026-09-10T21:51:15Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

### Why this stack

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

## Pre-scaffold verification

| Signal      | Value                                                | Severity | Notes                                                              |
| ----------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| npm package | not run                                                | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-08-22 | fresh    | from card `docs_url`                                                |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries (`.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `astro.config.mjs`, `CLAUDE.md` → `CLAUDE.md.scaffold`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: CLAUDE.md (existing cwd CLAUDE.md kept; scaffold version sided as `CLAUDE.md.scaffold`)
**.gitignore handling**: moved silently (cwd had no pre-existing `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 2 CRITICAL, 14 HIGH, 8 MODERATE, 3 LOW
**Direct vs transitive**: 1/0/2/0 direct of total 2/14/8/3 (npm audit's `isDirect` flag)

#### CRITICAL findings

- **astro** (direct) — range `<=7.2.7`, fix available. Advisories: XSS via unescaped attribute names in spread props (incomplete fix for CVE-2026-54298); XSS via unescaped `transition:*` directive values on hydrated islands; reflected XSS via unescaped View Transition animation properties; Host header SSRF in prerendered error page fetch; reflected XSS via unescaped slot name; remote code execution through AVIF image optimization; authorization bypass from missing path-segment boundary check when stripping the configured base. Also pulls in vulnerable `esbuild`, `sharp`.
- **tar** (transitive) — range `<=7.5.20`, fix available. Advisories: PAX size-override header smuggling; process crash via PAX numeric path type confusion; decompression/parse DoS via unlimited input; negative entry size causes infinite loop; uncaught exception DoS via NUL byte in PAX records; uncontrolled recursion in mapHas/filesFilter (stack-overflow DoS via crafted long-path tar).

#### HIGH findings

- **brace-expansion** (transitive) — range `<=1.1.17 || 3.0.0 - 5.0.8`. DoS via exponential-time / unbounded expansion, including a bypass of the CVE-2026-14257 mitigation.
- **browserslist** (transitive) — range `<=4.28.6`. Unbounded memory growth (no cache eviction); uncaught crash/prototype write via untrusted `browserslist-stats.json`.
- **devalue** (transitive) — range `5.6.3 - 5.8.0`. DoS via sparse array deserialization.
- **fast-uri** (transitive) — range `3.0.0 - 3.1.5`. Host confusion (backslash authority delimiter/introducer, percent-encoded scheme, failed IDN canonicalization) and SSRF via malformed IPv6/percent-decoding.
- **js-yaml** (transitive) — range `4.0.0 - 4.3.1`. Quadratic-complexity DoS in merge-key handling and `!!omap` resolution (CVE-2026-59870 fix not backported for 3.x/4.x).
- **miniflare** (transitive) — range `<=0.0.0-fff677e35 || 3.20250204.0 - 5.20260801.0-alpha`. Inherits `sharp`, `undici`, `ws` vulnerabilities.
- **nanoid** (transitive) — range `<=3.3.17`. Non-secure/custom generators can loop indefinitely with negative or zero size.
- **postcss** (transitive) — range `<=8.5.22`. Path traversal in source-map auto-loading (`sourceMappingURL`) leading to arbitrary `.map` file disclosure.
- **sharp** (transitive) — range `<=0.35.4-rc.0`. Inherited libvips CVEs (2026-33327/33328/35590/35591) and libheif vulnerabilities.
- **smol-toml** (transitive) — range `<=1.7.0`. DoS via malformed TOML documents.
- **svgo** (transitive) — range `4.0.0 - 4.0.2`. `removeScripts` plugin leaves executable scripts intact (namespace/control-character bypass, `foreignObject` HTML).
- **undici** (transitive) — range `7.0.0 - 7.28.0`. TLS validation bypass via SOCKS5 proxy, header injection, cache poisoning, cross-user info disclosure, and several related issues.
- **vite** (transitive) — range `7.0.0 - 7.3.3`. `launch-editor` NTLMv2 hash disclosure on Windows; `server.fs.deny` bypass on Windows alternate paths.
- **ws** (transitive) — range `8.0.0 - 8.20.1`. Uninitialized memory disclosure; memory exhaustion DoS from tiny fragments/data chunks.

#### MODERATE findings

- @astrojs/language-server (transitive, `2.14.0 - 2.16.10`)
- @cloudflare/vite-plugin (transitive, `<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`)
- baseline-browser-mapping (transitive, `>=2.0.0 <2.11.0`)
- supabase (direct, `1.1.6 - 2.98.2`)
- volar-service-yaml (transitive, `<=0.0.70`)
- wrangler (direct, `<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`)
- yaml (transitive, `2.0.0 - 2.8.2`)
- yaml-language-server (transitive, `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`)

All MODERATE findings report a fix available via `npm audit fix`.

#### LOW / INFO findings

- @babel/core (transitive, `<=7.29.0`)
- esbuild (transitive, `0.27.3 - 0.28.0`)
- postcss-selector-parser (transitive, `7.1.0 - 7.1.2`)

All LOW findings report a fix available via `npm audit fix`.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------- |
| bootstrapper_confidence  | first-class          |
| quality_override         | false                |
| path_taken               | standard             |
| self_check_answers       | null                 |
| team_size                | solo                 |
| deployment_target        | cloudflare-pages     |
| ci_provider              | github-actions       |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true                 |
| has_payments             | false                |
| has_realtime             | false                |
| has_ai                   | true                 |
| has_background_jobs      | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep — in this run, `CLAUDE.md.scaffold` carries the starter's own agent-context doc alongside your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — 2 CRITICAL (1 direct in `astro`, 1 transitive in `tar`) and 14 HIGH (all transitive) are worth a look before shipping; `npm audit fix` resolves most of the MODERATE/LOW tier automatically.

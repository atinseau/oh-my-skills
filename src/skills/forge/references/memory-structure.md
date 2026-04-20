# Memory Structure

`.forge/` is the agent's compact project memory, read lazily and keyword-indexed. Every entry carries
keywords; `index.md` is the table of contents and always the entry point. Files are deliberately
small so recall can be selective — the agent loads only what matches the current task.

## Directory Layout

```
.forge/
├── index.md                          # Table of contents (max 100 lines, derived)
├── context.md                        # Project summary: languages, frameworks, commands, last_consolidation
├── modules/
│   └── <name>.md                     # One file per module, built lazily on first reference
├── knowledge/
│   ├── patterns.md                   # Reusable patterns (cumulative)
│   ├── pitfalls.md                   # Traps + workarounds (cumulative)
│   ├── decisions.md                  # Architectural decisions (cumulative)
│   └── dependencies.md               # Extracted from manifests (rewritten on refresh)
├── features/<name>.md                # One file per completed feature
├── bugs/BUG-<NNN>.md                 # One file per resolved bug
└── sessions/<date>-<topic>-<author-slug>.md   # Only when memorable
```

## context.md

Frontmatter fields: `languages: [<list>]`, `frameworks: [<list>]`, `package_manager: <name>`,
`build_cmd`, `test_cmd`, `lint_cmd` (empty string is valid), `detected_at: <ISO 8601 date>`
(bootstrap time, never changes), `last_consolidation: <ISO 8601 date>` (updated on every forge
write — drives the sync/desync trigger).

Body: 3-8 sentences on stack specifics, structure, and conventions worth remembering. Not a full
architecture document — a condensed briefing.

```markdown
---
languages: [typescript, sql]
frameworks: [nextjs-15, drizzle]
package_manager: bun
build_cmd: bun run build
test_cmd: bun test
lint_cmd: bun run lint
detected_at: 2026-04-20
last_consolidation: 2026-04-20
---

# MyApp — Next.js SaaS

Auth via custom JWT (no NextAuth). Postgres via Drizzle. Tailwind + shadcn for UI.
Monorepo: web app at `apps/web`, shared schema at `packages/schema`.
```

## index.md

Auto-generated whenever forge writes. Max 100 lines. Frontmatter: `updated: <ISO date>`.

Include only sections with content: `## Modules`, `## Features`, `## Open Bugs`, `## Patterns`,
`## Pitfalls`, `## Decisions`, `## Last Session`. Each entry is one line with keywords:

- Module: `- <name> — <path> — keywords: a, b, c`
- Feature: `- <name> — status: <status> — keywords: a, b`
- Bug: `- BUG-<NNN> — <one-line symptom> — keywords: a, b`
- Pattern / Pitfall / Decision: `- <name> — keywords: a, b, c`
- Last session: `- <filename> — result: <pass|fail> — keywords: a, b`

```markdown
---
updated: 2026-04-20
---

# Index

## Modules
- auth — `src/auth/` — keywords: jwt, session, login
- api-client — `src/api/` — keywords: http, retry, timeout

## Features
- oauth2-login — status: done — keywords: oauth2, login

## Open Bugs
- BUG-001 — login token not refreshed on expiry — keywords: jwt, session

## Patterns
- zod-safe-parse-branching — keywords: validation, zod, error-handling

## Pitfalls
- edge-runtime-cookies — keywords: nextjs, edge, cookies

## Decisions
- custom-jwt-over-nextauth — keywords: auth, jwt, decision

## Last Session
- 2026-04-20-oauth2-login-arthur-tweak — result: pass — keywords: oauth2, login
```

## Per-module files (modules/<name>.md)

Frontmatter: `name`, `path`, `keywords: [<3-6 terms>]` (absent when `seeded: true`), optional
`status: active | removed` (`removed` keeps the file for keyword history), optional `seeded: true`
(stub created at first reference, not yet enriched).

Body (absent when seeded): `## Role` (one sentence), `## Key files` (2-3 bullets `- <path> (role)`),
`## Dependencies` (optional, 1-3 bullets).

Seeded stub: frontmatter with `name`, `path`, `seeded: true` — no body. Enriched: frontmatter with
full `keywords` array + `## Role` / `## Key files` / `## Dependencies` body sections.

## Knowledge files

Four cumulative files under `knowledge/`:

- **`patterns.md`** — reusable patterns (test idioms, error shapes, workflows). Entries separated
  by `---`. Follows `templates/pattern.md` (`name` + `keywords` + `created`; `## Pattern` /
  `## Why here` / `## Where applied`).
- **`pitfalls.md`** — traps + workarounds. Entries separated by `---`. Short frontmatter (`name` +
  `keywords`); body explains the trap and fix.
- **`decisions.md`** — architectural decisions. Entries separated by `---`. Follows
  `templates/decision.md` (`name` + `keywords` + `created`; `## Context` / `## Options considered`
  / `## Chosen` / `## Consequences`).
- **`dependencies.md`** — one `## <package-name>` block per direct dependency (`version:` +
  `purpose:`). Rewritten entirely on sync refresh, not appended.

Before appending a pattern or pitfall, check for an existing entry on the same concern — update
instead of duplicating.

## Feature and bug files

`features/<name>.md` uses `skills/forge/templates/feature.md`.
`bugs/BUG-<NNN>.md` uses `skills/forge/templates/bug.md`.

Both have their own frontmatter with `keywords:` for index retrieval. `<NNN>` is zero-padded
ascending (001, 002, ...).

## Session files (sessions/<date>-<topic>-<author-slug>.md)

Written only when the session produced a project-level learning. Routine sessions don't produce a
file. Content follows `templates/session.md`.

Filename: `<date>` (`YYYY-MM-DD`) + `<topic>` (2-4 word kebab-case slug) + `<author-slug>`.

`<author-slug>` derivation: take the part of `git config user.email` before `@`, lowercase, replace
non-alphanumeric characters with `-`, truncate to 20 characters. Fallback: `unknown`.

The author-slug eliminates concurrent-session collisions on shared branches.

## Merge Conflicts

- **`index.md`** — discard both sides, regenerate from the rest of `.forge/` (walk directories,
  rebuild from per-entity keywords).
- **`modules/<name>.md`** — resolve manually; keep the more enriched version (no `seeded: true`,
  or richer `keywords`).
- **`knowledge/*.md`** — take the union of entries from both sides; deduplicate by name / keywords.
- **`sessions/<date>-<topic>-<author-slug>.md`** — per-author filenames eliminate collisions. On
  collision (same email, two machines), append both sides in chronological order.
- **`features/*.md`, `bugs/BUG-*.md`** — genuine divergence; resolve by hand, favouring the side
  with more accurate "Verification" / "Lesson" content.
- **`context.md`** — take the later `last_consolidation`; for diverging commands or framework
  lists, resolve in favour of current project state.

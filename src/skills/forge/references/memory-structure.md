# Memory Structure

`.forge/` is the agent's compact project memory, read lazily and keyword-indexed. Every entry carries
keywords; `index.md` is the table of contents and always the entry point. Files are deliberately
small so recall can be selective — the agent loads only what matches the current task.

For per-entity schemas + blanks (context, module, bug, pitfall, feature, decision, pattern, session),
see `skills/forge/entities/<entity>.md`.

## Directory Layout

```
.forge/
├── index.md                          # Table of contents (max 100 lines, derived) — see entities/index below
├── context.md                        # Project summary — see entities/context.md
├── modules/
│   └── <name>.md                     # One file per module — see entities/module.md
├── knowledge/
│   ├── patterns.md                   # Reusable patterns (cumulative) — see entities/pattern.md
│   ├── pitfalls.md                   # Traps + workarounds (cumulative) — see entities/pitfall.md
│   ├── decisions.md                  # Architectural decisions (cumulative) — see entities/decision.md
│   └── dependencies.md               # Extracted from manifests (rewritten on refresh)
├── features/<name>.md                # One file per completed feature — see entities/feature.md
├── bugs/BUG-<NNN>.md                 # One file per resolved bug — see entities/bug.md
└── sessions/<date>-<topic>-<author-slug>.md   # Only when memorable — see entities/session.md
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

## Session filename rule

Filename: `<date>` (`YYYY-MM-DD`) + `<topic>` (2-4 word kebab-case slug) + `<author-slug>`.

`<author-slug>` derivation: take the part of `git config user.email` before `@`, lowercase, replace
non-alphanumeric characters with `-`, truncate to 20 characters. Fallback: `unknown`.

The author-slug eliminates concurrent-session collisions on shared branches.

## Security: what NOT to put in `.forge/`

`.forge/` is committed to git. Anything in it ends up in the repo's history and becomes public for public repos. Treat it accordingly:

- **Never copy-paste verbatim user prompts into session logs, bug descriptions, or learnings.** Prompts can contain API tokens, access keys, internal URLs, customer data, or other secrets the user pasted while discussing a problem. Paraphrase the user's intent instead: write "user asked for a session-expiry fix" rather than dumping the conversation.
- **Never include credentials, tokens, connection strings, or environment values in any `.forge/` file.** If a bug or pitfall concerns a secret being mishandled, describe the concern abstractly ("JWT signing key was logged by X") — do not paste the actual key.
- **Paths and module structure in `paths_involved` and `modules/*.md` are generally fine** for internal projects, but note that they leak architectural information. For closed-source projects that publish `.forge/` upstream (e.g. open-source drift from private fork), review what's committed.
- **Sanitise stack traces and error output** before dropping them in `bugs/BUG-*.md` Symptom / Verification sections. Real stack traces often contain absolute paths with user names, internal hostnames, tenant IDs, or request identifiers. Redact: `/Users/<name>/` → `/Users/<user>/`, `https://api.internal.corp/…` → `https://<internal-api>/…`, UUIDs → `<request-id>`.
- **`context.md` body generated from a README scan** can quote vendor names, internal URLs, or pre-launch product names. Review the generated body before committing on a public repo.
- **`.forge/qa/` (if introduced later)** would be an exception — screenshots, fixtures, and snapshots may contain private data. For now `.forge/qa/` is out of scope, but the same rule applies when it comes back.

If uncertain about whether an entry is safe to commit, write it locally first (outside `.forge/`), then distill the non-sensitive learning into the proper file. When in real doubt, add `.forge/sessions/` to `.gitignore` for that project — you lose continuity across machines but gain privacy.

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

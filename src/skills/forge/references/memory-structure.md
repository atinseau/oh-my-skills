# Memory Structure

`.forge/` is the agent's compact project memory, read lazily and keyword-indexed. Every entry carries
keywords; `index.md` is the table of contents and always the entry point. Files are deliberately
small so recall can be selective — the agent loads only what matches the current task.

MVP scope: the memory captures pitfalls and bugs only. See `triggers.md` → "Out of MVP scope" for
what is intentionally excluded.

For per-entity schemas + blanks (context, pitfall, bug), see `skills/forge/entities/<entity>.md`.

## Directory Layout

```
.forge/
├── index.md                          # Table of contents (max 100 lines, derived) — see section below
├── context.md                        # Project summary — see entities/context.md
├── knowledge/
│   └── pitfalls.md                   # Traps + workarounds (cumulative) — see entities/pitfall.md
└── bugs/BUG-<NNN>.md                 # One file per resolved bug — see entities/bug.md
```

Nothing else. No `features/`, `modules/`, `sessions/`, `knowledge/patterns.md`, `knowledge/decisions.md`, `knowledge/dependencies.md`. These may come back in a future version, gated on measured demand — see the `triggers.md` exclusion note.

## index.md

Auto-generated whenever forge writes. Max 100 lines. Frontmatter: `updated: <ISO date>`.

Include only sections with content: `## Open Bugs`, `## Pitfalls`. Each entry is one line with keywords:

- Bug: `- BUG-<NNN> — <one-line symptom> — keywords: a, b`
- Pitfall: `- <name> — keywords: a, b, c`

```markdown
---
updated: 2026-04-20
---

# Index

## Open Bugs
- BUG-001 — login token not refreshed on expiry — keywords: jwt, session

## Pitfalls
- edge-runtime-cookies — keywords: nextjs, edge, cookies
```

If neither section has content yet, the index carries only the frontmatter and the `# Index` heading — that is a valid empty state.

## Security: what NOT to put in `.forge/`

`.forge/` is committed to git. Anything in it ends up in the repo's history and becomes public for public repos. Treat it accordingly:

- **Never include credentials, tokens, connection strings, or environment values in any `.forge/` file.** If a bug or pitfall concerns a secret being mishandled, describe the concern abstractly ("JWT signing key was logged by X") — do not paste the actual key.
- **Never copy-paste verbatim user prompts into bug descriptions or learnings.** Prompts can contain API tokens, access keys, internal URLs, customer data, or other secrets the user pasted while discussing a problem. Paraphrase the user's intent instead.
- **Paths and module structure in `paths_involved`** are generally fine for internal projects, but note that they leak architectural information. For closed-source projects that publish `.forge/` upstream (e.g. open-source drift from private fork), review what's committed.
- **Sanitise stack traces and error output** before dropping them in `bugs/BUG-*.md` Symptom / Verification sections. Real stack traces often contain absolute paths with user names, internal hostnames, tenant IDs, or request identifiers. Redact: `/Users/<name>/` → `/Users/<user>/`, `https://api.internal.corp/…` → `https://<internal-api>/…`, UUIDs → `<request-id>`.
- **`context.md` body generated from a README scan** can quote vendor names, internal URLs, or pre-launch product names. Review the generated body before committing on a public repo.

If uncertain about whether an entry is safe to commit, write it locally first (outside `.forge/`), then distill the non-sensitive learning into the proper file.

## Merge Conflicts

- **`index.md`** — discard both sides, regenerate from the rest of `.forge/` (walk directories, rebuild from per-entry keywords).
- **`knowledge/pitfalls.md`** — take the union of entries from both sides; deduplicate by `name:` and `paths_involved:` overlap. When in doubt about whether two entries cover the same concern, run `forge audit` → "Possible duplicates" after the merge and consolidate manually.
- **`bugs/BUG-<NNN>.md`** — genuine divergence; resolve by hand, favouring the side with more accurate "Verification" / "Lesson" content. If both sides added a new BUG file with the same `<NNN>` but different content, renumber one to the next ascending unused number.
- **`context.md`** — take the later `last_consolidation`; for diverging commands or framework lists, resolve in favour of current project state.

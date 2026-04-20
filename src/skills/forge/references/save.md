# Save

How to write to `.forge/`. The goal is compact, deduped, keyword-indexed entries — not a diary. Forge is a knowledge base, not a log.

## Pick the template

| Trigger | Template | Destination |
|---|---|---|
| Feature completed | `templates/feature.md` | `features/<name>.md` |
| Bug resolved | `templates/bug.md` | `bugs/BUG-<NNN>.md` |
| Pattern surfaced | `templates/pattern.md` | appended entry in `knowledge/patterns.md` |
| Pitfall discovered | (inline frontmatter + body) | appended entry in `knowledge/pitfalls.md` |
| Decision made | `templates/decision.md` | appended entry in `knowledge/decisions.md` |
| Memorable session | `templates/session.md` | `sessions/<date>-<topic>-<author-slug>.md` |

When both a feature/bug file AND a session file would be written for the same work, **prefer the feature/bug file**. The session log is redundant — skip it. A session file is only written when the work is memorable but did not complete a specific feature or fix a specific bug.

`knowledge/*.md` files are cumulative — entries are separated by `---` lines or `## <name>` headers. They are NOT one-file-per-entity like features and bugs.

## Compact discipline

- Target line counts per entry:
  - Feature: 15-30 lines
  - Bug: 20-35 lines
  - Pattern: 10-25 lines
  - Decision: 15-30 lines
  - Pitfall entry: 10-25 lines
  - Session: 10-25 lines
- No redundant fields. Do NOT write `## What was asked` — the agent already has the user's request in context.
- No `## Iterations` section unless the session went through more than one iteration; if it did, add `iterations: N` in frontmatter and a short `## Iterations` block naming what changed.
- Keywords are always present (3-6 terms). They are the contract that makes future recall work.
- Ruthless brevity on bullet content: one line per point, no "I also realized that..." prose padding.
- Include code only when the pattern / fix / decision cannot be expressed in prose. Keep snippets to 1-3 lines.
- Never duplicate information already captured in `context.md` (project stack, constraints, team conventions).
- Do NOT repeat the bug description verbatim in `## Root cause` — summarise the cause, not the symptom.

### Keywords: the precision contract

Keywords drive recall. Weak keywords make entries invisible. Strong keywords are specific:

- Prefer domain terms over generic ones: `jwt-refresh` beats `auth`; `prisma-migration` beats `database`.
- Include the module name when the learning is module-scoped: `auth-service`, `billing-webhook`.
- Include the error code or exception name for bugs: `ERR_SOCKET_TIMEOUT`, `ZodError`.
- 3 terms minimum — a single keyword is never enough to distinguish an entry.

### Template shortcut: pitfall inline format

When no template exists for pitfalls, write the entry inline:

```
---
name: <short-slug>
keywords: [term1, term2, term3]
date: <ISO date>
---
<One-sentence description of the pitfall.>

**Workaround**: <what to do instead>
```

Append to `knowledge/pitfalls.md`, preceded by `---` if the file already has entries.

## Deduplicate before save

1. For `patterns.md`, `pitfalls.md`, and `decisions.md` entries:
   - Read the current file (if it exists).
   - Grep for overlapping keywords (2+ shared terms suggests the same concern).
   - Scan the matching entries: is this truly the same concern?
   - If yes — UPDATE conservatively: preserve the original `created:` date and the existing `## Pattern` / `## Why here` / `## Context` content. Append to `## Where applied` (patterns), add a clarifying note, or refine the workaround (pitfalls). Do NOT rewrite the core body unless the original is wrong. Do NOT create a second entry.
   - If no — append a new entry, separated from the previous by `---`.

2. For `features/<name>.md` and `bugs/BUG-<NNN>.md` (per-entity files):
   - If a file with the same name/id already exists, UPDATE in place.
   - For bugs, increment `<NNN>` to the next ascending unused number.

3. Deduplication is a REQUIRED step — skipping it produces a cluttered `.forge/` where every cycle adds noise.

## When NOT to save

This is the most important rule of save — forge is not a diary.

- Task produced no new project-level learning (agent implemented what it would have without forge anyway).
- Typo fix, formatting change, mechanical rename, pure refactor without new insight.
- The "learning" would be a generic programming observation ("arrow functions are concise") rather than project-specific ("in this project, all auth routes must go through `lib/session.ts:verify`").
- The user marked the task as quick-and-dirty / throwaway.
- A no-op cycle (task was trivial, memory is already rich on this area).

If nothing is memorable, NO session file is written for that cycle. Forge is a knowledge base, not a journal.

## After save

Always, after any write to `.forge/`:

1. Update `.forge/index.md` — regenerate the relevant section(s) from the new content. Set the frontmatter `updated:` field to today's ISO date. The index is derived; never hand-edit.
2. Update `last_consolidation` in `.forge/context.md` frontmatter to the current ISO date.
3. Do NOT git commit — the user commits when they're ready. Forge writes files; it does not push them.

## Session file specifics

- Filename pattern: `sessions/<date>-<topic>-<author-slug>.md`.
- `<author-slug>` derivation: `git config user.email`, take the part before `@`, lowercase, replace non-alphanumerics with `-`, truncate to 20 chars. Fallback: `unknown`.
- Session files are per-author — eliminates collisions when multiple devs work on the same branch the same day.
- Content: use `templates/session.md`. Minimal: frontmatter + `## Learnings` + `## Follow-ups`. No `## What was asked`.
- Only write a session file if the session produced something memorable (trigger the save path). A no-op session produces nothing.

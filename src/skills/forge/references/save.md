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
paths_involved: [<path/to/file>, <path/to/module/>]
date: <ISO date>
---
<One-sentence description of the pitfall.>

**Workaround**: <what to do instead>
```

Append to `knowledge/pitfalls.md`, preceded by `---` if the file already has entries.

### `paths_involved`: powering pre-flight warnings

Bug entries (`bugs/BUG-<NNN>.md`) and pitfall entries (`knowledge/pitfalls.md`) MUST include `paths_involved: [<path>, <path>]` in their frontmatter. List the files or directories where the bug/pitfall manifests — these are checked on every file edit (see `recall.md` → "Pre-flight"). Missing this field = the pitfall will not fire as a pre-flight warning and will only surface via keyword match, dramatically reducing its protective value.

Guidelines:
- Be specific when possible (`src/auth/session.ts`) and broad when the pitfall applies module-wide (`src/auth/`).
- Feature files MAY include `paths_involved` too (helps with cross-referencing) but it is not mandatory there.
- Patterns and decisions do not use `paths_involved` — they apply to the whole project, not specific files.

## Deduplicate before save — semantic, not just keyword-overlap

Keyword overlap alone is a weak dedup signal: "token-refresh-race" and "session-expiry-bug" might be the same concern under different names. Dedup is semantic: the agent must actively read candidate entries and decide.

**Procedure for `patterns.md`, `pitfalls.md`, and `decisions.md`:**

1. Read the target file (if it exists).
2. Find candidates: identify the top 3 entries that share ≥ 2 keywords with the new entry (or share `paths_involved` overlap for pitfalls).
3. If candidates exist, read them fully (not just headers).
4. For each candidate, explicitly classify:
   - **Same concern** — the new finding is a refinement, additional context, or another occurrence of the same underlying issue/pattern/decision.
   - **Related but distinct** — different enough to warrant a separate entry; cross-reference in the new entry's body (`See also: <other-entry-name>`).
   - **Unrelated** — keyword overlap was coincidental.
5. Classification drives action:
   - **Same concern** → UPDATE conservatively: preserve original `created:` date and existing `## Pattern` / `## Why here` / `## Context` body. Append to `## Where applied` (patterns), extend `paths_involved` (pitfalls), add a refinement note, or refine the workaround. Do NOT rewrite the core body unless the original is wrong.
   - **Related but distinct / Unrelated** → APPEND a new entry (separated by `---`). Add cross-references to related entries in the body.
6. If step 3-5 reveals the new finding is actually a duplicate of something already well-captured: do NOT save. Skipping duplicates is a valid save outcome.

**Procedure for `features/<name>.md` and `bugs/BUG-<NNN>.md` (per-entity files):**

- If a file with the same name/id already exists, UPDATE in place.
- For bugs, increment `<NNN>` to the next ascending unused number.

**Deduplication is MANDATORY.** Skipping it clutters `.forge/` and dilutes future recalls.

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

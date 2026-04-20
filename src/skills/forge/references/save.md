# Save

How to write to `.forge/`. The goal is compact, deduped, keyword-indexed entries — not a diary. Forge is a knowledge base, not a log.

MVP scope: the only save targets are pitfalls and bugs. See `triggers.md` → "Out of MVP scope" for what is intentionally NOT saved.

## Pick the entity file

For each trigger, load **only** the matching entity file (`entities/<name>.md`) — it contains both the schema (field details) and the blank to copy.

| Trigger | Entity file | Destination |
|---|---|---|
| Trigger 2 — Pitfall discovered | `entities/pitfall.md` | appended entry in `.forge/knowledge/pitfalls.md` |
| Trigger 2 (side-write) — Pitfall produced a concrete bug that was fixed | `entities/bug.md` | `.forge/bugs/BUG-<NNN>.md` |

Bugs are NOT a standalone trigger — they only arise as a side-write when a pitfall (Trigger 2) corresponds to a concrete bug that was fixed (see `triggers/pitfall.md` step 3).

`knowledge/pitfalls.md` is cumulative — entries are separated by `---` lines. It is NOT one-file-per-entity like bugs.

## Compact discipline

- Target line counts per entry:
  - Bug: 20-35 lines
  - Pitfall entry: 10-25 lines
- No redundant fields. Do NOT write `## What was asked` — the agent already has the user's request in context.
- Keywords are always present (3-6 terms). They are the contract that makes future recall work.
- Ruthless brevity on bullet content: one line per point, no "I also realized that..." prose padding.
- Include code only when the fix cannot be expressed in prose. Keep snippets to 1-3 lines.
- Never duplicate information already captured in `context.md` (project stack, constraints, team conventions).
- Do NOT repeat the bug description verbatim in `## Root cause` — summarise the cause, not the symptom.

### Keywords: the precision contract

Keywords drive recall. Weak keywords make entries invisible. Strong keywords are specific:

- Prefer domain terms over generic ones: `jwt-refresh` beats `auth`; `prisma-migration` beats `database`.
- Include the module name when the learning is module-scoped: `auth-service`, `billing-webhook`.
- Include the error code or exception name for bugs: `ERR_SOCKET_TIMEOUT`, `ZodError`.
- 3 terms minimum — a single keyword is never enough to distinguish an entry.

### Pitfall inline format

Write pitfall entries inline:

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
- Audit (`audit.md`) scans these fields to detect stale paths after renames or deletions. Keeping them accurate is what prevents silent memory rot.

## Deduplicate before save — semantic, not just keyword-overlap

Keyword overlap alone is a weak dedup signal: "token-refresh-race" and "session-expiry-bug" might be the same concern under different names. Dedup is semantic: the agent must actively read candidate entries and decide.

**Procedure for `pitfalls.md`:**

1. Read the target file (if it exists).
2. Find candidates: identify the top 3 entries that share ≥ 2 keywords with the new entry (or share `paths_involved` overlap).
3. If candidates exist, read them fully (not just headers).
4. For each candidate, explicitly classify:
   - **Same concern** — the new finding is a refinement, additional context, or another occurrence of the same underlying issue.
   - **Related but distinct** — different enough to warrant a separate entry; cross-reference in the new entry's body (`See also: <other-entry-name>`).
   - **Unrelated** — keyword overlap was coincidental.
5. Classification drives action:
   - **Same concern** → UPDATE conservatively: preserve original `date:` and existing body. Extend `paths_involved`, add a refinement note, or refine the workaround. Do NOT rewrite the core body unless the original is wrong.
   - **Related but distinct / Unrelated** → APPEND a new entry (separated by `---`). Add cross-references to related entries in the body.
6. If step 3-5 reveals the new finding is actually a duplicate of something already well-captured: do NOT save. Skipping duplicates is a valid save outcome.

**Procedure for `bugs/BUG-<NNN>.md` (per-entity files):**

- If a file with the same `id:` already exists, UPDATE in place.
- Otherwise, increment `<NNN>` to the next ascending unused number.

**Deduplication is MANDATORY.** Skipping it clutters `.forge/` and dilutes future recalls.

## When NOT to save

This is the most important rule of save — forge is not a diary.

- Task produced no new project-level learning (agent implemented what it would have without forge anyway).
- Typo fix, formatting change, mechanical rename, pure refactor without new insight.
- The "learning" would be a generic programming observation ("arrow functions are concise") rather than project-specific ("in this project, all auth routes must go through `lib/session.ts:verify`").
- The user marked the task as quick-and-dirty / throwaway.
- The learning belongs in a different source of truth — see `triggers.md` → "Out of MVP scope" for the mapping. MVP forge captures pitfalls + bugs only.

If nothing is memorable, NO file is written for that cycle. Forge is a knowledge base, not a journal.

## After save

Always, after any write to `.forge/`:

1. Update `.forge/index.md` — regenerate the relevant section(s) from the new content. Set the frontmatter `updated:` field to today's ISO date. The index is derived; never hand-edit.
2. Update `last_consolidation` in `.forge/context.md` frontmatter to the current ISO date.
3. Do NOT git commit — the user commits when they're ready. Forge writes files; it does not push them.

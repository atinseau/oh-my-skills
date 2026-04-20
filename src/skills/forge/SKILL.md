---
name: forge
description: Project memory layer. Auto-invoke when starting work on an unfamiliar codebase, completing a feature worth remembering, discovering a reusable pattern, learning a pitfall, detecting that memory may be stale (post-pull/sync), or recalling past context the user references. Compose with test-driven-development / systematic-debugging / verification-before-completion from superpowers — forge remembers, those skills enforce discipline. Do NOT invoke for one-shot scripts, throwaway edits, or routine tasks that produce nothing memorable.
by: oh-my-skills
---

# Forge

Project memory skill. Auto-invoked on specific signals to save or recall project context. Composes with superpowers — forge does NOT implement TDD, debugging, verification, or review. It remembers.

## What forge is for

Forge's value is continuity across sessions. Between your tasks and your breaks, `.forge/` preserves compact, keyword-indexed knowledge about your project — so the next session picks up with the right context automatically.

Best fit: projects spanning multiple sessions where learnings, patterns, and decisions accumulate. Overkill for one-shot scripts.

## When forge invokes itself

Six triggers. On each, forge reads or writes to `.forge/`.

| # | Signal | What happens |
|---|---|---|
| 1 | First task in a codebase with no `.forge/` | Bootstrap: write initial `context.md` + empty `index.md` |
| 2 | Feature completed | Save `features/<name>.md` (+ optional pattern / decision) |
| 3 | Reusable pattern surfaces | Append to `knowledge/patterns.md` |
| 4 | Pitfall discovered | Append to `knowledge/pitfalls.md` (+ bug file if fixed) |
| 5 | Memory may be stale (post-pull / manual edits) | Desync probe, ask user, bounded refresh or record staleness |
| 6 | User references past context | Recall: read `index.md`, keyword-match, lazy-load matching files |

See `references/triggers.md` for detection logic and detailed actions.

## Save

When triggers 2-4 fire: read `references/save.md`. Pick the right template, write compact content, dedup against existing entries, update `index.md`, update `last_consolidation` in `context.md`.

## Recall

When trigger 6 fires (or when a task may benefit from prior context): read `references/recall.md`. Always enter via `index.md`, keyword-match, lazy-load 1-3 matching files. Do not scan the memory tree.

## Lazy module enrichment

`modules/<name>.md` files are created as stubs (`seeded: true`) when a module is first referenced. On next recall, if the stub matches the task keywords, it is enriched in-place (read 2-3 files, extract role / key_files / keywords, rewrite). Budget: max 5 file reads per enrichment.

## Composition with superpowers

Forge is orthogonal to:
- `test-driven-development` — use this for TDD loops
- `systematic-debugging` — use this for bug investigation
- `verification-before-completion` — use this before claiming done
- `requesting-code-review` / `receiving-code-review` — use these for review discipline
- `writing-plans` / `executing-plans` / `subagent-driven-development` — use these for multi-step tasks

Forge does not replicate any of these. It remembers what they produce.

## Rules of forge

1. Auto-invoked — not always on.
2. Save only what's memorable — no session file for a no-op cycle.
3. Compact — target 10-30 lines per entry.
4. Keywords always — 3-6 terms per entry, for future recall.
5. Lazy — read `index.md` first, deeper files only on match.
6. Orthogonal — does not overlap superpowers skills.

## References

- `references/memory-structure.md` — `.forge/` layout, frontmatter schemas, index format, merge-conflict policy
- `references/triggers.md` — the 6 auto-invocation signals and their detection/action logic
- `references/save.md` — when/what/how to persist, dedup rules, when NOT to save
- `references/recall.md` — on-demand loading, keyword match, lazy enrichment

## Templates

Located at `skills/forge/templates/`:
- `feature.md` — completed feature
- `bug.md` — resolved bug
- `pattern.md` — reusable pattern (test idiom, archi shape, workflow)
- `decision.md` — architectural decision with rationale
- `session.md` — session log (only when memorable)

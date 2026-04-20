---
name: forge
description: Project memory skill. Auto-invoke on 7 signals — bootstrap new codebase, feature completed, pattern/pitfall/decision worth remembering, memory stale (post-pull), or recall needed (task start, file edit, user query). Composes with superpowers (TDD, debugging, verification, review). Do NOT invoke for one-shot scripts, typo fixes, or trivial edits.
by: oh-my-skills
---

# Forge

Project memory skill. Save / recall / warn based on the active trigger. Does NOT implement TDD, debugging, verification, or review — use the dedicated superpowers skills for those.

## Dispatch

1. Identify which of the 7 triggers fires (see table below).
2. Load `references/triggers/<name>.md` — ONLY the one that fires.
3. Follow its detect + action blocks.
4. For save actions → also read `references/save.md` and the matching `references/schemas/<entity>.md`.
5. For recall actions → also read `references/recall.md`.
6. Use `references/memory-structure.md` for `.forge/` layout, `index.md` format, session filename rule, security, and merge-conflict policy.

## Trigger matrix

| # | Signal | Kind | Reference |
|---|---|---|---|
| 1 | First task, no `.forge/` exists | Bootstrap | `triggers/bootstrap.md` |
| 2 | Feature completed | Save | `triggers/feature-completed.md` |
| 3 | Reusable pattern surfaces | Save | `triggers/pattern.md` |
| 4 | Pitfall discovered | Save | `triggers/pitfall.md` |
| 5 | Decision made among options | Save | `triggers/decision.md` |
| 6 | Memory may be stale (post-pull / manual edits) | Sync | `triggers/sync.md` |
| 7 | Recall needed (task start / file edit / user query) | Recall | `triggers/recall.md` |

See `references/triggers.md` for the "Not invoked for" exclusion list.

## Non-negotiable rules

1. **Lazy** — read `.forge/index.md` first on any recall; deeper files only on keyword match.
2. **Compact** — target 10-30 lines per entry. Keywords always (3-6 terms).
3. **`paths_involved` on bugs + pitfalls** — powers pre-flight warnings. Non-optional.
4. **Semantic dedup before save** — read top-3 candidates, classify same/related/unrelated, act accordingly (see `save.md`).
5. **Atomic enrichment** — if lazy module enrichment aborts, keep the `seeded: true` stub, never a half-written entry.
6. **Pre-flight is path-based, not semantic** — "no warning" ≠ "safe edit". Apply normal reasoning on top.
7. **Orthogonal** — do not duplicate `test-driven-development`, `systematic-debugging`, `verification-before-completion`, or review skills. Forge remembers what they produce.

## File map

```
src/skills/forge/
├── SKILL.md                           # this file — dispatcher
├── references/
│   ├── triggers.md                    # matrix + exclusion list
│   ├── triggers/<name>.md             # 7 per-trigger detail files (load only the one that fires)
│   ├── save.md                        # write path: templates, compact rules, semantic dedup
│   ├── recall.md                      # 3 recall modes (proactive / pre-flight / reactive) + lazy enrichment
│   ├── memory-structure.md            # .forge/ layout + index format + session rule + security + merge
│   └── schemas/<entity>.md            # per-entity schema + example (load only the one being saved)
└── templates/<entity>.md              # copy-paste blanks
```

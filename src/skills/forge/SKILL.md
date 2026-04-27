---
name: forge
description: Project memory skill (MVP). Auto-invoke on 3 signals — bootstrap new codebase, pitfall discovered, or recall needed (file edit pre-flight / user query). Manual mode — audit for memory health. Composes with superpowers (TDD, debugging, verification, review). Do NOT invoke for one-shot scripts, typo fixes, or trivial edits.
by: oh-my-skills
---

# Forge

Project memory skill (MVP scope). Save pitfalls / recall them before edits / bootstrap new repos. Does NOT implement TDD, debugging, verification, or review — use the dedicated superpowers skills for those.

## Dispatch

1. Identify which of the 3 auto-triggers fires, OR detect manual audit invocation (see matrix below).
2. Load the matching reference — ONLY the one that fires:
   - Auto-triggers → `references/triggers/<name>.md`
   - Manual audit → `references/audit.md`
3. Follow its detect + action blocks.
4. For save actions → also read `references/save.md` and the matching `entities/<entity>.md`.
5. For recall actions → also read `references/recall.md`.
6. For audit → `audit.md` is self-contained; it does not call `save.md` or `recall.md`.
7. Use `references/memory-structure.md` for `.forge/` layout, `index.md` format, security, and merge-conflict policy.

## Trigger matrix

| # | Signal | Kind | Reference |
|---|---|---|---|
| 1 | First task, no `.forge/` exists | Bootstrap (auto) | `triggers/bootstrap.md` |
| 2 | Pitfall discovered (side-write: bug if a concrete fix landed) | Save (auto) | `triggers/pitfall.md` |
| 3 | Recall needed (pre-flight on file edit / user query) | Recall (auto) | `triggers/recall.md` |
| 4 | User invokes audit ("forge audit", "audit memory", …) | Audit (manual) | `audit.md` |

See `references/triggers.md` for the "Not invoked for" exclusion list.

## Non-negotiable rules

1. **Lazy** — read `.forge/index.md` first on any recall; deeper files only on keyword or path match.
2. **Compact** — target 10-25 lines per entry. Keywords always (3-6 terms).
3. **`paths_involved` on bugs + pitfalls** — powers pre-flight warnings. Non-optional.
4. **Semantic dedup before save** — read top-3 candidates, classify same/related/unrelated, act accordingly (see `save.md`).
5. **Pre-flight is path-based, not semantic** — "no warning" ≠ "safe edit". Apply normal reasoning on top.
6. **Orthogonal** — do not duplicate `test-driven-development`, `systematic-debugging`, `verification-before-completion`, or review skills. Forge remembers what they produce.
7. **MVP scope** — features, patterns, decisions, sessions, modules are NOT saved in this version. Their rationale already lives in git log, PRs, and ADRs. Do not reinstate without measured demand (invocation frequency, pre-flight hit rate, save/skip ratio).
8. **Audit is read-only** — the audit mode reports findings; it never deletes, renames, or rewrites. The user drives follow-up fixes through the normal save path.

## File map

```
src/skills/forge/
├── SKILL.md                           # this file — dispatcher
├── references/
│   ├── triggers.md                    # exclusion list + shared-refs note
│   ├── triggers/<name>.md             # 3 per-trigger detail files (bootstrap, pitfall, recall)
│   ├── save.md                        # write path: entity picker, compact rules, semantic dedup
│   ├── recall.md                      # 2 recall modes (pre-flight / reactive) + task-start index read
│   ├── audit.md                       # manual mode: memory-health report (stale paths, orphans, duplicates)
│   └── memory-structure.md            # .forge/ layout + index format + security + merge
└── entities/<name>.md                 # per-entity schema + example + blank (context, pitfall, bug)
```

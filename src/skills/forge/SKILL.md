---
name: forge
description: Active project memory layer. Auto-invoke at task start (surface relevant memory proactively), before editing a file (check for known pitfalls/bugs on that path), when completing a feature or discovering a pattern/pitfall/decision worth remembering, when memory may be stale after git pull or manual edits, when starting work on an unfamiliar codebase (bootstrap mines git history + hot spots), or when the user references past context. Compose with test-driven-development / systematic-debugging / verification-before-completion from superpowers — forge remembers and surfaces, those skills enforce discipline. Do NOT invoke for one-shot scripts, throwaway edits, or routine tasks that produce nothing memorable.
by: oh-my-skills
---

# Forge

Active project memory skill. Auto-invoked on specific signals to save, recall, or surface project context. Composes with superpowers — forge does NOT implement TDD, debugging, verification, or review. It remembers and warns.

## What forge is for

Forge's value is **active continuity**. Between your tasks and your breaks, `.forge/` preserves compact, keyword-indexed knowledge about your project. But more importantly, forge **proactively surfaces** this memory when it's relevant — at task start, before file edits, when decisions are being made. You don't have to remember to ask; forge reminds.

Best fit: projects spanning multiple sessions where learnings, patterns, and decisions accumulate. Overkill for one-shot scripts.

## When forge invokes itself

Seven triggers. On each, forge reads, writes, or surfaces memory.

| # | Signal | What happens |
|---|---|---|
| 1 | First task in a codebase with no `.forge/` | Bootstrap: mines git history + hot spots, seeds `context.md`, stub modules, inferred decisions |
| 2 | Feature completed | Save `features/<name>.md` (+ optional pattern/decision) |
| 3 | Reusable pattern surfaces | Append to `knowledge/patterns.md` |
| 4 | Pitfall discovered | Append to `knowledge/pitfalls.md` (+ bug file if fixed) |
| 5 | Decision made among options | Propose save; append to `knowledge/decisions.md` |
| 6 | Memory may be stale (post-pull / manual edits) | Desync probe, ask user, bounded refresh or record staleness |
| 7 | Recall (task start / file edit / user query) | Surface relevant memory proactively OR on demand |

See `references/triggers.md` for detection logic and detailed actions.

## Save

When triggers 2-5 fire: read `references/save.md`. Pick the right template, apply semantic dedup, write compact content (populate `paths_involved:` where applicable), update `index.md`, update `last_consolidation` in `context.md`.

## Recall (3 modes)

Trigger 7 has three modes, all via `references/recall.md`:

- **Proactive (7a):** at task start, forge automatically surfaces the top 1-3 matching memory entries before Claude writes code. Announces what was loaded so the user sees forge is active.
- **Pre-flight (7b):** before any Edit/Write on a file, forge checks `paths_involved` fields across `knowledge/pitfalls.md` and `bugs/BUG-*.md`. If the file has associated pitfalls or past bugs, they are surfaced as warnings *before* the edit.
- **Reactive (7c):** user asks "how did we...", "what was the decision on...". Forge reads index, keyword-matches, lazy-loads matching files.

In all modes: enter via `index.md`, keyword-match, lazy-load 1-3 files. Never scan the memory tree.

## Lazy module enrichment

`modules/<name>.md` files are created as stubs (`seeded: true`) at bootstrap and on first reference. On recall, if a stub matches the task keywords, it is enriched in-place (read 2-3 files, extract role / key_files / keywords, rewrite). Budget: max 5 file reads per enrichment. Atomic: if enrichment aborts before completion, stub stays `seeded: true`.

## Semantic dedup on save

Before appending a new pattern/pitfall/decision, forge compares the new entry semantically to the top-3 keyword-matched existing entries and explicitly decides: "same concern → update conservatively" OR "different → append". This keeps `.forge/knowledge/*.md` focused over time.

## Composition with superpowers

Forge is orthogonal to:
- `test-driven-development` — use this for TDD loops
- `systematic-debugging` — use this for bug investigation
- `verification-before-completion` — use this before claiming done
- `requesting-code-review` / `receiving-code-review` — use these for review discipline. Forge can best-effort surface relevant pitfalls/bugs in the review request body (see `recall.md` → "Code review"), but the review skill itself is not aware of forge — effectiveness depends on the dispatched reviewer honouring the inline checklist.
- `writing-plans` / `executing-plans` / `subagent-driven-development` — use these for multi-step tasks

Forge does not replicate any of these. It remembers what they produce and surfaces it when relevant.

## Rules of forge

1. **Active, not passive** — forge pushes relevant memory at task start and before file edits, not only on user request.
2. Auto-invoked — not always on.
3. Save only what's memorable — no session file for a no-op cycle.
4. Compact — target 10-30 lines per entry.
5. Keywords always — 3-6 terms per entry, for future recall.
6. `paths_involved` on pitfalls and bugs — enables pre-flight warnings.
7. Lazy — read `index.md` first, deeper files only on match.
8. Semantic dedup before append — keep knowledge files focused.
9. Orthogonal — does not overlap superpowers skills.

## References

- `references/memory-structure.md` — `.forge/` layout, frontmatter schemas, `paths_involved` field, index format, merge-conflict policy
- `references/triggers.md` — the 7 auto-invocation signals with detection/action logic
- `references/save.md` — save path with semantic dedup, when NOT to save
- `references/recall.md` — 3 recall modes (proactive / pre-flight / reactive), lazy enrichment

## Templates

Located at `skills/forge/templates/`:
- `feature.md` — completed feature
- `bug.md` — resolved bug (with `paths_involved`)
- `pattern.md` — reusable pattern (test idiom, archi shape, workflow)
- `decision.md` — architectural decision with rationale
- `session.md` — session log (only when memorable)

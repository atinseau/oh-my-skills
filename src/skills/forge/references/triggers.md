# Triggers

Forge auto-invokes on 7 signals. Each signal lives in its own file under `triggers/<name>.md` — load only the one that fires, never all 7 at once.

## Trigger matrix

| # | Signal | Action | Details |
|---|---|---|---|
| 1 | First task in a codebase with no `.forge/` | Bootstrap (mines git + code) | `triggers/bootstrap.md` |
| 2 | Feature completed | Save feature (+ optional pattern/decision) | `triggers/feature-completed.md` |
| 3 | Reusable pattern surfaces | Save pattern | `triggers/pattern.md` |
| 4 | Pitfall discovered | Save pitfall (+ bug if applicable) | `triggers/pitfall.md` |
| 5 | Decision made among options | Save decision | `triggers/decision.md` |
| 6 | Memory may be stale | Desync probe + refresh ask | `triggers/sync.md` |
| 7 | Recall needed (task start, file edit, user query) | Surface relevant memory | `triggers/recall.md` |

Note: `<author-slug>` referenced in triggers is derived per `memory-structure.md` → "Session files" (take part before `@` in `git config user.email`, lowercase, non-alphanumerics → `-`, truncate 20 chars, fallback `unknown`).

## Not invoked for

- One-shot scripts or throwaway code.
- Single-file fixes that produce no new project-level insight.
- Routine tasks: typos, formatting, pure renames, mechanical refactors with no new reasoning.
- Tasks the user explicitly says are "quick and dirty" or "not worth remembering".
- Projects where no `.forge/` exists AND the user has not signalled memory is wanted. (Bootstrap is Trigger 1 — invoked on first substantive work, not on drive-by edits.)

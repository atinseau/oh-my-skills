# Triggers

Per-trigger details live in `triggers/<name>.md`. The dispatch matrix is in `SKILL.md`; this file holds the cross-cutting pieces that belong with the triggers but don't fit inside any single one.

## Not invoked for

- One-shot scripts or throwaway code.
- Single-file fixes that produce no new project-level insight.
- Routine tasks: typos, formatting, pure renames, mechanical refactors with no new reasoning.
- Tasks the user explicitly says are "quick and dirty" or "not worth remembering".
- Projects where no `.forge/` exists AND the user has not signalled memory is wanted. (Bootstrap is Trigger 1 — invoked on first substantive work, not on drive-by edits.)

## Shared references used by triggers

- `<author-slug>` derivation — see `memory-structure.md` → "Session filename rule" (take part before `@` in `git config user.email`, lowercase, non-alphanumerics → `-`, truncate 20 chars, fallback `unknown`).
- Schemas — see `schemas/<entity>.md` for frontmatter + body details of each entity a trigger may write.
- Save discipline (dedup, compact rules, when NOT to save) — see `save.md`.
- Recall modes (proactive / pre-flight / reactive) — see `recall.md`.

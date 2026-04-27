# Triggers

Per-trigger details live in `triggers/<name>.md`. The dispatch matrix is in `SKILL.md`; this file holds the cross-cutting pieces that belong with the triggers but don't fit inside any single one.

Audit is NOT a trigger — it is a manual mode invoked explicitly by the user and documented in `audit.md`.

## Not invoked for

- One-shot scripts or throwaway code.
- Single-file fixes that produce no new project-level insight.
- Routine tasks: typos, formatting, pure renames, mechanical refactors with no new reasoning.
- Tasks the user explicitly says are "quick and dirty" or "not worth remembering".
- Projects where no `.forge/` exists AND the user has not signalled memory is wanted. (Bootstrap is Trigger 1 — invoked on first substantive work, not on drive-by edits.)

## Out of MVP scope (do NOT save)

MVP forge captures pitfalls and bugs only. The following are intentionally NOT saved — their rationale already lives in other sources and duplicating it clutters `.forge/`:

- Completed features → git log, PR descriptions, CHANGELOG.
- Reusable patterns → codebase itself; if truly reusable, it becomes a function/module.
- Architectural decisions → ADR files, PR descriptions, commit messages.
- Session logs → conversation history, git log.
- Module summaries → README, directory structure, code.

If a future signal (measured invocation frequency, user demand) justifies reinstating any of these, reintroduce them one at a time with a dedicated trigger file.

## Shared references used by triggers

- Entity files — see `entities/<name>.md` (context, pitfall, bug) for schema + example + blank.
- Save discipline (dedup, compact rules, when NOT to save) — see `save.md`.
- Recall modes (task-start index read / pre-flight / reactive) — see `recall.md`.
- Manual audit procedure — see `audit.md`.

# Trigger 3 — Reusable pattern

**Detect:** during coding, a solution shape will clearly repeat (test idiom, error-handling pattern, concurrency shape, workflow). The agent recognises this either because it already solved the same shape earlier in the session, or knows it will be applied again immediately.

**Action:**
1. Read `.forge/knowledge/patterns.md` (if it exists) — apply semantic dedup (see `save.md`).
2. If an existing pattern covers this concern: UPDATE conservatively (extend `## Where applied`, preserve `created:` and `## Pattern` body).
3. Otherwise, APPEND a new entry (separated by `---`) using `skills/forge/templates/pattern.md`. Target 10-25 lines.
4. Update `.forge/index.md` — `## Patterns` section.
5. Update `last_consolidation`.

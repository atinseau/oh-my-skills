# Trigger 4 — Pitfall

**Detect:** during debugging or discovery, the agent learns something that should warn future work: a breaking assumption, a wrong default, a subtle behaviour, a library quirk.

**Action:**
1. Read `.forge/knowledge/pitfalls.md` (if it exists) — apply semantic dedup.
2. If present, UPDATE (add a note or refine the workaround). Otherwise, APPEND a new entry with frontmatter (`name`, `keywords`, `paths_involved: [<files/modules where this applies>]`) and body. Target 10-25 lines.
3. If the pitfall produced or was caused by a concrete bug that was then fixed: ALSO write `.forge/bugs/BUG-<NNN>.md` using `skills/forge/templates/bug.md` (find next ascending number). The bug file and pitfall entry cross-reference each other.
4. Update `.forge/index.md` — `## Pitfalls` and `## Open Bugs` as applicable.
5. Update `last_consolidation`.

# Trigger 2 — Feature completed

**Detect:**
- The user indicates completion: "done", "ship it", "that's it", "ready", or similar.
- OR the agent has finished implementing + verifying a feature (tests pass, manual check done, verification-before-completion cleared).

**Action:**
1. Pick a slug for the feature (kebab-case, 2-4 words).
2. Write `.forge/features/<slug>.md` using `skills/forge/entities/feature.md` (schema + blank). Target 15-30 lines. Include `paths_involved: [<touched file paths>]` in frontmatter.
3. Scan the work for secondary memorables:
   - Reusable pattern → Trigger 3.
   - Architectural decision with non-obvious rationale → Trigger 5.
4. Update `.forge/index.md` — add the feature entry under `## Features`.
5. Update `last_consolidation` in `.forge/context.md` to the current ISO date.

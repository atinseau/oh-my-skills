# Trigger 5 — Decision made

**Detect:** the agent considered 2+ concrete options and chose one with non-obvious rationale. Typical signals: "we could use X or Y, chose X because…", "picked approach A over B for …", "rejected the simpler path because …". Usually surfaces during feature work or architectural discussion.

**Action:**
1. Propose the save inline to the user: *"Save this decision? (one-line summary / skip)"*. A single clarifying line is enough — do NOT stall the task.
2. If user confirms (or says nothing and the decision is clearly non-trivial):
   - Read `.forge/knowledge/decisions.md` (if it exists) — apply semantic dedup.
   - APPEND a new entry using `skills/forge/templates/decision.md` (or UPDATE an existing related one). Target 15-30 lines.
3. Update `.forge/index.md` — `## Decisions` section.
4. Update `last_consolidation`.
5. If user says "skip", do NOT save. Record nothing — a rejected save is a signal the decision isn't actually memorable.

# Scenario Mode

Design test scenarios from the cartography. No browser needed — pure planning.

**Trigger:** "scenario [page or feature]"

## Algorithm

### 1. Load context

- Read `{discovery_root}/scenarios/_index.md`
- Read all `{discovery_root}/map/` files for the target area
- If no map exists → "This area hasn't been explored yet. Run explore first."

### 2. Identify gaps

- List all `[x]` (explored) interactions from map files that don't have a corresponding scenario — these are ready to plan
- List `[ ]` (unexplored) interactions — these are candidates but need exploration first (flag them as "needs explore" in the report)
- List all states from the map's States table
- Cross-reference with existing scenarios in `_index.md`
- Report: "X interactions have no scenario, Y states are untested"

### 3. Generate scenarios

- For each gap, write a scenario file (see Scenario File Format in SKILL.md)
- Priority rules:
  - `critical` — user can't complete their main task without this (create, save, delete)
  - `high` — important but has workarounds (edit, filter, sort)
  - `medium` — secondary features (undo/redo, keyboard shortcuts)
  - `low` — edge cases and cosmetic (empty states, error messages)

**Volume guard:** If more than 10 scenarios would be created, propose the top 5-7 by priority and ask the user before creating all of them.

### 4. Update index

- Add new scenarios to `_index.md` with status `discovered`
- Update coverage summary counts

### 5. Report to user

> "There are X scenarios ready to test. Which one should I start with?"

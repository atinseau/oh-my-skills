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

For each gap, create a scenario file at `{discovery_root}/scenarios/{name}.md` using the **Scenario File** format from SKILL.md.

**Field rules:**

- **Domain** is a key in the `test_dirs` config map. It determines which test directory the spec goes into. Infer the domain from the page's route (e.g., `/auth/login` → `auth`, `/dashboard/settings` → `dashboard`). If the route is ambiguous or does not map cleanly to a domain, ask the user.
- **Spec** is the test file name only — no path, no extension. The full path is resolved as: `test_dirs[domain] / spec + .spec.ts`. For example, if domain is `auth` and spec is `login-flow`, the test file lives at `test_dirs.auth/login-flow.spec.ts`.
- **Status** starts as `discovered` when first created.

**Priority rules:**

- `critical` — user can't complete their main task without this (create, save, delete)
- `high` — important but has workarounds (edit, filter, sort)
- `medium` — secondary features (undo/redo, keyboard shortcuts)
- `low` — edge cases and cosmetic (empty states, error messages)

**Volume guard:** If more than 10 scenarios would be created, propose the top 5-7 by priority and ask the user before creating all of them.

### 4. Update index

Add new scenarios to `{discovery_root}/scenarios/_index.md` using the **Scenario Index** format from SKILL.md. Scenarios are grouped by domain under `### [domain]` headings.

**Update rules:**

- If the domain section (`### [domain]`) does not exist yet, create it under `## Scenarios` with its own table.
- Add new scenarios as rows with status `discovered` and spec `--`.
- When a scenario gets a spec written later, replace `--` with the spec name.
- Update the `## Coverage` summary table with domain-level counts: total pages explored, total scenarios, how many have status `covered`, and the date of last exploration.

### 5. Report to user

> "There are X scenarios ready to test. Which one should I start with?"

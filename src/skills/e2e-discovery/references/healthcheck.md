# Healthcheck Mode

Analyze `.discovery/` against the current skill spec and fix incoherences.

**Trigger:** "healthcheck" or auto-triggered by setup when major incoherence detected.

## Algorithm

### 1. Load the spec

Read SKILL.md and all reference files to build understanding of:
- Expected directory structure (which dirs should exist, which should not)
- Expected config.yaml schema (which fields, which types)
- Expected map file format (which sections, which fields, which table columns)
- Expected scenario file format (which fields, which statuses)
- Expected index format (which sections, which grouping)

### 2. Scan .discovery/

Read every file and directory in {discovery_root}:
- config.yaml
- All files in map/
- All files in scenarios/ (including _index.md)
- Any other files or directories that exist

### 3. Compare and transform

For each file, compare its structure against the expected format. Fix silently.

**Config:**
- Unknown fields -> remove
- Missing required fields -> ask user or infer from project
- Fields with wrong type (e.g. test_dir string vs test_dirs map) -> transform

**Directories:**
- Directories that shouldn't exist (e.g. snapshots/) -> delete with contents
- Missing required directories (map/, scenarios/) -> create

**Map files:**
- Sections that shouldn't exist (e.g. ## Discovered Scenarios) -> remove
- Missing required fields -> add with sensible defaults
- Deprecated fields (e.g. Last validated) -> remove or rename
- Table columns that shouldn't exist (e.g. Snapshot) -> remove

**Scenario files:**
- Deprecated fields (e.g. Spec file:) -> transform to new format (Domain + Spec)
- Missing required fields -> infer or ask

**Index (_index.md):**
- Wrong grouping (page-grouped vs domain-grouped) -> rebuild from scenario files
- Stale/incorrect coverage counts -> recalculate from actual scenario statuses
- Dead links (scenarios that don't exist) -> remove
- Missing scenarios (exist on disk but not in index) -> add

### 4. Report

- Silent for all fixes applied
- Report only blocking issues that require user input
- Summary: "Healthcheck complete. X files fixed, Y issues require your input."

## Rules

1. No hardcoded transformation rules -- derive everything from the current spec
2. Read the spec fresh every time -- the skill may have evolved since last run
3. Prefer transformation over deletion when data can be preserved
4. Ask the user only when information cannot be inferred
5. If the .discovery/ directory doesn't exist at all, this is not a healthcheck issue -- let setup.md handle first-run creation

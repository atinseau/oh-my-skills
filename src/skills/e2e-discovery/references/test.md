# Test Mode

Generate Playwright test code from a scenario. Plays it live first to validate.

**Trigger:** "test [scenario name]"

## Algorithm

### 1. Load the scenario

- Read `{discovery_root}/scenarios/[name].md`
- Read the corresponding map file
- If scenario status is `covered` → "This scenario already has a test. Re-test?"

### 2. Validate preconditions

- Check that required mocks exist in `{mocks_dir}`
- If mocks are missing → list what's needed, **stop** until added

### 3. Play the scenario live

- `playwright-cli open [url]`
- Execute each step from the scenario
- After each step: `playwright-cli snapshot`
- Compare observed result with expected result
- If a step fails → update the scenario Notes, mark as `blocked`, tell the user

### 4. Write the test

- Check `{helpers_dir}` for existing helpers that match actions in the scenario
- If a helper exists → use it instead of writing the action inline
- If you write 3+ lines that could be reused by other tests → extract to a helper
- Create or update the `{spec_suffix}` file in `{test_dir}`
- Use selectors from snapshots: `getByRole`, `getByText`, `getByPlaceholder`
- Never use CSS selectors or snapshot refs in tests
- Each scenario step becomes one or more `expect()` assertions

### 5. Validate

- `playwright-cli close`
- Run `{test_command}`
- If green → mark scenario as `covered` in `_index.md`, record spec file path
- If red → re-open with `playwright-cli`, debug, fix, re-run

### 6. Update memory

- In the scenario file: check off each assertion that passed (`- [x]`), leave `- [ ]` for any that failed
- **If all assertions passed:**
  - Update scenario status to `covered` in both the scenario file header and `_index.md`
  - Update Coverage Summary counts in `_index.md`
  - Record the spec file path in both the scenario file header and `_index.md`
- **If the scenario was blocked (step 3 failure):**
  - Update scenario status to `blocked` in both the scenario file header and `_index.md`
  - Document the blocker in the scenario's Notes section
  - Do NOT update Coverage Summary counts (blocked ≠ covered)
- If new interactions were discovered during testing → update the map file

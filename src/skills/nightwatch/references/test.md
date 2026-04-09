# Test Mode

Generate Playwright test code from a scenario. Plays it live first to validate.

**Trigger:** "test [scenario name]"

## Algorithm

### 1. Load the scenario

- Read `{discovery_root}/scenarios/[name].md`
- Read the corresponding map file
- If scenario status is `covered` -> "This scenario already has a test. Re-test?"

### 2. Validate preconditions

- Check that required mocks exist in `{mocks_dir}`
- If mocks are missing -> list what's needed, **stop** until added

### 3. Play the scenario live

- `playwright-cli open [url]`
- Execute each step from the scenario
- After each step: `playwright-cli snapshot`
- Compare observed result with expected result
- If a step fails -> update the scenario Notes, mark as `blocked`, tell the user

### 4. Write the test

**Resolve the spec file path:**

1. Read the scenario's `**Domain:**` field to get the domain key
2. Look up `test_dirs[domain]` in `config.yaml` to get the target directory
3. Read the scenario's `**Spec:**` field to get the file name (no path, no extension)
4. Build the full path: `test_dirs[domain] / spec + .spec.ts`
   - Example: Domain=`auth`, Spec=`login-flow`, config has `test_dirs.auth: tests/e2e/auth` -> `tests/e2e/auth/login-flow.spec.ts`
5. If the domain does not exist in `test_dirs`, ask the user for the directory path and add the new entry to `config.yaml` under `test_dirs` before continuing

**Write the test file:**

- Check `{helpers_dir}` for existing helpers that match actions in the scenario
- If a helper exists -> use it instead of writing the action inline
- If you write 3+ lines that could be reused by other tests -> extract to a helper
- Create or update the spec file at the resolved path
- Use selectors from snapshots: `getByRole`, `getByText`, `getByPlaceholder`
- Never use CSS selectors or snapshot refs in tests
- Each scenario step becomes one or more `expect()` assertions

### 5. Validate

- `playwright-cli close`
- Run `{test_command}` targeting the resolved spec path
- If green -> mark scenario as `covered`, record the spec name (see step 6)
- If red -> re-open with `playwright-cli`, debug, fix, re-run

### 6. Update memory

**Scenario file:**

- Check off each assertion that passed (`- [x]`), leave `- [ ]` for any that failed
- Update the `**Spec:**` field with the spec name if it was not already set (name only, no path, no extension)

**If all assertions passed:**

1. Update scenario `**Status:**` to `covered` in the scenario file header
2. Update `_index.md`:
   - In the domain-grouped section (`### [domain]`), find the scenario row and set Status to `covered` and Spec to the spec name
   - Update the `## Coverage` table: recalculate the domain's `Covered` count by counting all `covered` scenarios under that domain

**If the scenario was blocked (step 3 failure):**

1. Update scenario `**Status:**` to `blocked` in the scenario file header
2. Document the blocker in the scenario's Notes section
3. Update `_index.md`:
   - In the domain-grouped section, find the scenario row and set Status to `blocked`
   - Do NOT update Coverage counts (blocked is not covered)

**If new interactions were discovered during testing:**

- Update the map file with the new interactions

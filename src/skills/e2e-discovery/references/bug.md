# Bug Mode -- Full Pipeline

Automated flow that handles the entire lifecycle: reproduce a bug, lock it with a failing test, trace the root cause, fix it, and validate. Adapts its entry point based on what already exists.

## Entry Points

The pipeline is the same, but you skip steps that are already done.

| User says | What exists | Start at |
|-----------|-------------|----------|
| "bug [description]" | Nothing | **Phase 1** -- Reproduce |
| "fix [scenario name]" | Scenario + failing test | **Phase 2** -- Understand & Fix |
| "this test is failing: [spec]" | Spec file (maybe scenario) | **Phase 2** -- Understand & Fix |
| "this test is failing" + test output | Test output pasted | **Phase 2** -- Understand & Fix |

**How to detect:** Read `{discovery_root}/scenarios/_index.md`. If the scenario exists and has status `tested` with a spec file, start at Phase 2. Otherwise start at Phase 1.

---

## Phase 1 -- Reproduce & Lock

Goal: go from a bug description to a failing regression test.

### 1. Search existing knowledge

- Read `{discovery_root}/scenarios/_index.md` and `{discovery_root}/map/` files
- Look for pages, zones, or interactions related to the bug description
- If a relevant map exists, skip to step 3
- If no relevant map, go to step 2

### 2. Targeted exploration

- Open the page most likely to contain the bug
- `playwright-cli snapshot --depth=3`
- Don't cartograph the whole page -- focus only on the area described in the bug
- Update or create the map file with the relevant zone only

### 3. Reproduce the bug

- Follow the steps described by the user
- Snapshot before and after each step
- Identify the exact step where the behavior diverges from expectations
- If the bug can't be reproduced, report what was observed and **stop**

### 4. Write the scenario

- Create a scenario file with status `discovered` and priority `critical`
- Steps are the exact reproduction path from step 3
- Assertions describe the **expected** behavior (what should happen when the bug is fixed)
- Add a Notes section documenting the **actual** behavior (the bug)

### 5. Generate the regression test

- Resolve the spec file path using domain-based lookup:
  1. Read the scenario's **Domain:** field
  2. Look up `test_dirs[domain]` from `config.yaml`
  3. Build the full path: `test_dirs[domain]` + scenario's **Spec:** name + `.spec.ts`
  4. If the domain is not in `test_dirs`, ask the user for the correct directory and add the entry to `config.yaml`
- Write the spec file with assertions for the **expected** (correct) behavior
- Run `{test_command}`
- If red, the test correctly catches the bug. Mark scenario as `tested`.
- If green, the bug isn't reproducible in the test harness. Report why and **stop**.

Continue to Phase 2 automatically.

---

## Phase 2 -- Understand & Fix

Goal: go from a failing test to a green suite.

### 1. Understand the bug

Load all available context -- don't touch code yet.

1. **Identify the source**
   - If entering from Phase 1, scenario and test are already loaded
   - If user gives a scenario name, read `{discovery_root}/scenarios/[name].md`
   - If user gives a spec file, read the spec, then find the linked scenario in `_index.md`
   - If user pastes test output, parse the failing assertion and locate the spec file using domain-based resolution: identify the domain from the test path or scenario, then look in `test_dirs[domain]`

2. **Read the test** -- identify what assertion fails and what it expects

3. **Read the map** -- understand the page structure, zones, and interactions involved

4. **Read the scenario** -- steps, assertions, Notes section (actual vs expected behavior)

5. **Re-snapshot the page live** -- use `playwright-cli open` and `playwright-cli snapshot` to understand the current UI structure. Do not read persisted snapshot files -- snapshots are ephemeral and not stored on disk. This gives you the real-time state of the UI as context for debugging.

6. **Summarize before proceeding**
   > "The bug: [one sentence]. The test expects [X] but the app does [Y]. The failing step is [step N]."

### 2. Classify the failure

Before tracing code, determine what kind of bug this is:

| Failure type | What to fix | How to tell |
|---|---|---|
| **App bug** | Fix the app code | The app visually does the wrong thing (verify with playwright-cli) |
| **Mock bug** | Fix mock data shape/values | The app works with real data but not mock data |
| **Harness bug** | Fix test harness (routes, providers) | Console shows 404/500 or provider errors |
| **Test bug** | Fix the test | The app behaves correctly visually but the test uses a wrong selector, stale text, or too-strict assertion |

**How to distinguish:** open the page with `playwright-cli open [url]`, replay the scenario steps, snapshot and compare with what the test asserts. If the UI is correct but the test fails, it is a test bug. If the UI is wrong, it is an app bug.

### 3. Trace the root cause

1. **Observe the bug live with playwright-cli**
   - Replay the scenario steps one by one
   - Snapshot before and after the failing step
   - `playwright-cli console error` -- capture JS errors
   - `playwright-cli network` -- check for failed API calls

2. **Search the codebase** (use in order, stop when you find it)

   a. **Text search** -- grep for the exact text from the test assertion
   b. **Component search** -- find the component from the map's zone/element table
   c. **Hook/store search** -- find the hook or store managing the relevant state
   d. **API search** -- check mock data in `{mocks_dir}`, compare with what the component expects

3. **Confirm the root cause**
   > "Root cause: [file:line] -- [explanation]"

   **When to stop and ask:** if you've tried all 4 search strategies without a lead, or the trail leads into a package you don't have context for. Don't guess.

### 4. Plan the fix

1. **Minimal fix** -- change the fewest lines possible. Don't refactor, don't add features.
2. **Check blast radius** -- will this affect other tests or features?
3. **Report the plan**
   > "Fix: [what to change] in [file]. This will [expected effect]."

### 5. Apply the fix

1. **Edit the file(s)** -- minimal change, follow existing code style
2. **Run unit tests** (if the fix touches app code) -- regression check
3. **Run `{test_command}`** -- the target test must pass, no other test must break
4. **If tests fail** -- re-read the error, adjust. If other tests broke, revert and rethink.

### 6. Close the loop

1. **Update the scenario** -- status to `covered` in both the scenario file and `_index.md`. Add a note: "Fixed in [commit hash] -- [brief description]"
2. **Update the index** using domain-grouped format. Add or update the scenario row under the correct `### [Domain]` heading. Update `## Coverage` table by domain:
   ```
   ## Coverage

   | Domain | Pages | Scenarios | Covered | Last explored |
   |--------|-------|-----------|---------|---------------|
   | auth   | 2     | 4         | 3       | 2026-04-08    |
   | editor | 3     | 8         | 5       | 2026-04-07    |
   ```
3. **Update the map** (if the fix changed the UI) -- update `{discovery_root}/map/`, set `Last explored` to today
4. **Report**
   > "Bug fixed. [spec file] now passes. [N] total E2E tests green. Scenario [name] marked as covered."

---

## Rules

1. **Read everything before touching code** -- understand the full context first
2. **Classify the failure before tracing** -- app, mock, harness, or test bug
3. **Minimal changes only** -- fix the bug, nothing else
4. **Run both unit and E2E tests** -- the fix must not introduce regressions
5. **If you can't find the root cause after all 4 search strategies, stop and ask** -- don't guess
6. **Update the discovery memory** -- close the loop so future sessions know the bug is fixed
7. **If the fix is in mock data, say so clearly** -- mock bugs aren't app bugs
8. **If the root cause is in a shared package (@culture-live/*)** -- don't modify it. Document the root cause precisely and report to the user.

## Troubleshooting

See also the Troubleshooting section in SKILL.md for UI-level issues (blank page, 404s, loading spinners).

### The test passes but the bug isn't actually fixed
The mock data might be hiding the real behavior. Check if the mock avoids the buggy code path.

### The fix breaks other E2E tests
1. The fix is too broad -- narrow with a more specific condition
2. Other tests depended on the buggy behavior -- update those tests
3. Other tests need different mock data -- use mock overrides

### The root cause is in the test harness
Fix the harness code, run all E2E tests, and update the scenario Notes to clarify this wasn't an app bug.

### Multiple bugs surface during the fix
Fix only the original bug. For new bugs: note in scenario Notes, add new scenarios with status `discovered`, update `_index.md`, and tell the user.

---
name: e2e-discovery
description: Use when writing E2E tests for a web app with Playwright, exploring UI to discover test scenarios, or debugging a failing E2E test. Especially useful when the test suite has gaps, the UI is complex, or you need to systematically cartograph pages before testing.
by: oh-my-skills
---

# E2E Discovery — Visual Testing with Persistent Memory

Discover tests by exploring the live UI with playwright-cli. Each session enriches a persistent knowledge base in `.discovery/` so the next session starts where the last one left off.

## Concept

Instead of writing tests from specs, you **discover** them by exploring the running app. playwright-cli snapshots give you the full accessibility tree of the page — every element, its role, its text, its state. You document what you find, identify scenarios, and generate tests.

The `.discovery/` directory is the persistent memory. It survives between conversations and prevents re-discovering what's already known.

## Session Bootstrap

**Read `references/setup.md` first.** It handles prerequisites (playwright-cli binary + skill) and config loading (first run detection, config.yaml creation or reading, coverage check). Skip if already done in this session.

## Modes

Five modes. Each has its own reference file with the detailed algorithm. **Read the reference file before starting the mode.**

| Mode | Trigger | Reference | Description |
|------|---------|-----------|-------------|
| **Explore** | "explore [page]" or default | `references/explore.md` | Cartograph a page: open, snapshot, document zones and interactions |
| **Scenario** | "scenario [page]" | `references/scenario.md` | Design test scenarios from the cartography. No browser needed. |
| **Test** | "test [scenario]" | `references/test.md` | Generate Playwright test from a scenario. Plays live first. |
| **Bug** | "bug [description]", "fix [scenario]", "this test is failing" | `references/bug.md` | Full pipeline: reproduce, scenario, test, trace, fix, green |
| **Healthcheck** | "healthcheck" or auto-triggered by setup | `references/healthcheck.md` | Analyze `.discovery/` against skill spec, fix incoherences |

### Mode Flow

The manual modes are sequential — the user controls transitions. Bug mode is the exception: it runs the full pipeline automatically. Healthcheck can be invoked at any time, before any mode, to ensure `.discovery/` is coherent with the current skill spec.

```
healthcheck ──(run before any mode if incoherence detected)──┐
                                                              v
explore → scenario → test
   ^                    |
   └────────────────────┘
     (re-explore when test reveals new interactions)

bug → explore (targeted) → scenario → failing test → trace → fix → green
      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      automated — no user input between steps

fix [scenario] ──────────────────────→ trace → fix → green
this test is failing ────────────────→ trace → fix → green
      (skip to Phase 2 when test/scenario already exist)
```

**Explore → Scenario:** After exploring, tell the user how many scenarios were identified and offer to flesh them out.

**Scenario → Test:** After writing scenarios, tell the user how many are ready and offer to start testing.

**Test → Explore (feedback loop):** If testing reveals interactions not in the map (error toasts, confirmation modals, edge cases), update the map before continuing. Tell the user what was discovered.

## Memory Structure

```
{discovery_root}/
├── config.yaml
├── map/
│   ├── [page-name].md
│   └── [page-name]--[zone].md
└── scenarios/
    ├── _index.md
    └── [scenario-name].md
```

## File Formats

### Map File

```markdown
# [Page Name]

**URL:** /path/to/page
**Last explored:** YYYY-MM-DD

## Layout

One sentence describing the page structure.

## Zones

### [Zone Name]

| Element | Role | Text/Label | Notes |
|---------|------|-----------|-------|
| Back button | button | "←" | Navigates to list |
| Title | heading | "Workflow Name" | Editable inline |
| Save | button | "Sauvegarder" | Disabled when no changes |

## States

| State | Trigger | Key changes |
|-------|---------|-------------|
| default | page load | — |
| editing | modify any field | title shows "non sauvegarde" |

## Interactions

Checkboxes track what has been explored (not tested — that's in scenarios).

- [x] Click "Noeuds" tab → palette visible with node categories
- [ ] Drag node from palette → node appears on canvas (needs mock)
```

### Scenario File

```markdown
# Scenario: [Human-readable name]

**Status:** discovered | playing | tested | covered | blocked
**Priority:** critical | high | medium | low
**Page:** [page-name]
**Domain:** auth
**Spec:** login-flow

## Preconditions

- URL: /path/to/start
- Required mocks: list any specific mock data needed
- Initial state: what the page should look like before starting

## Steps

1. Action description
   - **Do:** playwright-cli command or user action
   - **Expect:** what should change

## Assertions

- [ ] assertion

## Notes

Observations, edge cases, blockers found during testing.
```

**Stale flag:** `stale` is not a progression state. It is a flag set by the coherence cycle when a page's map changes after a scenario was last validated. A `covered (stale)` scenario still counts in coverage. Only the coherence cycle sets this flag — it is resolved by re-exploring the page.

### Scenario Index

```markdown
# Discovery Index

## Coverage

| Domain | Pages | Scenarios | Covered | Last explored |
|--------|-------|-----------|---------|---------------|

## Stale

| Scenario | Reason |
|----------|--------|

## Blocked

| Lead | Blocker | Source |
|------|---------|--------|

## Scenarios

### [domain]

| Scenario | Page | Status | Priority | Spec |
|----------|------|--------|----------|------|
| [name](./name.md) | page-name | discovered | critical | -- |
```

## Rules

### Boundaries

**The skill operates strictly through the UI. It must NEVER modify application source code to make testing easier.**

**Exception — Bug mode Phase 2:** When fixing a confirmed bug, the skill modifies application source code to fix the bug itself. This is distinct from modifying code for test convenience. The fix must be minimal and address a real defect, not work around a testing limitation.

Forbidden:
1. **No exposing internals** — never add `data-testid`, `window.__store`, `window.__api`, or any attribute/global to source code for test purposes
2. **No test-only code paths** — never add `if (process.env.TEST)` or similar conditional logic in the app
3. **No store/state exposure** — never expose Zustand stores, Redux stores, React context, or any internal state to `window` or global scope
4. **No API backdoors** — never create test-only API endpoints, bypass authentication, or weaken security for test convenience
5. **No component modifications** — never modify component props, add optional parameters, or change component interfaces to support testing
6. **No import rewiring** — never change module exports or add re-exports to make internals accessible to tests

Allowed:
1. **Mock data files** — create and edit files in `{mocks_dir}`
2. **Test harness configuration** — modify test-specific infrastructure (Playwright config, test fixtures, MSW handlers, mock server plugins)
3. **Test helpers** — create shared utilities in `{helpers_dir}`
4. **Spec files** — create and edit test files in the directory resolved from `test_dirs` for the scenario's domain
5. **Discovery memory** — write to `{discovery_root}` freely

**Why:** Tests must validate what a real user experiences. If a test requires source code changes, the app's public interface is insufficient — that's a design issue to report, not to work around.

**If you hit a wall:** document the blocker in `## Blocked` with what would need to change. The user decides whether to modify the source code — the skill never does.

### Browser
1. **All browser interaction MUST use `playwright-cli`** — see the `playwright-cli` skill for the full command reference. Never use Playwright codegen, direct scripts, or other browser tools.

### Exploration
1. **Always read existing maps first** — never re-explore what's documented
2. **Snapshot before and after every interaction** — source of truth
3. **One map file per distinct view** — panels with significant content get their own file
4. **Document what you SEE, not what you think** — no assumptions about behavior
5. **Use the table format** — every element gets a row with role, text, and notes

### Scenarios
1. **One scenario = one user intent** — "create a workflow" not "click 15 buttons"
2. **Ordered by user impact** — critical path first
3. **Each scenario lists its mock requirements** — so test generation knows what data is needed
4. **Reference map elements** — use the same names from the map tables

### Tests
1. **Always play the scenario with playwright-cli before writing** — verify it works
2. **Use role-based selectors** — `getByRole`, `getByText`, `getByPlaceholder`
3. **Never use CSS selectors or snapshot refs in test code** — they're fragile
4. **Test what the user sees** — not implementation details
5. **Run the test command before marking as covered** — green tests only

### Memory
1. **Never delete map files** — they are cumulative
2. **Update maps when the UI changes** — mark outdated sections
3. **Keep scenario status accurate** — if a test breaks, mark it back to `tested`

## Troubleshooting

### Page is blank or white screen
1. `playwright-cli console error` — check for JS errors
2. If "Cannot read properties of undefined" → missing mock or provider
3. If no errors but blank → check URL (must include required route params)
4. `playwright-cli network` — check for failed requests

### Console shows 404 or 500 errors
A mock route is missing or broken:
1. `playwright-cli network` — identify which URL failed
2. Check the mock API layer (server plugin, route handlers, or data files)
3. Add or fix the route, then `playwright-cli reload` and re-snapshot

### Snapshot shows loading spinner
The page hasn't finished loading:
1. Wait 2 seconds, `playwright-cli snapshot` again
2. If still loading → the mock data doesn't match what the component expects

### An interaction doesn't produce the expected result
1. Snapshot before and after to see exactly what changed
2. Check if the element ref is still valid (page may have re-rendered after a prior action)
3. If the UI changed since the map was written → update the map

### A scenario needs different mock data
Don't modify the shared mock data files. Instead:
1. Note in the scenario that it requires custom mock data
2. When writing the test, use the project's mock override mechanism

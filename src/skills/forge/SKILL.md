---
name: forge
description: Virtuous development cycle for any project. Language-agnostic core with composable profiles, deep memory, and self-built QA strategy. Use on any development task.
by: oh-my-skills
---

# Forge

Virtuous development cycle: **LOAD → ACT → BUILD → TEST → QA → JUDGE → MEMORIZE**.

Every task goes through this loop. The loop self-regulates — a simple fix does 1 iteration, a complex feature does 5. **Max 5 iterations** before documenting the blocker.

**Paths**: References at `skills/forge/references/`. Templates at `skills/forge/templates/`. Profiles at `skills/forge/profiles/`.

## Step 0 — Bootstrap

Check if `.forge/index.md` exists in the project root.

- **No** → Read `references/project-bootstrap.md` and execute it. This initializes `.forge/` by detecting active profiles, resolving build/test commands, and scanning the codebase. Then proceed to Step 1.
- **Yes** → Proceed to Step 1.

## Step 1 — LOAD

Read `references/memory-system.md` for rules.

1. Read `.forge/index.md`.
2. From the user's task, match keywords against `architecture/modules.md` (primary), `knowledge/pitfalls.md` (bug keywords), and `bugs/` entries (known issues).
3. Read only the relevant memory files.
4. Read the source of the identified modules.
5. Read the most recent session log for continuity.

**Never read the entire codebase.** The index is the entry point.

## Step 2 — ACT

Read `references/tdd.md` — test first, always.
Read `references/architecture-guard.md` — generic checks applied on every modified file.
Read every active profile's `profile.md` (profiles are listed in `.forge/config.md` frontmatter).

Branch on task nature:

- **Bug** → also read `references/investigation.md` and follow the 6-step process.
- **Performance** → write a timed test first (see perf pattern in `tdd.md`).
- **Adding tests to existing code** → the TDD red-first rule does NOT apply. Write tests expected to pass; a failure means you found a bug, switch to investigation.
- **Dependency update** → after editing the manifest, re-resolve config and update `.forge/knowledge/dependencies.md` at MEMORIZE.

For every task:
1. Write or update the test first.
2. Implement in the identified module only.
3. Run architecture-guard checks on every modified file.

## Step 3 — BUILD

Execute the `build_cmd` from `.forge/config.md` frontmatter:

```bash
<build_cmd> 2>&1
```

For large projects, bump the Bash tool timeout to 300000 (5 min).

- **0 errors** → Step 4.
- **Errors** → back to Step 2 with the error messages.

## Step 4 — TEST

Execute the `test_cmd` from `.forge/config.md` frontmatter:

```bash
<test_cmd> 2>&1
```

- **All pass** → Step 5.
- **Failures** → back to Step 2 with: which test failed, the assertion message, and the relevant code.

## Step 5 — QA

**This step is never skipped.**

- If `.forge/qa/index.md` does NOT exist:
  - Read `references/qa-runner.md`.
  - **Invest time**: analyze the app, probe host tools, design a strategy (visual, programmatic, metric, or mixed).
  - Create `.forge/qa/index.md` and any custom scripts/fixtures the strategy needs inside `.forge/qa/`.
  - **Building the QA strategy on the first pass is NOT counted as an iteration failure.** It is setup work. Iterations count only from JUDGE failures onward.
- If `.forge/qa/index.md` exists:
  - Follow the strategy.
  - If insufficient for the current task, **extend** `qa/index.md` and the tooling. Never bypass.

## Step 6 — JUDGE

Evaluate three criteria:

| Criterion | Source | Pass |
|---|---|---|
| Build | Step 3 output | 0 errors |
| Tests | Step 4 output | 100% pass |
| QA | `.forge/qa/index.md` criterion per flow | objective pass |

- **All pass** → Step 7.
- **Any fail** → back to Step 2 with full context (which criterion, what error, relevant artefacts).
- **5th failure** → stop. Document the blocker in `.forge/bugs/BUG-<NNN>.md` and inform the user.

## Step 7 — MEMORIZE (mandatory)

Read `references/memory-system.md`. The cycle does not end without saving.

1. Update `.forge/architecture/modules.md` if modules changed.
2. Create or update `.forge/features/<name>.md` or `.forge/bugs/BUG-<NNN>.md`.
3. Update `.forge/knowledge/dependencies.md` if dependencies changed.
4. Update `.forge/qa/index.md` if the QA strategy evolved.
5. Append to `.forge/sessions/<date>-<topic>.md`.
6. Regenerate `.forge/index.md` from the current content.

Use templates from `skills/forge/templates/` when creating new memory files.

## Code guidelines (always active)

### Architecture
1. Max 300 lines per file.
2. One file = one responsibility.
3. Dependency injection via constructor/parameter — no hidden singleton.
4. No god object (rough threshold: ~8 properties, ~10 public methods).
5. Module boundaries are explicit (interfaces, protocols, traits, types).

### Process
6. TDD: test first, always (exception: adding tests to existing code).
7. Errors visible, never silent.
8. No empty `catch`, no error suppression without a written justification.
9. No hardcoded values for configurable things (magic numbers, URLs, timeouts).

### Tests
10. One test = one behaviour.
11. Mocks via interfaces/protocols — no monkey-patching.
12. Integration tests for pipelines and real I/O.

### Memory (framework constraint)
13. Never scan the full codebase — `.forge/index.md` is the entry point.
14. Save to `.forge/` after every successful cycle (MEMORIZE is never optional).
15. Regenerate `.forge/index.md` at every MEMORIZE.

### QA (framework constraint)
16. QA is never skipped — every cycle hits Step 5.
17. QA strategy belongs to the project (`.forge/qa/`), not to the profile.
18. One objective pass/fail criterion per flow.

### Iterations (framework constraint)
19. Max 5 iterations before stopping and documenting the blocker.
20. Every iteration produces new information. If two consecutive iterations fail on the same thing, change approach.

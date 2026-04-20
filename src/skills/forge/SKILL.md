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
4. Read the source of the identified modules. If a matched module entry is marked `seeded: true`, first run lazy enrichment — see `references/memory-system.md` → "Lazy module discovery". Enrich the entry, regenerate `index.md`, then proceed with reading the module source. (Mid-cycle `index.md` regeneration is allowed here specifically for lazy enrichment; regeneration remains mandatory at MEMORIZE — see Step 7.)
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

Read the `test_cmd` from `.forge/config.md` frontmatter.

### Case A — `test_cmd` is non-empty

```bash
<test_cmd> 2>&1
```

- **All pass** → Step 5.
- **Failures** → back to Step 2 with: which test failed, the assertion message, and the relevant code.

### Case B — `test_cmd` is empty (or absent)

The project has no test suite configured. This is a valid project state, not a failure.

- Proceed to Step 5.
- JUDGE (Step 6) will treat the Tests criterion as `N/A` for this cycle.
- If `.forge/knowledge/pitfalls.md` does NOT already contain a `no-test-suite` pitfall, add one at MEMORIZE explaining that TDD discipline cannot fully apply until a test framework is in place. Do NOT propose installing a framework autonomously — record the observation and continue.

### Case C — `test_cmd` runs but reports "no tests found" with exit code 0

Some runners (`jest --passWithNoTests`, `cargo test` on a crate with no tests) exit 0. Step 4 proceeds normally — this is equivalent to Case A "All pass".

### Case D — `test_cmd` runs but reports "no tests found" with exit code != 0

Distinguish this from a real failure by the run's stderr/stdout. Common "no tests" phrases across runners: `no tests found`, `no test target`, `test suite is empty`, `No test files found` (vitest), `[no test files]` (go), `no tests ran` (pytest), `no tests to run` (cargo). If the output matches one of these AND no assertion failure is present AND no panic/exception trace is present, treat as Case B. **When in doubt, prefer Case A (treat as failure)** — a masked real failure is strictly worse than a misclassified empty test suite.

## Step 5 — QA

**This step is never skipped.**

- If `.forge/qa/index.md` does NOT exist:
  - Read `references/qa-runner.md`.
  - **First-pass rule:** the minimum-viable strategy is available ONLY when `.forge/sessions/` contains zero entries with `result: pass` (i.e., no cycle has ever completed MEMORIZE in this project). Count the session files programmatically; do not infer from the absence of `qa/index.md` alone — deleting `qa/index.md` does not re-enable the concession.
  - When eligible: produce one primary flow with a concrete pass/fail criterion, and explicit `TODO (next cycle)` markers for the remaining discipline questions. See `qa-runner.md` → "Minimum viable first pass".
  - When ineligible (any session with `result: pass` exists): invest the time and answer all 7 discipline questions before proceeding.
  - Create `.forge/qa/index.md` and any custom scripts/fixtures the chosen flow needs inside `.forge/qa/`.
  - **Building the QA strategy is NOT counted as an iteration failure.** It is setup work. Iterations count only from JUDGE failures onward.
- If `.forge/qa/index.md` exists:
  - Follow the strategy.
  - If `TODO (next cycle)` markers remain and this is NOT the cycle immediately following the minimum-viable pass, JUDGE will fail — resolve them first.
  - If the strategy is insufficient for the current task, **extend** `qa/index.md` and the tooling. Never bypass.

## Step 6 — JUDGE

Evaluate three criteria:

| Criterion | Source | Pass |
|---|---|---|
| Build | Step 3 output | 0 errors |
| Tests | Step 4 output | 100% pass, OR `N/A` when the project has no test suite (Step 4 Case B / C with no failures) |
| QA | `.forge/qa/index.md` criterion per flow, **no unresolved `TODO (next cycle)` markers from a prior cycle** | objective pass |

- **All pass** → Step 7.
- **Any fail** → back to Step 2 with full context (which criterion, what error, relevant artefacts).
- **5th failure** → stop. Document the blocker in `.forge/bugs/BUG-<NNN>.md` and inform the user.
- `strategy: minimum-viable` is valid for exactly one cycle. If `qa/index.md` still carries `strategy: minimum-viable` OR any `TODO (next cycle)` marker when the current session differs from the session that created it, that is a QA failure — return to Step 5, resolve every TODO, and remove the `strategy: minimum-viable` marker before continuing. Rewriting the markers to restart the clock is explicitly forbidden.
- When Tests is `N/A`, JUDGE still requires Build and QA to pass. A cycle with `N/A` tests is valid; it is not a degraded pass.

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

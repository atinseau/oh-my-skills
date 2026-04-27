# Forge UX Fixes (v1.0.1)

> **For agentic workers:** Use superpowers:subagent-driven-development to execute this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Address the 3 UX issues identified during the post-implementation dry-run of v1 forge: (C1) the first-cycle QA tax, (C2) heavyweight bootstrap on large projects, (I2) empty `test_cmd` treated as a failure loop.

**Architecture:** Pure markdown changes to `src/skills/forge/`. No new files. Three targeted edits in SKILL.md + two references (`project-bootstrap.md`, `qa-runner.md`, `memory-system.md`). Principle preserved: the framework prescribes discipline, not tooling — the fixes relax the *tempo* of the discipline, never its substance.

**Branch:** Continue on `feat/forge` (ahead of master by 14 commits, not yet merged).

**Dry-run analysis:** See conversation history — the scenarios exercised were "add login page to fresh Next.js scaffold" (C1 dominant, I2 dominant) and "fix crash on session expiry in 500-file Swift app" (C2 dominant).

---

## Task 1: C1 — QA progressive (minimum viable first pass)

**Problem:** `qa-runner.md` requires the agent to answer all 7 discipline questions and build supporting tooling on the first QA pass. Combined with MEMORIZE enforcement ("`qa/index.md` must exist for JUDGE to pass"), the first cycle on a greenfield project can spend 10-20 tool calls on QA infrastructure before the user sees any product code. The mitigation already in place ("QA strategy build isn't an iteration failure") addresses the iteration-budget risk but not the user-experience risk.

**Fix philosophy:** Relax the *tempo* of QA construction, never its depth. The first pass MAY produce a minimum-viable `qa/index.md` covering ONE primary flow end-to-end. The remaining six discipline questions become explicit TODOs inside `qa/index.md` that the next cycle MUST address (not MAY — MUST, or JUDGE fails).

### Files

- Modify: `src/skills/forge/references/qa-runner.md`
- Modify: `src/skills/forge/SKILL.md` (Step 5 section only)

### Steps

- [ ] **1.1 Add "Minimum viable first pass" section to qa-runner.md**

Insert a new `## Minimum viable first pass` section AFTER `## When to build the QA strategy` and BEFORE `## Required discipline`. Content:

```markdown
## Minimum viable first pass

The first Step 5 pass on a brand-new project does not have to produce the complete strategy in one shot. A **minimum-viable** `qa/index.md` is acceptable on the first pass if and only if:

1. Question 1 (app nature) is answered concretely.
2. Exactly ONE primary flow is defined with a concrete pass/fail criterion.
3. The tooling to execute that one flow is present in `.forge/qa/` and has been run successfully at least once.
4. The remaining six discipline questions (user journey, host-tools inventory, strategy justification, tooling map, per-flow criteria, extensibility plan) are present as **explicit `TODO (next cycle)` markers** in the file.

This concession exists so the user's first task is not held hostage to QA infrastructure design. It is not a permanent skip — the next cycle's Step 5 MUST resolve every TODO marker. If it does not, JUDGE (Step 6) fails.

**What it is not:** the minimum-viable pass is not "write a one-liner and move on". The one defined flow is real, tested, and persisted. The deferred items are scheduled, not skipped.

Example minimum-viable `qa/index.md` on the first cycle for a Next.js login page:

```markdown
---
strategy: minimum-viable
created: <ISO date>
---

## App nature
Web UI — Next.js 15 App Router with server actions.

## Primary flow: login-happy-path
- User navigates to /login
- Enters a known-good email+password
- Clicks Submit
- Lands on /dashboard within 3s

Script: `.forge/qa/scripts/login-happy-path.spec.ts` (Playwright).
Pass criterion: `page.url() === "<host>/dashboard"` AND `page.getByText("Welcome").isVisible()`.

## TODO (next cycle)
- Question 2 — full user journey (beyond login)
- Question 3 — host tools inventory (probe output recorded)
- Question 4 — strategy justification (visual vs programmatic vs mixed)
- Question 5 — tooling map (additional scripts for edit/delete/logout flows)
- Question 6 — per-flow pass criteria for each additional flow
- Question 7 — extensibility plan

The next cycle MUST address every TODO above. JUDGE will fail otherwise.
```
```

Rules:
- Keep the `## Required discipline` section unchanged — it remains the full target.
- The new section is a **one-time concession** explicitly scoped to the first pass.
- Explicitly state that subsequent cycles cannot reuse the minimum-viable concession.

- [ ] **1.2 Update qa-runner.md anti-patterns**

In the existing `## Anti-patterns` section, add TWO new bullets:

```markdown
- Using the minimum-viable concession on anything other than the very first pass. The concession is a one-time starter, not an ongoing pattern.
- Leaving `TODO (next cycle)` markers in `qa/index.md` past the next cycle. Unresolved TODOs from a prior cycle are a JUDGE failure.
```

- [ ] **1.3 Update SKILL.md Step 5**

Replace the current Step 5 body with:

```markdown
## Step 5 — QA

**This step is never skipped.**

- If `.forge/qa/index.md` does NOT exist:
  - Read `references/qa-runner.md`.
  - **First-pass rule:** on the *very first* cycle after bootstrap, a minimum-viable strategy is acceptable — one primary flow, one pass/fail criterion, explicit `TODO (next cycle)` markers for the remaining discipline questions. See `qa-runner.md` → "Minimum viable first pass".
  - Otherwise (not the first cycle): invest the time and answer all 7 discipline questions before proceeding.
  - Create `.forge/qa/index.md` and any custom scripts/fixtures the chosen flow needs inside `.forge/qa/`.
  - **Building the QA strategy is NOT counted as an iteration failure.** It is setup work. Iterations count only from JUDGE failures onward.
- If `.forge/qa/index.md` exists:
  - Follow the strategy.
  - If `TODO (next cycle)` markers remain and this is NOT the cycle immediately following the minimum-viable pass, JUDGE will fail — resolve them first.
  - If the strategy is insufficient for the current task, **extend** `qa/index.md` and the tooling. Never bypass.
```

- [ ] **1.4 Update SKILL.md Step 6 JUDGE**

Add to the Step 6 table row for QA, and add a new bullet after the 5th-failure rule:

```markdown
| QA | `.forge/qa/index.md` criterion per flow, **no unresolved `TODO (next cycle)` markers from a prior cycle** | objective pass |
```

And add this bullet:

```markdown
- If `qa/index.md` is marked `strategy: minimum-viable` from the *prior* cycle and still has `TODO (next cycle)` markers, that is a QA failure — return to Step 5 to complete the strategy before continuing the current task.
```

- [ ] **1.5 Manual validation**

```bash
bun check-types
bun biome check src/skills/forge/references/qa-runner.md src/skills/forge/SKILL.md --no-errors-on-unmatched
grep -c 'minimum-viable\|Minimum viable\|minimum viable' src/skills/forge/references/qa-runner.md   # expect >= 4 occurrences
grep -c 'minimum-viable\|Minimum viable\|minimum viable' src/skills/forge/SKILL.md                  # expect >= 2 occurrences
grep 'TODO (next cycle)' src/skills/forge/references/qa-runner.md                                   # expect present
```

- [ ] **1.6 Commit**

```bash
git add src/skills/forge/references/qa-runner.md src/skills/forge/SKILL.md
git commit --no-verify -m "feat(forge): add QA progressive mode for first-cycle bootstrap"
```

---

## Task 2: C2 — Bootstrap lazy (Phase 4 minimal seed + lazy discovery at LOAD)

**Problem:** On a large existing project (500+ files), `project-bootstrap.md` Phase 4 asks the agent to identify every module, infer its role, collect keywords, and write `architecture/modules.md` up front. The instruction "read a handful of files per module to infer role" breaks down at scale — the agent can spend 50+ file reads before the user's task begins, contradicting the very memory pattern forge is built on.

**Fix philosophy:** Bootstrap seeds a *minimal* architecture map — module names and paths, no role inference, no keyword harvesting. Detailed module entries are added **lazily** during LOAD (Step 1), only when the user's task touches a zone that has no entry yet.

### Files

- Modify: `src/skills/forge/references/project-bootstrap.md` (Phase 4 section)
- Modify: `src/skills/forge/references/memory-system.md` (LOAD phase section)
- Modify: `src/skills/forge/SKILL.md` (Step 1 LOAD)

### Steps

- [ ] **2.1 Rewrite project-bootstrap.md Phase 4**

Replace the entire `## Phase 4 — Architectural scan` section with:

```markdown
## Phase 4 — Architectural seed (minimal)

Bootstrap does NOT try to understand every module up front. It writes a **seed** — a list of candidate modules with just `name` and `path`. Role inference, keywords, and key-file lists are filled in lazily, during the first LOAD step that touches the module (see `references/memory-system.md` → "Lazy module discovery").

### Seed procedure

1. Check the candidate roots (first hit wins, do not merge):
   `src/`, `app/`, `lib/`, `Sources/`, `pkg/`, `cmd/`, `internal/`, `packages/*/src/`

2. In the chosen root, list **immediate subdirectories only**. Each subdirectory becomes a seed module. If the root is flat (no subdirectories, just files), the root itself is one seed module.

3. For each seed module, collect:
   - `name` — subdirectory name (or root name if flat)
   - `path` — relative path from project root
   - `seeded: true` — frontmatter marker indicating the entry is a seed, not a full description

   Do NOT read any file content. Do NOT infer roles or keywords at this stage.

4. Cap: if more than **12 seed modules** are produced, keep the first 12 by lexical order and add one `other` entry at the bottom:
   ```markdown
   ## other
   path: (multiple)
   seeded: true
   note: Remaining N modules to be discovered lazily at LOAD. See `references/memory-system.md`.
   ```

5. Write `.forge/architecture/modules.md` using the seed format — a flat list of `## <name>` blocks, each with `path:`, `seeded: true`, and nothing else.

### Rationale

On a 500-file project, the seed pass produces a ~30-line `modules.md` in < 5 tool calls. Full module entries are built only when the user's task demands them. This preserves the memory-over-scan principle at the scale where it matters most.
```

- [ ] **2.2 Add "Lazy module discovery" section to memory-system.md**

Insert this section AFTER the existing `## LOAD Phase` section and BEFORE the next section:

```markdown
## Lazy Module Discovery

Bootstrap writes seed entries in `architecture/modules.md` — just `name` + `path` + `seeded: true`. The LOAD step enriches these entries on demand.

### When to enrich

During LOAD step 2 (keyword matching), if the user's task references a module that exists only as a seed:

1. Read the module's `path` listed in the seed entry.
2. List the files in that directory (one level deep).
3. Read 2-3 representative files to infer the role (the public entry point, the largest file, or files named like `index.*`, `main.*`, `mod.rs`, `lib.rs`).
4. Extract 3-6 keywords from filenames + top-level symbols + any local README.
5. Rewrite the module's entry in `architecture/modules.md` — drop `seeded: true`, add `role:`, `key_files:`, `keywords:`.
6. Regenerate `.forge/index.md` so the index reflects the enriched entry.

### When to skip enrichment

If LOAD's keyword match already resolves to a module whose entry is NOT seeded (it was enriched in a prior cycle), no work is needed — use the existing entry.

### When to create new modules

If the user's task references a directory that is NOT in `modules.md` at all (even as a seed — e.g. the `other` bucket), create the entry from scratch using the same 5-step enrichment procedure. Add it under the correct root.

### Budget

Enrichment reads are bounded: at most 5 files per module on first enrichment. If more is needed to understand the module, that is a signal the module is too large and may warrant a split (architecture-guard rule #1).
```

- [ ] **2.3 Update SKILL.md Step 1 LOAD**

Replace step 4 of the current LOAD numbered list and add a reference. Current step 4 reads: `4. Read the source of the identified modules.`

New step 4 + additional instruction:

```markdown
4. Read the source of the identified modules. If a matched module entry is marked `seeded: true`, first run lazy enrichment — see `references/memory-system.md` → "Lazy module discovery". Enrich the entry, regenerate `index.md`, then proceed with reading the module source.
```

- [ ] **2.4 Update memory-system.md directory-tree legend**

In `## Directory Structure`, update the comment for `modules.md`:

```markdown
│   └── modules.md                    # Module map — seeded at bootstrap, enriched lazily at LOAD
```

- [ ] **2.5 Manual validation**

```bash
bun check-types
bun biome check src/skills/forge/references/project-bootstrap.md src/skills/forge/references/memory-system.md src/skills/forge/SKILL.md --no-errors-on-unmatched

grep -c 'seeded: true\|seeded:\|Lazy module discovery\|minimum seed\|Architectural seed' \
  src/skills/forge/references/project-bootstrap.md src/skills/forge/references/memory-system.md src/skills/forge/SKILL.md
# Expect: multiple hits across all three files

grep 'Phase 4 — Architectural seed' src/skills/forge/references/project-bootstrap.md
# Expect: found

grep 'Lazy module discovery' src/skills/forge/references/memory-system.md
# Expect: found
```

- [ ] **2.6 Commit**

```bash
git add src/skills/forge/references/project-bootstrap.md src/skills/forge/references/memory-system.md src/skills/forge/SKILL.md
git commit --no-verify -m "feat(forge): bootstrap writes minimal module seed; enrich lazily at LOAD"
```

---

## Task 3: I2 — Empty `test_cmd` handling

**Problem:** A fresh Next.js scaffold (or a Python project with no `pytest` configured, or an early-stage Rust crate) often has no test suite. `test_cmd` either stays empty after bootstrap generic-mode, or contains a command that returns non-zero because no tests exist. Step 4 treats non-zero as a test failure and loops at Step 2 asking to fix tests that don't exist. This is a real dead-end the user will hit on day one.

**Fix philosophy:** "No tests configured" is a **project state**, not a **failure**. Step 4 detects it, records it once in pitfalls, treats Tests as `N/A` in JUDGE, and moves on. The agent may suggest adding a test framework, but does not loop on it.

### Files

- Modify: `src/skills/forge/SKILL.md` (Step 4 + Step 6 JUDGE)
- Modify: `src/skills/forge/references/project-bootstrap.md` (Phase 5 `config.md` frontmatter)
- Modify: `src/skills/forge/references/memory-system.md` (add pitfalls note)

### Steps

- [ ] **3.1 Update SKILL.md Step 4**

Replace the current Step 4 body with:

```markdown
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

Distinguish this from a real failure by the run's stderr/stdout. If the output matches patterns like `no tests found`, `no test target`, or `test suite is empty` AND no assertion failure is present, treat as Case B (empty test suite). Otherwise treat as Case A failures.
```

- [ ] **3.2 Update SKILL.md Step 6 JUDGE**

Update the Tests row and add a note:

```markdown
| Tests | Step 4 output | 100% pass, OR `N/A` when the project has no test suite (Step 4 Case B / C with no failures) |
```

Add after the existing 5th-failure bullet:

```markdown
- When Tests is `N/A`, JUDGE still requires Build and QA to pass. A cycle with `N/A` tests is valid; it is not a degraded pass.
```

- [ ] **3.3 Update project-bootstrap.md Phase 5 `config.md` example**

In Phase 5 `### \`.forge/config.md\``, update the frontmatter example to document that `test_cmd` may be empty:

Replace:
```yaml
build_cmd: <resolved command or "">
test_cmd: <resolved command or "">
lint_cmd: <resolved command or "">
```

With:
```yaml
build_cmd: <resolved command — must be present>
test_cmd: <resolved command or empty string>   # Empty is valid: project has no test suite yet.
lint_cmd: <resolved command or empty string>
```

And add under "## Decisions" guidance in the same section:

```markdown
When inferring commands in generic mode (0 matches) and no test or lint command can be inferred, do not guess. Leave the field empty and record under `## Decisions` that no test/lint infrastructure was detected. Step 4 handles an empty `test_cmd` cleanly (see SKILL.md Step 4 Case B).
```

- [ ] **3.4 Update memory-system.md pitfall guidance**

In `## File Format Rules`, add one bullet after the existing cumulative rule:

```markdown
8. **Infrastructure pitfalls are recorded once** — e.g. `no-test-suite` is added to `knowledge/pitfalls.md` the first time Step 4 hits Case B, then never duplicated. Subsequent cycles with no tests reference the existing pitfall rather than adding a new entry.
```

- [ ] **3.5 Manual validation**

```bash
bun check-types
bun biome check src/skills/forge/SKILL.md src/skills/forge/references/project-bootstrap.md src/skills/forge/references/memory-system.md --no-errors-on-unmatched

grep -c 'Case A\|Case B\|Case C\|Case D' src/skills/forge/SKILL.md
# Expect: >= 4

grep 'no test suite\|no-test-suite\|Tests is `N/A`' src/skills/forge/SKILL.md
# Expect: found

grep -A 2 'test_cmd' src/skills/forge/references/project-bootstrap.md | grep -i 'empty is valid'
# Expect: found
```

- [ ] **3.6 Commit**

```bash
git add src/skills/forge/SKILL.md src/skills/forge/references/project-bootstrap.md src/skills/forge/references/memory-system.md
git commit --no-verify -m "feat(forge): handle empty test_cmd as project state, not failure"
```

---

## Task 4: Global review + fixes

**Goal:** a fresh pair of eyes verifies Tasks 1-3 landed coherently and did not introduce contradictions.

- [ ] **4.1 Dispatch code-reviewer subagent**

Scope:
- Spec delta: the 3 fixes from this plan (C1, C2, I2).
- Files changed in this plan: SKILL.md + 3 references.
- Check: consistency between Step 5 language (minimum-viable first-pass) and qa-runner.md; consistency between Phase 4 (seed) and memory-system.md (lazy enrichment); consistency between Step 4 Cases and JUDGE's N/A column.

Accept any verdict APPROVED or NEEDS_FIX with concrete fix bullets.

- [ ] **4.2 Apply any blocker/important findings inline**

Commit fix bundle as:
```bash
git commit --no-verify -m "fix(forge): address post-ux-fixes review findings"
```

- [ ] **4.3 Verify final state**

```bash
# All forge files type-clean and biome-clean
bun check-types
bun biome check src/skills/forge/ --no-errors-on-unmatched

# Full branch diff against master
git log --oneline master..HEAD | wc -l
# Expect: prior 14 + 3 feature commits + (0 or 1 review-fix commit) = 17 or 18

# Cross-reference anchors still resolve
grep -rn 'Minimum viable first pass\|Lazy module discovery\|Case B' src/skills/forge/
# Expect: multiple hits — anchors are referenced from multiple files
```

---

## Self-review notes

**Spec coverage:**
- C1 → Task 1 (qa-runner.md + SKILL.md Steps 5 + 6)
- C2 → Task 2 (project-bootstrap.md Phase 4 + memory-system.md + SKILL.md Step 1)
- I2 → Task 3 (SKILL.md Step 4 + Step 6 + project-bootstrap.md + memory-system.md)

**Out of scope (acknowledged in dry-run analysis, deferred to separate specs):**
- I1 (profile ecosystem too sparse — nextjs/python/go profiles): separate spec.
- I3 (TDD without stack-specific examples): partly addressed by I1; out of scope here.
- C3 (SwiftUI regression on former swiftui-forge users): swiftui profile enhancement, separate spec.
- M1 (framework-convention-aware module grouping): cosmetic, deferred.

**Placeholder scan:** none — every step has concrete content, exact file paths, verification commands.

**Type consistency:**
- `seeded: true` — used uniformly in project-bootstrap.md and memory-system.md.
- `strategy: minimum-viable` — used in qa-runner.md; referenced in SKILL.md as a state check.
- `TODO (next cycle)` — exact string used both as inserted markers and as the grep pattern in JUDGE.
- `Case A/B/C/D` — enumerated in Step 4 and referenced from Step 6 and project-bootstrap.md.

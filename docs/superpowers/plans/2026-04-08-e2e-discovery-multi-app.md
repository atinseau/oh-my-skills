# E2E Discovery Multi-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update e2e-discovery skill to support monorepos, domain-based test directories, ephemeral snapshots, clean separation of concerns (map/index/scenario), and a self-healing healthcheck mode.

**Architecture:** Each change is isolated to one or two files. SKILL.md is the central file updated last since it references all other files. The healthcheck reference is created new. Skills are not unit-tested — quality relies on content review.

**Tech Stack:** Markdown skill files, YAML config format

**Spec:** `docs/superpowers/specs/2026-04-08-e2e-discovery-multi-app-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/skills/e2e-discovery/references/setup.md` | Monorepo detection, test_dirs auto-population, config schema |
| Modify | `src/skills/e2e-discovery/references/explore.md` | Ephemeral snapshots, updated map format, index update |
| Modify | `src/skills/e2e-discovery/references/scenario.md` | Domain/Spec fields, domain-grouped index |
| Modify | `src/skills/e2e-discovery/references/test.md` | Domain-based path resolution, updated memory update |
| Modify | `src/skills/e2e-discovery/references/bug.md` | Live re-snapshots, updated path resolution |
| Delete | `src/skills/e2e-discovery/references/snapshots.md` | No longer relevant |
| Create | `src/skills/e2e-discovery/references/healthcheck.md` | Self-healing .discovery/ mode |
| Modify | `src/skills/e2e-discovery/SKILL.md` | Central spec: formats, structure, modes, rules |

---

### Task 1: Update `references/setup.md` — Monorepo + test_dirs

**Files:**
- Modify: `src/skills/e2e-discovery/references/setup.md`

This is the entry point. All other references depend on the config being correct.

- [ ] **Step 1: Read the current file and the spec sections 1, 2, 8**

Read `src/skills/e2e-discovery/references/setup.md` (current) and spec sections 1 (Monorepo), 2 (test_dirs), 6 (Virtuous Cycle), 8 (config format).

- [ ] **Step 2: Rewrite setup.md**

Changes to make:
- **Step 1 (playwright-cli check):** Keep as-is.
- **Step 2 (playwright-cli skill check):** Keep as-is.
- **Add new Step 3: Monorepo detection.** Before loading config, glob `**/playwright.config.{ts,js}` (exclude `node_modules`). If multiple found → list apps with their paths, ask user which one to work on. Set working context to that app's directory. If only one found → proceed as before.
- **Step 3 becomes Step 4: Load or create config.yaml.**
  - **If config.yaml exists:** Same flow but read `test_dirs` (map) instead of `test_dir`. If old `test_dir` field is found, note that healthcheck should be triggered (don't migrate here — that's healthcheck's job).
  - **If no config.yaml (first run):** Same detection from `playwright.config.ts` but build `test_dirs` map by scanning subdirectories of the detected test directory. Remove `spec_suffix` from the generated config. Use the config format from spec section 8.
- **Add new Step 5: Session bootstrap auto-correction (spec section 6).** After loading config and reading `_index.md`, perform silent coherence checks:
  - Remove dead links (scenarios referenced in index but file doesn't exist)
  - Detect stale scenarios: for each scenario, compare its page's `Last explored` date against when the scenario was last validated. If the map was re-explored after the scenario and the map content changed → mark scenario as `stale` in the index (page-level check per spec section 10)
  - Recalculate coverage counts in `## Coverage` table
  - Report only blocking issues. Fix everything else silently.
  - If major structural incoherence detected (unknown fields, wrong file formats) → trigger healthcheck mode before continuing.

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- Config format matches spec section 8 exactly
- No reference to `test_dir` (singular) or `spec_suffix`
- Monorepo detection is before config loading
- Old `test_dir` detection triggers healthcheck, not inline migration

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/setup.md
git commit -m "feat(e2e-discovery): update setup with monorepo detection and test_dirs"
```

---

### Task 2: Update `references/explore.md` — Ephemeral snapshots + clean map

**Files:**
- Modify: `src/skills/e2e-discovery/references/explore.md`

- [ ] **Step 1: Read the current file and spec sections 4, 5, 10**

Read `src/skills/e2e-discovery/references/explore.md` (current) and spec sections 4 (Snapshots), 5 (Separation of concerns), 10 (Staleness detection).

- [ ] **Step 2: Rewrite explore.md**

Changes to make:
- **Step 1 (Check existing knowledge):** Replace `Last validated` with `Last explored`. Remove reference to `Last validated`. Staleness check uses `Last explored` + git log.
- **Step 4 (Deep-dive):** Keep snapshot commands for in-session use but clarify they are ephemeral — used to extract data into the map, then discarded.
- **Step 5 (Save artifacts):**
  - Remove: `playwright-cli snapshot --filename={discovery_root}/snapshots/...` — no snapshot persistence.
  - Keep: Write/update map file, but remove the `## Discovered Scenarios` section instruction — maps are purely descriptive (spec section 5).
  - Remove: `Snapshot` column from States table references.
  - Update: Index update — when scenarios are discovered during exploration, add them to `_index.md` using **domain-grouped** format (under the appropriate `### [domain]` section). The domain is inferred from the page/route or asked to the user.
  - Add: Update `Last explored` date in the map file.

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- No reference to persisting snapshots to disk
- No reference to `snapshots/` directory
- No reference to `Last validated`
- No reference to `## Discovered Scenarios` in map files
- No `Snapshot` column in States table
- Index updates use domain grouping

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/explore.md
git commit -m "feat(e2e-discovery): ephemeral snapshots and clean map format in explore mode"
```

---

### Task 3: Update `references/scenario.md` — Domain + Spec fields

**Files:**
- Modify: `src/skills/e2e-discovery/references/scenario.md`

- [ ] **Step 1: Read the current file and spec sections 3, 5**

Read `src/skills/e2e-discovery/references/scenario.md` (current) and spec sections 3 (Scenario format), 5 (Index format).

- [ ] **Step 2: Rewrite scenario.md**

Changes to make:
- **Step 3 (Generate scenarios):** When creating a scenario file, use the new format with `**Domain:**` and `**Spec:**` fields instead of `**Spec file:**`. Domain is inferred from the page's route (e.g., `/auth/login` → `auth`) or asked to the user. Spec is the test file name without path or extension.
- **Step 4 (Update index):** Rewrite to use domain-grouped format. Scenarios are added under `### [domain]` sections. If the domain section doesn't exist yet, create it. Update `## Coverage` summary table with domain-level counts.
- Remove any reference to `Spec file:` (old field).

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- Scenario file template uses `**Domain:**` and `**Spec:**`
- No reference to `**Spec file:**`
- Index updates are domain-grouped
- Coverage summary is domain-level

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/scenario.md
git commit -m "feat(e2e-discovery): domain and spec fields in scenario mode"
```

---

### Task 4: Update `references/test.md` — Domain-based path resolution

**Files:**
- Modify: `src/skills/e2e-discovery/references/test.md`

- [ ] **Step 1: Read the current file and spec sections 2, 3**

Read `src/skills/e2e-discovery/references/test.md` (current) and spec sections 2 (test_dirs), 3 (Scenario format, path resolution).

- [ ] **Step 2: Rewrite test.md**

Changes to make:
- **Step 4 (Write the test):** Replace `{spec_suffix}` and `{test_dir}` with domain-based path resolution: read scenario's `**Domain:**` field → look up `test_dirs[domain]` in config → build path as `test_dirs[domain] / scenario.spec + .spec.ts`. If the domain doesn't exist in `test_dirs`, ask the user for the path and add the entry to config.
- **Step 5 (Validate):** Same `{test_command}` logic but update spec path reference.
- **Step 6 (Update memory):** Update scenario's `**Spec:**` field (name only). Update `_index.md` in the domain-grouped section. Update `## Coverage` counts.
- Remove all references to `{spec_suffix}` and `{test_dir}`.

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- Path resolution uses `test_dirs[domain] / spec + .spec.ts`
- No reference to `{spec_suffix}` or `{test_dir}`
- Memory updates use domain-grouped index

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/test.md
git commit -m "feat(e2e-discovery): domain-based path resolution in test mode"
```

---

### Task 5: Update `references/bug.md` — Live snapshots + updated paths

**Files:**
- Modify: `src/skills/e2e-discovery/references/bug.md`

- [ ] **Step 1: Read the current file and spec sections 3, 4**

Read `src/skills/e2e-discovery/references/bug.md` (current) and spec sections 3 (Scenario format), 4 (Snapshots).

- [ ] **Step 2: Rewrite bug.md**

Changes to make:
- **Phase 1, Step 5:** Replace `{spec_suffix}` with domain-based path resolution (same as test mode).
- **Phase 2, Step 1.5 (Read relevant snapshots):** Replace with "Re-snapshot the page live with `playwright-cli open` + `playwright-cli snapshot` to understand current UI structure. Do not read persisted snapshot files."
- **Phase 2, Step 1.1:** Replace `{test_dir}` with `test_dirs[domain]` lookup.
- **Phase 2, Step 6:** Replace `Last validated` with `Last explored`. Update scenario and index using domain-grouped format.
- Remove all references to `{spec_suffix}`, `{test_dir}`, `Last validated`, and persisted snapshot files.

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- No reference to persisted snapshots or `snapshots/` directory
- No reference to `{spec_suffix}`, `{test_dir}`, or `Last validated`
- Path resolution uses domain-based approach
- Index updates use domain grouping

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/bug.md
git commit -m "feat(e2e-discovery): live snapshots and domain paths in bug mode"
```

---

### Task 6: Delete `references/snapshots.md`

**Files:**
- Delete: `src/skills/e2e-discovery/references/snapshots.md`

- [ ] **Step 1: Delete the file**

```bash
git rm src/skills/e2e-discovery/references/snapshots.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(e2e-discovery): remove snapshots reference — snapshots are now ephemeral"
```

---

### Task 7: Create `references/healthcheck.md`

**Files:**
- Create: `src/skills/e2e-discovery/references/healthcheck.md`

- [ ] **Step 1: Read spec section 12**

Read spec section 12 (Healthcheck Mode).

- [ ] **Step 2: Write healthcheck.md**

The healthcheck is a mode, not a migration script. It has no hardcoded rules. Algorithm:

```markdown
# Healthcheck Mode

Analyze `.discovery/` against the current skill spec and fix incoherences.

**Trigger:** "healthcheck" or auto-triggered by setup when major incoherence detected.

## Algorithm

### 1. Load the spec

Read SKILL.md and all reference files to build understanding of:
- Expected directory structure (which dirs should exist, which should not)
- Expected config.yaml schema (which fields, which types)
- Expected map file format (which sections, which fields)
- Expected scenario file format (which fields, which statuses)
- Expected index format (which sections, which grouping)

### 2. Scan .discovery/

Read every file and directory in {discovery_root}:
- config.yaml
- All files in map/
- All files in scenarios/ (including _index.md)
- Any other files or directories that exist

### 3. Compare and transform

For each file, compare its structure against the expected format.

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
- Stale/incorrect coverage counts -> recalculate
- Dead links -> remove
- Missing scenarios -> add

### 4. Report

- Silent for all fixes applied
- Report only blocking issues that require user input
- Summary: "Healthcheck complete. X files fixed, Y issues require your input."
```

- [ ] **Step 3: Verify consistency**

Re-read the written file. Verify:
- No hardcoded migration rules — everything is derived from reading the spec
- Covers all file types (config, maps, scenarios, index, directories)
- Silent operation with blocking-only reporting
- Can be triggered manually or by setup

- [ ] **Step 4: Commit**

```bash
git add src/skills/e2e-discovery/references/healthcheck.md
git commit -m "feat(e2e-discovery): add healthcheck mode — self-healing .discovery"
```

---

### Task 8: Update `SKILL.md` — Central spec

**Files:**
- Modify: `src/skills/e2e-discovery/SKILL.md`

This task is last because SKILL.md references all other files. All reference files must be updated first.

- [ ] **Step 1: Read the current SKILL.md and the full spec**

Read `src/skills/e2e-discovery/SKILL.md` (current) and the full spec document.

- [ ] **Step 2: Update the Modes section**

Add Healthcheck to the modes table (5 modes instead of 4). Add healthcheck to the Mode Flow diagram — it can be triggered from setup or manually at any time.

- [ ] **Step 3: Update Memory Structure**

Remove `snapshots/` directory from the structure diagram. The structure should show:
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

- [ ] **Step 4: Update Map File format**

- Remove `**Last validated:**` field
- Remove `Snapshot` column from States table
- Remove `## Discovered Scenarios` section
- Keep: URL, Last explored, Layout, Zones (with element tables), States (without Snapshot column), Interactions

- [ ] **Step 5: Update Scenario File format**

Replace `**Spec file:**` with `**Domain:**` and `**Spec:**`. Add `stale` to the status list (as a flag, e.g., `covered (stale)`).

- [ ] **Step 6: Update Scenario Index format**

Replace the page-grouped format with domain-grouped format. Add `## Coverage` (domain-level summary), `## Stale`, `## Blocked` sections. Show scenarios grouped under `### [domain]` with columns: Scenario, Page, Status, Priority, Spec.

- [ ] **Step 7: Update config.yaml format**

Replace `test_dir` with `test_dirs` (map). Remove `spec_suffix`.

- [ ] **Step 8: Remove Snapshot Management section**

Delete the `## Snapshot Management` section and its reference to `references/snapshots.md`.

- [ ] **Step 9: Update Rules section**

- Replace `{test_dir}` with `test_dirs` in the Allowed list
- Remove any reference to persisted snapshots in the rules

- [ ] **Step 10: Update Troubleshooting section**

- Remove snapshot-specific troubleshooting entries that reference persisted files
- Keep entries that use live `playwright-cli snapshot` (ephemeral usage is fine)

- [ ] **Step 11: Add stale semantics to Rules or Scenario format**

Encode the key rules from spec section 9:
- `stale` is a flag, not a progression state — shown as `covered (stale)`
- `stale` does NOT degrade coverage counts
- Only the coherence cycle sets `stale` — never the user
- Resolved by re-exploring the page and confirming the scenario still works

- [ ] **Step 12: Verify full consistency**

Re-read the entire updated SKILL.md. Cross-reference with every reference file to verify:
- All formats match
- No stale references to snapshots/, test_dir, spec_suffix, Last validated, Spec file:
- Modes table lists all 5 modes
- Memory structure matches
- Stale semantics are documented

- [ ] **Step 13: Commit**

```bash
git add src/skills/e2e-discovery/SKILL.md
git commit -m "feat(e2e-discovery): update SKILL.md — multi-app, domain paths, ephemeral snapshots, healthcheck"
```

---

### Task 9: Final cross-file verification

- [ ] **Step 1: Read all files**

Read every file in `src/skills/e2e-discovery/` — SKILL.md and all references.

- [ ] **Step 2: Search for stale references**

Grep across all files for terms that should no longer exist (use word-boundary regex to avoid false positives):
- `\btest_dir\b` (not `test_dirs`) — use regex `test_dir[^s]` or `test_dir:` to avoid matching `test_dirs`
- `spec_suffix`
- `Spec file:`
- `Last validated`
- `snapshots/`
- `snapshots.md`
- `Discovered Scenarios`

- [ ] **Step 3: Fix any remaining issues**

If any stale references found, fix them in the appropriate file.

- [ ] **Step 4: Final commit (if changes)**

```bash
git add src/skills/e2e-discovery/
git commit -m "fix(e2e-discovery): clean up stale references across all files"
```

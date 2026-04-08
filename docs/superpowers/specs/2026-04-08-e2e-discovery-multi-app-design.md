# E2E Discovery — Multi-App & Memory Optimization

## Context

The e2e-discovery skill currently assumes a single app with one `base_url`, one `test_dir`, and one `.discovery/` root. This design extends the skill to support monorepos with multiple apps and optimizes the `.discovery/` memory structure for token efficiency.

## Decisions

### 1. Monorepo Support — Per-App Isolation

Each app in a monorepo gets its own `.discovery/` with its own `config.yaml`. Zero shared state between apps.

```
monorepo/
├── apps/
│   ├── front/
│   │   ├── playwright.config.ts
│   │   └── .discovery/
│   │       ├── config.yaml          # base_url: localhost:3000
│   │       ├── map/
│   │       └── scenarios/
│   └── admin/
│       ├── playwright.config.ts
│       └── .discovery/
│           ├── config.yaml          # base_url: localhost:3001
│           ├── map/
│           └── scenarios/
```

**Detection:** The setup phase globs `**/playwright.config.{ts,js}` from the project root. If multiple are found, the skill lists the apps and asks which one to work on. If only one is found, the current behavior is unchanged.

**Cross-app flows are out of scope.** The skill explores one app at a time.

### 2. Test Directories — Domain-Based Mapping

`test_dir` (single string) is replaced by `test_dirs` (map of domain to path).

```yaml
test_dirs:
  auth: tests/e2e/auth
  dashboard: tests/e2e/dashboard
  billing: tests/e2e/billing
```

**Auto-population at setup:** The skill scans existing test directories and builds the initial `test_dirs` map. If a project has a legacy `test_dir` field, it is migrated automatically — the skill scans subdirectories of the old `test_dir` and populates `test_dirs`.

**Growth over time:** When a scenario targets a domain not yet in `test_dirs`, the skill asks where tests for that domain should go, then adds the entry.

**`spec_suffix` is removed.** The extension `.spec.ts` is hardcoded.

### 3. Scenario Format Changes

Two new fields replace `Spec file:`:

```markdown
# Scenario: [Human-readable name]

**Status:** discovered | playing | tested | covered | blocked | stale
**Priority:** critical | high | medium | low
**Page:** [page-name]
**Domain:** auth
**Spec:** login-flow

## Preconditions
...
```

- **Domain** — key in `test_dirs`, determines the test directory
- **Spec** — file name only, no path, no extension

**Path resolution:** `test_dirs[domain]` + `spec` + `.spec.ts` = full path. Example: `tests/e2e/auth/login-flow.spec.ts`.

### 4. Snapshots — Ephemeral, Not Persisted

The `snapshots/` directory is removed from `.discovery/`. Playwright snapshots are used during the session for exploration and then discarded. The relevant information is extracted into map files during exploration.

If a future session needs to verify an element, it re-snapshots the live page. One command, no stale files.

**Gain:** Eliminates the largest source of persisted tokens (500-5000 tokens per snapshot file).

### 5. Separation of Concerns — Map, Index, Scenario

Each file type has one responsibility:

| File | Role | Contains |
|------|------|----------|
| **Map** | Cartography | What exists on the page — elements, zones, interactions, states |
| **Index** | Intelligence | Coverage stats, scenario tracking, stale/blocked status |
| **Scenario** | Test plan | Steps, assertions, preconditions for one user intent |

**Maps are purely descriptive.** No links to scenarios, no coverage info. A map documents what the agent sees, nothing more.

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
| Back button | button | "<-" | Navigates to list |
| Title | heading | "Workflow Name" | Editable inline |

## States

| State | Trigger | Key changes |
|-------|---------|-------------|
| default | page load | -- |
| editing | modify any field | title shows "non sauvegarde" |

## Interactions

- [x] Click "Noeuds" tab -> palette visible with node categories
- [ ] Drag node from palette -> node appears on canvas (needs mock)
```

**The index is the brain.** It owns the relationship between maps and scenarios, tracks coverage, and flags problems.

```markdown
# Discovery Index

## Coverage

| Domain | Pages | Scenarios | Covered | Last explored |
|--------|-------|-----------|---------|---------------|
| auth | 2 | 5 | 3 | 2025-03-15 |
| dashboard | 3 | 8 | 2 | 2025-03-10 |

## Stale

| Scenario | Reason |
|----------|--------|
| [login](./login.md) | page re-explored, elements changed |

## Blocked

| Lead | Blocker | Source |
|------|---------|--------|
| drag-and-drop | needs mock server | explore/canvas |

## Scenarios

### auth

| Scenario | Page | Status | Priority | Spec |
|----------|------|--------|----------|------|
| [login](./login.md) | login | covered | critical | login |
| [logout](./logout.md) | header | discovered | medium | -- |
| [reset-pwd](./reset-pwd.md) | login | stale | high | reset-pwd |

### dashboard

| Scenario | Page | Status | Priority | Spec |
|----------|------|--------|----------|------|
| [create-widget](./create-widget.md) | main | covered | critical | create-widget |
| [filter-activity](./filter-activity.md) | main | discovered | medium | -- |
```

### 6. Virtuous Cycle — Automatic Coherence

The map, index, and scenarios maintain coherence through automatic updates:

**Scenario created** -> Index updated with new scenario entry, linked to its page and domain.

**Test passes (covered)** -> Index updated, scenario status becomes `covered`.

**Map re-explored and elements changed** -> Scenarios referencing changed elements are marked `stale` in the index. The skill auto-corrects silently.

**Session bootstrap** -> The skill reads `_index.md`, cross-references with maps and scenarios, and auto-corrects:
- Removes dead links (deleted scenarios)
- Marks stale scenarios (map changed since scenario was written)
- Updates coverage counts

The skill only speaks up when something is **blocking** — a scenario that can't be run, a page that can't be reached. Everything else is fixed silently.

### 7. Updated `.discovery/` Structure

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

Changes from current structure:
- `snapshots/` directory removed
- Map files no longer contain scenario references or coverage info
- `_index.md` carries all cross-referencing and coverage intelligence
- `config.yaml` uses `test_dirs` (map) instead of `test_dir` (string)

### 8. Updated `config.yaml` Format

```yaml
# Auto-generated by e2e-discovery -- edit freely
discovery_root: tests/.discovery
dev_command: pnpm e2e:dev
base_url: http://localhost:5173
test_command: pnpm e2e
test_dirs:
  auth: tests/e2e/auth
  dashboard: tests/e2e/dashboard
helpers_dir: tests/helpers
mocks_dir: tests/mocks/data
```

Changes from current format:
- `test_dir` replaced by `test_dirs`
- `spec_suffix` removed (hardcoded `.spec.ts`)

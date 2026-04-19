# Memory System

`.forge/` is the agent's projected view of the codebase — a structured, queryable summary that replaces full codebase scans. The agent reads it at the start of every cycle and writes it at the end.

## Directory Structure

```
.forge/
├── index.md                          # Table of contents (max 100 lines, derived)
├── config.md                         # Active profiles + resolved commands + bootstrap reasoning
├── architecture/
│   └── modules.md                    # Module map with keywords
├── knowledge/
│   ├── pitfalls.md                   # Traps discovered + solutions (cumulative)
│   └── dependencies.md              # External libs, why, gotchas (cumulative)
├── features/
│   └── <name>.md                    # One file per feature
├── bugs/
│   └── BUG-<NNN>.md                # One file per resolved bug
├── sessions/
│   └── <date>-<topic>.md            # One session log per session
└── qa/                              # Opaque — managed by agent (see QA is separate)
```

## LOAD Phase

1. Read `.forge/index.md` first — it is the table of contents (max 100 lines).
2. From the user's task description, identify which modules are involved.
3. Read ONLY the memory files relevant to those modules. Do NOT read all of `.forge/`.
4. Read the most recent `sessions/<date>-*.md` for continuity with the previous session.
5. Read the source files of the identified modules (listed in `architecture/modules.md`).

**Rule: never read the entire codebase.** The memory system replaces full scans. If a module is not in `modules.md`, it does not exist for this task.

## MEMORIZE Phase

Mandatory at the end of every successful cycle. The cycle does not end without saving.

1. Update `architecture/modules.md` if modules were created, modified, or deleted.
2. Create or update `features/<name>.md` for feature work, or `bugs/BUG-<NNN>.md` for bug fixes.
3. Update `qa/index.md` if the QA strategy evolved.
4. Update `knowledge/dependencies.md` if dependencies changed.
5. Append to `sessions/<date>-<topic>.md` — one session log per day per topic. If the file exists for today, append.
6. Regenerate `.forge/index.md` after every write.

When creating new memory files, copy the corresponding template from `skills/forge/templates/` to ensure format consistency.

## File Format Rules

1. **One file = one subject** — one module, one bug, one feature, one session per file.
2. **Every file has a `keywords:` frontmatter** — this is the contract that makes `index.md` useful.
3. **`index.md` is derived, never hand-edited** — regenerated each MEMORIZE phase.
4. **Sessions are append-only** — one file per session, never overwritten mid-session.
5. **`knowledge/pitfalls.md` and `knowledge/dependencies.md` are cumulative** — new entries are appended, old entries are never removed.
6. **No duplication** — pitfalls live once in `knowledge/pitfalls.md`, referenced by links from modules and bugs.
7. **QA artefacts do NOT live in the memory tree** — they live in `.forge/qa/`.

## Templates

Template files live at `skills/forge/templates/`:

- `skills/forge/templates/module.md`
- `skills/forge/templates/bug.md`
- `skills/forge/templates/feature.md`
- `skills/forge/templates/session.md`

## index.md Format

`index.md` is auto-generated. Max 100 lines. One line per entry. Example:

```markdown
---
updated: 2026-04-18
---

# Index

Profiles: [swiftui, typescript]
Last session: 2026-04-18-oauth2-login

## Modules
- auth — `src/auth/` — keywords: jwt, session, login
- api-client — `src/api/` — keywords: http, retry, timeout
- storage — `src/storage/` — keywords: sqlite, migrations, cache

## Open Bugs
- BUG-001 — login token not refreshed on expiry — keywords: jwt, session

## Features
- oauth2-login — status: wip — keywords: oauth2, login
- dark-mode — status: done — keywords: theme, ui

## Pitfalls
- Token expiry not propagated to UI layer (see knowledge/pitfalls.md#token-expiry)

## Last Session
- 2026-04-18-oauth2-login — iterations: 3 — result: pass
```

## Frontmatter Examples

### module

```yaml
---
name: auth
path: src/auth/
keywords: [jwt, session, login]
---
```

### bug

```yaml
---
id: BUG-001
status: open
keywords: [jwt, session, token-refresh]
created: 2026-04-18
---
```

### feature

```yaml
---
name: oauth2-login
status: wip
keywords: [oauth2, login, session]
created: 2026-04-18
---
```

### session

```yaml
---
date: 2026-04-18
topic: oauth2-login
iterations: 3
result: pass
---
```

## QA is Separate

`.forge/qa/` is an opaque directory owned and managed by the agent. The agent's QA strategy, tooling configuration, and test artefacts live there. QA does NOT live in the memory tree — it is a parallel concern.

Refer to `references/qa-runner.md` for QA discipline and the agent's responsibilities around running and interpreting tests.

## Maintenance Rules

- **index.md**: Regenerated automatically after every MEMORIZE phase. Max 100 lines.
- **Conflicts**: If memory contradicts current code, code wins. Update the memory.
- **No duplicates**: Before creating a new entry, check if one exists.
- **Git**: `.forge/` is committed to git, including `.forge/qa/index.md` and `.forge/qa/scripts/` (scripts must be runnable in CI — see `references/qa-runner.md`). Gitignore only truly generated outputs (e.g. transient `current.png`, `diff-*.png`, on-the-fly fixtures); that policy belongs in the project's own `.gitignore`.

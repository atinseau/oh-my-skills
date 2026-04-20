# Memory System

`.forge/` is the agent's projected view of the codebase — a structured, queryable summary that replaces full codebase scans. The agent reads it at the start of every cycle and writes it at the end.

## Directory Structure

```
.forge/
├── index.md                          # Table of contents (max 100 lines, derived)
├── config.md                         # Active profiles + resolved commands + bootstrap reasoning
├── architecture/
│   └── modules.md                    # Module map — seeded at bootstrap, enriched lazily at LOAD
├── knowledge/
│   ├── pitfalls.md                   # Traps discovered + solutions (cumulative)
│   └── dependencies.md              # External libs, why, gotchas (cumulative)
├── features/
│   └── <name>.md                    # One file per feature
├── bugs/
│   └── BUG-<NNN>.md                # One file per resolved bug
├── sessions/
│   └── <date>-<topic>-<author-slug>.md   # One session log per session per author
└── qa/                              # Opaque — managed by agent (see QA is separate)
```

## LOAD Phase

1. Read `.forge/index.md` first — it is the table of contents (max 100 lines).
2. From the user's task description, identify which modules are involved.
3. Read ONLY the memory files relevant to those modules. Do NOT read all of `.forge/`.
4. Read the most recent `sessions/<date>-*.md` for continuity with the previous session.
5. Read the source files of the identified modules (listed in `architecture/modules.md`).

**Rule: never read the entire codebase.** The memory system replaces full scans. If a module is not in `modules.md`, it does not exist for this task.

## Lazy Module Discovery

Bootstrap writes seed entries in `architecture/modules.md` — just `name` + `path` + `seeded: true`. The LOAD step enriches these entries on demand.

### When to enrich

During LOAD step 2 (keyword matching), if the user's task references a module that exists only as a seed:

1. Read the module's `path` listed in the seed entry.
2. List the files in that directory (one level deep).
3. Read 2-3 representative files to infer the role (the public entry point, the largest file, or files named like `index.*`, `main.*`, `mod.rs`, `lib.rs`).
4. Extract 3-6 keywords from filenames + top-level symbols + any local README.
5. Rewrite the module's entry in `architecture/modules.md` — drop `seeded: true`, add `role:`, `key_files:`, `keywords:` as body lines inside the `## <name>` section (not as YAML frontmatter — `modules.md` is a shared file; per-module frontmatter blocks are not used).
6. Regenerate `.forge/index.md` so the index reflects the enriched entry.

### When to skip enrichment

If LOAD's keyword match already resolves to a module whose entry is NOT seeded (it was enriched in a prior cycle), no work is needed — use the existing entry.

### When to create new modules

If the user's task references a directory that is NOT in `modules.md` at all (even as a seed — e.g. it was swallowed by the `other` bucket), create the entry from scratch using the same 5-step enrichment procedure. Add it under the correct root.

### Budget

Enrichment reads are bounded: at most 5 files per module on first enrichment. The same 5-file cap applies to re-enrichment (when a module grows and its entry needs an update). If more is needed to understand the module, that is a signal the module is too large and may warrant a split (architecture-guard rule #1).

## Desync Detection

`.forge/` assumes every code change passes through a forge cycle. Reality breaks this assumption: `git pull`, IDE renames, out-of-band `npm i`, collaborators' merged PRs. The memory drifts silently. Desync detection catches this before it corrupts keyword matches and bug lookups.

### Trigger

Every LOAD runs the probe. See `SKILL.md` Step 1 for the exact commands.

### Refresh procedure (when user accepts)

Bounded. Do NOT rescan the codebase.

1. **Dependencies:** re-parse the current manifest(s) found at bootstrap. Rewrite `knowledge/dependencies.md` entirely — dependencies are cumulative *by content*, not by append-only history (unlike sessions).
2. **New modules:** list immediate subdirectories of the bootstrap root. For each that is absent from `modules.md`, add a seeded entry (`name` + `path` + `seeded: true`).
3. **Removed modules:** for each entry in `modules.md` whose `path` no longer exists on disk, change its header annotation to `status: removed` (keep the entry — it preserves keyword history for past bugs/features that referenced it).
4. **Do NOT re-enrich** existing non-seeded entries. Re-enrichment is a distinct operation, triggered only when a module is touched and its keywords look stale — out of scope for a refresh.
5. Update `last_consolidation` in `config.md` frontmatter.

### Refresh procedure (when user declines)

1. Record the detected changes verbatim in the upcoming session log under a `## Known staleness` section. This makes the debt visible in future LOADs that read the session log.
2. Proceed with LOAD. The agent operates with known-stale memory; keyword matches may miss newer code. The session log note is the contract that says the user accepted this tradeoff.

### What desync is NOT

- Not a replacement for MEMORIZE. MEMORIZE is the normal path: every completed cycle writes its changes into memory before exit. Desync only catches what MEMORIZE can't see because it happened outside a cycle.
- Not automatic. The user always decides whether to refresh. Silent auto-refresh would risk clobbering intentional manual annotations.

## MEMORIZE Phase

Mandatory at the end of every successful cycle. The cycle does not end without saving.

1. Update `architecture/modules.md` if modules were created, modified, or deleted.
2. Create or update `features/<name>.md` for feature work, or `bugs/BUG-<NNN>.md` for bug fixes.
3. Update `qa/index.md` if the QA strategy evolved.
4. Update `knowledge/dependencies.md` if dependencies changed.
5. Append to `sessions/<date>-<topic>-<author-slug>.md` — one session log per session per author. Derive `author-slug` from `git config user.email`: take the part before `@`, lowercase, replace non-alphanumerics with `-`, truncate to 20 chars. Fall back to `unknown` if git identity is unavailable.
6. Regenerate `.forge/index.md` after every write.

When creating new memory files, copy the corresponding template from `skills/forge/templates/` to ensure format consistency.

## File Format Rules

1. **One file = one subject** — one bug, one feature, one session per file. `architecture/modules.md` is the single exception: one file with many module blocks, where each module is a `## <name>` section.
2. **Every per-entity file has `keywords:` in frontmatter** — applies to `bugs/BUG-<NNN>.md`, `features/<name>.md`, `sessions/<date>-<topic>-<author-slug>.md`. In `architecture/modules.md`, each enriched module block lists `keywords:` as a body line inside its `## <name>` section; seeded blocks omit keywords until enrichment. Either form is the contract that makes `index.md` useful.
3. **`index.md` is derived, never hand-edited** — regenerated each MEMORIZE phase.
4. **Sessions are append-only and per-author** — one file per session per author. Filename pattern: `<date>-<topic>-<author-slug>.md`. `author-slug` is derived from `git config user.email` — take the part before `@`, lowercase it, replace any non-alphanumeric character with `-`, truncate to 20 characters. If no git identity is configured, use `unknown`. This keeps concurrent sessions on the same day from colliding in git.
5. **`knowledge/pitfalls.md` and `knowledge/dependencies.md` are cumulative** — new entries are appended, old entries are never removed.
6. **No duplication** — pitfalls live once in `knowledge/pitfalls.md`, referenced by links from modules and bugs.
7. **QA artefacts do NOT live in the memory tree** — they live in `.forge/qa/`.
8. **Infrastructure pitfalls are recorded once** — e.g. `no-test-suite` is added to `knowledge/pitfalls.md` the first time Step 4 hits Case B, then never duplicated. Subsequent cycles with no tests reference the existing pitfall rather than adding a new entry.

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

## Merge Conflicts

`.forge/` is committed to git, so concurrent work on a branch can produce merge conflicts. Resolution policy by file type:

### `index.md` — discard and regenerate

`index.md` is derived. On conflict, discard both sides and regenerate from the rest of `.forge/` by running the MEMORIZE index-regeneration step manually. The correct state is whatever the current `.forge/` content implies.

### `architecture/modules.md` — merge per block

Each `## <name>` block is independent. Resolve conflicting blocks block-by-block: keep the more-recently-enriched version (the one with fewer `seeded: true` markers and richer `keywords`). After resolving blocks, regenerate `index.md`.

### `knowledge/pitfalls.md` and `knowledge/dependencies.md` — union

These are cumulative. On conflict, take the union of entries from both sides. Deduplicate by entry name or title.

### `sessions/<date>-<topic>-<author-slug>.md` — should not conflict

Per-author naming eliminates this class of conflict by construction. If a conflict does occur (e.g. same author on two machines), fall back to append-both: keep both branches' content in chronological order within the file.

### `bugs/BUG-<NNN>.md` and `features/<name>.md` — conflict = genuine divergence

These reflect a single subject. If two agents edit the same bug/feature file concurrently, the content is genuinely divergent — resolve by hand, favouring the side with the more accurate "Verification" / "Design decisions" section.

### `config.md` — rare; inspect `last_consolidation`

If both sides changed `last_consolidation`, take the later timestamp. If profile commands diverge, resolve in favour of the side that documented the reason in `## Decisions`.

# Project Bootstrap

Runs when `.forge/index.md` is missing in the project. Initializes `.forge/` by detecting profiles, resolving commands, scanning the codebase, and writing the memory tree.

## Trigger

At the start of every cycle, the orchestrator checks whether `.forge/index.md` exists in the project root.

- **Missing** → run bootstrap (this document). After bootstrap completes, proceed to Step 1 (LOAD) of the current cycle.
- **Present** → skip bootstrap entirely. Go directly to LOAD.

Bootstrap never runs mid-cycle. It is a one-time initialization gate.

## Phase 1 — Shallow scan

List the project root and one level deep only. Do NOT recurse — deep scanning defeats the memory pattern by flooding context before anything is understood.

Steps:
1. List root directory entries (files + directories).
2. List the immediate children of each top-level directory (one extra level). Stop there.
3. Read `README.md` if present. Fall back to `README.txt` or `README.rst` if no `.md` found.
4. Read any manifest file found at the root:
   - `package.json`, `Cargo.toml`, `Package.swift`, `pyproject.toml`, `go.mod`
   - `Gemfile`, `pom.xml`, `build.gradle`, `Makefile`, `composer.json`, `justfile`

Do NOT list or read the contents of build/dependency directories: `node_modules/`, `vendor/`, `.git/`, `target/`, `dist/`, `.build/`, `__pycache__/`, `.gradle/`, or similar.

Goal: gather enough signal to detect profiles and infer commands, not to understand every file.

## Phase 2 — Profile detection

Each profile lives at `skills/forge/profiles/<name>/profile.md`. Its frontmatter contains a `detect:` field that specifies how to recognize the profile in a project.

Detection format example:
```yaml
detect:
  files: ["package.json", "next.config.*"]
  contents:
    - file: package.json
      matches: "\"next\""
```

The `files` array contains glob patterns tested against the project root. The optional `contents` array checks that specific files contain a given string.

Pseudocode:
```
matches = []
for profile_dir in skills/forge/profiles/:
  fm = parse_frontmatter(profile_dir/profile.md)
  if any(glob(pattern, project_root) for pattern in fm.detect.files):
    if fm.detect.contents is defined:
      if all(file_contains(c.file, c.matches) for c in fm.detect.contents):
        matches.append(profile_dir.name)
    else:
      matches.append(profile_dir.name)
```

Collect every profile that matches. A project may match zero, one, or several profiles.

## Phase 3 — Resolution (agent-driven)

The agent arbitrates command resolution. There are no silent defaults.

**0 matches — generic mode:**
No active profile. The agent inspects available signals to propose commands:
- `scripts` section of `package.json`
- `Makefile` targets
- `justfile` recipes
- `README` install/usage section

Propose `build_cmd`, `test_cmd`, `lint_cmd` from these signals. If nothing can be inferred for a given command, ask the user explicitly. Do not leave commands empty without user acknowledgment.

**1 match:**
Take the commands declared by that profile. Resolve any `<placeholder>` values (e.g. `<scheme>`, `<module>`) by inspecting the project. If the placeholder cannot be resolved from files alone, ask the user.

**N matches, only one declares `commands`:**
Use those commands. The other matched profiles contribute their rules and linting guidance but do not own the build. Record this in `.forge/config.md` under `## Decisions`.

**N matches, multiple declare `commands`:**
Ask the user which profile owns the build. Present the options clearly. Do not guess. Record the user's choice in `.forge/config.md` under `## Decisions`.

After the owning profile is selected, resolve any remaining `<placeholder>` values in the chosen commands. Inspect the project first; ask the user only if the value is ambiguous.

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

~~~markdown
## other
path: (multiple)
seeded: true
note: Remaining N modules to be discovered lazily at LOAD. See `references/memory-system.md`.
~~~

5. Write `.forge/architecture/modules.md` using the seed format — a flat list of `## <name>` blocks, each with `path:`, `seeded: true`, and nothing else.

### Rationale

On a 500-file project, the seed pass produces a ~30-line `modules.md` in under 5 tool calls. Full module entries are built only when the user's task demands them. This preserves the memory-over-scan principle at the scale where it matters most.

## Phase 5 — Write .forge/

Create files in this order:

### `.forge/config.md`

Frontmatter:
```yaml
---
profiles: [<matched profile names, or empty array>]
build_cmd: <resolved command — must be present>
test_cmd: <resolved command or empty string>   # Empty is valid: project has no test suite yet. See SKILL.md Step 4 Case B.
lint_cmd: <resolved command or empty string>
detected_at: <ISO 8601 date>
---
```

Body:

```markdown
## Why these profiles

- **<profile-name>**: matched because `<glob>` was found at project root.
- ...

## Decisions

- <Any user interaction, placeholder resolution, or command arbitration recorded here.>
```

Concrete example for a project with both Next.js and TypeScript detected:

```markdown
---
profiles: [nextjs, typescript]
build_cmd: next build
test_cmd: jest --passWithNoTests
lint_cmd: eslint . --ext .ts,.tsx
detected_at: 2026-04-18T00:00:00Z
---

## Why these profiles

- **nextjs**: matched because `next.config.js` was found at project root and `package.json` contains `"next"`.
- **typescript**: matched because `tsconfig.json` was found at project root.

## Decisions

- Both profiles detected. Only `nextjs` declares `commands`; `typescript` contributes rules only.
- `lint_cmd` placeholder `<extensions>` resolved to `.ts,.tsx` from `tsconfig.json` include patterns.
```

**When inferring commands in generic mode (0 profile matches)** and no test or lint command can be inferred from scripts, Makefiles, or manifests, do not guess. Leave the field empty and record under `## Decisions` that no test/lint infrastructure was detected. Step 4 handles an empty `test_cmd` cleanly — see SKILL.md Step 4 Case B.

### `.forge/architecture/modules.md`

Written in Phase 4. Uses template at `skills/forge/templates/module.md`.

### `.forge/knowledge/pitfalls.md`

```markdown
---
type: pitfalls
---
```

Empty body. Pitfalls are added incrementally as the agent discovers them during cycles.

### `.forge/knowledge/dependencies.md`

Extract dependencies from the manifest file(s) found in Phase 1. For each dependency:

```markdown
## <dependency-name>

- **version**: <version string>
- **purpose**: <inferred from name/docs, or "purpose unknown">
```

List direct dependencies only (not transitive). For manifests with dev and prod sections, list both, labeling each group.

### `.forge/index.md`

Generated last, after all other files exist. Follow the structure defined in `references/memory-system.md` to produce the index. The index summarizes the state of all `.forge/` files and serves as the entry point for future LOAD steps.

## Phase 6 — QA is deferred

Do NOT create `.forge/qa/index.md` during bootstrap.

QA strategy is built by the agent at the **first Step 5 (QA) pass of the first cycle**, when there is a real task to reason about. Without a concrete task, any QA strategy would be generic guessing with no actionable value.

See `references/qa-runner.md` for the QA build process.

## Phase 7 — Return to the cycle

Bootstrap is complete. All `.forge/` files have been written, including `.forge/index.md`.

The orchestrator proceeds to Step 1 (LOAD) of the current cycle, which reads `.forge/index.md` to restore memory context before the task begins.

## Principles

- The bootstrap traces its reasoning in `config.md` (body sections "Why these profiles" and "Decisions"), making every detection and arbitration choice auditable.
- The bootstrap is not silent in case of ambiguity — it asks the user rather than guessing, so the `.forge/` state reflects actual intent.

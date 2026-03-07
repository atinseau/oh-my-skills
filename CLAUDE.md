# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

oh-my-skills is a community registry for sharing bash commands/aliases and LLM skills (Claude, Copilot). Users install via a one-liner that clones the repo to `~/.oh-my-skills`, copies skills to the right LLM directories, and sources commands into the user's shell.

## Commands

```bash
# Install dependencies
bun install

# Run all tests (requires Docker running)
TESTCONTAINERS_RYUK_DISABLED=true bun test

# Run a single test file
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts

# Validate bash script syntax
bash -n scripts/install.sh
```

## Architecture

### Scripts (`scripts/`)

Three bash scripts handle the lifecycle:

- **`install.sh`** — Clones repo to `~/.oh-my-skills`, detects Claude/Copilot CLIs, copies skills to `~/.claude/skills/` and `~/.copilot/skills/`, copies commands to `~/.oh-my-skills/commands/`, creates `~/.oh-my-skills/shell` (dynamic sourcing script), injects a single `source` line into `.bashrc`/`.zshrc`. Writes `registry.json` to track installed skill paths and version.
- **`uninstall.sh`** — Reads `registry.json` to find and remove skills (verified by `by: oh-my-skills` marker in SKILL.md), removes the sourcing line from shell config, deletes `~/.oh-my-skills/`.
- **`update.sh`** — Reads local version from `registry.json`, compares against remote git tags, prompts user to update. Auto-detects branch name.

### Registry (`~/.oh-my-skills/registry.json`)

```json
{"version":"0.1.0","skills":{"claude":["/path/to/skill"],"copilot":["/path/to/skill"]}}
```

Skills are NOT duplicated inside `~/.oh-my-skills` — the registry just tracks where they were copied. Commands live in `~/.oh-my-skills/commands/` and are dynamically sourced via `~/.oh-my-skills/shell`.

### Source content (`src/`)

- `src/skills/` — Skill directories, each containing a `SKILL.md` with YAML frontmatter including `by: oh-my-skills`
- `src/commands/` — Shell scripts (`.sh`) defining aliases/functions

### Tests (`tests/`)

All tests run inside Alpine Docker containers via **testcontainers**. The real scripts are copied into each container using `docker cp`, a local git repo simulates the remote, and fake `claude`/`copilot` binaries are created for LLM detection.

- `helpers.ts` — `exec()` wrapper (uses `docker exec` directly since testcontainers' `.exec()` hangs in bun), `copyToContainer()`, shared constants
- `install.test.ts` — Runs real `install.sh` in container, verifies all artifacts
- `uninstall.test.ts` — Installs first, then runs real `uninstall.sh`, checks cleanup + preservation of foreign skills
- `update.test.ts` — Tests version comparison, no-op when up-to-date, update detection with new git tags

### Key conventions

- Every skill MUST have `by: oh-my-skills` in its SKILL.md frontmatter — this is how uninstall identifies skills to remove
- The `VERSION` variable in `install.sh` is the source of truth for the current release version
- Scripts use `jq` when available, with `sed`/`grep` fallbacks for systems without it

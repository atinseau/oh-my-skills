# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

oh-my-skills is a community registry for sharing bash commands/aliases and LLM skills (Claude, Copilot). Users install via a one-liner that clones the repo to `~/.oh-my-skills`, copies skills to the right LLM directories, and sources commands into the user's shell.

## Commands

```bash
# Install dependencies
bun install

# Type-check (used in pre-commit)
bun check-types

# Lint/format (used in pre-commit; writes fixes)
bun run check

# Validate bash script syntax (all lifecycle scripts)
bash -n scripts/lib.sh && bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh

# Run all tests (requires Docker running)
TESTCONTAINERS_RYUK_DISABLED=true bun test

# Run a single test file
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts
```

## Architecture

### Scripts (`scripts/`)

- **`lib.sh`** — Shared library sourced by all three lifecycle scripts. Contains: colors/log helpers, `confirm()`, `detect_shell()`, `detect_llms()`, `get_version()`, `init_registry()`, `install_skills()`, `install_commands()`, `create_shell_sourcing(mode)`, `inject_sourcing(shell, mode)`. The `mode` parameter (`"install"` or `"update"`) controls log messages (e.g. "created" vs "updated") and suppresses redundant warnings in update context.
- **`install.sh`** — Clones repo to `~/.oh-my-skills`, then calls lib functions to detect CLIs, copy skills/commands, create shell sourcing, and inject the `source` line into `.bashrc`/`.zshrc`. Writes `registry.json`.
- **`uninstall.sh`** — Reads `registry.json` to find and remove skills (verified by `by: oh-my-skills` marker in SKILL.md), removes the sourcing line from shell config, deletes `~/.oh-my-skills/`.
- **`update.sh`** — Supports manual mode and shell-startup auto-check mode, compares local version from `registry.json` with remote git tags, asks for explicit confirmation when an update is available, then calls lib functions directly (not `install.sh`) to update skills/commands/shell in update context, and prints commit titles since the previous release as the changelog.

### Registry (`~/.oh-my-skills/registry.json`)

```json
{"version":"0.1.0","skills":{"claude":["/path/to/skill"],"copilot":["/path/to/skill"]}}
```

Skills are NOT duplicated inside `~/.oh-my-skills` — the registry just tracks where they were copied. Commands live in `~/.oh-my-skills/commands/` and are recursively sourced via `~/.oh-my-skills/shell`.

### Source content (`src/`)

- `src/skills/` — Skill directories, each containing a `SKILL.md` with YAML frontmatter including `by: oh-my-skills`
- `src/commands/` — Shell scripts (`.sh`) defining aliases/functions; nested command folders are supported (for example `src/commands/oms-cli/oms.sh`)

### Tests (`tests/`)

All tests run inside Alpine Docker containers via **testcontainers**. The real scripts are copied into each container using `docker cp`, a local git repo simulates the remote, and fake `claude`/`copilot` binaries are created for LLM detection.

- `helpers.ts` — `exec()` wrapper (uses `docker exec` directly since testcontainers' `.exec()` hangs in bun), `copyToContainer()`, shared constants
- `install.test.ts` — Runs real `install.sh` in container, verifies all artifacts
- `uninstall.test.ts` — Installs first, then runs real `uninstall.sh`, checks cleanup + preservation of foreign skills
- `update.test.ts` — Tests version comparison, no-op when up-to-date, update detection with new git tags

### Key conventions

- Every skill MUST have `by: oh-my-skills` in its SKILL.md frontmatter — this is how uninstall identifies skills to remove
- Skills MUST be cross-LLM compatible (Claude Code + GitHub Copilot): use only standard SKILL.md frontmatter fields (`name`, `description`, `by`); avoid Claude Code-specific fields (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `context`) unless they have a functional equivalent; never use Claude Code-only syntax like `!`command`` for dynamic context injection — instead, write explicit instructions telling the agent to run those commands
- `package.json` version is the release source of truth used by installer logic and tests
- Scripts use `jq` when available, with `sed`/`grep` fallbacks for systems without it
- Reinstall is expected to be idempotent and must not duplicate shell sourcing lines
- The shell bootstrap should stay quiet when auto-check finds no update; if the user declines an update, they can trigger it later with `oms update`


### Guidelines

- When a contribution is made, ensure copilot-instructions.md and claude.md are updated with any relevant information about new commands, architectural changes, or conventions, only updating the relevant sections and only if necessary

- If a critical behavior is added or changed, it should be reflected in the tests

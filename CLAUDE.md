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

- **`lib.sh`** — Shared library sourced by all three lifecycle scripts. Contains: colors/log helpers, `confirm()`, `detect_shell()`, `detect_llms()`, `get_version()`, `init_registry()`, `extract_frontmatter()`, `generate_claude_wrapper()`, `generate_copilot_wrapper()`, `install_skills()`, `install_commands()`, `create_shell_sourcing(mode)`, `inject_sourcing(shell, mode)`. The `mode` parameter (`"install"` or `"update"`) controls log messages (e.g. "created" vs "updated") and suppresses redundant warnings in update context.
- **`install.sh`** — Clones repo to `~/.oh-my-skills`, then calls lib functions to detect CLIs, install canonical skills + LLM wrappers, copy commands, create shell sourcing, and inject the `source` line into `.bashrc`/`.zshrc`. Writes `registry.json`.
- **`uninstall.sh`** — Reads `registry.json` to find and remove LLM wrapper files (verified by checking that the wrapper references `oh-my-skills/skills/`), removes the sourcing line from shell config, deletes `~/.oh-my-skills/`. Accepts `--yes` / `-y` to skip the interactive confirmation prompt (required when running via `curl | bash` since stdin is not a terminal).
- **`update.sh`** — Supports three modes: `--manual` (synchronous network check with full UI), `--auto-check` (cache-first zero-latency check at shell startup), and `--background-fetch` (silent network fetch that only writes the cache). Uses a cache file (`~/.oh-my-skills/.update-cache`) with a configurable TTL (`OMS_UPDATE_CACHE_TTL` env var, default 24h/86400s) to avoid blocking shell startup with network calls. When the cache is stale or missing, `--auto-check` spawns a detached `--background-fetch` process and returns immediately; the user sees the update notification on the *next* shell open once the cache is populated. Manual mode always does a synchronous fetch and also writes the cache. After a successful update, the cache is invalidated so the next auto-check re-fetches cleanly. Asks for explicit confirmation when an update is available, then calls lib functions directly (not `install.sh`) to update skills/commands/shell in update context, and prints commit titles since the previous release as the changelog.

### Skill installation pattern (`.agent/skills` — Single Source, Multiple Consumers)

Skills follow a **single source of truth** pattern to avoid drift across LLM tools:

1. **Canonical skill** — `~/.oh-my-skills/skills/<name>.md` contains 100% of the intelligence (copied from `src/skills/<name>/SKILL.md`). This is the only file that carries logic.
2. **LLM wrappers** — Lightweight files (2–8 lines) that redirect to the canonical skill:
   - **Claude**: `~/.claude/skills/<name>/SKILL.md` — contains `Follow the instructions in <canonical-path>` + `$ARGUMENTS`
   - **Copilot**: `~/.copilot/skills/<name>.prompt.md` — contains YAML frontmatter (`mode`, `description`) + a link to the canonical skill
3. **Adding a new LLM** — Create a wrapper in the tool's native format pointing to the canonical skill. Zero logic duplication.

### Registry (`~/.oh-my-skills/registry.json`)

```json
{"version":"0.1.0","skills":{"claude":["/root/.claude/skills/git-pr-flow/SKILL.md"],"copilot":["/root/.copilot/skills/git-pr-flow.prompt.md"]}}
```

The registry tracks the paths of **LLM wrapper files** (not directories). Uninstall uses the registry to locate wrappers and verifies ownership by checking that each wrapper references `oh-my-skills/skills/` before deleting it. For Claude wrappers (which live in subdirectories), the parent directory is also removed if empty after deletion. Canonical skills live in `~/.oh-my-skills/skills/` and are cleaned up automatically when `~/.oh-my-skills/` is removed. Commands live in `~/.oh-my-skills/commands/` and are recursively sourced via `~/.oh-my-skills/shell`.

### Source content (`src/`)

- `src/skills/` — Skill directories, each containing a `SKILL.md` with YAML frontmatter (`name`, `description`, `by: oh-my-skills`). At install time, the `SKILL.md` is copied as the canonical skill and LLM-specific wrappers are generated from its frontmatter.
- `src/commands/` — Shell scripts (`.sh`) defining aliases/functions. Two layouts are supported: flat (`commands/name.sh`) or nested (`commands/name/name.sh`). The nested layout allows co-locating tests and helper files alongside the command. Only `*.sh` files are copied to `~/.oh-my-skills/commands/` during installation; non-shell files (tests, READMEs, etc.) are excluded.

### Tests (`tests/`)

All tests run inside Alpine Docker containers via **testcontainers**. The real scripts are copied into each container using `docker cp`, a local git repo simulates the remote, and fake `claude`/`copilot` binaries are created for LLM detection.

Lifecycle script tests live in `tests/`:
- `helpers.ts` — `exec()` wrapper (uses `docker exec` directly since testcontainers' `.exec()` hangs in bun), `copyToContainer()`, shared constants
- `install.test.ts` — Runs real `install.sh` in container, verifies all artifacts
- `uninstall.test.ts` — Installs first, then runs real `uninstall.sh`, checks cleanup + preservation of foreign skills
- `update.test.ts` — Tests version comparison, no-op when up-to-date, cache lifecycle (write after manual check, fresh cache auto-check, stale cache triggers background fetch, background-fetch populates cache, cache invalidation after update), TTL override via `OMS_UPDATE_CACHE_TTL`, and update detection with new git tags

Command tests are co-located with their source in `src/commands/<name>/<name>.test.ts`:
- `src/commands/oms-cli/oms-cli.test.ts` — Tests the `oms` CLI command (help, update delegation, unknown subcommands)
- `src/commands/oms-git-diff/oms-git-diff.test.ts` — Tests the `oms-git-diff` command with a multi-branch git topology (feature branches, integration branches, staged/unstaged changes, edge cases)

### Key conventions

- Every skill MUST have `by: oh-my-skills` in its SKILL.md frontmatter — this marker is preserved in the canonical copy; uninstall identifies wrapper files by checking they reference `oh-my-skills/skills/`
- Skills MUST be cross-LLM compatible (Claude Code + GitHub Copilot): use only standard SKILL.md frontmatter fields (`name`, `description`, `by`); avoid Claude Code-specific fields (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `context`) unless they have a functional equivalent; never use Claude Code-only syntax like `!`command`` for dynamic context injection — instead, write explicit instructions telling the agent to run those commands
- `package.json` version is the release source of truth used by installer logic and tests
- Scripts use `jq` when available, with `sed`/`grep` fallbacks for systems without it
- Reinstall is expected to be idempotent and must not duplicate shell sourcing lines
- The shell bootstrap should stay quiet when auto-check finds no update; if the user declines an update, they can trigger it later with `oms update`


### Guidelines

- When a contribution is made, ensure claude.md are updated with any relevant information about new commands, architectural changes, or conventions, only updating the relevant sections and only if necessary

- If a critical behavior is added or changed, it should be reflected in the tests

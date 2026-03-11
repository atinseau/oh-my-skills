# Copilot instructions for `oh-my-skills`

## Build, test, and lint commands

```bash
# Install dependencies
bun install

# Type-check (used in pre-commit)
bun check-types

# Lint/format (used in pre-commit; writes fixes)
bun run check

# Validate bash script syntax
bash -n scripts/lib.sh && bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh

# Run all tests (Docker required)
TESTCONTAINERS_RYUK_DISABLED=true bun test

# Run one test file
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts
```

## High-level architecture

- The project is driven by a shared library and three bash lifecycle scripts in `scripts/`:
  - `lib.sh`: shared library sourced by all three scripts. Contains log helpers, `confirm()`, `detect_shell()`, `detect_llms()`, registry/skills/commands/shell functions. `create_shell_sourcing` and `inject_sourcing` accept a `mode` parameter (`"install"` or `"update"`) to adapt their log output without duplicating logic.
  - `install.sh`: clones/updates `~/.oh-my-skills`, then calls lib functions to install canonical skills + LLM wrappers, copy commands, create shell sourcing, and inject the `source` line into `.bashrc`/`.zshrc` in install context.
  - `uninstall.sh`: reads `~/.oh-my-skills/registry.json`, removes only tracked LLM wrapper files that reference `oh-my-skills/skills/` (ownership marker), cleans up empty parent directories (Claude wrappers use subdirectories), removes shell sourcing, and deletes `~/.oh-my-skills`. Accepts `--yes` / `-y` flag to skip the confirmation prompt (required for `curl | bash` usage since stdin is consumed by the script).
  - `update.sh`: supports three modes — `--manual` (synchronous network check with full UI), `--auto-check` (cache-first zero-latency check at shell startup), and `--background-fetch` (silent network fetch that only writes the cache). Uses a cache file (`~/.oh-my-skills/.update-cache`) with a configurable TTL (`OMS_UPDATE_CACHE_TTL`, default 24h) to avoid blocking shell startup with network calls. When the cache is stale or missing, `--auto-check` spawns a background `--background-fetch` process and returns immediately; the user sees the update notification on the *next* shell open once the cache is populated. Manual mode always does a synchronous fetch. After a successful update, the cache is invalidated so the next auto-check re-fetches cleanly. Asks for explicit confirmation when an update is available, then calls lib functions directly in update context (not `install.sh`) and prints commit titles since the previous release as the changelog.
- Skills follow a **single source of truth** pattern: canonical skills live in `~/.oh-my-skills/skills/<name>.md` (copied from `src/skills/<name>/SKILL.md`), and lightweight LLM-specific wrappers (2–8 lines) are generated in each tool's native location (`~/.claude/skills/<name>/SKILL.md`, `~/.copilot/skills/<name>.prompt.md`). Wrappers contain zero logic — they only redirect to the canonical skill.
- `registry.json` in the install directory is the runtime state: installed version and LLM wrapper file paths per CLI.
- `~/.oh-my-skills/shell` is the integration point for commands: in interactive shells it runs the auto-update check, then recursively sources every `*.sh` file under `~/.oh-my-skills/commands`.
- Tests execute the real bash scripts inside Alpine containers using `testcontainers`; each suite builds a fake remote git repo and validates real filesystem effects. Lifecycle script tests live in `tests/*.test.ts`; command tests are co-located with their source in `src/commands/<name>/<name>.test.ts`.

## Key conventions

- Skill ownership marker is required: every managed skill `SKILL.md` must include `by: oh-my-skills`; uninstall identifies wrapper files by checking they reference `oh-my-skills/skills/` to avoid deleting foreign skills.
- Skills must be cross-LLM compatible (Claude Code + GitHub Copilot): use only standard SKILL.md frontmatter fields (`name`, `description`, `by`); avoid LLM-specific fields or syntax — in particular, never use Claude Code's `!`command`` dynamic injection syntax; instead, write explicit instructions telling the agent to run those commands itself.
- `package.json` version is the release source of truth consumed by installer logic and tests.
- Bash scripts prefer `jq` for JSON updates/parsing, with `grep`/`sed` fallback paths when `jq` is unavailable.
- Shell config should contain only one `oh-my-skills` source line; reinstall is expected to be idempotent and not duplicate sourcing.
- Commands support two layouts under `src/commands/`: flat (`command-name.sh`) or nested (`command-name/command-name.sh`). The nested layout allows co-locating tests and helper scripts alongside the command. Only `*.sh` files are copied to `~/.oh-my-skills/commands/` during installation; non-shell files (tests, READMEs, etc.) are excluded. The shell bootstrap sources all `*.sh` files recursively.


## Guidelines

- When a contribution is made, ensure copilot-instructions.md and claude.md are updated with any relevant information about new commands, architectural changes, or conventions, only updating the relevant sections and only if necessary.

- If a critical behavior is added or changed, it should be reflected in the tests

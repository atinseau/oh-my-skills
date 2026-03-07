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
bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh

# Run all tests (Docker required)
TESTCONTAINERS_RYUK_DISABLED=true bun test

# Run one test file
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts
```

## High-level architecture

- The project is driven by three bash lifecycle scripts in `scripts/`:
  - `install.sh`: clones/updates into `~/.oh-my-skills`, installs skills into detected CLI locations (`~/.claude/skills`, `~/.copilot/skills`), copies command scripts into `~/.oh-my-skills/commands`, generates `~/.oh-my-skills/shell`, and injects one `source` line into the user shell config.
  - `uninstall.sh`: reads `~/.oh-my-skills/registry.json`, removes only tracked skills that carry the expected marker, removes shell sourcing, and deletes `~/.oh-my-skills`.
  - `update.sh`: supports manual mode and shell-startup auto-check mode; it compares installed version vs remote git tags, asks for explicit confirmation with a reason when an update is available, then re-runs install and prints commit titles since the previous release as the changelog.
- `registry.json` in the install directory is the runtime state: installed version and copied skill paths per CLI.
- `~/.oh-my-skills/shell` is the integration point for commands: in interactive shells it runs the auto-update check, then recursively sources every `*.sh` file under `~/.oh-my-skills/commands`.
- Tests (`tests/*.test.ts`) execute the real bash scripts inside Alpine containers using `testcontainers`; each suite builds a fake remote git repo and validates real filesystem effects.

## Key conventions

- Skill ownership marker is required: every managed skill `SKILL.md` must include `by: oh-my-skills`; uninstall uses this marker to avoid deleting foreign skills.
- `package.json` version is the release source of truth consumed by installer logic and tests.
- Bash scripts prefer `jq` for JSON updates/parsing, with `grep`/`sed` fallback paths when `jq` is unavailable.
- Shell config should contain only one `oh-my-skills` source line; reinstall is expected to be idempotent and not duplicate sourcing.
- Commands may live in nested folders under `src/commands/`; installation copies the tree and shell bootstrap sources them recursively.


## Guidelines

- When a contribution is made, ensure copilot-instructions.md and claude.md are updated with any relevant information about new commands, architectural changes, or conventions, only updating the relevant sections and only if necessary.

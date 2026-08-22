# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

oh-my-skills is the "oh-my-zsh" of AI agents — a community ecosystem for sharing and installing LLM skills (Claude, Copilot) and shell commands. One-liner install: clones the repo to `~/.oh-my-skills`, copies skills to the right LLM directories, and sources commands into the user's shell.

## Commands

```bash
# Install dependencies
bun install

# Type-check (used in pre-commit)
bun check-types

# Lint/format (used in pre-commit; writes fixes)
bun run check

# Validate bash script syntax (all lifecycle scripts)
bash -n scripts/lib.sh && bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh && bash -n scripts/hooks.sh

# Run all tests (requires Docker running)
# `bun run test` (not `bun test`) — pretest builds the shared image first
TESTCONTAINERS_RYUK_DISABLED=true bun run test

# Run a single test file
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts

# Re-record per-file durations after adding or reshaping a test file
TESTCONTAINERS_RYUK_DISABLED=true bun run test:timings
```

## Architecture

### Scripts (`scripts/`)

4 lifecycle scripts: `install.sh`, `uninstall.sh`, `update.sh` + `lib.sh` (shared library). All scripts source `lib.sh`.

### Skill installation pattern — Single Source, Multiple Consumers

Skills follow a **single source of truth** pattern to avoid drift across LLM tools:

1. **Canonical skill** — `~/.oh-my-skills/skills/<name>/` directory (copied from `src/skills/<name>/`). Entry point is always `SKILL.md`; skills may include subdirectories (e.g. `references/`).
2. **LLM links/wrappers** — Point to the canonical skill:
   - **Claude**: `~/.claude/skills/<name>` — **symlink** to the canonical skill directory. Claude reads the SKILL.md directly through the symlink.
   - **Copilot**: `~/.copilot/skills/<name>.prompt.md` — wrapper file with YAML frontmatter (`mode`, `description`) + a link to the canonical skill (symlink not possible due to required frontmatter).
3. **Adding a new LLM** — Prefer symlinks when the tool reads SKILL.md natively. Use a wrapper only when the tool requires a specific format (e.g. Copilot frontmatter).

### Registry (`~/.oh-my-skills/registry.json`)

Tracks installed **LLM skill paths** (symlinks and wrappers). Used by `install_skills` for clean reinstall (read → remove old → reset → install fresh) and by `uninstall.sh` for removal. Example: `{"version":"0.1.0","skills":{"claude":["/root/.claude/skills/git-pr-flow/SKILL.md"],"copilot":[...]}}`

### Hooks (`src/hooks/`)

Claude Code hooks follow the same single-source-of-truth pattern as skills: each hook is a directory under `src/hooks/<name>/` with a `hook.json` (event, matcher, timeout) and a `hook.sh` entrypoint. `install.sh`/`update.sh` always copy these to `~/.oh-my-skills/hooks/<name>/` — harmless, like skills/commands. Registering a hook into `~/.claude/settings.json` is a **separate, explicit, opt-in** step via `oms hooks enable <name>` (see `scripts/hooks.sh`), never done automatically. `oms hooks enable`/`disable` require `jq` — safely merging into a shared config file the user didn't create is not attempted with sed/grep. `uninstall.sh` disables every enabled hook before removing the install directory.

### Source content (`src/`)

- `src/skills/` — Skill directories, each containing a `SKILL.md` with YAML frontmatter and optional subdirectories.
- `src/commands/` — Shell scripts (`.sh`) defining aliases/functions.
- `src/hooks/` — Hook directories, each containing a `hook.json` (event/matcher/timeout) and a `hook.sh` entrypoint.

### Tests (`tests/`)

Integration tests in Alpine Docker containers via testcontainers. Lifecycle scripts tested end-to-end, commands tested with co-located unit tests.

## Contributing: Writing a Skill

**Required structure:**
```
src/skills/<name>/
├── SKILL.md          # Entry point (required)
├── references/       # Optional — long-form docs referenced by SKILL.md
├── templates/        # Optional — reusable content templates (e.g. memory files, session logs)
└── scripts/          # Optional — executable helpers the agent runs (portable sh + jq, e.g. ultraplan's audit.sh)
```

Optional subdirectories are not prescribed; skills may also use `profiles/`, `flows/`, etc. if warranted. Keep SKILL.md as the single entry point: references and templates are loaded only when SKILL.md instructs the agent to.

**Required frontmatter in SKILL.md:**
```yaml
---
name: <skill-name>
description: <one-line description>
by: oh-my-skills
---
```

**Rules:**
- `by: oh-my-skills` is required — ownership marker used by uninstall
- Cross-LLM compatible: only standard frontmatter fields (`name`, `description`, `by`). No Claude Code-specific fields (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `context`)
- No Claude Code-only syntax like `` !`command` `` — write explicit instructions for the agent to run commands
- Skill prose is not unit tested — quality relies on SKILL.md content
- Executable helpers under `scripts/` **are** tested: co-located `<name>.test.ts`, same Docker infra as commands and hooks. A guard that silently matches nothing reads as "invariant holds" — that is precisely what the tests exist to catch
- Co-located tests stay in the repo: `install_skills` copies every subdirectory file except `*.test.ts` / `*.test.js`, and marks `*.sh` executable. A skill's `scripts/` sits beside SKILL.md, so anything installed there is content the agent reads
- A skill's scripts live beside SKILL.md, not in the user's project. SKILL.md must say how to resolve that directory; ultraplan vendors them into the plan directory at emit time so nothing downstream re-resolves it

## Contributing: Writing a Command

**Two supported layouts:**
```
# Flat (simple command)
src/commands/my-cmd.sh

# Nested (command + co-located tests)
src/commands/my-cmd/
├── my-cmd.sh
├── my-cmd.test.ts
└── ...
```

**Rules:**
- Only `*.sh` files are copied at install — non-shell files (tests, README) stay in repo
- Use nested layout when a command has tests
- Commands define shell aliases/functions sourced via `~/.oh-my-skills/shell`
- Commands are sourced into the **user's** shell, which is usually zsh — write bash/zsh-portable code and test both. Bash-only constructs can fail silently rather than error: `BASH_REMATCH` is empty in zsh unless `setopt BASH_REMATCH`, and an unmatched glob aborts the command in zsh instead of expanding to itself

## Contributing: Writing a Hook

**Required structure:**
```
src/hooks/<name>/
├── hook.json      # {"event": "<ClaudeCodeEventName>", "matcher": "*", "timeout": 10}
├── hook.sh        # Entrypoint — reads Claude Code's stdin JSON, writes stdout JSON
└── hook.test.ts   # Co-located tests, same pattern as command tests
```

**Rules:**
- One `event` per hook directory in v1 — a hook needing multiple events ships as multiple directories sharing a script
- `hook.sh` must be portable between macOS and Alpine Linux (the test environment) — use `jq` for JSON parsing, not `tac`/`tail -r` or other GNU/BSD-specific tools
- Fail silently (`exit 0`, no output) on any missing/unexpected input rather than blocking the user's prompt — a hook's job is to nudge, never to break the session
- `jq` is required for a hook to be enabled/disabled by `oms hooks` — this is enforced by `hook_enable`/`hook_disable` in `lib.sh`, not something individual hooks need to check themselves
- Test hooks the same way as commands: co-located `hook.test.ts`, testcontainers/Alpine, feeding realistic stdin JSON and asserting on stdout/exit code

## Contributing: Writing Tests

**What is tested and how:**

| What | Where | How |
|---|---|---|
| Lifecycle scripts (install, uninstall, update) | `tests/*.test.ts` | End-to-end integration in Alpine Docker containers |
| Shell commands | `src/commands/<name>/<name>.test.ts` | Co-located tests, same Docker infra |
| Hook scripts | `src/hooks/<name>/hook.test.ts` | Co-located tests, same Docker infra |
| Skill prose (SKILL.md, references, templates) | Not tested | Quality relies on SKILL.md content |
| Skill scripts | `src/skills/<name>/scripts/<name>.test.ts` | Co-located tests, same Docker infra |

**Test infrastructure:**
- All tests run in Alpine containers via **testcontainers** (Docker required)
- Containers start from `oh-my-skills-test:latest`, built from `tests/Dockerfile` with every package the suite needs. Never `apk add` in a `beforeAll` — add the package to the Dockerfile instead
- `helpers.ts` provides `startContainer()`, `exec()` and `copyToContainer()`. All three are **async — always `await` them**; a missing `await` silently reorders container state
- `exec()` and `copyToContainer()` take the `StartedTestContainer`, not its id, and use testcontainers' native APIs (`container.exec()`, ~13ms vs ~34ms for spawning the `docker` CLI). The native call hung under Bun before 1.4
- `exec().output` is **stdout only** — redirect with `2>&1` when a test needs stderr
- Local git repo simulates the remote
- Fake `claude`/`copilot` binaries created for LLM detection

**Test suite performance:**
- The suite runs with `--parallel --timings=tests/timings.json` (one worker process per file). Re-record `tests/timings.json` with `bun run test:timings` when durations shift materially — the file is written slowest-first, so it doubles as the slow-file report
- **Never use `bun test --changed`.** It resolves the JS/TS import graph, but the suite's real inputs are the shell scripts it copies into containers, so a change to `scripts/*.sh` selects zero test files and the run goes green without testing anything
- Tests inside one file share a container and mutate its state — do not make them `--concurrent`
- Prefer bounded polling over fixed `sleep`s in container-side scripts, and keep the budget tight: a poll that never converges burns it in full on every run

**Pattern for a new command test:**
- Create `src/commands/<name>/<name>.test.ts`
- Follow existing test patterns: setup container, copy scripts, execute, assert on stdout/files

## Contributing: Lifecycle Script Tests

**Coverage by file:**
- `install.test.ts` — Runs real `install.sh` in container, verifies all produced artifacts (canonical skills, LLM wrappers, registry, shell sourcing)
- `uninstall.test.ts` — Installs first, then runs `uninstall.sh`, verifies complete cleanup + preservation of foreign (non-oh-my-skills) skills
- `update.test.ts` — Version comparison, no-op when up-to-date, cache lifecycle (write, read, invalidation, TTL), update detection via git tags
- `lib.test.ts` — Unit tests for shared library functions
- `hooks.test.ts` — End-to-end `install_hooks`, `hook_enable`, `hook_disable`, `disable_all_hooks` lifecycle; verifies hooks are copied, registered, disabled on uninstall
- `hooks-cli.test.ts` — End-to-end `oms hooks list/status/enable/disable` CLI commands; verifies settings.json merging and registry tracking

**When to write/modify these tests:**
- Any behavior change in lifecycle scripts must be reflected in tests
- New script or function in `lib.sh` → add tests in `lib.test.ts`
- Change to install/uninstall/update flow → update corresponding test file

## Release Workflow

- **Source of truth:** version in `package.json`
- Release triggered by pushing a `v*` tag — `release.yml` bumps `package.json`, creates GitHub Release, restores canary installer mode (`DEFAULT_TAG` mechanism)
- Installer and tests use `package.json` version
- `update.sh` compares git tags to detect new versions, displays commit titles as changelog
- **GitHub workflows (`.github/workflows/`):** `pr-checks.yml` (PR checks), `release.yml` (release publishing)

## Update Resilience

The updater replaces the code it is running from, so the second half of an update must not use the first half's definitions:

- `update.sh` re-sources `lib.sh` after the pull and re-enters itself as `update.sh --apply` (an internal mode) when the pulled updater advertises it. A change to the install path therefore takes effect in the release that ships it, not the one after. Updating from a version predating the handover degrades to re-sourcing the library.
- `clean_dev_files` prunes `src/`, `tests/` and `package.json` after every run, and HEAD sits detached on a release tag. Anything that reads from `src/` must restore the checkout first (`git checkout -- .` then an explicit `git checkout <ref>`) — `git pull` has no upstream to follow and restores nothing.
- Test a change to the install path by patching `lib.sh` **and** `update.sh` in the fixture remote and asserting each leaves a marker (see `tests/update.test.ts`). Markers must live outside `INSTALL_DIR`, which `clean_dev_files` prunes to its whitelist.

## Conventions

- Scripts use `jq` when available, with `sed`/`grep` fallbacks for systems without it
- Reinstall must be idempotent — no duplicated shell sourcing lines
- Shell bootstrap stays quiet when auto-check finds no update; if the user declines an update, they can trigger it later with `oms update`
- Pre-commit hooks managed by **lefthook** (`lefthook.yml`) — runs type-check, biome lint/format, bash syntax validation, and tests
- When contributing, update CLAUDE.md if relevant (affected sections only)
- Any critical behavior change must be reflected in tests

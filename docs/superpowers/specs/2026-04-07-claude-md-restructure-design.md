# CLAUDE.md Restructure — Design Spec

## Goal

Rewrite the CLAUDE.md to clearly communicate the project's vision, provide actionable contribution guides, and reduce architecture verbosity. The file must serve both new open-source contributors and core maintainers while staying concise enough for Claude Code to load fully in context.

## Approach

Restructure as a single dense CLAUDE.md (approach C). Trim implementation details from the architecture section to make room for new contribution guides. Every section uses bullet points, code examples, and tables — no prose.

## Structure

### 1. Vision & Objective (new)

oh-my-skills is the "oh-my-zsh" of AI agents — a community ecosystem for sharing and installing LLM skills (Claude, Copilot) and shell commands. One-liner install: clones repo to `~/.oh-my-skills`, copies skills to the right LLM directories, sources commands into the user's shell.

### 2. Commands (unchanged)

Keep the existing quick reference block as-is:
- `bun install`, `bun check-types`, `bun run check`
- `bash -n` syntax validation for all lifecycle scripts
- `TESTCONTAINERS_RYUK_DISABLED=true bun test` for running tests

### 3. Architecture (trimmed)

Replace detailed per-function/per-mode descriptions with a structural overview:

- **Scripts (`scripts/`)** — 4 lifecycle scripts: `install.sh`, `uninstall.sh`, `update.sh` + `lib.sh` (shared library). All scripts source `lib.sh`.
- **Skill installation pattern** — Single source of truth: canonical skill in `~/.oh-my-skills/skills/<name>/` (copied from `src/skills/<name>/`), LLM wrappers in `~/.claude/skills/` and `~/.copilot/skills/` redirect to canonical. Adding a new LLM = new wrapper format, zero logic duplication.
- **Registry (`~/.oh-my-skills/registry.json`)** — Tracks installed LLM wrapper paths. Uninstall verifies ownership before deletion. Example: `{"version":"0.1.0","skills":{"claude":["/root/.claude/skills/git-pr-flow/SKILL.md"],"copilot":[...]}}`
- **Source content (`src/`)** — `src/skills/` for skills, `src/commands/` for shell commands.
- **Tests (`tests/`)** — Integration tests in Alpine Docker containers via testcontainers. Lifecycle scripts tested end-to-end, commands tested with co-located unit tests.

**Removed from current version:**
- Listing of all `lib.sh` functions
- Detailed description of `update.sh` 3 modes (manual, auto-check, background-fetch)
- Implementation details of registry JSON format
- Description of `helpers.ts` internals

### 4. Contributing: Writing a Skill

**Required structure:**
```
src/skills/<name>/
├── SKILL.md          # Entry point (required)
└── references/       # Optional subdirectory referenced by SKILL.md
```

**Required frontmatter:**
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
- Skills are not unit tested — quality relies on SKILL.md content

### 5. Contributing: Writing a Command

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

### 6. Contributing: Writing Tests

**What is tested and how:**

| What | Where | How |
|---|---|---|
| Lifecycle scripts (install, uninstall, update) | `tests/*.test.ts` | End-to-end integration in Alpine Docker containers |
| Shell commands | `src/commands/<name>/<name>.test.ts` | Co-located tests, same Docker infra |
| Skills | Not tested | Quality relies on SKILL.md content |

**Test infrastructure:**
- All tests run in Alpine containers via **testcontainers** (Docker required)
- Real scripts copied into container via `docker cp`
- Local git repo simulates the remote
- Fake `claude`/`copilot` binaries created for LLM detection
- `helpers.ts` provides `exec()` (wrapper around `docker exec` — testcontainers native `.exec()` hangs in bun) and `copyToContainer()`

**Pattern for a new command test:**
- Create `src/commands/<name>/<name>.test.ts`
- Follow existing test patterns: setup container, copy scripts, execute, assert on stdout/files

### 7. Contributing: Lifecycle Script Tests

**Coverage by file:**
- `install.test.ts` — Runs real `install.sh` in container, verifies all produced artifacts (canonical skills, LLM wrappers, registry, shell sourcing)
- `uninstall.test.ts` — Installs first, then runs `uninstall.sh`, verifies complete cleanup + preservation of foreign (non-oh-my-skills) skills
- `update.test.ts` — Version comparison, no-op when up-to-date, cache lifecycle (write, read, invalidation, TTL), update detection via git tags
- `lib.test.ts` — Unit tests for shared library functions

**When to write/modify these tests:**
- Any behavior change in lifecycle scripts must be reflected in tests
- New script or function in `lib.sh` → add tests in `lib.test.ts`
- Change to install/uninstall/update flow → update corresponding test file

### 8. Release Workflow

- **Source of truth:** version in `package.json`
- Release triggered by pushing a `v*` tag — `release.yml` bumps `package.json`, creates GitHub Release, restores canary installer mode (`DEFAULT_TAG` mechanism)
- Installer and tests use `package.json` version
- `update.sh` compares git tags to detect new versions, displays commit titles as changelog
- **GitHub workflows (`.github/workflows/`):** `pr-checks.yml` (PR checks), `release.yml` (release publishing)

### 9. Conventions

- Scripts use `jq` when available, with `sed`/`grep` fallbacks
- Reinstall must be idempotent — no duplicated shell sourcing lines
- Shell bootstrap stays quiet when auto-check finds no update; if the user declines an update, they can trigger it later with `oms update`
- Pre-commit hooks managed by **lefthook** (`lefthook.yml`) — runs type-check, biome lint/format, bash syntax validation, and tests
- When contributing, update CLAUDE.md if relevant (affected sections only)
- Any critical behavior change must be reflected in tests

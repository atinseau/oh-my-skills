# CLAUDE.md Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite CLAUDE.md to communicate project vision, provide contribution guides, and trim architecture verbosity.

**Architecture:** Single-file rewrite. Replace the current CLAUDE.md with 9 restructured sections per the spec at `docs/superpowers/specs/2026-04-07-claude-md-restructure-design.md`.

**Tech Stack:** Markdown

---

## File Structure

- Modify: `CLAUDE.md` — complete rewrite with new 9-section structure

---

### Task 1: Rewrite CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (full replacement)
- Reference: `docs/superpowers/specs/2026-04-07-claude-md-restructure-design.md` (the spec)

- [ ] **Step 1: Replace CLAUDE.md content**

Rewrite the entire file with the following structure and content. Each section must match the spec exactly.

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

oh-my-skills is the "oh-my-zsh" of AI agents — a community ecosystem for sharing and installing LLM skills (Claude, Copilot) and shell commands. One-liner install: clones the repo to `~/.oh-my-skills`, copies skills to the right LLM directories, and sources commands into the user's shell.

## Commands

\`\`\`bash
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
\`\`\`

## Architecture

### Scripts (`scripts/`)

4 lifecycle scripts: `install.sh`, `uninstall.sh`, `update.sh` + `lib.sh` (shared library). All scripts source `lib.sh`.

### Skill installation pattern — Single Source, Multiple Consumers

Skills follow a **single source of truth** pattern to avoid drift across LLM tools:

1. **Canonical skill** — `~/.oh-my-skills/skills/<name>/` directory (copied from `src/skills/<name>/`). Entry point is always `SKILL.md`; skills may include subdirectories (e.g. `references/`).
2. **LLM wrappers** — Lightweight files (2–8 lines) that redirect to the canonical skill:
   - **Claude**: `~/.claude/skills/<name>/SKILL.md` — contains `Follow the instructions in <canonical-path>` + `$ARGUMENTS`
   - **Copilot**: `~/.copilot/skills/<name>.prompt.md` — contains YAML frontmatter (`mode`, `description`) + a link to the canonical skill
3. **Adding a new LLM** — Create a wrapper in the tool's native format pointing to the canonical skill. Zero logic duplication.

### Registry (`~/.oh-my-skills/registry.json`)

Tracks installed **LLM wrapper file** paths. Uninstall verifies ownership by checking that each wrapper references `oh-my-skills/skills/` before deleting it. Example: `{"version":"0.1.0","skills":{"claude":["/root/.claude/skills/git-pr-flow/SKILL.md"],"copilot":[...]}}`

### Source content (`src/`)

- `src/skills/` — Skill directories, each containing a `SKILL.md` with YAML frontmatter and optional subdirectories.
- `src/commands/` — Shell scripts (`.sh`) defining aliases/functions.

### Tests (`tests/`)

Integration tests in Alpine Docker containers via testcontainers. Lifecycle scripts tested end-to-end, commands tested with co-located unit tests.

## Contributing: Writing a Skill

**Required structure:**
\`\`\`
src/skills/<name>/
├── SKILL.md          # Entry point (required)
└── references/       # Optional subdirectory referenced by SKILL.md
\`\`\`

**Required frontmatter in SKILL.md:**
\`\`\`yaml
---
name: <skill-name>
description: <one-line description>
by: oh-my-skills
---
\`\`\`

**Rules:**
- `by: oh-my-skills` is required — ownership marker used by uninstall
- Cross-LLM compatible: only standard frontmatter fields (`name`, `description`, `by`). No Claude Code-specific fields (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `context`)
- No Claude Code-only syntax like `` !`command` `` — write explicit instructions for the agent to run commands
- Skills are not unit tested — quality relies on SKILL.md content

## Contributing: Writing a Command

**Two supported layouts:**
\`\`\`
# Flat (simple command)
src/commands/my-cmd.sh

# Nested (command + co-located tests)
src/commands/my-cmd/
├── my-cmd.sh
├── my-cmd.test.ts
└── ...
\`\`\`

**Rules:**
- Only `*.sh` files are copied at install — non-shell files (tests, README) stay in repo
- Use nested layout when a command has tests
- Commands define shell aliases/functions sourced via `~/.oh-my-skills/shell`

## Contributing: Writing Tests

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

## Contributing: Lifecycle Script Tests

**Coverage by file:**
- `install.test.ts` — Runs real `install.sh` in container, verifies all produced artifacts (canonical skills, LLM wrappers, registry, shell sourcing)
- `uninstall.test.ts` — Installs first, then runs `uninstall.sh`, verifies complete cleanup + preservation of foreign (non-oh-my-skills) skills
- `update.test.ts` — Version comparison, no-op when up-to-date, cache lifecycle (write, read, invalidation, TTL), update detection via git tags
- `lib.test.ts` — Unit tests for shared library functions

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

## Conventions

- Scripts use `jq` when available, with `sed`/`grep` fallbacks for systems without it
- Reinstall must be idempotent — no duplicated shell sourcing lines
- Shell bootstrap stays quiet when auto-check finds no update; if the user declines an update, they can trigger it later with `oms update`
- Pre-commit hooks managed by **lefthook** (`lefthook.yml`) — runs type-check, biome lint/format, bash syntax validation, and tests
- When contributing, update CLAUDE.md if relevant (affected sections only)
- Any critical behavior change must be reflected in tests
```

- [ ] **Step 2: Verify the file renders correctly**

Read the file back and check:
- All 9 sections present: Project Overview, Commands, Architecture, Writing a Skill, Writing a Command, Writing Tests, Lifecycle Script Tests, Release Workflow, Conventions
- Code blocks are properly fenced
- Table renders correctly
- No broken markdown

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: restructure CLAUDE.md with vision, contribution guides, and trimmed architecture"
```

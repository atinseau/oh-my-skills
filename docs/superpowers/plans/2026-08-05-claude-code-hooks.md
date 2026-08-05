# Claude Code Hooks Infrastructure + `handoff` Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a generic, reusable `src/hooks/` artifact type for oh-my-skills (mirroring `src/skills/` and `src/commands/`), plus its first consumer: a `handoff` hook that watches context usage on `UserPromptSubmit` and nudges Claude to suggest `/handoff` once usage crosses a threshold.

**Architecture:** Canonical hook files are always copied to `~/.oh-my-skills/hooks/<name>/` on install/update (harmless, like skills/commands). Registering a hook into `~/.claude/settings.json` is a separate, explicit, opt-in step via a new `oms hooks enable|disable|list|status` command, implemented with `jq`-only JSON merge/remove primitives in `lib.sh` for safety (never hand-rolled text surgery on a file Claude Code depends on globally).

**Tech Stack:** Bash (lib.sh functions + thin CLI scripts), `jq` (required for hook enable/disable), Bun + testcontainers (Alpine) for tests, matching the existing lifecycle-script test infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-05-claude-code-hooks-design.md`

## Global Constraints

- `oms hooks enable`/`disable` **require `jq`** — if absent, abort cleanly with an actionable error, never attempt sed/grep JSON surgery on `~/.claude/settings.json`. This is a deliberate exception to the project's usual jq-with-fallback convention.
- Registering hooks into `~/.claude/settings.json` only ever happens via the explicit `oms hooks enable <name>` command — never automatically during `curl | bash` install or `oms update`.
- Copying canonical hook files to `~/.oh-my-skills/hooks/<name>/` always happens during install/update (harmless, no external file touched), exactly like skills and commands.
- Hooks are global-scope (`~/.claude/settings.json`), not project-scoped.
- `settings.json` writes are atomic: build the new content, write to a temp file, then `mv` over the original. Never write directly to the target file.
- Settings merges only ever touch entries whose `command` points at `~/.oh-my-skills/hooks/...` — hooks the user configured themselves for the same event must survive untouched.
- No GNU/BSD-specific text tools (`tac`, `tail -r`) in `hook.sh` scripts — the project's tests run on Alpine Linux and the primary dev machine is macOS. Use `jq` for all transcript parsing.
- `scripts/hooks.sh` does **not** need the curl-bootstrap `load_lib` duplication that `install.sh`/`uninstall.sh`/`update.sh` carry — it's only ever invoked post-install via `oms hooks ...`, where `lib.sh` is always present beside it. Do not add it to `release.yml`'s `DEFAULT_TAG` patch loop.
- `hook.json` v1 schema supports exactly one `event` per hook directory (no arrays of events) — YAGNI until a real second hook needs otherwise.

---

### Task 1: `install_hooks()` — canonical hook file copying

**Files:**
- Modify: `scripts/lib.sh` (add `HOOKS_DIR` config near line 9-12, add `install_hooks()` function, extend `clean_dev_files()` whitelist at line ~264)
- Test: `tests/lib.test.ts` (new `describe("install_hooks()", ...)` block, plus a fixture hook added to the shared container setup)

**Interfaces:**
- Produces: `HOOKS_DIR` (`"$INSTALL_DIR/hooks"`, string constant, same pattern as `SKILLS_DIR`/`COMMANDS_DIR`), `install_hooks()` (no args, copies `$INSTALL_DIR/src/hooks/*/` → `$HOOKS_DIR/*/`, copying only `hook.json` and `hook.sh` if present, `chmod +x` on `hook.sh`).

- [ ] **Step 1: Write the failing tests**

Add a fixture hook to the shared container setup in `tests/lib.test.ts`, right after the existing `src/commands` fixture block (after line 65, before the "Fake LLM binaries" comment):

```ts
		// src/hooks (with a hook.test.ts that should NOT be copied)
		exec(id, `mkdir -p ${INSTALL}/src/hooks/sample-hook`);
		exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > ${INSTALL}/src/hooks/sample-hook/hook.json`,
		);
		exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > ${INSTALL}/src/hooks/sample-hook/hook.sh`,
		);
		exec(
			id,
			`printf 'import { test } from "bun:test";\n' > ${INSTALL}/src/hooks/sample-hook/hook.test.ts`,
		);
```

Add a new `describe` block at the end of the top-level `describe("lib.sh unit tests", ...)` body (after the `create_shell_sourcing()`/`inject_sourcing()` blocks — check the current end of the file first with Read to append correctly, don't guess the line number):

```ts
	// ─── install_hooks() ──────────────────────────────────────────────────────

	describe("install_hooks()", () => {
		it("copies canonical hook.json and hook.sh to ~/.oh-my-skills/hooks/", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			lib(id, `install_hooks`);

			const meta = exec(
				id,
				`test -f ${INSTALL}/hooks/sample-hook/hook.json && echo ok`,
			);
			expect(meta.output).toBe("ok");

			const script = exec(
				id,
				`test -f ${INSTALL}/hooks/sample-hook/hook.sh && echo ok`,
			);
			expect(script.output).toBe("ok");

			const content = exec(id, `cat ${INSTALL}/hooks/sample-hook/hook.json`);
			expect(content.output).toContain("UserPromptSubmit");
		});

		it("makes hook.sh executable", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			lib(id, `install_hooks`);
			const r = exec(id, `test -x ${INSTALL}/hooks/sample-hook/hook.sh && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("excludes non hook.json/hook.sh files from installation", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			lib(id, `install_hooks`);
			const r = exec(
				id,
				`test -f ${INSTALL}/hooks/sample-hook/hook.test.ts && echo found || echo absent`,
			);
			expect(r.output).toBe("absent");
		});

		it("skips hook directories without hook.json", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			exec(id, `mkdir -p ${INSTALL}/src/hooks/incomplete-hook`);
			exec(id, `printf 'echo nope' > ${INSTALL}/src/hooks/incomplete-hook/hook.sh`);

			lib(id, `install_hooks`);
			const r = exec(
				id,
				`test -d ${INSTALL}/hooks/incomplete-hook && echo found || echo absent`,
			);
			expect(r.output).toBe("absent");

			exec(id, `rm -rf ${INSTALL}/src/hooks/incomplete-hook`);
		});

		it("preserves existing unrelated files under HOOKS_DIR (e.g. .state/)", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			exec(id, `mkdir -p ${INSTALL}/hooks/.state`);
			exec(id, `printf 'marker' > ${INSTALL}/hooks/.state/handoff-nudged-xyz`);

			lib(id, `install_hooks`);

			const r = exec(
				id,
				`test -f ${INSTALL}/hooks/.state/handoff-nudged-xyz && echo ok`,
			);
			expect(r.output).toBe("ok");
		});

		it("does nothing when no src/hooks directory exists", () => {
			exec(id, `mv ${INSTALL}/src/hooks ${INSTALL}/src/hooks.bak`);
			const r = lib(id, `install_hooks`);
			expect(r.exitCode).toBe(0);
			exec(id, `mv ${INSTALL}/src/hooks.bak ${INSTALL}/src/hooks`);
		});
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: FAIL — `install_hooks: command not found` (function doesn't exist yet)

- [ ] **Step 3: Implement `install_hooks()` in `scripts/lib.sh`**

Add `HOOKS_DIR` beside the other directory constants (after line 12, `COMMANDS_DIR="$INSTALL_DIR/commands"`):

```bash
HOOKS_DIR="$INSTALL_DIR/hooks"
```

Add `install_hooks()` right after `install_commands()` (after its closing brace, before the `create_shell_sourcing` comment block):

```bash
install_hooks() {
    local src_hooks_dir="$INSTALL_DIR/src/hooks"

    if [[ ! -d "$src_hooks_dir" ]]; then
        log_warning "No hooks directory found in repository"
        return 0
    fi

    mkdir -p "$HOOKS_DIR"

    for hook_dir in "$src_hooks_dir"/*/; do
        if [[ ! -d "$hook_dir" ]]; then continue; fi
        if [[ ! -f "$hook_dir/hook.json" ]]; then continue; fi

        local hook_name
        hook_name=$(basename "$hook_dir")
        local dest="$HOOKS_DIR/$hook_name"
        mkdir -p "$dest"
        cp "$hook_dir/hook.json" "$dest/hook.json"
        if [[ -f "$hook_dir/hook.sh" ]]; then
            cp "$hook_dir/hook.sh" "$dest/hook.sh"
            chmod +x "$dest/hook.sh"
        fi
        log_success "Installed canonical hook '${CYAN}$hook_name${NC}'"
    done
}
```

Note this deliberately does **not** `rm -rf "$HOOKS_DIR"` first (unlike `install_skills`'s clean-slate approach) — that would wipe `hooks/.state/` (the `handoff` hook's anti-spam markers) on every install/update. Cleaning up canonical dirs for hooks removed from the repo is out of scope for v1 (see spec's "Open items").

Extend the `clean_dev_files()` whitelist (the `case "$base" in` block, currently `.|..|.git|scripts|skills|commands|shell|registry.json|.update-cache)`) to also preserve `hooks`:

```bash
            .|..|.git|scripts|skills|commands|hooks|shell|registry.json|.update-cache)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: PASS (all `install_hooks()` tests, plus all pre-existing tests still green)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib.sh tests/lib.test.ts
git commit -m "feat(hooks): add install_hooks() canonical copy step"
```

---

### Task 2: Registry tracking for enabled hooks

**Files:**
- Modify: `scripts/lib.sh` (`init_registry()`, `registry_write_skills()`, add `registry_read_enabled_hooks()`, `registry_add_enabled_hook()`, `registry_remove_enabled_hook()`)
- Test: `tests/lib.test.ts` (extend `init_registry()` describe block, add new `describe("hooks registry", ...)`)

**Interfaces:**
- Consumes: `REGISTRY_FILE` (existing constant), `get_version()` (existing).
- Produces: `registry_read_enabled_hooks()` (no args, prints one hook name per line from `registry.json`'s `.hooks.enabled`), `registry_add_enabled_hook(name)` (idempotent), `registry_remove_enabled_hook(name)`. Also: `registry_write_skills()` now preserves any existing `.hooks` key instead of dropping it.

- [ ] **Step 1: Write the failing tests**

Extend the existing `init_registry()` describe block in `tests/lib.test.ts` (find it at the `// ─── init_registry() ───` comment) by adding one more `it`:

```ts
		it("initializes registry.json with an empty hooks.enabled list", () => {
			lib(id, `init_registry`);
			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.hooks.enabled).toEqual([]);
		});
```

Add a new `describe` block after `install_skills()`'s (before `install_commands()`'s, so it's tested alongside the registry-writing behavior it depends on):

```ts
	// ─── hooks registry ───────────────────────────────────────────────────────

	describe("hooks registry", () => {
		it("registry_write_skills preserves an existing hooks.enabled list", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);

			// install_skills calls registry_write_skills internally, which used to
			// overwrite the whole registry — this must NOT drop the hooks key.
			exec(id, `rm -rf ${HOME}/.claude/skills`);
			lib(id, `install_skills`);

			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.hooks.enabled).toEqual(["handoff"]);
		});

		it("registry_add_enabled_hook is idempotent", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);
			lib(id, `registry_add_enabled_hook "handoff"`);

			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.hooks.enabled).toEqual(["handoff"]);
		});

		it("registry_remove_enabled_hook removes only the named hook", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);
			lib(id, `registry_add_enabled_hook "other-hook"`);
			lib(id, `registry_remove_enabled_hook "handoff"`);

			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.hooks.enabled).toEqual(["other-hook"]);
		});

		it("registry_read_enabled_hooks prints one name per line", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);
			lib(id, `registry_add_enabled_hook "other-hook"`);

			const r = lib(id, `registry_read_enabled_hooks`);
			expect(r.output.split("\n").sort()).toEqual(["handoff", "other-hook"]);
		});
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: FAIL — `registry.hooks` is `undefined` (init_registry doesn't write it yet), and `registry_add_enabled_hook`/`registry_remove_enabled_hook`/`registry_read_enabled_hooks` are undefined commands.

- [ ] **Step 3: Implement in `scripts/lib.sh`**

Replace `init_registry()`:

```bash
init_registry() {
    local version
    version=$(get_version)
    echo "{\"version\":\"$version\",\"skills\":{\"claude\":[],\"copilot\":[]},\"hooks\":{\"enabled\":[]}}" > "$REGISTRY_FILE"
    log_success "Registry initialized (v$version)"
}
```

Replace `registry_write_skills()` (it must preserve any existing `.hooks` key — currently it rebuilds the whole file from scratch on every call, which silently drops enabled-hooks state every time `install_skills` runs):

```bash
registry_write_skills() {
    local claude_paths="$1"
    local copilot_paths="$2"
    local version
    version=$(get_version)

    if command -v jq &> /dev/null; then
        local claude_json="[]"
        local copilot_json="[]"
        if [[ -n "$claude_paths" ]]; then
            claude_json=$(echo "$claude_paths" | tr '|' '\n' | jq -R . | jq -s .)
        fi
        if [[ -n "$copilot_paths" ]]; then
            copilot_json=$(echo "$copilot_paths" | tr '|' '\n' | jq -R . | jq -s .)
        fi
        local hooks_json='{"enabled":[]}'
        if [[ -f "$REGISTRY_FILE" ]]; then
            hooks_json=$(jq -c '.hooks // {"enabled":[]}' "$REGISTRY_FILE" 2>/dev/null || echo '{"enabled":[]}')
        fi
        jq -n --arg v "$version" --argjson c "$claude_json" --argjson p "$copilot_json" --argjson h "$hooks_json" \
            '{"version":$v,"skills":{"claude":$c,"copilot":$p},"hooks":$h}' > "$REGISTRY_FILE"
    else
        # Without jq: build JSON manually
        local claude_arr=""
        if [[ -n "$claude_paths" ]]; then
            claude_arr=$(echo "$claude_paths" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        fi
        local copilot_arr=""
        if [[ -n "$copilot_paths" ]]; then
            copilot_arr=$(echo "$copilot_paths" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        fi
        local hooks_field='"hooks":{"enabled":[]}'
        if [[ -f "$REGISTRY_FILE" ]]; then
            local existing_hooks
            existing_hooks=$(grep -oE '"hooks"[[:space:]]*:[[:space:]]*\{[^}]*\}' "$REGISTRY_FILE" 2>/dev/null | head -1)
            [[ -n "$existing_hooks" ]] && hooks_field="$existing_hooks"
        fi
        echo "{\"version\":\"$version\",\"skills\":{\"claude\":[${claude_arr}],\"copilot\":[${copilot_arr}]},${hooks_field}}" > "$REGISTRY_FILE"
    fi
}
```

Add the three new hooks-registry functions after `registry_write_skills()` (before `extract_frontmatter`):

```bash
# Read enabled hook names from the registry, one per line.
# Usage: registry_read_enabled_hooks
registry_read_enabled_hooks() {
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        return 0
    fi
    if command -v jq &> /dev/null; then
        jq -r '.hooks.enabled[]?' "$REGISTRY_FILE" 2>/dev/null
    else
        sed -n 's/.*"hooks"[[:space:]]*:[[:space:]]*{[[:space:]]*"enabled"[[:space:]]*:[[:space:]]*\[\(.*\)\][[:space:]]*}.*/\1/p' "$REGISTRY_FILE" 2>/dev/null \
            | tr ',' '\n' | tr -d '"[:space:]' | grep -v '^$'
    fi
}

# Add a hook name to the registry's enabled list (idempotent). Requires jq.
# Usage: registry_add_enabled_hook "handoff"
registry_add_enabled_hook() {
    local name="$1"
    local tmp
    tmp=$(mktemp)
    jq --arg n "$name" '.hooks.enabled = ((.hooks.enabled // []) + [$n] | unique)' "$REGISTRY_FILE" > "$tmp"
    mv "$tmp" "$REGISTRY_FILE"
}

# Remove a hook name from the registry's enabled list. Requires jq.
# Usage: registry_remove_enabled_hook "handoff"
registry_remove_enabled_hook() {
    local name="$1"
    local tmp
    tmp=$(mktemp)
    jq --arg n "$name" '.hooks.enabled = ((.hooks.enabled // []) - [$n])' "$REGISTRY_FILE" > "$tmp"
    mv "$tmp" "$REGISTRY_FILE"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: PASS (all new tests, plus every pre-existing test in the file still green — pay particular attention to the `install_skills()` describe block, since `registry_write_skills` changed)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib.sh tests/lib.test.ts
git commit -m "feat(hooks): track enabled hooks in registry.json without losing state on reinstall"
```

---

### Task 3: `settings.json` merge/remove primitives

**Files:**
- Modify: `scripts/lib.sh` (add `CLAUDE_SETTINGS_FILE` config, `settings_merge_hook()`, `settings_remove_hook()`)
- Test: `tests/lib.test.ts` (new `describe("settings_merge_hook() / settings_remove_hook()", ...)`)

**Interfaces:**
- Produces: `CLAUDE_SETTINGS_FILE` (`"$HOME/.claude/settings.json"`, string constant), `settings_merge_hook(event, matcher, command, timeout)` (returns 1 and logs an error on invalid existing JSON, otherwise 0), `settings_remove_hook(event, command)` (same error contract; no-op success if the file doesn't exist).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/lib.test.ts`, after the `hooks registry` block from Task 2:

```ts
	// ─── settings_merge_hook() / settings_remove_hook() ──────────────────────

	describe("settings_merge_hook() / settings_remove_hook()", () => {
		it("creates ~/.claude/settings.json when it doesn't exist", () => {
			exec(id, `rm -rf ${HOME}/.claude/settings.json`);
			lib(
				id,
				`settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`,
			);
			const r = exec(id, `test -f ${HOME}/.claude/settings.json && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("writes the expected hook entry shape", () => {
			exec(id, `rm -f ${HOME}/.claude/settings.json`);
			lib(
				id,
				`settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`,
			);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			expect(settings.hooks.UserPromptSubmit).toEqual([
				{
					matcher: "*",
					hooks: [{ type: "command", command: "/opt/hook.sh", timeout: 10 }],
				},
			]);
		});

		it("is idempotent — re-merging the same command doesn't duplicate it", () => {
			exec(id, `rm -f ${HOME}/.claude/settings.json`);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			expect(settings.hooks.UserPromptSubmit.length).toBe(1);
		});

		it("preserves pre-existing unrelated hook entries for the same event", () => {
			exec(
				id,
				`echo '{"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[{"type":"command","command":"/my/own/script.sh","timeout":5}]}]}}' > ${HOME}/.claude/settings.json`,
			);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			const commands = settings.hooks.UserPromptSubmit.flatMap((g: any) =>
				g.hooks.map((h: any) => h.command),
			);
			expect(commands.sort()).toEqual(["/my/own/script.sh", "/opt/hook.sh"]);
		});

		it("preserves pre-existing entries for other events", () => {
			exec(
				id,
				`echo '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"/other/script.sh"}]}]}}' > ${HOME}/.claude/settings.json`,
			);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(
				"/other/script.sh",
			);
			expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
				"/opt/hook.sh",
			);
		});

		it("aborts without writing when existing settings.json has invalid JSON", () => {
			exec(id, `printf 'not json{' > ${HOME}/.claude/settings.json`);
			const r = lib(
				id,
				`settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`,
			);
			expect(r.exitCode).not.toBe(0);
			const content = exec(id, `cat ${HOME}/.claude/settings.json`);
			expect(content.output).toBe("not json{");
		});

		it("settings_remove_hook removes only the matching command", () => {
			exec(id, `rm -f ${HOME}/.claude/settings.json`);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			lib(
				id,
				`echo '{"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[{"type":"command","command":"/opt/hook.sh","timeout":10}]},{"matcher":"*","hooks":[{"type":"command","command":"/my/own/script.sh"}]}]}}' > ${HOME}/.claude/settings.json`,
			);
			lib(id, `settings_remove_hook "UserPromptSubmit" "/opt/hook.sh"`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			const commands = settings.hooks.UserPromptSubmit.flatMap((g: any) =>
				g.hooks.map((h: any) => h.command),
			);
			expect(commands).toEqual(["/my/own/script.sh"]);
		});

		it("settings_remove_hook is a no-op success when settings.json doesn't exist", () => {
			exec(id, `rm -f ${HOME}/.claude/settings.json`);
			const r = lib(id, `settings_remove_hook "UserPromptSubmit" "/opt/hook.sh"`);
			expect(r.exitCode).toBe(0);
		});
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: FAIL — `settings_merge_hook`/`settings_remove_hook` are undefined commands.

- [ ] **Step 3: Implement in `scripts/lib.sh`**

Add `CLAUDE_SETTINGS_FILE` beside `HOOKS_DIR` (from Task 1):

```bash
CLAUDE_SETTINGS_FILE="$HOME/.claude/settings.json"
```

Add the two functions after `registry_remove_enabled_hook()` (from Task 2), before `extract_frontmatter`:

```bash
# Merge a hook entry into ~/.claude/settings.json (idempotent — replaces any
# existing entry with the same command). Requires jq. Never touches entries
# for OTHER commands, including hooks the user configured themselves.
# Usage: settings_merge_hook <event> <matcher> <command> <timeout>
settings_merge_hook() {
    local event="$1" matcher="$2" command="$3" timeout="$4"

    mkdir -p "$(dirname "$CLAUDE_SETTINGS_FILE")"
    if [[ ! -f "$CLAUDE_SETTINGS_FILE" ]]; then
        echo '{}' > "$CLAUDE_SETTINGS_FILE"
    fi

    if ! jq empty "$CLAUDE_SETTINGS_FILE" 2>/dev/null; then
        log_error "$CLAUDE_SETTINGS_FILE contains invalid JSON — fix it manually before enabling hooks"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    # NOTE: ".hooks" at the top level is the settings.json hooks map; the inner
    # ".hooks" (inside each matcher-group object) is that group's own command
    # list — same field name, two different levels of the schema.
    jq --arg event "$event" --arg matcher "$matcher" --arg cmd "$command" --argjson timeout "$timeout" '
        .hooks[$event] = ((.hooks[$event] // [])
            | map(select((.hooks // []) | any(.command == $cmd) | not))
            + [{matcher: $matcher, hooks: [{type: "command", command: $cmd, timeout: $timeout}]}])
    ' "$CLAUDE_SETTINGS_FILE" > "$tmp"
    mv "$tmp" "$CLAUDE_SETTINGS_FILE"
}

# Remove any hook entry matching <command> under <event> from
# ~/.claude/settings.json. Requires jq. Success no-op if the file is absent.
# Usage: settings_remove_hook <event> <command>
settings_remove_hook() {
    local event="$1" command="$2"

    if [[ ! -f "$CLAUDE_SETTINGS_FILE" ]]; then
        return 0
    fi

    if ! jq empty "$CLAUDE_SETTINGS_FILE" 2>/dev/null; then
        log_error "$CLAUDE_SETTINGS_FILE contains invalid JSON — fix it manually"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    jq --arg event "$event" --arg cmd "$command" '
        if (.hooks[$event]? // null) == null then .
        else .hooks[$event] = (.hooks[$event] | map(select((.hooks // []) | any(.command == $cmd) | not)))
        end
    ' "$CLAUDE_SETTINGS_FILE" > "$tmp"
    mv "$tmp" "$CLAUDE_SETTINGS_FILE"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: PASS (all new tests, all pre-existing tests still green)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib.sh tests/lib.test.ts
git commit -m "feat(hooks): add settings_merge_hook/settings_remove_hook primitives"
```

---

### Task 4: `hook_enable`/`hook_disable`/`hooks_list_available`/`disable_all_hooks`

**Files:**
- Modify: `scripts/lib.sh` (add the four functions, composing Tasks 1-3)
- Test: `tests/lib.test.ts` (new `describe("hook_enable() / hook_disable()", ...)`)

**Interfaces:**
- Consumes: `HOOKS_DIR`, `CLAUDE_SETTINGS_FILE` (Task 1/3), `settings_merge_hook`/`settings_remove_hook` (Task 3), `registry_add_enabled_hook`/`registry_remove_enabled_hook`/`registry_read_enabled_hooks` (Task 2).
- Produces: `hooks_list_available()` (prints canonical hook names, one per line), `hook_enable(name)`, `hook_disable(name)`, `disable_all_hooks()` (iterates `registry_read_enabled_hooks`, calls `hook_disable` on each, tolerates missing `jq`).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/lib.test.ts`, after the `settings_merge_hook()` block from Task 3:

```ts
	// ─── hook_enable() / hook_disable() ───────────────────────────────────────

	describe("hook_enable() / hook_disable()", () => {
		it("hooks_list_available lists canonical hook names", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			lib(id, `install_hooks`);
			const r = lib(id, `hooks_list_available`);
			expect(r.output.split("\n")).toContain("sample-hook");
		});

		it("hook_enable errors for an unknown hook name", () => {
			const r = lib(id, `hook_enable "nonexistent-hook"`);
			expect(r.exitCode).not.toBe(0);
		});

		it("hook_enable merges into settings.json and updates the registry", () => {
			exec(id, `rm -rf ${INSTALL}/hooks ${HOME}/.claude/settings.json`);
			lib(id, `install_hooks && init_registry`);
			const r = lib(id, `hook_enable "sample-hook"`);
			expect(r.exitCode).toBe(0);

			const settings = JSON.parse(
				exec(id, `cat ${HOME}/.claude/settings.json`).output,
			);
			expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
				`${INSTALL}/hooks/sample-hook/hook.sh`,
			);

			const registry = JSON.parse(
				exec(id, `cat ${INSTALL}/registry.json`).output,
			);
			expect(registry.hooks.enabled).toContain("sample-hook");
		});

		it("hook_disable removes the settings.json entry and the registry record", () => {
			exec(id, `rm -rf ${INSTALL}/hooks ${HOME}/.claude/settings.json`);
			lib(id, `install_hooks && init_registry && hook_enable "sample-hook"`);
			lib(id, `hook_disable "sample-hook"`);

			const settings = JSON.parse(
				exec(id, `cat ${HOME}/.claude/settings.json`).output,
			);
			const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
				(g: any) => g.hooks.map((h: any) => h.command),
			);
			expect(commands).not.toContain(`${INSTALL}/hooks/sample-hook/hook.sh`);

			const registry = JSON.parse(
				exec(id, `cat ${INSTALL}/registry.json`).output,
			);
			expect(registry.hooks.enabled).not.toContain("sample-hook");
		});

		it("disable_all_hooks disables every currently-enabled hook", () => {
			exec(id, `rm -rf ${INSTALL}/hooks ${HOME}/.claude/settings.json`);
			lib(id, `install_hooks && init_registry && hook_enable "sample-hook"`);
			lib(id, `disable_all_hooks`);

			const registry = JSON.parse(
				exec(id, `cat ${INSTALL}/registry.json`).output,
			);
			expect(registry.hooks.enabled).toEqual([]);
		});

		it("hook_enable fails cleanly without jq", () => {
			exec(id, `rm -rf ${INSTALL}/hooks`);
			lib(id, `install_hooks && init_registry`);
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			const r = lib(id, `hook_enable "sample-hook"`);
			expect(r.exitCode).not.toBe(0);
			exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
		});
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: FAIL — `hooks_list_available`/`hook_enable`/`hook_disable`/`disable_all_hooks` are undefined commands. (Before running, confirm `jq`'s actual path in the Alpine image — check with `exec(id, "which jq")` if the `mv /usr/bin/jq` step in the last test doesn't match; Alpine installs jq at `/usr/bin/jq` via `apk add jq`, but verify against the container rather than assuming.)

- [ ] **Step 3: Implement in `scripts/lib.sh`**

Add after `settings_remove_hook()` (from Task 3), before `extract_frontmatter`:

```bash
# List canonical hook names available under HOOKS_DIR, one per line.
# Usage: hooks_list_available
hooks_list_available() {
    if [[ ! -d "$HOOKS_DIR" ]]; then
        return 0
    fi
    for hook_dir in "$HOOKS_DIR"/*/; do
        if [[ ! -d "$hook_dir" ]]; then continue; fi
        if [[ ! -f "$hook_dir/hook.json" ]]; then continue; fi
        basename "$hook_dir"
    done
}

# Register a canonical hook into ~/.claude/settings.json and the registry.
# Usage: hook_enable <name>
hook_enable() {
    local name="$1"
    local hook_dir="$HOOKS_DIR/$name"
    local meta="$hook_dir/hook.json"

    if [[ ! -f "$meta" ]]; then
        log_error "Unknown hook '$name' (no $meta — run 'oms update' first?)"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        log_error "jq is required to enable hooks (safe settings.json editing). Install jq and try again."
        return 1
    fi

    local event matcher timeout command
    event=$(jq -r '.event' "$meta")
    matcher=$(jq -r '.matcher // "*"' "$meta")
    timeout=$(jq -r '.timeout // 10' "$meta")
    command="$hook_dir/hook.sh"

    if [[ ! -x "$command" ]]; then
        log_error "Hook script not found or not executable: $command"
        return 1
    fi

    settings_merge_hook "$event" "$matcher" "$command" "$timeout" || return 1
    registry_add_enabled_hook "$name"
    log_success "Enabled hook '${CYAN}$name${NC}' on ${event}"
}

# Remove a hook's registration from ~/.claude/settings.json and the registry.
# Usage: hook_disable <name>
hook_disable() {
    local name="$1"
    local hook_dir="$HOOKS_DIR/$name"
    local meta="$hook_dir/hook.json"

    if [[ ! -f "$meta" ]]; then
        log_error "Unknown hook '$name' (no $meta)"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        log_error "jq is required to disable hooks (safe settings.json editing). Install jq and try again."
        return 1
    fi

    local event command
    event=$(jq -r '.event' "$meta")
    command="$hook_dir/hook.sh"

    settings_remove_hook "$event" "$command" || return 1
    registry_remove_enabled_hook "$name"
    log_success "Disabled hook '${CYAN}$name${NC}'"
}

# Disable every currently-enabled hook. Used by uninstall.sh before the
# install directory (and therefore every hook script) is deleted. Tolerates
# missing jq by skipping settings.json cleanup — the target script is about
# to be deleted anyway, so a dangling command entry is harmless (it will
# simply fail with "file not found" and be treated as a non-blocking error
# by Claude Code if ever invoked).
# Usage: disable_all_hooks
disable_all_hooks() {
    local enabled
    enabled=$(registry_read_enabled_hooks)

    if [[ -z "$enabled" ]]; then
        return 0
    fi

    if ! command -v jq &> /dev/null; then
        log_warning "jq not available — leaving hook entries in $CLAUDE_SETTINGS_FILE (they will simply no-op)"
        return 0
    fi

    local name
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        hook_disable "$name" || true
    done <<< "$enabled"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/lib.test.ts`
Expected: PASS (all new tests, all pre-existing tests still green — this is the largest test file in the project, run it in full, not just the new `describe` block)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib.sh tests/lib.test.ts
git commit -m "feat(hooks): add hook_enable/hook_disable/disable_all_hooks"
```

---

### Task 5: `scripts/hooks.sh` CLI + `oms hooks` subcommand

**Files:**
- Create: `scripts/hooks.sh`
- Modify: `src/commands/oms-cli/oms.sh` (add `hooks)` case, update help text)
- Test: `src/commands/oms-cli/oms-cli.test.ts` (extend), new `tests/hooks-cli.test.ts` for `scripts/hooks.sh` directly

**Interfaces:**
- Consumes: `scripts/lib.sh` functions from Tasks 1-4 (`hooks_list_available`, `hook_enable`, `hook_disable`, `registry_read_enabled_hooks`).
- Produces: `oms hooks list|enable <name>|disable <name>|status|--help` (delegated from `oms.sh` to `bash "$install_dir/scripts/hooks.sh" "$@"`, same pattern as `oms update`).

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks-cli.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, HOME, SCRIPTS_DIR } from "./helpers";

describe("scripts/hooks.sh", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache bash jq >/dev/null 2>&1");
		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/hooks.sh`, "/scripts/hooks.sh");
		exec(id, "chmod +x /scripts/hooks.sh");

		exec(id, `mkdir -p ${HOME}/.oh-my-skills/hooks/sample-hook`);
		exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > ${HOME}/.oh-my-skills/hooks/sample-hook/hook.json`,
		);
		exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > ${HOME}/.oh-my-skills/hooks/sample-hook/hook.sh`,
		);
		exec(id, `chmod +x ${HOME}/.oh-my-skills/hooks/sample-hook/hook.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("list shows the available hook as disabled by default", () => {
		exec(id, `rm -f ${HOME}/.oh-my-skills/registry.json`);
		const r = exec(id, `bash /scripts/hooks.sh list`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("sample-hook");
		expect(r.output).toContain("disabled");
	});

	it("enable registers the hook and status reflects it", () => {
		const r = exec(id, `bash /scripts/hooks.sh enable sample-hook`);
		expect(r.exitCode).toBe(0);

		const status = exec(id, `bash /scripts/hooks.sh status`);
		expect(status.output).toContain("sample-hook");
		expect(status.output).toContain("enabled");

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
			"sample-hook/hook.sh",
		);
	});

	it("disable removes the registration", () => {
		const r = exec(id, `bash /scripts/hooks.sh disable sample-hook`);
		expect(r.exitCode).toBe(0);

		const status = exec(id, `bash /scripts/hooks.sh status`);
		expect(status.output).toContain("disabled");
	});

	it("enable without a name errors with usage", () => {
		const r = exec(id, `bash /scripts/hooks.sh enable 2>&1`);
		expect(r.exitCode).not.toBe(0);
		expect(r.output).toContain("Usage");
	});

	it("unknown subcommand errors", () => {
		const r = exec(id, `bash /scripts/hooks.sh bogus 2>&1`);
		expect(r.exitCode).not.toBe(0);
		expect(r.output).toContain("Unknown hooks command");
	});
});
```

Extend `src/commands/oms-cli/oms-cli.test.ts` with a delegation test, mirroring the existing `update` delegation test (add after the `"should delegate update..."` test):

```ts
	it("should delegate hooks to the installed hooks script", () => {
		exec(id, `mkdir -p ${HOME}/.oh-my-skills/scripts`);
		exec(
			id,
			`cat > ${HOME}/.oh-my-skills/scripts/hooks.sh <<'EOF'
#!/bin/bash
printf '%s' "$*" > "$HOME/hooks-args.txt"
EOF`,
		);
		exec(id, `chmod +x ${HOME}/.oh-my-skills/scripts/hooks.sh`);

		const result = exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms hooks enable sample-hook'`,
		);
		expect(result.exitCode).toBe(0);

		const recorded = exec(id, `cat ${HOME}/hooks-args.txt`);
		expect(recorded.output).toBe("enable sample-hook");
	});
```

Also add `"hooks"` to the existing `"should print usage by default"` and `"should print usage with --help"` assertions (they currently check for `"update"` — add a matching `expect(result.output).toContain("hooks")` in both).

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/hooks-cli.test.ts src/commands/oms-cli/oms-cli.test.ts`
Expected: FAIL — `scripts/hooks.sh` doesn't exist yet (copy fails), `oms hooks` is not a recognized subcommand yet.

- [ ] **Step 3: Implement**

Create `scripts/hooks.sh`:

```bash
#!/bin/bash

# oh-my-skills hooks CLI — enable/disable/list Claude Code hooks.
# Unlike install.sh/uninstall.sh/update.sh, this script is never invoked via
# curl | bash — it only runs post-install via `oms hooks ...`, where lib.sh
# is always present beside it. No bootstrap duplication needed here.

set -euo pipefail

source "${BASH_SOURCE[0]%/*}/lib.sh"

usage() {
    cat <<'EOF'
Usage: oms hooks <command> [name]

Commands:
  list              List available hooks and their enabled status
  status            Alias for list
  enable <name>     Register a hook in ~/.claude/settings.json
  disable <name>    Remove a hook from ~/.claude/settings.json

Options:
  --help            Show this help message
EOF
}

print_status() {
    local available
    available=$(hooks_list_available)

    if [[ -z "$available" ]]; then
        log_warning "No hooks installed"
        return 0
    fi

    local enabled
    enabled=$(registry_read_enabled_hooks)

    local hook_name
    while IFS= read -r hook_name; do
        [[ -z "$hook_name" ]] && continue
        if echo "$enabled" | grep -qx "$hook_name"; then
            log_success "$hook_name (enabled)"
        else
            log_info "$hook_name (disabled)"
        fi
    done <<< "$available"
}

main() {
    local command="${1:-list}"

    case "$command" in
        list|status)
            print_status
            ;;
        enable)
            local name="${2:-}"
            if [[ -z "$name" ]]; then
                log_error "Usage: oms hooks enable <name>"
                return 1
            fi
            hook_enable "$name"
            ;;
        disable)
            local name="${2:-}"
            if [[ -z "$name" ]]; then
                log_error "Usage: oms hooks disable <name>"
                return 1
            fi
            hook_disable "$name"
            ;;
        --help|-h|help)
            usage
            ;;
        *)
            log_error "Unknown hooks command: $command"
            usage
            return 1
            ;;
    esac
}

main "$@"
```

Modify `src/commands/oms-cli/oms.sh`: add a `hooks)` case right before `version|--version|-v)`, and add `hooks` to the usage text.

```bash
        hooks)
            local hooks_script="${install_dir}/scripts/hooks.sh"
            if [[ ! -f "$hooks_script" ]]; then
                echo "oh-my-skills hooks script not found at $hooks_script" >&2
                return 1
            fi

            shift
            bash "$hooks_script" "$@"
            ;;
```

And update the `help|""|--help)` heredoc to list it:

```
Commands:
  update      Update oh-my-skills to the latest version
  hooks       Manage Claude Code hooks (list, enable, disable, status)
  version     Show installed version
  help        Show this help message
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/hooks-cli.test.ts src/commands/oms-cli/oms-cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks.sh src/commands/oms-cli/oms.sh tests/hooks-cli.test.ts src/commands/oms-cli/oms-cli.test.ts
git commit -m "feat(hooks): add oms hooks CLI (list/enable/disable/status)"
```

---

### Task 6: Install/update/uninstall lifecycle integration

**Files:**
- Modify: `scripts/install.sh` (call `install_hooks`, bump step count)
- Modify: `scripts/update.sh` (call `install_hooks` in `apply_update`)
- Modify: `scripts/uninstall.sh` (call `disable_all_hooks`, bump step count)
- Modify: `lefthook.yml`, `.github/workflows/pr-checks.yml` (add `scripts/hooks.sh` to `bash -n` validation)
- Modify: `tests/install.test.ts`, `tests/uninstall.test.ts`, `tests/update.test.ts` (extend fixtures + assertions)

**Interfaces:**
- Consumes: `install_hooks()` (Task 1), `disable_all_hooks()` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `tests/install.test.ts`, add a fixture hook to the fake remote repo in `beforeAll` (after the `src/commands/oms-cli` fixture block, around line 54):

```ts
		exec(id, "mkdir -p /tmp/remote-repo/src/hooks/sample-hook");
		exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > /tmp/remote-repo/src/hooks/sample-hook/hook.json`,
		);
		exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > /tmp/remote-repo/src/hooks/sample-hook/hook.sh`,
		);
```

Add a new `it` after `"should expose oms command with --help"`:

```ts
	it("should install canonical hook files without registering them in settings.json", () => {
		const meta = exec(
			id,
			`test -f ${INSTALL}/hooks/sample-hook/hook.json && echo ok`,
		);
		expect(meta.output).toBe("ok");

		const script = exec(
			id,
			`test -x ${INSTALL}/hooks/sample-hook/hook.sh && echo ok`,
		);
		expect(script.output).toBe("ok");

		// Install must never touch ~/.claude/settings.json on its own
		const settings = exec(
			id,
			`test -f ${HOME}/.claude/settings.json && echo exists || echo absent`,
		);
		expect(settings.output).toBe("absent");
	});
```

In `tests/uninstall.test.ts`, add the same fixture hook to `beforeAll` (after the `src/commands` fixture, around line 48), then explicitly enable it post-install so uninstall has something real to clean up:

```ts
		exec(id, "mkdir -p /tmp/remote-repo/src/hooks/sample-hook");
		exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > /tmp/remote-repo/src/hooks/sample-hook/hook.json`,
		);
		exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > /tmp/remote-repo/src/hooks/sample-hook/hook.sh`,
		);
```

And after the existing `// Run install first` line (`exec(id, \`REPO_URL=/tmp/remote-repo bash /scripts/install.sh\`);`), enable the hook:

```ts
		exec(
			id,
			`bash -c 'source /scripts/lib.sh; init_registry 2>/dev/null; hook_enable "sample-hook"'`,
		);
```

(`init_registry` guards against a missing registry.json in this isolated `bash -c` invocation; it's harmless if one already exists from install — reset it here deliberately since `hook_enable` needs `registry.json` to be valid JSON with a `.hooks.enabled` key, and this keeps the test independent of `install.sh`'s exact registry-writing internals.)

Add a new `it` before `"should have removed ~/.oh-my-skills directory"`:

```ts
	it("should have removed the hook entry from ~/.claude/settings.json", () => {
		const r = exec(id, `cat ${HOME}/.claude/settings.json 2>/dev/null || echo '{}'`);
		const settings = JSON.parse(r.output);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands.some((c: string) => c.includes("sample-hook"))).toBe(
			false,
		);
	});
```

In `tests/update.test.ts`, find the test(s) covering `apply_update`/`perform_update` (Read the file first to locate exact assertions and fixture setup before editing — don't guess line numbers) and add an assertion that a hook present in the "remote" fixture repo gets copied to `${INSTALL}/hooks/<name>/` after an update, following the same pattern as whatever assertion already exists there for skills/commands being refreshed on update.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts tests/uninstall.test.ts tests/update.test.ts
```
Expected: FAIL — `install.sh` never calls `install_hooks`, so `${INSTALL}/hooks/sample-hook/` doesn't exist; `uninstall.sh` never calls `disable_all_hooks`, so the settings.json entry survives.

- [ ] **Step 3: Implement**

In `scripts/install.sh`'s `main()`, add a step after `install_commands` (before `local version`):

```bash
    print_step "Installing hooks..."
    install_hooks
```

And bump `init_steps 6` to `init_steps 7`.

In `scripts/update.sh`'s `apply_update()`, add `install_hooks` after `install_commands`:

```bash
apply_update() {
    local user_shell
    user_shell=$(detect_shell)

    detect_llms
    install_skills
    install_commands
    install_hooks
    clean_dev_files
    create_shell_sourcing "update"
    inject_sourcing "$user_shell" "update"
}
```

In `scripts/uninstall.sh`'s `main()`, add a step before `"Removing installation..."`:

```bash
    print_step "Disabling hooks..."
    disable_all_hooks
```

And bump `init_steps 3` to `init_steps 4`.

In `lefthook.yml`, update the `bash -n` job:

```yaml
    - run: bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh && bash -n scripts/hooks.sh
```

In `.github/workflows/pr-checks.yml`, update the equivalent `run:` line the same way (Read the file first to match its exact existing formatting before editing).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts tests/uninstall.test.ts tests/update.test.ts
```
Expected: PASS. Then run the full suite to confirm no regressions: `TESTCONTAINERS_RYUK_DISABLED=true bun test`

- [ ] **Step 5: Commit**

```bash
git add scripts/install.sh scripts/update.sh scripts/uninstall.sh lefthook.yml .github/workflows/pr-checks.yml tests/install.test.ts tests/uninstall.test.ts tests/update.test.ts
git commit -m "feat(hooks): wire install_hooks/disable_all_hooks into the install/update/uninstall lifecycle"
```

---

### Task 7: The `handoff` hook (context-usage detection + nudge)

**Files:**
- Create: `src/hooks/handoff/hook.json`
- Create: `src/hooks/handoff/hook.sh`
- Test: `src/hooks/handoff/hook.test.ts`

**Interfaces:**
- Consumes: stdin JSON with `transcript_path` and `session_id` (Claude Code's `UserPromptSubmit` hook input contract).
- Produces: exit 0 silently below threshold or on missing data; exit 0 with `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}` on stdout when above threshold and not already nudged this session.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/handoff/hook.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec } from "../../../tests/helpers";

// A transcript is JSONL: one JSON object per line. Each usage-bearing line
// mimics a Claude Code assistant turn.
function usageLine(input: number, cacheRead = 0, cacheCreate = 0): string {
	return JSON.stringify({
		message: {
			usage: {
				input_tokens: input,
				cache_read_input_tokens: cacheRead,
				cache_creation_input_tokens: cacheCreate,
			},
		},
	});
}

describe("handoff hook.sh", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache bash jq >/dev/null 2>&1");
		exec(id, "mkdir -p /hook");
		copyToContainer(
			id,
			`${__dirname}/hook.sh`,
			"/hook/hook.sh",
		);
		exec(id, "chmod +x /hook/hook.sh");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	function runHook(
		transcriptPath: string,
		sessionId: string,
		env = "",
	) {
		const input = JSON.stringify({
			transcript_path: transcriptPath,
			session_id: sessionId,
		});
		return exec(
			id,
			`rm -f /root/.oh-my-skills/hooks/.state/handoff-nudged-${sessionId}; echo '${input}' | ${env} /hook/hook.sh`,
		);
	}

	it("stays silent below the threshold", () => {
		exec(id, `printf '%s\\n' '${usageLine(1000)}' > /tmp/below.jsonl`);
		const r = runHook("/tmp/below.jsonl", "session-below");
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("nudges above the default 70% threshold", () => {
		exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/above.jsonl`);
		const r = runHook("/tmp/above.jsonl", "session-above");
		expect(r.exitCode).toBe(0);
		const parsed = JSON.parse(r.output);
		expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("/handoff");
	});

	it("sums input + cache_read + cache_creation tokens", () => {
		exec(
			id,
			`printf '%s\\n' '${usageLine(50000, 60000, 50000)}' > /tmp/summed.jsonl`,
		);
		const r = runHook("/tmp/summed.jsonl", "session-summed");
		expect(r.exitCode).toBe(0);
		expect(r.output).not.toBe(""); // 160000 / 200000 = 80%, above threshold
	});

	it("uses the LAST usage entry in the transcript, not the first", () => {
		exec(
			id,
			`printf '%s\\n%s\\n' '${usageLine(150000)}' '${usageLine(1000)}' > /tmp/last.jsonl`,
		);
		const r = runHook("/tmp/last.jsonl", "session-last");
		expect(r.output).toBe(""); // last entry is well below threshold
	});

	it("only nudges once per session_id", () => {
		exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/once.jsonl`);
		const first = runHook("/tmp/once.jsonl", "session-once");
		expect(first.output).not.toBe("");

		// Re-run WITHOUT clearing the marker this time
		const input = JSON.stringify({
			transcript_path: "/tmp/once.jsonl",
			session_id: "session-once",
		});
		const second = exec(id, `echo '${input}' | /hook/hook.sh`);
		expect(second.output).toBe("");
	});

	it("exits silently when transcript_path is missing or the file doesn't exist", () => {
		const r1 = exec(id, `echo '{}' | /hook/hook.sh`);
		expect(r1.exitCode).toBe(0);
		expect(r1.output).toBe("");

		const r2 = runHook("/tmp/does-not-exist.jsonl", "session-missing");
		expect(r2.exitCode).toBe(0);
		expect(r2.output).toBe("");
	});

	it("respects OMS_HANDOFF_THRESHOLD and OMS_HANDOFF_CONTEXT_WINDOW overrides", () => {
		exec(id, `printf '%s\\n' '${usageLine(1000)}' > /tmp/custom.jsonl`);
		// 1000 / 2000 = 50%, above a 10% threshold
		const r = runHook(
			"/tmp/custom.jsonl",
			"session-custom",
			"OMS_HANDOFF_THRESHOLD=10 OMS_HANDOFF_CONTEXT_WINDOW=2000",
		);
		expect(r.output).not.toBe("");
	});

	it("exits silently when jq is unavailable", () => {
		exec(id, "mv /usr/bin/jq /usr/bin/jq.bak");
		exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/nojq.jsonl`);
		const r = runHook("/tmp/nojq.jsonl", "session-nojq");
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
		exec(id, "mv /usr/bin/jq.bak /usr/bin/jq");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test src/hooks/handoff/hook.test.ts`
Expected: FAIL — `src/hooks/handoff/hook.sh` doesn't exist yet (copy step fails).

- [ ] **Step 3: Implement**

Create `src/hooks/handoff/hook.json`:

```json
{
  "event": "UserPromptSubmit",
  "matcher": "*",
  "timeout": 10
}
```

Create `src/hooks/handoff/hook.sh`:

```bash
#!/bin/bash

# oh-my-skills handoff hook — UserPromptSubmit.
#
# Nudges Claude to suggest running /handoff once estimated context usage
# crosses a threshold. Claude Code hooks have no built-in token/context
# telemetry, so this is a best-effort estimate from the transcript's last
# recorded token usage — not the same number Claude Code's own UI shows.
#
# Portability note: only jq is used to parse the transcript (no tac/tail -r,
# which differ between macOS and the Alpine containers this project tests in).

set -euo pipefail

input="$(cat)"

if ! command -v jq &> /dev/null; then
    exit 0
fi

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
session_id=$(echo "$input" | jq -r '.session_id // empty')

if [[ -z "$transcript_path" || ! -f "$transcript_path" || -z "$session_id" ]]; then
    exit 0
fi

context_window="${OMS_HANDOFF_CONTEXT_WINDOW:-200000}"
threshold_pct="${OMS_HANDOFF_THRESHOLD:-70}"

usage_tokens=$(jq -s '
    [.[] | select(.message.usage != null)] | last
    | if . == null then 0
      else (.message.usage.input_tokens // 0)
         + (.message.usage.cache_read_input_tokens // 0)
         + (.message.usage.cache_creation_input_tokens // 0)
      end
' "$transcript_path" 2>/dev/null) || exit 0

if [[ -z "$usage_tokens" || "$usage_tokens" == "null" ]]; then
    exit 0
fi

pct=$(( usage_tokens * 100 / context_window ))

if [[ $pct -lt $threshold_pct ]]; then
    exit 0
fi

state_dir="$HOME/.oh-my-skills/hooks/.state"
mkdir -p "$state_dir"
marker="$state_dir/handoff-nudged-${session_id}"

if [[ -f "$marker" ]]; then
    exit 0
fi
touch "$marker"

jq -n --arg pct "$pct" '{
    hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: ("Context usage is estimated at around " + $pct + "% of the context window. If a natural checkpoint exists in the current work, consider proactively suggesting the user run /handoff to save session state before context gets compacted.")
    }
}'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test src/hooks/handoff/hook.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/handoff
git commit -m "feat(hooks): add handoff hook — context-usage nudge on UserPromptSubmit"
```

---

### Task 8: End-to-end lifecycle test (`tests/hooks.test.ts`)

**Files:**
- Create: `tests/hooks.test.ts`

**Interfaces:**
- Consumes: `scripts/install.sh`, `scripts/uninstall.sh`, the real `src/hooks/handoff/` files (Task 7), `oms hooks` via `src/commands/oms-cli/oms.sh` (Task 5).

This is the integration test named explicitly in the spec's Testing section — it exercises the real, unmodified scripts end-to-end (as opposed to Tasks 1-6's unit-level `lib()` tests), matching how `install.test.ts`/`uninstall.test.ts` already do full-script e2e runs.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	HOME,
	INSTALL,
	PROJECT_DIR,
	SCRIPTS_DIR,
	VERSION,
} from "./helpers";

describe("oh-my-skills hooks lifecycle (e2e)", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache git bash jq curl >/dev/null 2>&1");

		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/uninstall.sh`, "/scripts/uninstall.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/hooks.sh`, "/scripts/hooks.sh");
		exec(id, "chmod +x /scripts/*.sh");

		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		// Ship the REAL handoff hook, not a fixture
		exec(id, "mkdir -p /tmp/remote-repo/src/hooks");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/hooks/handoff`,
			"/tmp/remote-repo/src/hooks/handoff",
		);

		exec(id, "mkdir -p /tmp/remote-repo/src/commands/oms-cli");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/tmp/remote-repo/src/commands/oms-cli/oms.sh",
		);
		exec(id, "mkdir -p /tmp/remote-repo/scripts");
		exec(id, "cp /scripts/*.sh /tmp/remote-repo/scripts/");
		copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'initial' && git tag v${VERSION}`,
		);

		exec(id, `printf '# my bashrc\n' > ${HOME}/.bashrc`);

		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("installs the handoff hook canonically without enabling it", () => {
		const script = exec(
			id,
			`test -x ${INSTALL}/hooks/handoff/hook.sh && echo ok`,
		);
		expect(script.output).toBe("ok");

		const settings = exec(
			id,
			`test -f ${HOME}/.claude/settings.json && echo exists || echo absent`,
		);
		expect(settings.output).toBe("absent");
	});

	it("oms hooks list shows handoff as disabled", () => {
		const r = exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks list'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("handoff");
		expect(r.output).toContain("disabled");
	});

	it("oms hooks enable handoff registers it in settings.json", () => {
		const r = exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
			`${INSTALL}/hooks/handoff/hook.sh`,
		);
	});

	it("the enabled hook script actually runs and responds to a high-usage transcript", () => {
		exec(
			id,
			`printf '%s\\n' '{"message":{"usage":{"input_tokens":180000}}}' > /tmp/e2e-transcript.jsonl`,
		);
		const input = JSON.stringify({
			transcript_path: "/tmp/e2e-transcript.jsonl",
			session_id: "e2e-session",
		});
		const r = exec(
			id,
			`echo '${input}' | ${INSTALL}/hooks/handoff/hook.sh`,
		);
		expect(r.output).toContain("/handoff");
	});

	it("oms hooks disable handoff removes it from settings.json", () => {
		const r = exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks disable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands).not.toContain(`${INSTALL}/hooks/handoff/hook.sh`);
	});

	it("uninstall cleans up a still-enabled hook", () => {
		exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`,
		);
		const r = exec(id, `bash /scripts/uninstall.sh --yes`);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands.some((c: string) => c.includes("handoff/hook.sh"))).toBe(
			false,
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/hooks.test.ts`
Expected: FAIL at the first assertion, since Tasks 1-7 land the pieces this test exercises together for the first time here — if any earlier task has a subtle integration bug invisible at the unit level (e.g. a path mismatch between `install_hooks`'s copy destination and `hook_enable`'s expected `$HOOKS_DIR/$name/hook.sh` path), this is where it surfaces.

- [ ] **Step 3: Fix any integration gaps found**

There is no new production code anticipated here — Tasks 1-7 should already make this pass. If it doesn't, the fix belongs in whichever Task's files are actually at fault (most likely path assumptions in `hook_enable`/`install_hooks` from Tasks 1 and 4) — patch there, not with a workaround in the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `TESTCONTAINERS_RYUK_DISABLED=true bun test tests/hooks.test.ts`
Expected: PASS. Then run the entire suite once more to confirm the whole feature is integrated cleanly: `TESTCONTAINERS_RYUK_DISABLED=true bun test`

- [ ] **Step 5: Commit**

```bash
git add tests/hooks.test.ts
git commit -m "test(hooks): add end-to-end install/enable/disable/uninstall lifecycle test"
```

---

### Task 9: Documentation — `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Update the "Commands" section**

In the `bash -n` validation command block, add `scripts/hooks.sh`:

```bash
bash -n scripts/lib.sh && bash -n scripts/install.sh && bash -n scripts/uninstall.sh && bash -n scripts/update.sh && bash -n scripts/hooks.sh
```

- [ ] **Step 2: Add a "Hooks (`src/hooks/`)" subsection under "Architecture"**

Insert after the existing "Registry" subsection, before "Source content (`src/`)":

```markdown
### Hooks (`src/hooks/`)

Claude Code hooks follow the same single-source-of-truth pattern as skills: each hook is a directory under `src/hooks/<name>/` with a `hook.json` (event, matcher, timeout) and a `hook.sh` entrypoint. `install.sh`/`update.sh` always copy these to `~/.oh-my-skills/hooks/<name>/` — harmless, like skills/commands. Registering a hook into `~/.claude/settings.json` is a **separate, explicit, opt-in** step via `oms hooks enable <name>` (see `scripts/hooks.sh`), never done automatically. `oms hooks enable`/`disable` require `jq` — safely merging into a shared config file the user didn't create is not attempted with sed/grep. `uninstall.sh` disables every enabled hook before removing the install directory.
```

- [ ] **Step 3: Update the `src/` bullet list**

In the "Source content (`src/`)" section, add a bullet after the `src/commands/` one:

```markdown
- `src/hooks/` — Hook directories, each containing a `hook.json` (event/matcher/timeout) and a `hook.sh` entrypoint.
```

- [ ] **Step 4: Add a "Contributing: Writing a Hook" section**

Insert after "Contributing: Writing a Command", before "Contributing: Writing Tests":

```markdown
## Contributing: Writing a Hook

**Required structure:**
\`\`\`
src/hooks/<name>/
├── hook.json      # {"event": "<ClaudeCodeEventName>", "matcher": "*", "timeout": 10}
├── hook.sh        # Entrypoint — reads Claude Code's stdin JSON, writes stdout JSON
└── hook.test.ts   # Co-located tests, same pattern as command tests
\`\`\`

**Rules:**
- One `event` per hook directory in v1 — a hook needing multiple events ships as multiple directories sharing a script
- `hook.sh` must be portable between macOS and Alpine Linux (the test environment) — use `jq` for JSON parsing, not `tac`/`tail -r` or other GNU/BSD-specific tools
- Fail silently (`exit 0`, no output) on any missing/unexpected input rather than blocking the user's prompt — a hook's job is to nudge, never to break the session
- `jq` is required for a hook to be enabled/disabled by `oms hooks` — this is enforced by `hook_enable`/`hook_disable` in `lib.sh`, not something individual hooks need to check themselves
- Test hooks the same way as commands: co-located `hook.test.ts`, testcontainers/Alpine, feeding realistic stdin JSON and asserting on stdout/exit code
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the src/hooks/ artifact type and oms hooks command"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-05-claude-code-hooks-design.md` maps to a task: canonical copy → Task 1; registry → Task 2; settings merge/remove → Task 3; enable/disable/uninstall composition → Task 4; CLI → Task 5; lifecycle wiring → Task 6; the `handoff` hook itself → Task 7; end-to-end coverage → Task 8; docs → Task 9.
- **Read files before editing them.** Several steps above say "Read the file first to locate exact assertions/line numbers before editing" (Task 6's `update.test.ts` and `pr-checks.yml` edits) — this plan was written against the codebase as it existed on 2026-08-05; if earlier tasks in this same plan shift line numbers in a file a later task also touches, re-read before editing, don't trust a stale line number.
- **jq path in Alpine:** Task 4's Step 2 note flags verifying `jq`'s actual binary path in the Alpine test image before writing the `mv /usr/bin/jq /usr/bin/jq.bak` step — confirm with `which jq` in a real container rather than assuming, since a wrong path would make that test silently pass for the wrong reason (jq still found elsewhere) instead of failing loudly.

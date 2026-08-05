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

// Source lib.sh and run a bash expression
function lib(id: string, cmd: string) {
	return exec(id, `bash -c 'source /scripts/lib.sh 2>/dev/null; ${cmd}'`);
}

describe("lib.sh unit tests", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache bash jq curl >/dev/null 2>&1");

		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");

		// INSTALL_DIR with package.json
		exec(id, `mkdir -p ${INSTALL}`);
		copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			`${INSTALL}/package.json`,
		);

		// src/skills
		exec(id, `mkdir -p ${INSTALL}/src/skills/hello-skill`);
		exec(
			id,
			`printf '%s\n' '---' 'name: hello-skill' 'by: oh-my-skills' '---' > ${INSTALL}/src/skills/hello-skill/SKILL.md`,
		);

		// src/commands (with nested dir + non-.sh files that should be excluded)
		exec(id, `mkdir -p ${INSTALL}/src/commands/nested`);
		exec(
			id,
			`printf '#!/bin/bash\nalias hi="echo hi"\n' > ${INSTALL}/src/commands/hi.sh`,
		);
		exec(
			id,
			`printf '#!/bin/bash\nalias bye="echo bye"\n' > ${INSTALL}/src/commands/nested/bye.sh`,
		);
		exec(
			id,
			`printf 'import { test } from "bun:test";\n' > ${INSTALL}/src/commands/nested/bye.test.ts`,
		);
		exec(
			id,
			`printf '# Commands README\n' > ${INSTALL}/src/commands/README.md`,
		);

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

		// Fake LLM binaries
		exec(
			id,
			`printf '#!/bin/sh\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);
		exec(
			id,
			`printf '#!/bin/sh\necho copilot' > /usr/local/bin/copilot && chmod +x /usr/local/bin/copilot`,
		);

		// Shell configs
		exec(id, `printf '# original\n' > ${HOME}/.bashrc`);
		exec(id, `printf '# original\n' > ${HOME}/.zshrc`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// ─── log helpers ──────────────────────────────────────────────────────────

	describe("log helpers", () => {
		it("log_info outputs the message", () => {
			const r = lib(id, `log_info "hello info"`);
			expect(r.output).toContain("hello info");
		});

		it("log_success outputs the message", () => {
			const r = lib(id, `log_success "all good"`);
			expect(r.output).toContain("all good");
		});

		it("log_warning outputs the message", () => {
			const r = lib(id, `log_warning "be careful"`);
			expect(r.output).toContain("be careful");
		});

		it("log_error outputs the message to stderr", () => {
			const r = exec(
				id,
				`bash -c 'source /scripts/lib.sh 2>/dev/null; log_error "something broke" 2>&1'`,
			);
			expect(r.output).toContain("something broke");
		});
	});

	// ─── confirm() ────────────────────────────────────────────────────────────

	describe("confirm()", () => {
		it("returns 0 when user inputs y", () => {
			const r = exec(
				id,
				`bash -c 'source /scripts/lib.sh 2>/dev/null; echo y | confirm "proceed?" && echo yes'`,
			);
			expect(r.output).toContain("yes");
			expect(r.exitCode).toBe(0);
		});

		it("returns 0 when user inputs Y", () => {
			const r = exec(
				id,
				`bash -c 'source /scripts/lib.sh 2>/dev/null; echo Y | confirm "proceed?" && echo yes'`,
			);
			expect(r.output).toContain("yes");
		});

		it("returns non-zero when user inputs n", () => {
			const r = exec(
				id,
				`bash -c 'source /scripts/lib.sh 2>/dev/null; echo n | confirm "proceed?" || echo no'`,
			);
			expect(r.output).toContain("no");
		});

		it("returns non-zero for any other input", () => {
			const r = exec(
				id,
				`bash -c 'source /scripts/lib.sh 2>/dev/null; echo maybe | confirm "proceed?" || echo no'`,
			);
			expect(r.output).toContain("no");
		});
	});

	// ─── detect_shell() ───────────────────────────────────────────────────────

	describe("detect_shell()", () => {
		it("returns zsh when .zshrc exists", () => {
			exec(id, `touch ${HOME}/.zshrc`);
			const r = lib(id, `detect_shell`);
			expect(r.output).toBe("zsh");
		});

		it("returns bash when only .bashrc exists", () => {
			exec(id, `rm -f ${HOME}/.zshrc && touch ${HOME}/.bashrc`);
			const r = lib(id, `detect_shell`);
			expect(r.output).toBe("bash");
		});

		it("returns bash as default when neither exists", () => {
			exec(id, `rm -f ${HOME}/.zshrc ${HOME}/.bashrc`);
			const r = lib(id, `detect_shell`);
			expect(r.output).toBe("bash");
			// Restore for following tests
			exec(id, `printf '# original\n' > ${HOME}/.bashrc`);
		});
	});

	// ─── detect_llms() ────────────────────────────────────────────────────────

	describe("detect_llms()", () => {
		it("detects both CLIs when available", () => {
			const r = lib(id, `detect_llms`);
			expect(r.output).toContain("Claude CLI detected");
			expect(r.output).toContain("GitHub Copilot CLI detected");
		});

		it("warns when claude is missing", () => {
			exec(id, `mv /usr/local/bin/claude /usr/local/bin/claude.bak`);
			const r = lib(id, `detect_llms`);
			expect(r.output).toContain("Claude CLI not found");
			exec(id, `mv /usr/local/bin/claude.bak /usr/local/bin/claude`);
		});

		it("warns when copilot is missing", () => {
			exec(id, `mv /usr/local/bin/copilot /usr/local/bin/copilot.bak`);
			const r = lib(id, `detect_llms`);
			expect(r.output).toContain("GitHub Copilot CLI not found");
			exec(id, `mv /usr/local/bin/copilot.bak /usr/local/bin/copilot`);
		});

		it("warns that no skills will be installed when no CLI found", () => {
			exec(
				id,
				`mv /usr/local/bin/claude /usr/local/bin/claude.bak && mv /usr/local/bin/copilot /usr/local/bin/copilot.bak`,
			);
			const r = lib(id, `detect_llms`);
			expect(r.output).toContain("No supported LLM CLI detected");
			exec(
				id,
				`mv /usr/local/bin/claude.bak /usr/local/bin/claude && mv /usr/local/bin/copilot.bak /usr/local/bin/copilot`,
			);
		});
	});

	// ─── get_version() ────────────────────────────────────────────────────────

	describe("get_version()", () => {
		it("reads version from package.json with jq", () => {
			const r = lib(id, `get_version`);
			expect(r.output).toBe(VERSION);
		});

		it("reads version from package.json without jq", () => {
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			try {
				const r = lib(id, `get_version`);
				expect(r.output).toBe(VERSION);
			} finally {
				exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
			}
		});

		it("returns unknown when package.json is missing", () => {
			exec(id, `mv ${INSTALL}/package.json ${INSTALL}/package.json.bak`);
			try {
				const r = lib(id, `get_version`);
				expect(r.output).toBe("unknown");
			} finally {
				exec(id, `mv ${INSTALL}/package.json.bak ${INSTALL}/package.json`);
			}
		});
	});

	// ─── init_registry() ──────────────────────────────────────────────────────

	describe("init_registry()", () => {
		it("creates registry.json with version and empty skills", () => {
			lib(id, `init_registry`);
			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.version).toBe(VERSION);
			expect(registry.skills.claude).toEqual([]);
			expect(registry.skills.copilot).toEqual([]);
		});

		it("overwrites an existing registry", () => {
			exec(
				id,
				`echo '{"version":"old","skills":{}}' > ${INSTALL}/registry.json`,
			);
			lib(id, `init_registry`);
			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.version).toBe(VERSION);
		});

		it("initializes registry.json with an empty hooks.enabled list", () => {
			lib(id, `init_registry`);
			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.hooks.enabled).toEqual([]);
		});
	});

	// ─── install_skills() ─────────────────────────────────────────────────────

	describe("install_skills()", () => {
		it("copies canonical skill to ~/.oh-my-skills/skills/", () => {
			exec(id, `rm -rf ${INSTALL}/skills`);
			lib(id, `init_registry && install_skills`);

			const skill = exec(
				id,
				`test -f ${INSTALL}/skills/hello-skill/SKILL.md && echo ok`,
			);
			expect(skill.output).toBe("ok");

			// Canonical file should contain the original SKILL.md content
			const content = exec(id, `cat ${INSTALL}/skills/hello-skill/SKILL.md`);
			expect(content.output).toContain("by: oh-my-skills");
		});

		it("creates Claude symlink and updates registry", () => {
			exec(id, `rm -rf ${HOME}/.claude/skills`);
			lib(id, `init_registry && install_skills`);

			// Should be a symlink
			const isLink = exec(
				id,
				`test -L ${HOME}/.claude/skills/hello-skill && echo ok`,
			);
			expect(isLink.output).toBe("ok");

			// Symlink target should be the canonical dir
			const target = exec(id, `readlink ${HOME}/.claude/skills/hello-skill`);
			expect(target.output).toContain("oh-my-skills/skills/hello-skill");

			// Content readable through symlink
			const content = exec(
				id,
				`cat ${HOME}/.claude/skills/hello-skill/SKILL.md`,
			);
			expect(content.output).toContain("by: oh-my-skills");

			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.skills.claude.length).toBeGreaterThan(0);
		});

		it("generates Copilot wrapper and updates registry", () => {
			exec(id, `rm -rf ${HOME}/.copilot/skills`);
			lib(id, `init_registry && install_skills`);

			const wrapper = exec(
				id,
				`test -f ${HOME}/.copilot/skills/hello-skill.prompt.md && echo ok`,
			);
			expect(wrapper.output).toBe("ok");

			// Wrapper should have frontmatter and point to canonical skill
			const content = exec(
				id,
				`cat ${HOME}/.copilot/skills/hello-skill.prompt.md`,
			);
			expect(content.output).toContain('mode: "agent"');
			expect(content.output).toContain(
				"oh-my-skills/skills/hello-skill/SKILL.md",
			);

			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			expect(registry.skills.copilot.length).toBeGreaterThan(0);
		});

		it("skips claude wrapper when claude CLI is absent", () => {
			exec(
				id,
				`rm -rf ${HOME}/.claude/skills && mv /usr/local/bin/claude /usr/local/bin/claude.bak`,
			);
			lib(id, `init_registry && install_skills`);

			const wrapper = exec(
				id,
				`test -f ${HOME}/.claude/skills/hello-skill/SKILL.md && echo exists || echo absent`,
			);
			expect(wrapper.output).toBe("absent");

			// Canonical skill should still be installed
			const canonical = exec(
				id,
				`test -f ${INSTALL}/skills/hello-skill/SKILL.md && echo ok`,
			);
			expect(canonical.output).toBe("ok");

			exec(id, `mv /usr/local/bin/claude.bak /usr/local/bin/claude`);
		});

		it("resets skills list on each call (no duplicates in registry)", () => {
			lib(id, `init_registry && install_skills`);
			lib(id, `install_skills`);
			const r = exec(id, `cat ${INSTALL}/registry.json`);
			const registry = JSON.parse(r.output);
			// Each skill should appear exactly once per LLM
			const uniqueClaude = new Set(registry.skills.claude);
			expect(uniqueClaude.size).toBe(registry.skills.claude.length);
		});
	});

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

		it("registry_write_skills preserves hooks via non-jq fallback", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);

			// Hide jq to force non-jq code path
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			try {
				exec(id, `rm -rf ${HOME}/.claude/skills`);
				lib(id, `install_skills`);

				const r = exec(id, `cat ${INSTALL}/registry.json`);
				const registry = JSON.parse(r.output);
				expect(registry.hooks.enabled).toEqual(["handoff"]);
			} finally {
				exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
			}
		});

		it("registry_read_enabled_hooks works via non-jq sed fallback", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);
			lib(id, `registry_add_enabled_hook "other-hook"`);

			// Hide jq to force non-jq code path
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			try {
				const r = lib(id, `registry_read_enabled_hooks`);
				expect(r.output.split("\n").sort()).toEqual(["handoff", "other-hook"]);
			} finally {
				exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
			}
		});

		it("registry_add_enabled_hook fails safely when jq is absent", () => {
			lib(id, `init_registry`);

			// Hide jq
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			try {
				const r = lib(id, `registry_add_enabled_hook "handoff"`);
				expect(r.exitCode).not.toBe(0);
				// Registry should still be intact
				const reg = exec(id, `cat ${INSTALL}/registry.json`);
				const registry = JSON.parse(reg.output);
				expect(registry.version).toBeDefined();
				expect(registry.skills).toBeDefined();
				expect(registry.hooks).toBeDefined();
			} finally {
				exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
			}
		});

		it("registry_remove_enabled_hook fails safely when jq is absent", () => {
			lib(id, `init_registry`);
			lib(id, `registry_add_enabled_hook "handoff"`);

			// Hide jq
			exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
			try {
				const r = lib(id, `registry_remove_enabled_hook "handoff"`);
				expect(r.exitCode).not.toBe(0);
				// Registry should still be intact with hooks preserved
				const reg = exec(id, `cat ${INSTALL}/registry.json`);
				const registry = JSON.parse(reg.output);
				expect(registry.hooks.enabled).toEqual(["handoff"]);
			} finally {
				exec(id, `mv /usr/bin/jq.bak /usr/bin/jq`);
			}
		});
	});

	// ─── settings_merge_hook() / settings_remove_hook() ──────────────────────

	describe("settings_merge_hook() / settings_remove_hook()", () => {
		it("creates ~/.claude/settings.json when it doesn't exist", () => {
			exec(id, `rm -rf ${HOME}/.claude/settings.json`);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			const r = exec(id, `test -f ${HOME}/.claude/settings.json && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("writes the expected hook entry shape", () => {
			exec(id, `rm -f ${HOME}/.claude/settings.json`);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
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
			// NOTE: uses exec(), not lib() — lib() wraps cmd in an extra
			// `bash -c '...'` layer, and this echo's own single-quoted JSON
			// argument breaks that outer quoting (nested single quotes don't
			// nest in shell). exec() matches every other JSON-seeding line in
			// this file and round-trips the JSON correctly.
			exec(
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
			const r = lib(
				id,
				`settings_remove_hook "UserPromptSubmit" "/opt/hook.sh"`,
			);
			expect(r.exitCode).toBe(0);
		});

		it("settings_remove_hook only strips the matching hook from a co-located group, not the whole group", () => {
			// A single matcher-group can legitimately hold multiple hooks (the
			// settings.json schema's .hooks is an array precisely for this).
			// Removing our command must not silently drop the user's own
			// co-located command in the same group.
			exec(
				id,
				`echo '{"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[{"type":"command","command":"/opt/hook.sh","timeout":10},{"type":"command","command":"/my/own/script.sh"}]}]}}' > ${HOME}/.claude/settings.json`,
			);
			lib(id, `settings_remove_hook "UserPromptSubmit" "/opt/hook.sh"`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			const commands = settings.hooks.UserPromptSubmit.flatMap((g: any) =>
				g.hooks.map((h: any) => h.command),
			);
			expect(commands).toEqual(["/my/own/script.sh"]);
		});

		it("settings_merge_hook's idempotent re-merge only strips the matching hook from a co-located group, not the whole group", () => {
			exec(
				id,
				`echo '{"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[{"type":"command","command":"/opt/hook.sh","timeout":10},{"type":"command","command":"/my/own/script.sh"}]}]}}' > ${HOME}/.claude/settings.json`,
			);
			lib(id, `settings_merge_hook "UserPromptSubmit" "*" "/opt/hook.sh" 10`);
			const r = exec(id, `cat ${HOME}/.claude/settings.json`);
			const settings = JSON.parse(r.output);
			const commands = settings.hooks.UserPromptSubmit.flatMap((g: any) =>
				g.hooks.map((h: any) => h.command),
			);
			expect(commands.sort()).toEqual(["/my/own/script.sh", "/opt/hook.sh"]);
		});
	});

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

	// ─── install_commands() ───────────────────────────────────────────────────

	describe("install_commands()", () => {
		it("copies command files to COMMANDS_DIR", () => {
			exec(id, `rm -rf ${INSTALL}/commands`);
			lib(id, `install_commands`);

			const r = exec(id, `test -f ${INSTALL}/commands/hi.sh && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("copies nested command files", () => {
			lib(id, `install_commands`);
			const r = exec(
				id,
				`test -f ${INSTALL}/commands/nested/bye.sh && echo ok`,
			);
			expect(r.output).toBe("ok");
		});

		it("makes .sh files executable", () => {
			lib(id, `install_commands`);
			const r = exec(id, `test -x ${INSTALL}/commands/hi.sh && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("excludes non-.sh files from installation", () => {
			exec(id, `rm -rf ${INSTALL}/commands`);
			lib(id, `install_commands`);

			const ts = exec(
				id,
				`test -f ${INSTALL}/commands/nested/bye.test.ts && echo found || echo absent`,
			);
			expect(ts.output).toBe("absent");

			const md = exec(
				id,
				`test -f ${INSTALL}/commands/README.md && echo found || echo absent`,
			);
			expect(md.output).toBe("absent");
		});
	});

	// ─── create_shell_sourcing() ──────────────────────────────────────────────

	describe("create_shell_sourcing()", () => {
		it("creates an executable shell file", () => {
			lib(id, `create_shell_sourcing "install"`);
			const r = exec(id, `test -x ${INSTALL}/shell && echo ok`);
			expect(r.output).toBe("ok");
		});

		it("shell file sources commands recursively", () => {
			lib(id, `create_shell_sourcing "install"`);
			const content = exec(id, `cat ${INSTALL}/shell`);
			expect(content.output).toContain("commands");
			expect(content.output).toContain("source");
		});

		it("shell file triggers auto-check on interactive shell", () => {
			lib(id, `create_shell_sourcing "install"`);
			const content = exec(id, `cat ${INSTALL}/shell`);
			expect(content.output).toContain("update.sh");
			expect(content.output).toContain("--auto-check");
		});

		it('outputs "created" message in install mode', () => {
			const r = lib(id, `create_shell_sourcing "install"`);
			expect(r.output).toContain("created");
		});

		it('outputs "updated" message in update mode', () => {
			const r = lib(id, `create_shell_sourcing "update"`);
			expect(r.output).toContain("updated");
		});
	});

	// ─── inject_sourcing() ────────────────────────────────────────────────────

	describe("inject_sourcing()", () => {
		it("injects source line into .bashrc", () => {
			exec(id, `printf '# clean\n' > ${HOME}/.bashrc`);
			lib(
				id,
				`create_shell_sourcing "install" && inject_sourcing "bash" "install"`,
			);
			const r = exec(id, `grep "oh-my-skills" ${HOME}/.bashrc`);
			expect(r.exitCode).toBe(0);
			expect(r.output).toContain("source");
		});

		it("injects source line into .zshrc", () => {
			exec(id, `printf '# clean\n' > ${HOME}/.zshrc`);
			lib(
				id,
				`create_shell_sourcing "install" && inject_sourcing "zsh" "install"`,
			);
			const r = exec(id, `grep "oh-my-skills" ${HOME}/.zshrc`);
			expect(r.exitCode).toBe(0);
			expect(r.output).toContain("source");
		});

		it("preserves existing content when injecting", () => {
			exec(id, `printf '# my config\nexport FOO=bar\n' > ${HOME}/.bashrc`);
			lib(
				id,
				`create_shell_sourcing "install" && inject_sourcing "bash" "install"`,
			);
			const r = exec(id, `cat ${HOME}/.bashrc`);
			expect(r.output).toContain("my config");
			expect(r.output).toContain("FOO=bar");
		});

		it("does not duplicate sourcing line on repeated calls", () => {
			exec(id, `printf '# clean\n' > ${HOME}/.bashrc`);
			lib(
				id,
				`create_shell_sourcing "install" && inject_sourcing "bash" "install"`,
			);
			lib(id, `inject_sourcing "bash" "install"`);
			const r = exec(id, `grep -c "oh-my-skills" ${HOME}/.bashrc`);
			expect(r.output).toBe("1");
		});

		it("silently skips in update mode when sourcing already present", () => {
			exec(id, `printf '# clean\n' > ${HOME}/.bashrc`);
			lib(
				id,
				`create_shell_sourcing "install" && inject_sourcing "bash" "install"`,
			);
			const r = lib(id, `inject_sourcing "bash" "update"`);
			// No warning in update mode
			expect(r.output).not.toContain("already present");
			const count = exec(id, `grep -c "oh-my-skills" ${HOME}/.bashrc`);
			expect(count.output).toBe("1");
		});
	});

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
			const r = exec(
				id,
				`test -x ${INSTALL}/hooks/sample-hook/hook.sh && echo ok`,
			);
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
			exec(
				id,
				`printf 'echo nope' > ${INSTALL}/src/hooks/incomplete-hook/hook.sh`,
			);

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
});

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

		// src/commands (with nested dir)
		exec(id, `mkdir -p ${INSTALL}/src/commands/nested`);
		exec(
			id,
			`printf '#!/bin/bash\nalias hi="echo hi"\n' > ${INSTALL}/src/commands/hi.sh`,
		);
		exec(
			id,
			`printf '#!/bin/bash\nalias bye="echo bye"\n' > ${INSTALL}/src/commands/nested/bye.sh`,
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
	});

	// ─── install_skills() ─────────────────────────────────────────────────────

	describe("install_skills()", () => {
		it("copies canonical skill to ~/.oh-my-skills/skills/", () => {
			exec(id, `rm -rf ${INSTALL}/skills`);
			lib(id, `init_registry && install_skills`);

			const skill = exec(
				id,
				`test -f ${INSTALL}/skills/hello-skill.md && echo ok`,
			);
			expect(skill.output).toBe("ok");

			// Canonical file should contain the original SKILL.md content
			const content = exec(id, `cat ${INSTALL}/skills/hello-skill.md`);
			expect(content.output).toContain("by: oh-my-skills");
		});

		it("generates Claude wrapper and updates registry", () => {
			exec(id, `rm -rf ${HOME}/.claude/skills`);
			lib(id, `init_registry && install_skills`);

			const wrapper = exec(
				id,
				`test -f ${HOME}/.claude/skills/hello-skill.md && echo ok`,
			);
			expect(wrapper.output).toBe("ok");

			// Wrapper should point to canonical skill, not contain full content
			const content = exec(id, `cat ${HOME}/.claude/skills/hello-skill.md`);
			expect(content.output).toContain("oh-my-skills/skills/hello-skill.md");
			expect(content.output).toContain("$ARGUMENTS");

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
			expect(content.output).toContain("oh-my-skills/skills/hello-skill.md");

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
				`test -f ${HOME}/.claude/skills/hello-skill.md && echo exists || echo absent`,
			);
			expect(wrapper.output).toBe("absent");

			// Canonical skill should still be installed
			const canonical = exec(
				id,
				`test -f ${INSTALL}/skills/hello-skill.md && echo ok`,
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
});

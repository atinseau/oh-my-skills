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

describe("oh-my-skills Uninstall (real script)", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		// Install deps
		exec(id, "apk add --no-cache git bash jq >/dev/null 2>&1");

		// Copy real scripts
		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/uninstall.sh`, "/scripts/uninstall.sh");
		exec(id, "chmod +x /scripts/*.sh");

		// Create local repo
		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);
		exec(id, "mkdir -p /tmp/remote-repo/src/skills/test-skill");
		exec(
			id,
			`printf '%s\\n' '---' 'name: test-skill' 'description: A test skill' 'by: oh-my-skills' '---' 'Test.' > /tmp/remote-repo/src/skills/test-skill/SKILL.md`,
		);
		exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		exec(
			id,
			`printf '#!/bin/bash\\nalias hi="echo hi"\\n' > /tmp/remote-repo/src/commands/hi.sh`,
		);
		exec(
			id,
			"mkdir -p /tmp/remote-repo/scripts && cp /scripts/*.sh /tmp/remote-repo/scripts/",
		);
		copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'init' && git tag v${VERSION}`,
		);

		// Fake LLM binaries
		exec(
			id,
			`printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);
		exec(
			id,
			`printf '#!/bin/sh\\necho copilot' > /usr/local/bin/copilot && chmod +x /usr/local/bin/copilot`,
		);

		// Create .bashrc
		exec(
			id,
			`printf '%s\\n' '# original config' 'export LANG=en' > ${HOME}/.bashrc`,
		);

		// Run install first
		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);

		// Also create a foreign skill in Claude's skills dir (not from oh-my-skills)
		exec(id, `mkdir -p ${HOME}/.claude/skills`);
		exec(
			id,
			`printf '%s\\n' 'This is a custom skill that has nothing to do with oh-my-skills.' > ${HOME}/.claude/skills/foreign-skill.md`,
		);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should have installed wrappers before uninstall", () => {
		// Claude wrapper should be a file (not a directory)
		const claude = exec(
			id,
			`test -f ${HOME}/.claude/skills/test-skill.md && echo ok`,
		);
		expect(claude.output).toBe("ok");

		// Copilot wrapper should be a .prompt.md file
		const copilot = exec(
			id,
			`test -f ${HOME}/.copilot/skills/test-skill.prompt.md && echo ok`,
		);
		expect(copilot.output).toBe("ok");

		// Canonical skill should exist
		const canonical = exec(
			id,
			`test -f ${INSTALL}/skills/test-skill.md && echo ok`,
		);
		expect(canonical.output).toBe("ok");
	});

	it("should run uninstall.sh successfully", () => {
		// Pipe "y" for confirmation
		const r = exec(id, `echo y | bash /scripts/uninstall.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Uninstallation Complete");
	});

	it("should have removed Claude wrapper for test-skill", () => {
		const r = exec(
			id,
			`test -f ${HOME}/.claude/skills/test-skill.md && echo exists || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have removed Copilot wrapper for test-skill", () => {
		const r = exec(
			id,
			`test -f ${HOME}/.copilot/skills/test-skill.prompt.md && echo exists || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have preserved foreign skills (no oh-my-skills marker)", () => {
		const r = exec(
			id,
			`test -f ${HOME}/.claude/skills/foreign-skill.md && echo exists`,
		);
		expect(r.output).toBe("exists");
	});

	it("should have removed sourcing from .bashrc", () => {
		const r = exec(
			id,
			`grep -q "oh-my-skills" ${HOME}/.bashrc && echo found || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have preserved original .bashrc content", () => {
		const r = exec(id, `cat ${HOME}/.bashrc`);
		expect(r.output).toContain("original config");
	});

	it("should have removed ~/.oh-my-skills directory", () => {
		const r = exec(id, `test -d ${INSTALL} && echo exists || echo gone`);
		expect(r.output).toBe("gone");
	});

	it("should handle running uninstall again gracefully (already removed)", () => {
		const r = exec(id, `bash /scripts/uninstall.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("not installed");
	});
});

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

describe("oh-my-skills install.sh (e2e)", () => {
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
		exec(id, "chmod +x /scripts/*.sh");

		// Local git repo acting as the remote
		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		exec(id, "mkdir -p /tmp/remote-repo/src/skills/greeting-skill");
		exec(
			id,
			`printf '%s\n' '---' 'name: greeting-skill' 'description: A friendly greeting skill' 'by: oh-my-skills' '---' 'Say hello nicely.' > /tmp/remote-repo/src/skills/greeting-skill/SKILL.md`,
		);
		exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		exec(
			id,
			`printf '#!/bin/bash\nalias greet="echo hello"\n' > /tmp/remote-repo/src/commands/greet.sh`,
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

		// Fake LLM binaries
		exec(
			id,
			`printf '#!/bin/sh\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);

		exec(id, `printf '# my bashrc\nexport PATH=/usr/bin\n' > ${HOME}/.bashrc`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should complete the full install workflow successfully", () => {
		const r = exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Installation Complete");
	});

	it("should install canonical skill to ~/.oh-my-skills/skills/", () => {
		const r = exec(
			id,
			`test -f ${INSTALL}/skills/greeting-skill/SKILL.md && echo ok`,
		);
		expect(r.output).toBe("ok");

		// Canonical file should contain the original SKILL.md content
		const content = exec(id, `cat ${INSTALL}/skills/greeting-skill/SKILL.md`);
		expect(content.output).toContain("by: oh-my-skills");
		expect(content.output).toContain("Say hello nicely.");
	});

	it("should generate Claude wrapper pointing to canonical skill", () => {
		const r = exec(
			id,
			`test -f ${HOME}/.claude/skills/greeting-skill/SKILL.md && echo ok`,
		);
		expect(r.output).toBe("ok");

		const content = exec(
			id,
			`cat ${HOME}/.claude/skills/greeting-skill/SKILL.md`,
		);
		expect(content.output).toContain(
			"oh-my-skills/skills/greeting-skill/SKILL.md",
		);
		expect(content.output).toContain("$ARGUMENTS");
		// Wrapper should NOT contain the full skill content
		expect(content.output).not.toContain("Say hello nicely.");
	});

	it("should fail fast when git is not installed", () => {
		const r = exec(
			id,
			`PATH=/usr/local/bin /bin/bash /scripts/install.sh 2>&1`,
		);
		expect(r.exitCode).toBe(1);
		expect(r.output).toContain("git is required");
	});

	it("should fetch lib.sh and install successfully when lib.sh is not beside the script", () => {
		// Simulates curl pipe mode: only install.sh is available, no lib.sh beside it.
		// OMS_LIB_BASE_URL uses file:// to mock the network fetch without internet access.
		exec(id, `rm -rf ${INSTALL}`);
		exec(
			id,
			"mkdir -p /tmp/standalone && cp /scripts/install.sh /tmp/standalone/install.sh",
		);
		const r = exec(
			id,
			"REPO_URL=/tmp/remote-repo OMS_LIB_BASE_URL=file:///scripts bash /tmp/standalone/install.sh 2>&1",
		);
		expect(r.output).not.toContain("unbound variable");
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Installation Complete");
	});

	it("should not duplicate the sourcing line on reinstall", () => {
		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
		const count = exec(id, `grep -c "oh-my-skills" ${HOME}/.bashrc`);
		expect(count.output).toBe("1");
	});

	it("should preserve original .bashrc content after install", () => {
		const r = exec(id, `cat ${HOME}/.bashrc`);
		expect(r.output).toContain("my bashrc");
	});

	it("should make commands available via the shell file", () => {
		const r = exec(
			id,
			`bash -c 'shopt -s expand_aliases; source ${INSTALL}/shell && alias greet'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("greet");
	});

	it("should expose oms command with --help", () => {
		const r = exec(id, `bash -c 'source ${INSTALL}/shell && oms --help'`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Usage: oms");
		expect(r.output).toContain("update");
	});
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, HOME, INSTALL, SCRIPTS_DIR } from "./helpers";

describe("oh-my-skills Install (real script)", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		// Install deps
		exec(id, "apk add --no-cache git bash jq >/dev/null 2>&1");

		// Copy real scripts into the container
		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/uninstall.sh`, "/scripts/uninstall.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		exec(id, "chmod +x /scripts/*.sh");

		// Create a local git repo to act as the "remote" repo
		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		// Add skills
		exec(id, "mkdir -p /tmp/remote-repo/src/skills/greeting-skill");
		exec(
			id,
			`printf '%s\\n' '---' 'name: greeting-skill' 'description: A greeting skill' 'by: oh-my-skills' '---' 'Say hello to the user.' > /tmp/remote-repo/src/skills/greeting-skill/SKILL.md`,
		);

		exec(id, "mkdir -p /tmp/remote-repo/src/skills/deploy-skill");
		exec(
			id,
			`printf '%s\\n' '---' 'name: deploy-skill' 'description: Deploy helper' 'by: oh-my-skills' '---' 'Help deploy.' > /tmp/remote-repo/src/skills/deploy-skill/SKILL.md`,
		);

		// Add commands
		exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		exec(
			id,
			`printf '#!/bin/bash\\nalias greet="echo hello"\\n' > /tmp/remote-repo/src/commands/greet.sh`,
		);
		exec(
			id,
			`printf '#!/bin/bash\\nalias deploy="echo deploying"\\n' > /tmp/remote-repo/src/commands/deploy.sh`,
		);

		// Add scripts dir (so update can re-run install)
		exec(id, "mkdir -p /tmp/remote-repo/scripts");
		exec(id, "cp /scripts/*.sh /tmp/remote-repo/scripts/");

		// Commit
		exec(
			id,
			"cd /tmp/remote-repo && git add . && git commit -m 'initial' && git tag v0.0.2",
		);

		// Create fake claude and copilot binaries
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
			`printf '%s\\n' '# my bashrc' 'export PATH=/usr/bin' > ${HOME}/.bashrc`,
		);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should run install.sh successfully", () => {
		const r = exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Installation Complete");
	});

	it("should have created ~/.oh-my-skills", () => {
		const r = exec(id, `test -d ${INSTALL} && echo ok`);
		expect(r.output).toBe("ok");
	});

	it("should have created registry.json with version", () => {
		const r = exec(id, `cat ${INSTALL}/registry.json`);
		const registry = JSON.parse(r.output);
		expect(registry.version).toBe("0.0.2");
	});

	it("should have installed skills for Claude", () => {
		const r = exec(id, `cat ${INSTALL}/registry.json`);
		const registry = JSON.parse(r.output);
		expect(registry.skills.claude.length).toBeGreaterThan(0);

		// Check actual files exist
		const check = exec(
			id,
			`test -f ${HOME}/.claude/skills/greeting-skill/SKILL.md && echo ok`,
		);
		expect(check.output).toBe("ok");

		const check2 = exec(
			id,
			`test -f ${HOME}/.claude/skills/deploy-skill/SKILL.md && echo ok`,
		);
		expect(check2.output).toBe("ok");
	});

	it("should have installed skills for Copilot", () => {
		const r = exec(id, `cat ${INSTALL}/registry.json`);
		const registry = JSON.parse(r.output);
		expect(registry.skills.copilot.length).toBeGreaterThan(0);

		const check = exec(
			id,
			`test -f ${HOME}/.copilot/skills/greeting-skill/SKILL.md && echo ok`,
		);
		expect(check.output).toBe("ok");
	});

	it("should have oh-my-skills marker in installed skills", () => {
		const r = exec(
			id,
			`grep "by: oh-my-skills" ${HOME}/.claude/skills/greeting-skill/SKILL.md && echo found`,
		);
		expect(r.output).toContain("found");
	});

	it("should have copied commands", () => {
		const r = exec(
			id,
			`test -f ${INSTALL}/commands/greet.sh && test -f ${INSTALL}/commands/deploy.sh && echo ok`,
		);
		expect(r.output).toBe("ok");
	});

	it("should have created the shell sourcing script", () => {
		const r = exec(id, `test -x ${INSTALL}/shell && echo ok`);
		expect(r.output).toBe("ok");

		const content = exec(id, `cat ${INSTALL}/shell`);
		expect(content.output).toContain("source");
		expect(content.output).toContain("commands");
	});

	it("should have injected sourcing into .bashrc", () => {
		const r = exec(id, `grep "oh-my-skills" ${HOME}/.bashrc`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("source");
	});

	it("should have preserved original .bashrc content", () => {
		const r = exec(id, `cat ${HOME}/.bashrc`);
		expect(r.output).toContain("my bashrc");
	});

	it("should not duplicate sourcing on reinstall", () => {
		// Run install again
		const r = exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
		expect(r.exitCode).toBe(0);

		// Count sourcing lines
		const count = exec(id, `grep -c "oh-my-skills" ${HOME}/.bashrc`);
		expect(count.output).toBe("1");
	});

	it("should source commands dynamically via shell script", () => {
		const r = exec(
			id,
			`bash -c 'shopt -s expand_aliases; source ${INSTALL}/shell && alias greet && alias deploy'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("greet");
		expect(r.output).toContain("deploy");
	});

	it("should not create a skills subdirectory in .oh-my-skills", () => {
		const r = exec(id, `test -d ${INSTALL}/skills && echo exists || echo nope`);
		expect(r.output).toBe("nope");
	});
});

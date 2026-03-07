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

describe("oh-my-skills Update (real script)", () => {
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
		copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		exec(id, "chmod +x /scripts/*.sh");

		// Create local repo (v${VERSION})
		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);
		exec(id, "mkdir -p /tmp/remote-repo/src/skills/skill-a");
		exec(
			id,
			`printf '%s\\n' '---' 'name: skill-a' 'by: oh-my-skills' '---' > /tmp/remote-repo/src/skills/skill-a/SKILL.md`,
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
			`cd /tmp/remote-repo && git add . && git commit -m 'v${VERSION}' && git tag v${VERSION}`,
		);

		// Fake LLM binaries
		exec(
			id,
			`printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);

		// Create .bashrc
		exec(id, `printf '# bashrc\\n' > ${HOME}/.bashrc`);

		// Run install
		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it(`should have version ${VERSION} after install`, () => {
		const r = exec(id, `jq -r '.version' ${INSTALL}/registry.json`);
		expect(r.output).toBe(VERSION);
	});

	it("should report up-to-date in manual mode when no update available", () => {
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("up to date");
	});

	it("should stay quiet in auto-check mode when no update available", () => {
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should not modify installation when up to date", () => {
		// Add a marker file to verify nothing changes
		exec(id, `echo untouched > ${INSTALL}/marker.txt`);

		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`);

		const r = exec(id, `cat ${INSTALL}/marker.txt`);
		expect(r.output).toBe("untouched");
	});

	it("should not modify registry when up to date", () => {
		const r = exec(id, `jq -r '.version' ${INSTALL}/registry.json`);
		expect(r.output).toBe(VERSION);
	});

	it("should detect update when remote has new tag", () => {
		// Push a new version to the remote repo — also update hi.sh to verify command updates
		exec(
			id,
			"cd /tmp/remote-repo && echo bye > src/commands/bye.sh && git add . && git commit -m 'feat(commands): add bye alias' && printf '#!/bin/bash\\nalias hi=\"echo hi v2\"\\n' > src/commands/hi.sh && echo fix > CHANGELOG_FIX && git add . && git commit -m 'fix(update): improve release sync' && git tag v0.2.0",
		);

		const r = exec(
			id,
			`echo n | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.output).toContain("Update available");
		expect(r.output).toContain("Reason: keep your commands, skills, and fixes");
		expect(r.output).toContain("oms update");
	});

	it("should update in manual mode when user confirms", () => {
		const r = exec(
			id,
			`echo y | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Update Complete");
		expect(r.output).toContain("Changelog since");
		expect(r.output).toContain("feat(commands): add bye alias");
		expect(r.output).toContain("fix(update): improve release sync");
	});

	it("should have updated existing command after update", () => {
		// hi.sh was modified in v0.2.0 — verify the installed copy reflects the new content
		const r = exec(id, `cat ${INSTALL}/commands/hi.sh`);
		expect(r.output).toContain("hi v2");
	});

	it("should have installed new command added in update", () => {
		const r = exec(id, `test -f ${INSTALL}/commands/bye.sh && echo ok`);
		expect(r.output).toBe("ok");
	});

	it("should handle not-installed state in manual mode", () => {
		// Remove installation
		exec(id, `rm -rf ${INSTALL}`);

		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("not installed");
	});

	it("should stay quiet when not installed in auto-check mode", () => {
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});
});

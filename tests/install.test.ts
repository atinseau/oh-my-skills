import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	HOME,
	INSTALL,
	PROJECT_DIR,
	SCRIPTS_DIR,
	startContainer,
	VERSION,
} from "./helpers";

describe("oh-my-skills install.sh (e2e)", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;

		await exec(id, "mkdir -p /scripts");
		await copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		await copyToContainer(
			id,
			`${SCRIPTS_DIR}/install.sh`,
			"/scripts/install.sh",
		);
		await copyToContainer(
			id,
			`${SCRIPTS_DIR}/uninstall.sh`,
			"/scripts/uninstall.sh",
		);
		await copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		await exec(id, "chmod +x /scripts/*.sh");

		// Local git repo acting as the remote
		await exec(id, "mkdir -p /tmp/remote-repo");
		await exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		await exec(id, "mkdir -p /tmp/remote-repo/src/skills/greeting-skill");
		await exec(
			id,
			`printf '%s\n' '---' 'name: greeting-skill' 'description: A friendly greeting skill' 'by: oh-my-skills' '---' 'Say hello nicely.' > /tmp/remote-repo/src/skills/greeting-skill/SKILL.md`,
		);
		// A skill with the optional subdirectories: prose that must ship, a
		// script that must ship executable, and a co-located test that must not.
		await exec(
			id,
			"mkdir -p /tmp/remote-repo/src/skills/greeting-skill/references /tmp/remote-repo/src/skills/greeting-skill/scripts",
		);
		await exec(
			id,
			`printf 'Long-form notes.\n' > /tmp/remote-repo/src/skills/greeting-skill/references/notes.md`,
		);
		await exec(
			id,
			`printf '#!/bin/sh\necho helper\n' > /tmp/remote-repo/src/skills/greeting-skill/scripts/helper.sh && chmod +x /tmp/remote-repo/src/skills/greeting-skill/scripts/helper.sh`,
		);
		await exec(
			id,
			`printf 'it("runs", () => {});\n' > /tmp/remote-repo/src/skills/greeting-skill/scripts/helper.test.ts`,
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		await exec(
			id,
			`printf '#!/bin/bash\nalias greet="echo hello"\n' > /tmp/remote-repo/src/commands/greet.sh`,
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/commands/oms-cli");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/tmp/remote-repo/src/commands/oms-cli/oms.sh",
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/hooks/sample-hook");
		await exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > /tmp/remote-repo/src/hooks/sample-hook/hook.json`,
		);
		await exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > /tmp/remote-repo/src/hooks/sample-hook/hook.sh`,
		);
		await exec(id, "mkdir -p /tmp/remote-repo/scripts");
		await exec(id, "cp /scripts/*.sh /tmp/remote-repo/scripts/");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		await exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'initial' && git tag v${VERSION}`,
		);

		// Fake LLM binaries
		await exec(
			id,
			`printf '#!/bin/sh\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);

		await exec(
			id,
			`printf '# my bashrc\nexport PATH=/usr/bin\n' > ${HOME}/.bashrc`,
		);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should complete the full install workflow successfully", async () => {
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/install.sh`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Installation Complete");
	});

	it("should install canonical skill to ~/.oh-my-skills/skills/", async () => {
		const r = await exec(
			id,
			`test -f ${INSTALL}/skills/greeting-skill/SKILL.md && echo ok`,
		);
		expect(r.output).toBe("ok");

		// Canonical file should contain the original SKILL.md content
		const content = await exec(
			id,
			`cat ${INSTALL}/skills/greeting-skill/SKILL.md`,
		);
		expect(content.output).toContain("by: oh-my-skills");
		expect(content.output).toContain("Say hello nicely.");
	});

	// Skill subdirectories ship wholesale, so an installed *.test.ts would end
	// up in the agent's own skill directory — the same reason only *.sh files
	// are copied for commands.
	it("should install skill subdirectories without the co-located tests", async () => {
		const prose = await exec(
			id,
			`cat ${INSTALL}/skills/greeting-skill/references/notes.md`,
		);
		expect(prose.output).toBe("Long-form notes.");

		const script = await exec(
			id,
			`test -x ${INSTALL}/skills/greeting-skill/scripts/helper.sh && echo executable`,
		);
		expect(script.output).toBe("executable");

		const test = await exec(
			id,
			`test -e ${INSTALL}/skills/greeting-skill/scripts/helper.test.ts && echo shipped || echo absent`,
		);
		expect(test.output).toBe("absent");

		const anyTest = await exec(
			id,
			`find ${INSTALL}/skills -name '*.test.*' | wc -l`,
		);
		expect(anyTest.output).toBe("0");
	});

	it("should create Claude symlink pointing to canonical skill", async () => {
		// Should be a symlink
		const isLink = await exec(
			id,
			`test -L ${HOME}/.claude/skills/greeting-skill && echo ok`,
		);
		expect(isLink.output).toBe("ok");

		// Symlink target should be the canonical dir
		const target = await exec(
			id,
			`readlink ${HOME}/.claude/skills/greeting-skill`,
		);
		expect(target.output).toContain("oh-my-skills/skills/greeting-skill");

		// Content should be readable through the symlink
		const content = await exec(
			id,
			`cat ${HOME}/.claude/skills/greeting-skill/SKILL.md`,
		);
		expect(content.output).toContain("Say hello nicely.");
	});

	it("should fail fast when git is not installed", async () => {
		const r = await exec(
			id,
			`PATH=/usr/local/bin /bin/bash /scripts/install.sh 2>&1`,
		);
		expect(r.exitCode).toBe(1);
		expect(r.output).toContain("git is required");
	});

	it("should fetch lib.sh and install successfully when lib.sh is not beside the script", async () => {
		// Simulates curl pipe mode: only install.sh is available, no lib.sh beside it.
		// OMS_LIB_BASE_URL uses file:// to mock the network fetch without internet access.
		await exec(id, `rm -rf ${INSTALL}`);
		await exec(
			id,
			"mkdir -p /tmp/standalone && cp /scripts/install.sh /tmp/standalone/install.sh",
		);
		const r = await exec(
			id,
			"REPO_URL=/tmp/remote-repo OMS_LIB_BASE_URL=file:///scripts bash /tmp/standalone/install.sh 2>&1",
		);
		expect(r.output).not.toContain("unbound variable");
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Installation Complete");
	});

	it("should not duplicate the sourcing line on reinstall", async () => {
		await exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
		const count = await exec(id, `grep -c "oh-my-skills" ${HOME}/.bashrc`);
		expect(count.output).toBe("1");
	});

	it("should preserve original .bashrc content after install", async () => {
		const r = await exec(id, `cat ${HOME}/.bashrc`);
		expect(r.output).toContain("my bashrc");
	});

	it("should make commands available via the shell file", async () => {
		const r = await exec(
			id,
			`bash -c 'shopt -s expand_aliases; source ${INSTALL}/shell && alias greet'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("greet");
	});

	it("should expose oms command with --help", async () => {
		const r = await exec(id, `bash -c 'source ${INSTALL}/shell && oms --help'`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Usage: oms");
		expect(r.output).toContain("update");
	});

	it("should install canonical hook files without registering them in settings.json", async () => {
		const meta = await exec(
			id,
			`test -f ${INSTALL}/hooks/sample-hook/hook.json && echo ok`,
		);
		expect(meta.output).toBe("ok");

		const script = await exec(
			id,
			`test -x ${INSTALL}/hooks/sample-hook/hook.sh && echo ok`,
		);
		expect(script.output).toBe("ok");

		// Install must never touch ~/.claude/settings.json on its own
		const settings = await exec(
			id,
			`test -f ${HOME}/.claude/settings.json && echo exists || echo absent`,
		);
		expect(settings.output).toBe("absent");
	});

	// Re-running the installer over an existing install used to be a silent
	// no-op: clean_dev_files prunes src/ and package.json after every run, HEAD
	// sits detached on a release tag so `git pull` had no upstream to follow,
	// and nothing restored the pruned checkout — so install_skills found no
	// src/skills and left the previous install untouched.
	it("should repair an install whose checkout was pruned", async () => {
		await exec(id, `rm -rf ${INSTALL}/skills/greeting-skill`);
		expect(
			(await exec(id, `test -d ${INSTALL}/src && echo exists || echo pruned`))
				.output,
		).toBe("pruned");

		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/install.sh`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Refreshing");
		// The version is read from package.json, which only exists if the
		// checkout was restored before the install ran.
		expect(r.output).not.toContain("vunknown");

		expect(
			(
				await exec(
					id,
					`test -f ${INSTALL}/skills/greeting-skill/SKILL.md && echo ok`,
				)
			).output,
		).toBe("ok");
	});

	describe("clean reinstall", () => {
		it("should remove skills deleted from the repo on reinstall", async () => {
			// Verify greeting-skill is installed from previous tests
			expect(
				(await exec(id, `test -d ${INSTALL}/skills/greeting-skill && echo ok`))
					.output,
			).toBe("ok");
			expect(
				(
					await exec(
						id,
						`test -L ${HOME}/.claude/skills/greeting-skill && echo ok`,
					)
				).output,
			).toBe("ok");

			// Simulate a release that renamed the skill. Doing it in the remote
			// rather than by hand in the install dir is the point: the installer
			// refreshes its own checkout, so a src/ patched locally would just be
			// overwritten.
			await exec(
				id,
				"cd /tmp/remote-repo && git mv src/skills/greeting-skill src/skills/farewell-skill && git add -A && git commit -m 'chore: rename greeting-skill'",
			);

			// Reinstall over existing install dir
			const r = await exec(
				id,
				`REPO_URL=/tmp/remote-repo bash /scripts/install.sh`,
			);
			expect(r.exitCode).toBe(0);

			// Canonical skill should be gone (full clean + reinstall with empty src)
			expect(
				(
					await exec(
						id,
						`test -d ${INSTALL}/skills/greeting-skill && echo exists || echo gone`,
					)
				).output,
			).toBe("gone");

			// ...and the renamed one installed in its place
			expect(
				(
					await exec(
						id,
						`test -f ${INSTALL}/skills/farewell-skill/SKILL.md && echo ok`,
					)
				).output,
			).toBe("ok");

			// Claude symlink should be gone too
			expect(
				(
					await exec(
						id,
						`test -L ${HOME}/.claude/skills/greeting-skill && echo exists || echo gone`,
					)
				).output,
			).toBe("gone");
		});

		it("should remove legacy flat skill files on reinstall", async () => {
			// Restore greeting-skill first, then add a legacy file
			await exec(id, `mkdir -p ${INSTALL}/src/skills/greeting-skill`);
			await exec(
				id,
				`cp /tmp/remote-repo/src/skills/greeting-skill/SKILL.md ${INSTALL}/src/skills/greeting-skill/SKILL.md`,
			);
			// Create a legacy flat file that shouldn't survive reinstall
			await exec(
				id,
				`mkdir -p ${INSTALL}/skills && printf 'legacy' > ${INSTALL}/skills/old-skill.md`,
			);

			const r = await exec(
				id,
				`REPO_URL=/tmp/remote-repo bash /scripts/install.sh`,
			);
			expect(r.exitCode).toBe(0);

			// Legacy file should be gone (skills dir was fully recreated)
			expect(
				(
					await exec(
						id,
						`test -f ${INSTALL}/skills/old-skill.md && echo exists || echo gone`,
					)
				).output,
			).toBe("gone");
		});
	});
});

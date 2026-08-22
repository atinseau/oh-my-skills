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

describe("oh-my-skills Uninstall (real script)", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;

		// Install deps

		// Copy real scripts
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
		await exec(id, "chmod +x /scripts/*.sh");

		// Create local repo
		await exec(id, "mkdir -p /tmp/remote-repo");
		await exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/skills/test-skill");
		await exec(
			id,
			`printf '%s\\n' '---' 'name: test-skill' 'description: A test skill' 'by: oh-my-skills' '---' 'Test.' > /tmp/remote-repo/src/skills/test-skill/SKILL.md`,
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		await exec(
			id,
			`printf '#!/bin/bash\\nalias hi="echo hi"\\n' > /tmp/remote-repo/src/commands/hi.sh`,
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
		await exec(
			id,
			"mkdir -p /tmp/remote-repo/scripts && cp /scripts/*.sh /tmp/remote-repo/scripts/",
		);
		await copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		await exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'init' && git tag v${VERSION}`,
		);

		// Fake LLM binaries
		await exec(
			id,
			`printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);
		await exec(
			id,
			`printf '#!/bin/sh\\necho copilot' > /usr/local/bin/copilot && chmod +x /usr/local/bin/copilot`,
		);

		// Create .bashrc
		await exec(
			id,
			`printf '%s\\n' '# original config' 'export LANG=en' > ${HOME}/.bashrc`,
		);

		// Run install first
		await exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);

		// Enable the sample hook so uninstall has something real to clean up.
		// NOTE: deliberately does NOT call init_registry here (unlike the
		// snippet suggested in the task brief) — init_registry unconditionally
		// overwrites registry.json, including the skills.claude/copilot arrays
		// that install.sh's install_skills step just populated. Calling it here
		// wiped that skill-tracking data and broke the "should have removed
		// Claude symlink/Copilot wrapper for test-skill" assertions below, since
		// uninstall's remove_skills() relies on the registry to know what to
		// remove. install.sh (via install_hooks -> install_skills's
		// registry_write_skills) already leaves registry.json as valid JSON
		// with a `.hooks.enabled` key, so hook_enable works directly.
		await exec(
			id,
			`bash -c 'source /scripts/lib.sh; hook_enable "sample-hook"'`,
		);

		// Also create a foreign skill in Claude's skills dir (not from oh-my-skills)
		await exec(id, `mkdir -p ${HOME}/.claude/skills`);
		await exec(
			id,
			`printf '%s\\n' 'This is a custom skill that has nothing to do with oh-my-skills.' > ${HOME}/.claude/skills/foreign-skill.md`,
		);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should have installed skills before uninstall", async () => {
		// Claude skill should be a symlink
		const claude = await exec(
			id,
			`test -L ${HOME}/.claude/skills/test-skill && echo ok`,
		);
		expect(claude.output).toBe("ok");

		// Copilot wrapper should be a .prompt.md file
		const copilot = await exec(
			id,
			`test -f ${HOME}/.copilot/skills/test-skill.prompt.md && echo ok`,
		);
		expect(copilot.output).toBe("ok");

		// Canonical skill should exist
		const canonical = await exec(
			id,
			`test -f ${INSTALL}/skills/test-skill/SKILL.md && echo ok`,
		);
		expect(canonical.output).toBe("ok");
	});

	it("should run uninstall.sh successfully", async () => {
		const r = await exec(id, `bash /scripts/uninstall.sh --yes`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Uninstallation Complete");
	});

	it("should have removed Claude symlink for test-skill", async () => {
		const r = await exec(
			id,
			`test -L ${HOME}/.claude/skills/test-skill && echo exists || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have removed Copilot wrapper for test-skill", async () => {
		const r = await exec(
			id,
			`test -f ${HOME}/.copilot/skills/test-skill.prompt.md && echo exists || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have preserved foreign skills (no oh-my-skills marker)", async () => {
		const r = await exec(
			id,
			`test -f ${HOME}/.claude/skills/foreign-skill.md && echo exists`,
		);
		expect(r.output).toBe("exists");
	});

	it("should have removed sourcing from .bashrc", async () => {
		const r = await exec(
			id,
			`grep -q "oh-my-skills" ${HOME}/.bashrc && echo found || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have preserved original .bashrc content", async () => {
		const r = await exec(id, `cat ${HOME}/.bashrc`);
		expect(r.output).toContain("original config");
	});

	it("should have removed the hook entry from ~/.claude/settings.json", async () => {
		const r = await exec(
			id,
			`cat ${HOME}/.claude/settings.json 2>/dev/null || echo '{}'`,
		);
		const settings = JSON.parse(r.output);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands.some((c: string) => c.includes("sample-hook"))).toBe(false);
	});

	it("should have removed ~/.oh-my-skills directory", async () => {
		const r = await exec(id, `test -d ${INSTALL} && echo exists || echo gone`);
		expect(r.output).toBe("gone");
	});

	it("should handle running uninstall again gracefully (already removed)", async () => {
		const r = await exec(id, `bash /scripts/uninstall.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("not installed");
	});
});

describe("oh-my-skills Uninstall without jq (real script)", () => {
	// Regression coverage for the bug where registry_read_enabled_hooks'
	// non-jq fallback ended in `grep -v '^$'`, which exits 1 on the normal
	// empty `hooks.enabled: []` case every fresh install writes.
	// disable_all_hooks does `enabled=$(registry_read_enabled_hooks)` as its
	// first statement, and both it and uninstall.sh run under
	// `set -euo pipefail` — so on a jq-less machine, that failing assignment
	// silently killed the entire uninstall.sh script: no error message, no
	// goodbye box, shell sourcing already stripped but ~/.oh-my-skills never
	// removed (a partial, broken uninstall).
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
		await exec(id, "chmod +x /scripts/*.sh");

		// Minimal remote repo — no hooks shipped, so hooks.enabled stays [].
		await exec(id, "mkdir -p /tmp/remote-repo");
		await exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/skills/test-skill");
		await exec(
			id,
			`printf '%s\\n' '---' 'name: test-skill' 'description: A test skill' 'by: oh-my-skills' '---' 'Test.' > /tmp/remote-repo/src/skills/test-skill/SKILL.md`,
		);
		await exec(
			id,
			"mkdir -p /tmp/remote-repo/scripts && cp /scripts/*.sh /tmp/remote-repo/scripts/",
		);
		await copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		await exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'init' && git tag v${VERSION}`,
		);

		await exec(
			id,
			`printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);
		await exec(
			id,
			`printf '%s\\n' '# original config' 'export LANG=en' > ${HOME}/.bashrc`,
		);

		// Real install — this is the normal fresh-install state:
		// registry.json ends up with hooks.enabled == [].
		await exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("has hooks.enabled == [] after a fresh install (sanity check)", async () => {
		const r = await exec(id, `cat ${INSTALL}/registry.json`);
		const registry = JSON.parse(r.output);
		expect(registry.hooks.enabled).toEqual([]);
	});

	it("runs uninstall.sh to completion on a machine without jq", async () => {
		await exec(id, `mv /usr/bin/jq /usr/bin/jq.bak`);
		const r = await exec(id, `bash /scripts/uninstall.sh --yes`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Uninstallation Complete");
	});

	it("actually removed ~/.oh-my-skills (not a silent partial uninstall)", async () => {
		const r = await exec(id, `test -d ${INSTALL} && echo exists || echo gone`);
		expect(r.output).toBe("gone");
	});
});

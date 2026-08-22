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

const CACHE_FILE = `${INSTALL}/.update-cache`;

// A semver strictly greater than VERSION — used for "remote has new version" scenarios.
// Derived from VERSION so it stays valid after release bumps.
const NEW_VERSION = `${Number(VERSION.split(".")[0]) + 1}.0.0`;
// One higher again, for the core-change scenario that must run last among the
// update flows: it rewrites lib.sh and update.sh in the remote.
const CORE_VERSION = `${Number(VERSION.split(".")[0]) + 2}.0.0`;

describe("oh-my-skills Update (real script)", () => {
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
		await copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		await exec(id, "chmod +x /scripts/*.sh");

		// Create local repo (v${VERSION})
		await exec(id, "mkdir -p /tmp/remote-repo");
		await exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/skills/skill-a");
		await exec(
			id,
			`printf '%s\\n' '---' 'name: skill-a' 'by: oh-my-skills' '---' > /tmp/remote-repo/src/skills/skill-a/SKILL.md`,
		);
		await exec(id, "mkdir -p /tmp/remote-repo/src/commands");
		await exec(
			id,
			`printf '#!/bin/bash\\nalias hi="echo hi"\\n' > /tmp/remote-repo/src/commands/hi.sh`,
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
			`cd /tmp/remote-repo && git add . && git commit -m 'v${VERSION}' && git tag v${VERSION}`,
		);

		// Fake LLM binaries
		await exec(
			id,
			`printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`,
		);

		// Create .bashrc
		await exec(id, `printf '# bashrc\\n' > ${HOME}/.bashrc`);

		// Run install
		await exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it(`should have version ${VERSION} after install`, async () => {
		const r = await exec(id, `jq -r '.version' ${INSTALL}/registry.json`);
		expect(r.output).toBe(VERSION);
	});

	// ── get_remote_version ───────────────────────────────────────────────

	it("should parse remote version from git tags", async () => {
		// Extract get_remote_version from update.sh and call it directly
		// This catches regressions in the tag-parsing pipeline (grep/sed/sort)
		const r = await exec(
			id,
			`bash -c '
				source /scripts/lib.sh 2>/dev/null
				REPO_URL=/tmp/remote-repo
				# Source only the function definition from update.sh
				eval "$(sed -n "/^get_remote_version()/,/^}/p" /scripts/update.sh)"
				get_remote_version
			'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe(VERSION);
	});

	// ── Manual mode ──────────────────────────────────────────────────────

	it("should report up-to-date in manual mode when no update available", async () => {
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("up to date");
	});

	it("should write cache after manual check", async () => {
		// Manual mode always writes the cache with fresh result
		const r = await exec(id, `cat ${CACHE_FILE}`);
		expect(r.exitCode).toBe(0);
		// Cache should contain the current version
		expect(r.output).toContain(VERSION);
	});

	it("should not modify installation when up to date", async () => {
		// Add a marker file to verify nothing changes
		await exec(id, `echo untouched > ${INSTALL}/marker.txt`);

		await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);

		const r = await exec(id, `cat ${INSTALL}/marker.txt`);
		expect(r.output).toBe("untouched");
	});

	it("should not modify registry when up to date", async () => {
		const r = await exec(id, `jq -r '.version' ${INSTALL}/registry.json`);
		expect(r.output).toBe(VERSION);
	});

	// ── Auto-check mode with cache ──────────────────────────────────────

	it("should stay quiet in auto-check mode when cache is fresh and up to date", async () => {
		// Cache was written by previous manual check with current VERSION — should be silent
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should spawn background fetch when cache is missing", async () => {
		// Remove cache
		await exec(id, `rm -f ${CACHE_FILE}`);

		// Auto-check with no cache: should be silent (background fetch spawned)
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should spawn background fetch when cache is stale", async () => {
		// Write a stale cache (timestamp = 0, i.e. epoch)
		await exec(id, `echo "0 ${VERSION}" > ${CACHE_FILE}`);

		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		// Should be silent — background fetch was spawned instead of blocking
		expect(r.output).toBe("");
	});

	it("should populate cache via background-fetch mode", async () => {
		// Remove any existing cache
		await exec(id, `rm -f ${CACHE_FILE}`);

		// Run the background-fetch mode synchronously to simulate what the background process does
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --background-fetch`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");

		// Cache file should now exist with the current version
		const cache = await exec(id, `cat ${CACHE_FILE}`);
		expect(cache.exitCode).toBe(0);
		expect(cache.output).toContain(VERSION);
	});

	// ── Update detection via cache ──────────────────────────────────────

	it("should detect update in auto-check when cache has newer version", async () => {
		// Push a new version to the remote repo — also update hi.sh to verify command updates,
		// and add a hook to verify hooks are installed on update
		await exec(
			id,
			`cd /tmp/remote-repo && echo bye > src/commands/bye.sh && mkdir -p src/hooks/sample-hook && printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > src/hooks/sample-hook/hook.json && printf '#!/bin/bash\\necho sample-hook\\n' > src/hooks/sample-hook/hook.sh && git add . && git commit -m 'feat(commands): add bye alias' && printf '#!/bin/bash\\nalias hi="echo hi v2"\\n' > src/commands/hi.sh && echo fix > CHANGELOG_FIX && git add . && git commit -m 'fix(update): improve release sync' && git tag v${NEW_VERSION}`,
		);

		// Simulate what the background fetch would have written: a fresh cache with the new version
		const now = Math.floor(Date.now() / 1000);
		await exec(id, `echo "${now} ${NEW_VERSION}" > ${CACHE_FILE}`);

		// Auto-check should now detect the update from cache (no network needed)
		const r = await exec(
			id,
			`echo n | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.output).toContain("Update available");
		expect(r.output).toContain("oms update");
	});

	it("should update in manual mode when user confirms", async () => {
		const r = await exec(
			id,
			`echo y | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Update Complete");
		expect(r.output).toContain("Changelog since");
		expect(r.output).toContain("feat(commands): add bye alias");
		expect(r.output).toContain("fix(update): improve release sync");

		// Update output must not contain install-specific messages
		expect(r.output).not.toContain("Installing oh-my-skills");
		expect(r.output).not.toContain("Already installed");
		expect(r.output).not.toContain("Installation Complete");
		// Shell sourcing message should say "updated", not "created"
		expect(r.output).toContain("Shell sourcing script updated");
		// Only one "Update Complete" banner
		expect(r.output.split("Update Complete").length - 1).toBe(1);
	});

	it("should invalidate cache after successful update", async () => {
		// After a successful update, cache should be removed so next auto-check re-fetches
		const r = await exec(
			id,
			`test -f ${CACHE_FILE} && echo exists || echo gone`,
		);
		expect(r.output).toBe("gone");
	});

	it("should have updated existing command after update", async () => {
		// hi.sh was modified in the new tag — verify the installed copy reflects the new content
		const r = await exec(id, `cat ${INSTALL}/commands/hi.sh`);
		expect(r.output).toContain("hi v2");
	});

	it("should have installed new command added in update", async () => {
		const r = await exec(id, `test -f ${INSTALL}/commands/bye.sh && echo ok`);
		expect(r.output).toBe("ok");
	});

	it("should have installed hook added in update", async () => {
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
	});

	// ── Resilience to core code changes ─────────────────────────────────
	//
	// update.sh sources lib.sh, pulls, then installs. Before the handover, the
	// install ran from the definitions loaded *before* the pull, so a release
	// fixing install_skills installed itself with the previous release's logic
	// and the fix only landed one update later. v3 patches both halves of the
	// core — the library and the updater — and each leaves a marker only the
	// newly pulled code can write. Markers live outside INSTALL, which
	// clean_dev_files prunes down to its whitelist at the end of every run.

	it("runs the pulled lib.sh and the pulled update.sh, not the ones it started with", async () => {
		const setup = await exec(
			id,
			`(${[
				"cd /tmp/remote-repo",
				`printf '\\ninstall_commands() { mkdir -p "$COMMANDS_DIR"; echo v3 > /tmp/core-marker; log_success "Commands copied to $COMMANDS_DIR"; }\\n' >> scripts/lib.sh`,
				`sed -i 's|^load_lib$|load_lib\\necho v3 > /tmp/driver-marker|' scripts/update.sh`,
				"git add . && git commit -m 'chore: change the core install path'",
				`git tag v${CORE_VERSION}`,
			].join(" && ")}) 2>&1`,
		);
		expect(setup.exitCode).toBe(0);

		await exec(id, "rm -f /tmp/core-marker /tmp/driver-marker");

		// The user always runs the *installed* updater — the one the pull
		// replaces underneath the running process.
		const r = await exec(
			id,
			`echo y | REPO_URL=/tmp/remote-repo bash ${INSTALL}/scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("Update Complete");

		const core = await exec(id, "cat /tmp/core-marker");
		expect(core.output).toBe("v3");

		const driver = await exec(id, "cat /tmp/driver-marker");
		expect(driver.output).toBe("v3");
	});

	it("runs the tail of the update exactly once across the handover", async () => {
		// The handover is an exec, not a call: the parent must not also run
		// apply_update after the child returns.
		const r = await exec(
			id,
			`echo y | REPO_URL=/tmp/remote-repo bash ${INSTALL}/scripts/update.sh --manual`,
		);
		expect(r.output.split("Update Complete").length - 1).toBe(1);
		expect(r.output.split("Commands copied to").length - 1).toBe(1);
		expect(r.output.split("Shell sourcing script updated").length - 1).toBe(1);
	});

	// ── Auto-check with short TTL ───────────────────────────────────────

	it("should respect OMS_UPDATE_CACHE_TTL override", async () => {
		// Write a cache with a timestamp 2 seconds ago and TTL of 1 second — should be stale
		const staleTs = Math.floor(Date.now() / 1000) - 2;
		await exec(id, `echo "${staleTs} ${NEW_VERSION}" > ${CACHE_FILE}`);

		// With TTL=1, the cache is stale, so auto-check should spawn background fetch (silent)
		const r = await exec(
			id,
			`OMS_UPDATE_CACHE_TTL=1 REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should use cache when TTL is large enough", async () => {
		// Write a cache with a recent timestamp containing a different version
		const now = Math.floor(Date.now() / 1000);
		await exec(id, `echo "${now} ${NEW_VERSION}" > ${CACHE_FILE}`);

		// With default TTL, this fresh cache should trigger update prompt
		const r = await exec(
			id,
			`echo n | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.output).toContain("Update available");
	});

	// ── Edge cases ──────────────────────────────────────────────────────

	it("should handle not-installed state in manual mode", async () => {
		// Remove installation
		await exec(id, `rm -rf ${INSTALL}`);

		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("not installed");
	});

	it("should stay quiet when not installed in auto-check mode", async () => {
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should stay quiet when not installed in background-fetch mode", async () => {
		const r = await exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --background-fetch`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});
});

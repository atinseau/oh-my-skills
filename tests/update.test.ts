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

const CACHE_FILE = `${INSTALL}/.update-cache`;

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
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
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

	// ── get_remote_version ───────────────────────────────────────────────

	it("should parse remote version from git tags", () => {
		// Extract get_remote_version from update.sh and call it directly
		// This catches regressions in the tag-parsing pipeline (grep/sed/sort)
		const r = exec(
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

	it("should report up-to-date in manual mode when no update available", () => {
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --manual`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("up to date");
	});

	it("should write cache after manual check", () => {
		// Manual mode always writes the cache with fresh result
		const r = exec(id, `cat ${CACHE_FILE}`);
		expect(r.exitCode).toBe(0);
		// Cache should contain the current version
		expect(r.output).toContain(VERSION);
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

	// ── Auto-check mode with cache ──────────────────────────────────────

	it("should stay quiet in auto-check mode when cache is fresh and up to date", () => {
		// Cache was written by previous manual check with current VERSION — should be silent
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should spawn background fetch when cache is missing", () => {
		// Remove cache
		exec(id, `rm -f ${CACHE_FILE}`);

		// Auto-check with no cache: should be silent (background fetch spawned)
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should spawn background fetch when cache is stale", () => {
		// Write a stale cache (timestamp = 0, i.e. epoch)
		exec(id, `echo "0 ${VERSION}" > ${CACHE_FILE}`);

		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		// Should be silent — background fetch was spawned instead of blocking
		expect(r.output).toBe("");
	});

	it("should populate cache via background-fetch mode", () => {
		// Remove any existing cache
		exec(id, `rm -f ${CACHE_FILE}`);

		// Run the background-fetch mode synchronously to simulate what the background process does
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --background-fetch`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");

		// Cache file should now exist with the current version
		const cache = exec(id, `cat ${CACHE_FILE}`);
		expect(cache.exitCode).toBe(0);
		expect(cache.output).toContain(VERSION);
	});

	// ── Update detection via cache ──────────────────────────────────────

	it("should detect update in auto-check when cache has newer version", () => {
		// Push a new version to the remote repo — also update hi.sh to verify command updates
		exec(
			id,
			"cd /tmp/remote-repo && echo bye > src/commands/bye.sh && git add . && git commit -m 'feat(commands): add bye alias' && printf '#!/bin/bash\\nalias hi=\"echo hi v2\"\\n' > src/commands/hi.sh && echo fix > CHANGELOG_FIX && git add . && git commit -m 'fix(update): improve release sync' && git tag v0.2.0",
		);

		// Simulate what the background fetch would have written: a fresh cache with v0.2.0
		const now = Math.floor(Date.now() / 1000);
		exec(id, `echo "${now} 0.2.0" > ${CACHE_FILE}`);

		// Auto-check should now detect the update from cache (no network needed)
		const r = exec(
			id,
			`echo n | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.output).toContain("Update available");
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

		// Update output must not contain install-specific messages
		expect(r.output).not.toContain("Installing oh-my-skills");
		expect(r.output).not.toContain("Already installed");
		expect(r.output).not.toContain("Installation Complete");
		// Shell sourcing message should say "updated", not "created"
		expect(r.output).toContain("Shell sourcing script updated");
		// Only one "Update Complete" banner
		expect(r.output.split("Update Complete").length - 1).toBe(1);
	});

	it("should invalidate cache after successful update", () => {
		// After a successful update, cache should be removed so next auto-check re-fetches
		const r = exec(id, `test -f ${CACHE_FILE} && echo exists || echo gone`);
		expect(r.output).toBe("gone");
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

	// ── Auto-check with short TTL ───────────────────────────────────────

	it("should respect OMS_UPDATE_CACHE_TTL override", () => {
		// Write a cache with a timestamp 2 seconds ago and TTL of 1 second — should be stale
		const staleTs = Math.floor(Date.now() / 1000) - 2;
		exec(id, `echo "${staleTs} 0.2.0" > ${CACHE_FILE}`);

		// With TTL=1, the cache is stale, so auto-check should spawn background fetch (silent)
		const r = exec(
			id,
			`OMS_UPDATE_CACHE_TTL=1 REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("should use cache when TTL is large enough", () => {
		// Write a cache with a recent timestamp containing a different version
		const now = Math.floor(Date.now() / 1000);
		exec(id, `echo "${now} 9.9.9" > ${CACHE_FILE}`);

		// With default TTL, this fresh cache should trigger update prompt
		const r = exec(
			id,
			`echo n | REPO_URL=/tmp/remote-repo bash /scripts/update.sh --auto-check`,
		);
		expect(r.output).toContain("Update available");
	});

	// ── Edge cases ──────────────────────────────────────────────────────

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

	it("should stay quiet when not installed in background-fetch mode", () => {
		const r = exec(
			id,
			`REPO_URL=/tmp/remote-repo bash /scripts/update.sh --background-fetch`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});
});

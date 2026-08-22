import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	PROJECT_DIR,
	startContainer,
} from "../../../tests/helpers";

/**
 * oms-run-all command tests
 *
 * Tests the parallel command runner across multiple directories.
 * Uses fake repos (/repos/repo1, /repos/repo2, /repos/repo3) inside
 * an Alpine container to exercise batch, mapping, sequential, stream,
 * failure, and cleanup behaviors.
 */
describe("oms-run-all command", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	const CMD = "/commands/oms-run-all/oms-run-all.sh";

	// Strip ANSI escape codes for clean assertions
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences requires \x1b
	const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

	// Helper: run oms-run-all with given args
	const run = async (args: string) =>
		await exec(id, `bash -c 'source ${CMD} && oms-run-all ${args} 2>&1'`);

	// Helper: run via alias
	const runAlias = async (args: string) =>
		await exec(
			id,
			`bash -c 'shopt -s expand_aliases; source ${CMD}; eval oms-ra ${args} 2>&1'`,
		);

	beforeAll(async () => {
		container = await startContainer();
		id = container;

		// Install dependencies

		// Copy the command into the container
		await exec(id, "mkdir -p /commands/oms-run-all");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-run-all/oms-run-all.sh`,
			CMD,
		);
		await exec(id, `chmod +x ${CMD}`);

		// Create fake repos
		await exec(id, "mkdir -p /repos/repo1 /repos/repo2 /repos/repo3");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// ===========================================================
	// Help
	// ===========================================================

	describe("help", () => {
		it("should show usage when no args are given", async () => {
			const result = await run("");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
		});

		it("should show usage with --help flag", async () => {
			const result = await run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
		});
	});

	// ===========================================================
	// Batch uniform mode
	// ===========================================================

	describe("batch uniform mode (grouped)", () => {
		it("should show a single grouped header with all dirs", async () => {
			const result = await run('"echo ok" /repos/repo1 /repos/repo2');
			const out = strip(result.output);
			expect(result.exitCode).toBe(0);
			// Grouped: single header line with comma-separated dirs
			expect(out).toContain("→ /repos/repo1, /repos/repo2");
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
			// Should NOT have separate "→ /repos/repo1" and "→ /repos/repo2" headers
			expect(out).not.toMatch(/▸ echo ok → \/repos\/repo1\n/);
		});

		it("should show grouped header with three dirs", async () => {
			const result = await run(
				'"echo ok" /repos/repo1 /repos/repo2 /repos/repo3',
			);
			const out = strip(result.output);
			expect(result.exitCode).toBe(0);
			// Final state: header without dirs + all results
			expect(out).toContain("▸ echo ok");
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
			expect(out).toContain("✓ /repos/repo3");
		});
	});

	// ===========================================================
	// Batch mapping mode (non-grouped)
	// ===========================================================

	describe("batch mapping mode (non-grouped)", () => {
		it("should show separate headers when commands differ", async () => {
			const result = await run(
				'/repos/repo1="echo hello" /repos/repo2="echo world"',
			);
			const out = strip(result.output);
			expect(result.exitCode).toBe(0);
			// Non-grouped: one header per dir with → arrow
			expect(out).toContain("▸ echo hello → /repos/repo1");
			expect(out).toContain("▸ echo world → /repos/repo2");
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
		});
	});

	// ===========================================================
	// Sequential (--then)
	// ===========================================================

	describe("sequential (--then)", () => {
		it("should run steps sequentially", async () => {
			const result = await run(
				'/repos/repo1="echo step1" --then /repos/repo2="echo step2"',
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("/repos/repo1");
			expect(result.output).toContain("/repos/repo2");
		});
	});

	// ===========================================================
	// Failure propagation
	// ===========================================================

	describe("failure propagation", () => {
		it("should report failure in non-grouped mode", async () => {
			const result = await run('/repos/repo1="exit 1" /repos/repo2="echo ok"');
			const out = strip(result.output);
			expect(result.exitCode).not.toBe(0);
			expect(out).toContain("✗ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
		});

		it("should report failure in grouped mode with error block", async () => {
			const result = await run(
				'"sh -c \\"echo FAIL_OUTPUT && exit 1\\"" /repos/repo1 /repos/repo2',
			);
			const out = strip(result.output);
			expect(result.exitCode).not.toBe(0);
			// Both dirs should show ✗ with exit code
			expect(out).toContain("✗ /repos/repo1");
			expect(out).toContain("(exit 1)");
			// Error block should show captured output
			expect(out).toContain("FAIL_OUTPUT");
		});

		it("should show mixed results in grouped mode", async () => {
			// repo1 succeeds, repo2 fails (different exit behavior via same command)
			await exec(
				id,
				"echo '#!/bin/sh\nexit 1' > /repos/repo2/fail.sh && chmod +x /repos/repo2/fail.sh",
			);
			const result = await run(
				'"sh fail.sh 2>/dev/null || true" /repos/repo1 /repos/repo2',
			);
			const out = strip(result.output);
			// All should succeed because of || true
			expect(result.exitCode).toBe(0);
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
			await exec(id, "rm -f /repos/repo2/fail.sh");
		});
	});

	// ===========================================================
	// Failure does not stop pipeline
	// ===========================================================

	describe("failure does not stop pipeline", () => {
		it("should continue to step 2 even if step 1 fails", async () => {
			const result = await run(
				'/repos/repo1="exit 1" --then /repos/repo2="echo after-fail"',
			);
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain("/repos/repo2");
			expect(result.output).toContain("after-fail");
		});
	});

	// ===========================================================
	// Non-existent directory
	// ===========================================================

	describe("non-existent directory", () => {
		it("should fail when directory does not exist", async () => {
			const result = await run('/repos/nonexistent="echo hi"');
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain("/repos/nonexistent");
		});
	});

	// ===========================================================
	// Temp cleanup
	// ===========================================================

	describe("temp cleanup", () => {
		it("should clean up temp directories after running", async () => {
			// Clean any leftover temp files from previous tests first
			await exec(id, "rm -rf /tmp/tmp.* 2>/dev/null || true");

			await run('/repos/repo1="echo cleanup-test"');

			// After a successful run, no .rc or .out files should remain
			const checkFiles = await exec(
				id,
				'find /tmp -maxdepth 2 \\( -name "*.rc" -o -name "*.out" \\) 2>/dev/null | head -5',
			);
			expect(checkFiles.output).toBe("");
		});
	});

	// ===========================================================
	// Stream mode
	// ===========================================================

	describe("stream mode", () => {
		it("should run in stream mode with prefixed output", async () => {
			const result = await run('--stream /repos/repo1="echo streamed"');
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("stream mode");
			expect(result.output).toContain("streamed");
			expect(result.output).toContain("/repos/repo1");
		});
	});

	// ===========================================================
	// Batch then stream
	// ===========================================================

	describe("batch then stream", () => {
		it("should support batch step followed by stream step", async () => {
			const result = await run(
				'/repos/repo1="echo build-done" --stream /repos/repo1="echo dev-started"',
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("build-done");
			expect(result.output).toContain("stream mode");
			expect(result.output).toContain("dev-started");
		});
	});

	// ===========================================================
	// Stream then batch (--then after --stream)
	// ===========================================================

	describe("stream then batch", () => {
		it("should run stream step then continue to batch step", async () => {
			const result = await run(
				'--stream /repos/repo1="echo streaming" --then /repos/repo1="echo cleanup"',
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("stream mode");
			expect(result.output).toContain("streaming");
			expect(result.output).toContain("cleanup");
		});
	});

	// ===========================================================
	// Alias
	// ===========================================================

	describe("non-TTY output", () => {
		it("should not output spinner escape codes when piped", async () => {
			const result = await exec(
				id,
				`bash -c 'source ${CMD} && oms-run-all /repos/repo1="echo piped" 2>&1 | cat'`,
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).not.toContain("⠋");
			expect(result.output).not.toContain("⠙");
			expect(result.output).toContain("/repos/repo1");
		});

		it("should not duplicate header or results in grouped non-TTY mode", async () => {
			// Use staggered sleeps to force multiple poll cycles
			const result = await exec(
				id,
				`bash -c 'source ${CMD} && oms-run-all "sleep 0.2 && echo done" /repos/repo1 /repos/repo2 /repos/repo3 2>&1 | cat'`,
			);
			const out = strip(result.output);
			expect(result.exitCode).toBe(0);
			// Header should appear exactly once
			const headers = out.split("\n").filter((l: string) => l.includes("▸"));
			expect(headers).toHaveLength(1);
			// Each result should appear exactly once
			const repo1Lines = out
				.split("\n")
				.filter((l: string) => l.includes("✓") && l.includes("/repos/repo1"));
			const repo2Lines = out
				.split("\n")
				.filter((l: string) => l.includes("✓") && l.includes("/repos/repo2"));
			const repo3Lines = out
				.split("\n")
				.filter((l: string) => l.includes("✓") && l.includes("/repos/repo3"));
			expect(repo1Lines).toHaveLength(1);
			expect(repo2Lines).toHaveLength(1);
			expect(repo3Lines).toHaveLength(1);
		});
	});

	// ===========================================================
	// Path normalization
	// ===========================================================

	describe("path normalization", () => {
		it("should handle ./ prefix in directory paths", async () => {
			const result = await exec(
				id,
				`bash -c 'cd /repos && source ${CMD} && oms-run-all ./repo1="echo normalized" 2>&1'`,
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("normalized");
		});
	});

	// ===========================================================
	// Ctrl+C (SIGINT) cleanup
	// ===========================================================

	describe("ctrl+c cleanup", () => {
		// Helper: launch oms-run-all, interrupt it, and report how many worker
		// processes were running before the signal and how many survived it.
		//
		// Uses SIGTERM because bash marks async jobs of a non-interactive script
		// SIGINT-immune, so a plain SIGINT never reaches them; the batch trap
		// handles INT and TERM identically, so TERM exercises the same path.
		//
		// Workers are counted with `pgrep -fx "sleep 30"`. The previous version
		// used `pgrep -c`, which BusyBox does not support: the command always
		// failed, the `|| echo NO_LEFTOVER_PROCS` fallback always fired, and all
		// three assertions passed unconditionally. -f matches the full command
		// line and -x anchors it, so wrapper shells whose argv merely contains
		// "sleep 30" are not counted.
		//
		// Both waits poll rather than sleeping a fixed duration — the old script
		// burned a hard 1.5s per case for something that settles in ~50ms.
		const sigintTest = async (mode: string, args: string, expected: number) => {
			const prefix = mode === "stream" ? "--stream " : "";
			await exec(
				id,
				`cat > /tmp/sigint-test.sh << 'SCRIPT'
#!/bin/bash
workers() { pgrep -fx "sleep 30" | wc -l | tr -d ' '; }

# Strays from an earlier case would corrupt this one's counts.
for p in $(pgrep -fx "sleep 30"); do kill -9 "$p" 2>/dev/null; done

bash ${CMD} --exec ${prefix}${args} &
CHILD=$!

# Wait until every worker is up, bounded at ~5s.
for _ in $(seq 500); do [ "$(workers)" -ge ${expected} ] && break; sleep 0.01; done
STARTED=$(workers)

kill -TERM $CHILD 2>/dev/null
wait $CHILD 2>/dev/null

# Wait until the cleanup has reaped them. It settles in ~50ms, so 2s is
# ample headroom; the loop exits on the first clean poll, and only a
# regression would ever burn the full budget.
for _ in $(seq 200); do [ "$(workers)" -eq 0 ] && break; sleep 0.01; done
LEFTOVER=$(workers)

for p in $(pgrep -fx "sleep 30"); do kill -9 "$p" 2>/dev/null; done
echo "STARTED=$STARTED"
echo "LEFTOVER=$LEFTOVER"
SCRIPT`,
			);
			await exec(id, "chmod +x /tmp/sigint-test.sh");
			return await exec(id, "bash /tmp/sigint-test.sh 2>&1");
		};

		it("should signal batch children and clean up its temp dir", async () => {
			await exec(id, "rm -rf /tmp/tmp.* 2>/dev/null || true");

			const result = await sigintTest("batch", '/repos/repo1="sleep 30"', 1);
			// Without this the leftover assertion below would be vacuous: nothing
			// to leak if nothing ever ran.
			expect(result.output).toContain("STARTED=1");

			const checkFiles = await exec(
				id,
				'find /tmp -maxdepth 2 \\( -name "*.rc" -o -name "*.out" \\) 2>/dev/null | head -5',
			);
			expect(checkFiles.output).toBe("");
		});

		// Regression coverage for the orphaned-worker leak: both runners background
		// a subshell, so the user's command is a grandchild (a great-grandchild in
		// stream mode). The traps used to `kill` only the recorded subshell PID,
		// which left the real command running, reparented to init — Ctrl+C gave the
		// prompt back while the builds kept writing. `kill_tree` in oms-run-all.sh
		// now walks the descendants before killing each parent.
		it("should leave no orphaned batch children after SIGINT", async () => {
			const result = await sigintTest(
				"batch",
				'/repos/repo1="sleep 30" /repos/repo2="sleep 30"',
				2,
			);
			expect(result.output).toContain("STARTED=2");
			expect(result.output).toContain("LEFTOVER=0");
		});

		it("should leave no orphaned stream children after SIGINT", async () => {
			const result = await sigintTest(
				"stream",
				'/repos/repo1="sleep 30" /repos/repo2="sleep 30"',
				2,
			);
			expect(result.output).toContain("STARTED=2");
			expect(result.output).toContain("LEFTOVER=0");
		});
	});

	// ===========================================================
	// Alias
	// ===========================================================

	describe("oms-ra alias", () => {
		it("should produce the same output as oms-run-all", async () => {
			const result = await runAlias("--help");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
			expect(result.output).toContain("oms-ra");
		});
	});
});

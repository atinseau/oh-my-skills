import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, PROJECT_DIR } from "../../../tests/helpers";

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
	let id: string;

	const CMD = "/commands/oms-run-all/oms-run-all.sh";

	// Strip ANSI escape codes for clean assertions
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences requires \x1b
	const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

	// Helper: run oms-run-all with given args
	const run = (args: string) =>
		exec(id, `bash -c 'source ${CMD} && oms-run-all ${args} 2>&1'`);

	// Helper: run via alias
	const runAlias = (args: string) =>
		exec(
			id,
			`bash -c 'shopt -s expand_aliases; source ${CMD}; eval oms-ra ${args} 2>&1'`,
		);

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		// Install dependencies
		exec(id, "apk add --no-cache bash coreutils sed >/dev/null 2>&1");

		// Copy the command into the container
		exec(id, "mkdir -p /commands/oms-run-all");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-run-all/oms-run-all.sh`,
			CMD,
		);
		exec(id, `chmod +x ${CMD}`);

		// Create fake repos
		exec(id, "mkdir -p /repos/repo1 /repos/repo2 /repos/repo3");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// ===========================================================
	// Help
	// ===========================================================

	describe("help", () => {
		it("should show usage when no args are given", () => {
			const result = run("");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
		});

		it("should show usage with --help flag", () => {
			const result = run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
		});
	});

	// ===========================================================
	// Batch uniform mode
	// ===========================================================

	describe("batch uniform mode (grouped)", () => {
		it("should show a single grouped header with all dirs", () => {
			const result = run('"echo ok" /repos/repo1 /repos/repo2');
			const out = strip(result.output);
			expect(result.exitCode).toBe(0);
			// Grouped: single header line with comma-separated dirs
			expect(out).toContain("→ /repos/repo1, /repos/repo2");
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
			// Should NOT have separate "→ /repos/repo1" and "→ /repos/repo2" headers
			expect(out).not.toMatch(/▸ echo ok → \/repos\/repo1\n/);
		});

		it("should show grouped header with three dirs", () => {
			const result = run('"echo ok" /repos/repo1 /repos/repo2 /repos/repo3');
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
		it("should show separate headers when commands differ", () => {
			const result = run('/repos/repo1="echo hello" /repos/repo2="echo world"');
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
		it("should run steps sequentially", () => {
			const result = run(
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
		it("should report failure in non-grouped mode", () => {
			const result = run('/repos/repo1="exit 1" /repos/repo2="echo ok"');
			const out = strip(result.output);
			expect(result.exitCode).not.toBe(0);
			expect(out).toContain("✗ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
		});

		it("should report failure in grouped mode with error block", () => {
			const result = run(
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

		it("should show mixed results in grouped mode", () => {
			// repo1 succeeds, repo2 fails (different exit behavior via same command)
			exec(
				id,
				"echo '#!/bin/sh\nexit 1' > /repos/repo2/fail.sh && chmod +x /repos/repo2/fail.sh",
			);
			const result = run(
				'"sh fail.sh 2>/dev/null || true" /repos/repo1 /repos/repo2',
			);
			const out = strip(result.output);
			// All should succeed because of || true
			expect(result.exitCode).toBe(0);
			expect(out).toContain("✓ /repos/repo1");
			expect(out).toContain("✓ /repos/repo2");
			exec(id, "rm -f /repos/repo2/fail.sh");
		});
	});

	// ===========================================================
	// Failure does not stop pipeline
	// ===========================================================

	describe("failure does not stop pipeline", () => {
		it("should continue to step 2 even if step 1 fails", () => {
			const result = run(
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
		it("should fail when directory does not exist", () => {
			const result = run('/repos/nonexistent="echo hi"');
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain("/repos/nonexistent");
		});
	});

	// ===========================================================
	// Temp cleanup
	// ===========================================================

	describe("temp cleanup", () => {
		it("should clean up temp directories after running", () => {
			// Clean any leftover temp files from previous tests first
			exec(id, "rm -rf /tmp/tmp.* 2>/dev/null || true");

			run('/repos/repo1="echo cleanup-test"');

			// After a successful run, no .rc or .out files should remain
			const checkFiles = exec(
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
		it("should run in stream mode with prefixed output", () => {
			const result = run('--stream /repos/repo1="echo streamed"');
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
		it("should support batch step followed by stream step", () => {
			const result = run(
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
		it("should run stream step then continue to batch step", () => {
			const result = run(
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
		it("should not output spinner escape codes when piped", () => {
			const result = exec(
				id,
				`bash -c 'source ${CMD} && oms-run-all /repos/repo1="echo piped" 2>&1 | cat'`,
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).not.toContain("⠋");
			expect(result.output).not.toContain("⠙");
			expect(result.output).toContain("/repos/repo1");
		});

		it("should not duplicate header or results in grouped non-TTY mode", () => {
			// Use staggered sleeps to force multiple poll cycles
			const result = exec(
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
		it("should handle ./ prefix in directory paths", () => {
			const result = exec(
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
		// Helper: write a script that launches oms-run-all, sends SIGINT, then checks
		// Use SIGTERM for testing because background processes ignore SIGINT.
		// In real terminal usage, Ctrl+C sends SIGINT to the entire foreground
		// process group so all processes (parent + children) receive it directly.
		const sigintTest = (mode: string, args: string) => {
			const prefix = mode === "stream" ? "--stream " : "";
			exec(
				id,
				`cat > /tmp/sigint-test.sh << 'SCRIPT'
#!/bin/bash
bash ${CMD} --exec ${prefix}${args} &
CHILD=$!
sleep 1
kill -TERM $CHILD 2>/dev/null
wait $CHILD 2>/dev/null
sleep 0.5
pgrep -c "sleep 30" 2>/dev/null || echo "NO_LEFTOVER_PROCS"
SCRIPT`,
			);
			exec(id, "chmod +x /tmp/sigint-test.sh");
			return exec(id, "bash /tmp/sigint-test.sh 2>&1");
		};

		it("should kill batch children when SIGINT is sent", () => {
			const result = sigintTest(
				"batch",
				'/repos/repo1="sleep 30" /repos/repo2="sleep 30"',
			);
			expect(result.output).toContain("NO_LEFTOVER_PROCS");
		});

		it("should kill stream children when SIGINT is sent", () => {
			const result = sigintTest(
				"stream",
				'/repos/repo1="sleep 30" /repos/repo2="sleep 30"',
			);
			expect(result.output).toContain("NO_LEFTOVER_PROCS");
		});

		it("should clean up temp files after SIGINT in batch mode", () => {
			exec(id, "rm -rf /tmp/tmp.* 2>/dev/null || true");

			sigintTest("batch", '/repos/repo1="sleep 30"');

			const checkFiles = exec(
				id,
				'find /tmp -maxdepth 2 \\( -name "*.rc" -o -name "*.out" \\) 2>/dev/null | head -5',
			);
			expect(checkFiles.output).toBe("");
		});
	});

	// ===========================================================
	// Alias
	// ===========================================================

	describe("oms-ra alias", () => {
		it("should produce the same output as oms-run-all", () => {
			const result = runAlias("--help");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Usage");
			expect(result.output).toContain("oms-ra");
		});
	});
});

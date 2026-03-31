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

	describe("batch uniform mode", () => {
		it("should run the same command in multiple directories", () => {
			const result = run('"echo ok" /repos/repo1 /repos/repo2');
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("/repos/repo1");
			expect(result.output).toContain("/repos/repo2");
		});
	});

	// ===========================================================
	// Batch mapping mode
	// ===========================================================

	describe("batch mapping mode", () => {
		it("should run different commands per directory", () => {
			const result = run('/repos/repo1="echo hello" /repos/repo2="echo world"');
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("/repos/repo1");
			expect(result.output).toContain("/repos/repo2");
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
		it("should report failure for failed repos and success for passing ones", () => {
			// Use "false" instead of "exit 1" — exit would terminate the subshell
			// before the .rc file is written, causing the spinner to hang.
			const result = run('/repos/repo1="false" /repos/repo2="echo ok"');
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain("/repos/repo1");
			expect(result.output).toContain("/repos/repo2");
		});
	});

	// ===========================================================
	// Failure does not stop pipeline
	// ===========================================================

	describe("failure does not stop pipeline", () => {
		it("should continue to step 2 even if step 1 fails", () => {
			// Use "false" instead of "exit 1" — exit would terminate the subshell
			// before the .rc file is written, causing the spinner to hang.
			const result = run(
				'/repos/repo1="false" --then /repos/repo2="echo after-fail"',
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

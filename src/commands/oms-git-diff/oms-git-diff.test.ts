import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	PROJECT_DIR,
	startContainer,
} from "../../../tests/helpers";

/**
 * oms-git-diff command tests
 *
 * We build a fake git repo inside an Alpine container with the following branch topology:
 *
 *   main:       A --- B
 *                      \
 *   stage:              C --- D
 *                              \
 *   develop:                    E --- F
 *
 * Then we exercise oms-git-diff from various branch positions and working-tree states
 * to verify the diff cascade logic:
 *   - feature branch  → commit diff against closest parent
 *   - integration branch with local changes → staged / unstaged diff
 *   - integration branch with no changes → no output
 *   - detached HEAD → error
 *   - outside a git repo → error
 */
describe("oms-git-diff command", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	const REPO = "/repo";
	const REMOTE = "/tmp/remote-repo";
	const CMD = "/commands/oms-git-diff/oms-git-diff.sh";

	// Helper: run oms-git-diff inside the cloned repo
	const runDiff = async (cwd = REPO) =>
		await exec(id, `cd ${cwd} && bash -c 'source ${CMD} && oms-git-diff'`);

	// Helper: run a git command inside the cloned repo
	const git = async (cmd: string, cwd = REPO) =>
		await exec(id, `cd ${cwd} && git ${cmd}`);

	beforeAll(async () => {
		container = await startContainer();
		id = container;

		// Install dependencies

		// Copy the oms-git-diff command into the container
		await exec(id, "mkdir -p /commands/oms-git-diff");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-git-diff/oms-git-diff.sh`,
			CMD,
		);
		await exec(id, `chmod +x ${CMD}`);

		// -------------------------------------------------------
		// Build the fake remote repository with branch topology:
		//   main:    A --- B
		//                   \
		//   stage:           C --- D
		//                          \
		//   develop:                E --- F
		// -------------------------------------------------------
		await exec(id, `mkdir -p ${REMOTE}`);
		await exec(
			id,
			`cd ${REMOTE} && git init -b main && git config user.email 't@t' && git config user.name 'T'`,
		);

		// Commit A on main
		await exec(
			id,
			`cd ${REMOTE} && echo "file-a" > a.txt && git add . && git commit -m "A"`,
		);
		// Commit B on main
		await exec(
			id,
			`cd ${REMOTE} && echo "file-b" > b.txt && git add . && git commit -m "B"`,
		);

		// Create stage from main, add commits C and D
		await exec(id, `cd ${REMOTE} && git checkout -b stage`);
		await exec(
			id,
			`cd ${REMOTE} && echo "file-c" > c.txt && git add . && git commit -m "C"`,
		);
		await exec(
			id,
			`cd ${REMOTE} && echo "file-d" > d.txt && git add . && git commit -m "D"`,
		);

		// Create develop from stage, add commits E and F
		await exec(id, `cd ${REMOTE} && git checkout -b develop`);
		await exec(
			id,
			`cd ${REMOTE} && echo "file-e" > e.txt && git add . && git commit -m "E"`,
		);
		await exec(
			id,
			`cd ${REMOTE} && echo "file-f" > f.txt && git add . && git commit -m "F"`,
		);

		// Go back to main so clone gets main as default
		await exec(id, `cd ${REMOTE} && git checkout main`);

		// -------------------------------------------------------
		// Clone the repo (simulates a developer's local copy)
		// -------------------------------------------------------
		await exec(id, `git clone ${REMOTE} ${REPO}`);
		await exec(
			id,
			`cd ${REPO} && git config user.email 't@t' && git config user.name 'T'`,
		);

		// Fetch all remote branches and set up local tracking branches
		await exec(id, `cd ${REPO} && git fetch origin`);
		await exec(id, `cd ${REPO} && git checkout -b stage origin/stage`);
		await exec(id, `cd ${REPO} && git checkout -b develop origin/develop`);
		// Go back to main
		await exec(id, `cd ${REPO} && git checkout main`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// ===========================================================
	// Feature branch scenarios
	// ===========================================================

	describe("feature branch from develop", () => {
		it("should diff only the feature commits against develop", async () => {
			// Create a feature branch from develop with 2 commits
			await git("checkout develop");
			await git("checkout -b feature/from-develop");
			await exec(
				id,
				`cd ${REPO} && echo "feat-1" > feat1.txt && git add . && git commit -m "G"`,
			);
			await exec(
				id,
				`cd ${REPO} && echo "feat-2" > feat2.txt && git add . && git commit -m "H"`,
			);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			// Should contain only changes from commits G and H
			expect(result.output).toContain("feat-1");
			expect(result.output).toContain("feat-2");

			// Should NOT contain changes from develop, stage, or main commits
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");
			expect(result.output).not.toContain("file-c");
			expect(result.output).not.toContain("file-d");
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/from-develop");
		});
	});

	describe("feature branch from stage", () => {
		it("should diff only the feature commits against stage", async () => {
			await git("checkout stage");
			await git("checkout -b feature/from-stage");
			await exec(
				id,
				`cd ${REPO} && echo "stage-feat" > stage-feat.txt && git add . && git commit -m "SF"`,
			);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("stage-feat");

			// Should NOT contain changes from stage or earlier
			expect(result.output).not.toContain("file-c");
			expect(result.output).not.toContain("file-d");
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");

			// Cleanup
			await git("checkout stage");
			await git("branch -D feature/from-stage");
		});
	});

	describe("feature branch from main", () => {
		it("should diff only the feature commits against main", async () => {
			await git("checkout main");
			await git("checkout -b feature/from-main");
			await exec(
				id,
				`cd ${REPO} && echo "main-feat" > main-feat.txt && git add . && git commit -m "MF"`,
			);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("main-feat");
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");

			// Cleanup
			await git("checkout main");
			await git("branch -D feature/from-main");
		});
	});

	// ===========================================================
	// Integration branch scenarios
	// ===========================================================

	describe("on develop (integration branch), with staged changes", () => {
		it("should return only the staged diff, not commits from develop vs stage", async () => {
			await git("checkout develop");

			// Stage a change without committing
			await exec(id, `cd ${REPO} && echo "staged-change" > staged.txt`);
			await git("add staged.txt");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			// Should contain the staged file
			expect(result.output).toContain("staged-change");

			// Should NOT contain develop vs stage history (E, F commits)
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			await git("reset HEAD staged.txt");
			await exec(id, `cd ${REPO} && rm -f staged.txt`);
		});
	});

	describe("on develop (integration branch), with unstaged changes", () => {
		it("should return only the unstaged diff", async () => {
			await git("checkout develop");

			// Modify a tracked file without staging
			await exec(id, `cd ${REPO} && echo "modified-content" >> f.txt`);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("modified-content");
			expect(result.output).not.toContain("file-e");

			// Cleanup
			await git("checkout -- f.txt");
		});
	});

	describe("on develop (integration branch), no changes", () => {
		it("should produce no output", async () => {
			await git("checkout develop");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	describe("on stage (integration branch), with staged changes", () => {
		it("should return only the staged diff", async () => {
			await git("checkout stage");

			await exec(id, `cd ${REPO} && echo "stage-staged" > stage-staged.txt`);
			await git("add stage-staged.txt");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("stage-staged");

			// Should NOT contain stage vs main history
			expect(result.output).not.toContain("file-c");
			expect(result.output).not.toContain("file-d");

			// Cleanup
			await git("reset HEAD stage-staged.txt");
			await exec(id, `cd ${REPO} && rm -f stage-staged.txt`);
		});
	});

	describe("on stage (integration branch), no changes", () => {
		it("should produce no output", async () => {
			await git("checkout stage");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	describe("on main (integration branch), with unstaged changes", () => {
		it("should return only the unstaged diff", async () => {
			await git("checkout main");

			await exec(id, `cd ${REPO} && echo "main-change" >> b.txt`);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("main-change");

			// Cleanup
			await git("checkout -- b.txt");
		});
	});

	describe("on main (integration branch), no changes", () => {
		it("should produce no output", async () => {
			await git("checkout main");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	// ===========================================================
	// Diff cascade priority on feature branches
	// ===========================================================

	describe("feature branch with commits AND staged changes", () => {
		it("should return the commit diff (highest priority) which includes the committed file", async () => {
			await git("checkout develop");
			await git("checkout -b feature/cascade-test");
			await exec(
				id,
				`cd ${REPO} && echo "committed-content" > committed.txt && git add . && git commit -m "committed"`,
			);

			// Also stage a separate file (not committed)
			await exec(id, `cd ${REPO} && echo "extra-staged" > extra.txt`);
			await git("add extra.txt");

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			// Commit diff (merge-base..HEAD) includes committed.txt
			expect(result.output).toContain("committed-content");

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/cascade-test");
		});
	});

	// ===========================================================
	// Edge cases
	// ===========================================================

	describe("not a git repository", () => {
		it("should fail with an error on stderr", async () => {
			const result = await exec(
				id,
				`cd /tmp && bash -c 'source ${CMD} && oms-git-diff 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("not a git repository");
		});
	});

	describe("detached HEAD", () => {
		it("should fail with an error on stderr", async () => {
			// Go to a known branch first, then detach
			await git("checkout develop");
			const headSha = await git("rev-parse HEAD");
			await git(`checkout ${headSha.output}`);

			const result = await exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("detached HEAD");

			// Cleanup
			await git("checkout develop");
		});
	});

	describe("oms-gd alias", () => {
		it("should produce the same output as oms-git-diff", async () => {
			await git("checkout develop");
			await git("checkout -b feature/alias-test");
			await exec(
				id,
				`cd ${REPO} && echo "alias-content" > alias.txt && git add . && git commit -m "alias-commit"`,
			);

			const viaDirect = await exec(
				id,
				`cd ${REPO} && bash -c 'shopt -s expand_aliases; source ${CMD} && oms-git-diff'`,
			);
			const viaAlias = await exec(
				id,
				`cd ${REPO} && bash -c 'shopt -s expand_aliases; source ${CMD}; eval oms-gd'`,
			);

			expect(viaAlias.exitCode).toBe(0);
			expect(viaAlias.output).toContain("alias-content");
			expect(viaAlias.output).toBe(viaDirect.output);

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/alias-test");
		});
	});

	describe("feature branch with no remote tracking (new local branch not pushed)", () => {
		it("should still detect the closest parent and diff correctly", async () => {
			await git("checkout develop");
			await git("checkout -b feature/unpushed");
			await exec(
				id,
				`cd ${REPO} && echo "unpushed-work" > unpushed.txt && git add . && git commit -m "unpushed"`,
			);

			// Branch has no origin/feature/unpushed → local_head != remote_head (empty)
			// Should be detected as feature branch with develop as closest parent
			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("unpushed-work");
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/unpushed");
		});
	});

	// ===========================================================
	// Direct diff mode (branch name argument)
	// ===========================================================

	describe("direct diff mode: explicit branch argument", () => {
		it("should diff HEAD against the given branch name", async () => {
			await git("checkout develop");
			await git("checkout -b feature/direct-diff-test");
			await exec(
				id,
				`cd ${REPO} && echo "direct-content" > direct.txt && git add . && git commit -m "direct"`,
			);

			// Pass "main" explicitly — should diff against origin/main
			const result = await exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff main'`,
			);
			expect(result.exitCode).toBe(0);

			// Should include the feature commit AND the develop commits (all vs main)
			expect(result.output).toContain("direct-content");
			expect(result.output).toContain("file-e");
			expect(result.output).toContain("file-f");

			// Should NOT include main commits (a, b are already in main)
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/direct-diff-test");
		});

		it("should diff HEAD against a local branch ref when no origin/ exists", async () => {
			await git("checkout main");
			await git("checkout -b feature/local-ref-test");
			await exec(
				id,
				`cd ${REPO} && echo "local-ref" > local-ref.txt && git add . && git commit -m "local-ref"`,
			);

			// Pass "main" — origin/main exists so it resolves to origin/main
			const result = await exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff main'`,
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("local-ref");

			// Cleanup
			await git("checkout main");
			await git("branch -D feature/local-ref-test");
		});

		it("should return error for an unknown branch", async () => {
			await git("checkout main");

			const result = await exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff nonexistent-branch-xyz 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("unknown branch or ref");
		});
	});

	describe("feature branch fully pushed (local == origin/feature)", () => {
		it("should show all feature commits vs base, not treat it as integration", async () => {
			await git("checkout develop");
			await git("checkout -b feature/pushed-fully");
			await exec(
				id,
				`cd ${REPO} && echo "pushed-1" > pushed1.txt && git add . && git commit -m "P1"`,
			);
			await exec(
				id,
				`cd ${REPO} && echo "pushed-2" > pushed2.txt && git add . && git commit -m "P2"`,
			);
			await exec(
				id,
				`cd ${REPO} && echo "pushed-3" > pushed3.txt && git add . && git commit -m "P3"`,
			);

			// Simulate pushing: set up origin/feature/pushed-fully at the same commit
			// (push to the local remote repo used in setup)
			await exec(id, `cd ${REPO} && git push ${REMOTE} feature/pushed-fully`);
			// local HEAD == origin/feature/pushed-fully now
			await exec(id, `cd ${REPO} && git fetch origin`);

			const result = await runDiff();
			expect(result.exitCode).toBe(0);

			// All 3 feature commits should appear in the diff
			expect(result.output).toContain("pushed-1");
			expect(result.output).toContain("pushed-2");
			expect(result.output).toContain("pushed-3");

			// Should NOT contain develop history
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			await git("checkout develop");
			await git("branch -D feature/pushed-fully");
		});
	});
});

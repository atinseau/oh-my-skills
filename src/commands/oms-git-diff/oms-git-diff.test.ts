import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, PROJECT_DIR } from "../../../tests/helpers";

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
	let id: string;

	const REPO = "/repo";
	const REMOTE = "/tmp/remote-repo";
	const CMD = "/commands/oms-git-diff/oms-git-diff.sh";

	// Helper: run oms-git-diff inside the cloned repo
	const runDiff = (cwd = REPO) =>
		exec(id, `cd ${cwd} && bash -c 'source ${CMD} && oms-git-diff'`);

	// Helper: run a git command inside the cloned repo
	const git = (cmd: string, cwd = REPO) => exec(id, `cd ${cwd} && git ${cmd}`);

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		// Install dependencies
		exec(id, "apk add --no-cache bash git >/dev/null 2>&1");

		// Copy the oms-git-diff command into the container
		exec(id, "mkdir -p /commands/oms-git-diff");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-git-diff/oms-git-diff.sh`,
			CMD,
		);
		exec(id, `chmod +x ${CMD}`);

		// -------------------------------------------------------
		// Build the fake remote repository with branch topology:
		//   main:    A --- B
		//                   \
		//   stage:           C --- D
		//                          \
		//   develop:                E --- F
		// -------------------------------------------------------
		exec(id, `mkdir -p ${REMOTE}`);
		exec(
			id,
			`cd ${REMOTE} && git init -b main && git config user.email 't@t' && git config user.name 'T'`,
		);

		// Commit A on main
		exec(
			id,
			`cd ${REMOTE} && echo "file-a" > a.txt && git add . && git commit -m "A"`,
		);
		// Commit B on main
		exec(
			id,
			`cd ${REMOTE} && echo "file-b" > b.txt && git add . && git commit -m "B"`,
		);

		// Create stage from main, add commits C and D
		exec(id, `cd ${REMOTE} && git checkout -b stage`);
		exec(
			id,
			`cd ${REMOTE} && echo "file-c" > c.txt && git add . && git commit -m "C"`,
		);
		exec(
			id,
			`cd ${REMOTE} && echo "file-d" > d.txt && git add . && git commit -m "D"`,
		);

		// Create develop from stage, add commits E and F
		exec(id, `cd ${REMOTE} && git checkout -b develop`);
		exec(
			id,
			`cd ${REMOTE} && echo "file-e" > e.txt && git add . && git commit -m "E"`,
		);
		exec(
			id,
			`cd ${REMOTE} && echo "file-f" > f.txt && git add . && git commit -m "F"`,
		);

		// Go back to main so clone gets main as default
		exec(id, `cd ${REMOTE} && git checkout main`);

		// -------------------------------------------------------
		// Clone the repo (simulates a developer's local copy)
		// -------------------------------------------------------
		exec(id, `git clone ${REMOTE} ${REPO}`);
		exec(
			id,
			`cd ${REPO} && git config user.email 't@t' && git config user.name 'T'`,
		);

		// Fetch all remote branches and set up local tracking branches
		exec(id, `cd ${REPO} && git fetch origin`);
		exec(id, `cd ${REPO} && git checkout -b stage origin/stage`);
		exec(id, `cd ${REPO} && git checkout -b develop origin/develop`);
		// Go back to main
		exec(id, `cd ${REPO} && git checkout main`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// ===========================================================
	// Feature branch scenarios
	// ===========================================================

	describe("feature branch from develop", () => {
		it("should diff only the feature commits against develop", () => {
			// Create a feature branch from develop with 2 commits
			git("checkout develop");
			git("checkout -b feature/from-develop");
			exec(
				id,
				`cd ${REPO} && echo "feat-1" > feat1.txt && git add . && git commit -m "G"`,
			);
			exec(
				id,
				`cd ${REPO} && echo "feat-2" > feat2.txt && git add . && git commit -m "H"`,
			);

			const result = runDiff();
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
			git("checkout develop");
			git("branch -D feature/from-develop");
		});
	});

	describe("feature branch from stage", () => {
		it("should diff only the feature commits against stage", () => {
			git("checkout stage");
			git("checkout -b feature/from-stage");
			exec(
				id,
				`cd ${REPO} && echo "stage-feat" > stage-feat.txt && git add . && git commit -m "SF"`,
			);

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("stage-feat");

			// Should NOT contain changes from stage or earlier
			expect(result.output).not.toContain("file-c");
			expect(result.output).not.toContain("file-d");
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");

			// Cleanup
			git("checkout stage");
			git("branch -D feature/from-stage");
		});
	});

	describe("feature branch from main", () => {
		it("should diff only the feature commits against main", () => {
			git("checkout main");
			git("checkout -b feature/from-main");
			exec(
				id,
				`cd ${REPO} && echo "main-feat" > main-feat.txt && git add . && git commit -m "MF"`,
			);

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("main-feat");
			expect(result.output).not.toContain("file-a");
			expect(result.output).not.toContain("file-b");

			// Cleanup
			git("checkout main");
			git("branch -D feature/from-main");
		});
	});

	// ===========================================================
	// Integration branch scenarios
	// ===========================================================

	describe("on develop (integration branch), with staged changes", () => {
		it("should return only the staged diff, not commits from develop vs stage", () => {
			git("checkout develop");

			// Stage a change without committing
			exec(id, `cd ${REPO} && echo "staged-change" > staged.txt`);
			git("add staged.txt");

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			// Should contain the staged file
			expect(result.output).toContain("staged-change");

			// Should NOT contain develop vs stage history (E, F commits)
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			git("reset HEAD staged.txt");
			exec(id, `cd ${REPO} && rm -f staged.txt`);
		});
	});

	describe("on develop (integration branch), with unstaged changes", () => {
		it("should return only the unstaged diff", () => {
			git("checkout develop");

			// Modify a tracked file without staging
			exec(id, `cd ${REPO} && echo "modified-content" >> f.txt`);

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("modified-content");
			expect(result.output).not.toContain("file-e");

			// Cleanup
			git("checkout -- f.txt");
		});
	});

	describe("on develop (integration branch), no changes", () => {
		it("should produce no output", () => {
			git("checkout develop");

			const result = runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	describe("on stage (integration branch), with staged changes", () => {
		it("should return only the staged diff", () => {
			git("checkout stage");

			exec(id, `cd ${REPO} && echo "stage-staged" > stage-staged.txt`);
			git("add stage-staged.txt");

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("stage-staged");

			// Should NOT contain stage vs main history
			expect(result.output).not.toContain("file-c");
			expect(result.output).not.toContain("file-d");

			// Cleanup
			git("reset HEAD stage-staged.txt");
			exec(id, `cd ${REPO} && rm -f stage-staged.txt`);
		});
	});

	describe("on stage (integration branch), no changes", () => {
		it("should produce no output", () => {
			git("checkout stage");

			const result = runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	describe("on main (integration branch), with unstaged changes", () => {
		it("should return only the unstaged diff", () => {
			git("checkout main");

			exec(id, `cd ${REPO} && echo "main-change" >> b.txt`);

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("main-change");

			// Cleanup
			git("checkout -- b.txt");
		});
	});

	describe("on main (integration branch), no changes", () => {
		it("should produce no output", () => {
			git("checkout main");

			const result = runDiff();
			expect(result.exitCode).toBe(0);
			expect(result.output).toBe("");
		});
	});

	// ===========================================================
	// Diff cascade priority on feature branches
	// ===========================================================

	describe("feature branch with commits AND staged changes", () => {
		it("should return the commit diff (highest priority) which includes the committed file", () => {
			git("checkout develop");
			git("checkout -b feature/cascade-test");
			exec(
				id,
				`cd ${REPO} && echo "committed-content" > committed.txt && git add . && git commit -m "committed"`,
			);

			// Also stage a separate file (not committed)
			exec(id, `cd ${REPO} && echo "extra-staged" > extra.txt`);
			git("add extra.txt");

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			// Commit diff (merge-base..HEAD) includes committed.txt
			expect(result.output).toContain("committed-content");

			// Cleanup
			git("checkout develop");
			git("branch -D feature/cascade-test");
		});
	});

	// ===========================================================
	// Edge cases
	// ===========================================================

	describe("not a git repository", () => {
		it("should fail with an error on stderr", () => {
			const result = exec(
				id,
				`cd /tmp && bash -c 'source ${CMD} && oms-git-diff 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("not a git repository");
		});
	});

	describe("detached HEAD", () => {
		it("should fail with an error on stderr", () => {
			// Go to a known branch first, then detach
			git("checkout develop");
			const headSha = git("rev-parse HEAD");
			git(`checkout ${headSha.output}`);

			const result = exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("detached HEAD");

			// Cleanup
			git("checkout develop");
		});
	});

	describe("oms-gd alias", () => {
		it("should produce the same output as oms-git-diff", () => {
			git("checkout develop");
			git("checkout -b feature/alias-test");
			exec(
				id,
				`cd ${REPO} && echo "alias-content" > alias.txt && git add . && git commit -m "alias-commit"`,
			);

			const viaDirect = exec(
				id,
				`cd ${REPO} && bash -c 'shopt -s expand_aliases; source ${CMD} && oms-git-diff'`,
			);
			const viaAlias = exec(
				id,
				`cd ${REPO} && bash -c 'shopt -s expand_aliases; source ${CMD}; eval oms-gd'`,
			);

			expect(viaAlias.exitCode).toBe(0);
			expect(viaAlias.output).toContain("alias-content");
			expect(viaAlias.output).toBe(viaDirect.output);

			// Cleanup
			git("checkout develop");
			git("branch -D feature/alias-test");
		});
	});

	describe("feature branch with no remote tracking (new local branch not pushed)", () => {
		it("should still detect the closest parent and diff correctly", () => {
			git("checkout develop");
			git("checkout -b feature/unpushed");
			exec(
				id,
				`cd ${REPO} && echo "unpushed-work" > unpushed.txt && git add . && git commit -m "unpushed"`,
			);

			// Branch has no origin/feature/unpushed → local_head != remote_head (empty)
			// Should be detected as feature branch with develop as closest parent
			const result = runDiff();
			expect(result.exitCode).toBe(0);

			expect(result.output).toContain("unpushed-work");
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			git("checkout develop");
			git("branch -D feature/unpushed");
		});
	});

	// ===========================================================
	// Direct diff mode (branch name argument)
	// ===========================================================

	describe("direct diff mode: explicit branch argument", () => {
		it("should diff HEAD against the given branch name", () => {
			git("checkout develop");
			git("checkout -b feature/direct-diff-test");
			exec(
				id,
				`cd ${REPO} && echo "direct-content" > direct.txt && git add . && git commit -m "direct"`,
			);

			// Pass "main" explicitly — should diff against origin/main
			const result = exec(
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
			git("checkout develop");
			git("branch -D feature/direct-diff-test");
		});

		it("should diff HEAD against a local branch ref when no origin/ exists", () => {
			git("checkout main");
			git("checkout -b feature/local-ref-test");
			exec(
				id,
				`cd ${REPO} && echo "local-ref" > local-ref.txt && git add . && git commit -m "local-ref"`,
			);

			// Pass "main" — origin/main exists so it resolves to origin/main
			const result = exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff main'`,
			);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("local-ref");

			// Cleanup
			git("checkout main");
			git("branch -D feature/local-ref-test");
		});

		it("should return error for an unknown branch", () => {
			git("checkout main");

			const result = exec(
				id,
				`cd ${REPO} && bash -c 'source ${CMD} && oms-git-diff nonexistent-branch-xyz 2>&1'`,
			);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("unknown branch or ref");
		});
	});

	describe("feature branch fully pushed (local == origin/feature)", () => {
		it("should show all feature commits vs base, not treat it as integration", () => {
			git("checkout develop");
			git("checkout -b feature/pushed-fully");
			exec(
				id,
				`cd ${REPO} && echo "pushed-1" > pushed1.txt && git add . && git commit -m "P1"`,
			);
			exec(
				id,
				`cd ${REPO} && echo "pushed-2" > pushed2.txt && git add . && git commit -m "P2"`,
			);
			exec(
				id,
				`cd ${REPO} && echo "pushed-3" > pushed3.txt && git add . && git commit -m "P3"`,
			);

			// Simulate pushing: set up origin/feature/pushed-fully at the same commit
			// (push to the local remote repo used in setup)
			exec(id, `cd ${REPO} && git push ${REMOTE} feature/pushed-fully`);
			// local HEAD == origin/feature/pushed-fully now
			exec(id, `cd ${REPO} && git fetch origin`);

			const result = runDiff();
			expect(result.exitCode).toBe(0);

			// All 3 feature commits should appear in the diff
			expect(result.output).toContain("pushed-1");
			expect(result.output).toContain("pushed-2");
			expect(result.output).toContain("pushed-3");

			// Should NOT contain develop history
			expect(result.output).not.toContain("file-e");
			expect(result.output).not.toContain("file-f");

			// Cleanup
			git("checkout develop");
			git("branch -D feature/pushed-fully");
		});
	});
});

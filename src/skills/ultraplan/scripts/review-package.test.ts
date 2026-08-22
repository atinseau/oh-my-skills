import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	startContainer,
} from "../../../../tests/helpers";

// review-package.sh is the reviewer's whole view of a change: it is told to read
// the file once and to treat anything not visible in it as unverified. A
// package too large to read in one call therefore degrades the review
// silently — the reviewer judges the part it saw and reports nothing missing.
// These tests pin the header and the size-driven context reduction, which are
// the only signals that the degradation happened.

const PKG = "/ultraplan/review-package.sh";
const REPO = "/repo";

describe("ultraplan review-package.sh", () => {
	let container: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		await exec(container, "mkdir -p /ultraplan /out");
		await copyToContainer(container, `${__dirname}/review-package.sh`, PKG);
		await exec(container, `chmod +x ${PKG}`);

		// A repo with a base commit and one unit branch touching two files
		// inside the write-set and one outside it.
		await exec(
			container,
			[
				`mkdir -p ${REPO}/src/lib ${REPO}/src/other`,
				`cd ${REPO}`,
				"git init -q -b plan",
				"git config user.email t@t.t && git config user.name t",
				// 400 lines so a -U10 diff is measurably fatter than -U3
				"seq 1 400 > src/lib/owned.txt",
				"seq 1 40 > src/other/foreign.txt",
				"git add -A && git commit -qm base",
				"git switch -qc unit",
				// change every 20th line: many small hunks, so context dominates
				"awk 'NR%20==0 {print \"changed \" NR; next} {print}' src/lib/owned.txt > t && mv t src/lib/owned.txt",
				"echo appended >> src/other/foreign.txt",
				"git add -A && git commit -qm 'unit work'",
			].join(" && "),
		);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	async function run(out: string, env = "", paths = "src/lib/owned.txt") {
		return await exec(
			container,
			`${env} sh ${PKG} ${REPO} plan unit ${out} -- ${paths} 2>&1`,
		);
	}

	it("writes a package with a header naming commits, files and size", async () => {
		const r = await run("/out/full.md");
		expect(r.exitCode).toBe(0);
		const pkg = await exec(container, "cat /out/full.md");
		expect(pkg.output).toContain("# Review package plan..unit");
		expect(pkg.output).toContain("## Package");
		expect(pkg.output).toMatch(
			/commits: 1 · files: 1 · diff: \d+ bytes at -U10/,
		);
		expect(pkg.output).toContain("full context");
		expect(pkg.output).toContain("## Commits");
		expect(pkg.output).toContain("## Files changed");
		expect(pkg.output).toContain("## Diff");
	});

	it("scopes the diff to the declared write-set", async () => {
		await run("/out/scoped.md");
		const pkg = await exec(container, "cat /out/scoped.md");
		expect(pkg.output).toContain("src/lib/owned.txt");
		expect(pkg.output).not.toContain("src/other/foreign.txt");
	});

	// The point of the guard: the reviewer must never be handed a package it
	// can only read half of without the file saying so.
	it("drops to -U3 and says so when the full-context diff is too large", async () => {
		const r = await run("/out/reduced.md", "REVIEW_PACKAGE_MAX_BYTES=2000");
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("context reduced from -U10 to -U3");
		const pkg = await exec(container, "cat /out/reduced.md");
		expect(pkg.output).toContain("at -U3");
		expect(pkg.output).toContain("exceeded 2000 bytes");
	});

	it("shrinks the package when it reduces the context", async () => {
		await run("/out/a.md");
		await run("/out/b.md", "REVIEW_PACKAGE_MAX_BYTES=2000");
		const sizes = await exec(container, "wc -c < /out/a.md; wc -c < /out/b.md");
		const [full = 0, reduced = 0] = sizes.output
			.split("\n")
			.map((n) => Number(n.trim()));
		expect(reduced).toBeGreaterThan(0);
		expect(reduced).toBeLessThan(full);
	});

	// Reducing context is not always enough. Then the reviewer is told to
	// refuse rather than review a fraction — the skill's "no silent caps" rule.
	it("tells the reviewer to refuse when even -U3 is over the limit", async () => {
		const r = await run("/out/huge.md", "REVIEW_PACKAGE_MAX_BYTES=100");
		expect(r.output).toContain("too large to review in one call");
		const pkg = await exec(container, "cat /out/huge.md");
		expect(pkg.output).toContain("say so in your verdict");
	});

	it("stays at -U10 when the diff fits", async () => {
		const r = await run("/out/fits.md", "REVIEW_PACKAGE_MAX_BYTES=999999");
		expect(r.output).toContain("at -U10");
		expect(r.output).not.toContain("reduced");
	});

	it("leaves no temporary diff behind", async () => {
		await run("/out/clean.md", "REVIEW_PACKAGE_MAX_BYTES=2000");
		const leftovers = await exec(
			container,
			"ls /out | grep -c '.diff.' || true",
		);
		expect(leftovers.output).toBe("0");
	});

	it("refuses an unknown base or head", async () => {
		const bad = await exec(
			container,
			`sh ${PKG} ${REPO} nope unit /out/bad.md -- src/lib/owned.txt 2>&1`,
		);
		expect(bad.exitCode).toBe(2);
		expect(bad.output).toContain("bad base");
		const gone = await exec(container, "test -f /out/bad.md; echo $?");
		expect(gone.output).toBe("1");
	});

	it("rejects a missing argument", async () => {
		const r = await exec(container, `sh ${PKG} ${REPO} plan 2>&1`);
		expect(r.exitCode).not.toBe(0);
	});
});

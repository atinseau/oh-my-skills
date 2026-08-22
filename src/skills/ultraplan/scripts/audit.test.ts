import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	startContainer,
} from "../../../../tests/helpers";

// audit.sh is the only mechanical guard ultraplan has: a plan.json that passes
// it is handed to parallel workers unread. A check that silently matches
// nothing therefore reads as "invariant holds". Every test below breaks one
// invariant in the shipped template and asserts the audit says so — the
// template itself is the "clean plan" fixture.
//
// Mutations are jq filters applied to templates/plan.json inside the container.

const AUDIT = "/ultraplan/audit.sh";
const CLEAN = "/ultraplan/plan.json";

describe("ultraplan audit.sh", () => {
	let container: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		await exec(container, "mkdir -p /ultraplan /work");
		await copyToContainer(container, `${__dirname}/audit.sh`, AUDIT);
		await copyToContainer(
			container,
			`${__dirname}/../templates/plan.json`,
			CLEAN,
		);
		await exec(container, `chmod +x ${AUDIT}`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	// Apply a jq mutation to the clean template, then audit the result.
	// `--finish` runs the extra end-of-run checks.
	async function audit(mutation: string, mode = "") {
		const plan = `/work/plan-${Math.random().toString(36).slice(2, 10)}.json`;
		const build = await exec(
			container,
			`jq '${mutation}' ${CLEAN} > ${plan} 2>&1`,
		);
		expect(build.exitCode).toBe(0);
		return await exec(container, `sh ${AUDIT} ${plan} ${mode} 2>&1`);
	}

	// A finished run: every verdict written, every unit merged and reviewed,
	// every due oracle merged. Used as the clean fixture for --finish.
	const FINISHED = `
    .requirements |= map(.verdict = "satisfied" | .evidence = "seen in the diff"
      | if .oracle.testable then .oracle.merged = true | .oracle.status = "merged" else . end)
    | .units |= map(.status = "merged" | .review.verdict = "satisfied" | .review.evidence = "ok")
  `;

	it("passes the shipped template unmodified", async () => {
		const r = await exec(container, `sh ${AUDIT} ${CLEAN} 2>&1`);
		expect(r.output).not.toContain("✗");
		expect(r.exitCode).toBe(0);
	});

	it("rejects a missing plan argument", async () => {
		const r = await exec(container, `sh ${AUDIT} 2>&1`);
		expect(r.exitCode).not.toBe(0);
	});

	// The regression this suite exists for: `$ids|index(.)` compared $ids with
	// itself, so every membership check passed whatever the plan said.
	it("catches a coverage map pointing at a unit that does not exist", async () => {
		const r = await audit('.requirements[0].units = ["U-99"]');
		expect(r.output).toContain("✗ coverage map references existing unit ids");
		expect(r.output).toContain("U-99");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit covering a requirement that does not exist", async () => {
		const r = await audit('.units[1].covers = ["R-99"]');
		expect(r.output).toContain(
			"✗ unit coverage references existing requirement ids",
		);
		expect(r.exitCode).toBe(1);
	});

	it("catches a missing gate row", async () => {
		const r = await audit(".gates |= [.[0]]");
		expect(r.output).toContain("✗ gate table");
		expect(r.output).toContain("every-merge-batch");
		expect(r.exitCode).toBe(1);
	});

	it("catches an empty gate table", async () => {
		const r = await audit(".gates = []");
		expect(r.output).toContain("✗ gate table");
		expect(r.exitCode).toBe(1);
	});

	it("catches two units in one wave writing the same file", async () => {
		const r = await audit(
			'.units[2].writes += ["src/lib/export/orders-csv.ts"]',
		);
		expect(r.output).toContain("✗ write-sets disjoint");
		expect(r.output).toContain("U-02");
		expect(r.exitCode).toBe(1);
	});

	// The overlap that the old exact-string comparison could not see.
	it("catches a directory write-set containing another unit's file", async () => {
		const r = await audit('.units[2].writes += ["src/lib/export/"]');
		expect(r.output).toContain("✗ write-sets disjoint");
		expect(r.exitCode).toBe(1);
	});

	it("allows sibling paths that merely share a prefix string", async () => {
		const r = await audit('.units[2].writes += ["src/lib/export-legacy.ts"]');
		expect(r.output).toContain("✓ write-sets disjoint");
	});

	it("catches two units in one wave claiming the same resource", async () => {
		const r = await audit(".units[1].uses = .units[2].uses");
		expect(r.output).toContain("✗ resource-sets disjoint");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit past wave 0 writing a frozen contract", async () => {
		const r = await audit('.units[1].writes += ["src/types/export.ts"]');
		expect(r.output).toContain("✗ no unit past wave 0 writes a contract");
		expect(r.exitCode).toBe(1);
	});

	it("catches an oracle spec file that a unit also writes", async () => {
		const r = await audit(".requirements[0].oracle.path = .units[1].writes[0]");
		expect(r.output).toContain("✗ oracle spec files are unique");
		expect(r.exitCode).toBe(1);
	});

	it("catches a duplicate unit id", async () => {
		const r = await audit(".units += [.units[1]]");
		expect(r.output).toContain("✗ no duplicate requirement or unit ids");
		expect(r.output).toContain("U-02");
		expect(r.exitCode).toBe(1);
	});

	it("catches a dependsOn pointing forward or at nothing", async () => {
		const r = await audit('.units[1].dependsOn = ["U-04"]');
		expect(r.output).toContain("✗ dependsOn");
		expect(r.exitCode).toBe(1);
	});

	it("catches an oracle due after a unit that does not cover it", async () => {
		const r = await audit('.requirements[0].oracle.dueAfterUnit = "U-04"');
		expect(r.output).toContain(
			"✗ oracle due unit is one of the covering units",
		);
		expect(r.exitCode).toBe(1);
	});

	it("catches a universally quantified requirement whose oracle never re-arms", async () => {
		const r = await audit(".requirements[0].universallyQuantified = true");
		expect(r.output).toContain("✗ universally quantified requirements re-arm");
		expect(r.exitCode).toBe(1);
	});

	it("catches a baseline that does not match its breakdown", async () => {
		const r = await audit(".metrics.sequentialBaseline = 99");
		expect(r.output).toContain("✗ baseline sum matches breakdown");
		expect(r.exitCode).toBe(1);
	});

	it("catches metrics counts drifting from the plan", async () => {
		const r = await audit(".metrics.units = 12");
		expect(r.output).toContain("✗ metrics unit and wave counts match the plan");
		expect(r.exitCode).toBe(1);
	});

	// The honesty check: fanning out while the projection says it does not pay.
	it("catches worthFanningOut disagreeing with the projected speedup", async () => {
		const r = await audit(".metrics.worthFanningOut = true");
		expect(r.output).toContain("✗ worthFanningOut agrees");
		expect(r.exitCode).toBe(1);
	});

	it("catches a missing wave-0 contracts unit", async () => {
		const r = await audit(".units[0].infrastructural = false");
		expect(r.output).toContain("✗ a wave-0 infrastructural unit exists");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit with no acceptance command", async () => {
		const r = await audit('.units[1].acceptance = ""');
		expect(r.output).toContain("✗ every unit has an acceptance command");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit with no declared resource-set", async () => {
		const r = await audit(".units[1] |= del(.uses)");
		expect(r.output).toContain("✗ every unit declares a resource-set");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit with an empty write-set", async () => {
		const r = await audit(".units[1].writes = []");
		expect(r.output).toContain("✗ every unit declares a write-set");
		expect(r.exitCode).toBe(1);
	});

	it("catches a missing rulings ledger", async () => {
		const r = await audit("del(.rulings)");
		expect(r.output).toContain("✗ rulings[] present");
		expect(r.exitCode).toBe(1);
	});

	// `ls plan.md packs/*.md` fails as a whole when packs/ is missing, which is
	// exactly the plan you want scanned: prose written, packs not yet emitted.
	it("catches placeholder text in plan.md with no packs directory", async () => {
		await exec(
			container,
			`mkdir -p /work/ph && cp ${CLEAN} /work/ph/plan.json && printf '## Wave 1\\nU-02 — TODO\\n' > /work/ph/plan.md`,
		);
		const r = await exec(container, `sh ${AUDIT} /work/ph/plan.json 2>&1`);
		expect(r.output).toContain("✗ no placeholders");
		expect(r.exitCode).toBe(1);
	});

	it("catches placeholder text in a pack with no plan.md", async () => {
		await exec(
			container,
			`mkdir -p /work/pk/packs && cp ${CLEAN} /work/pk/plan.json && printf '### U-02\\n**Done when** TBD\\n' > /work/pk/packs/U-02.md`,
		);
		const r = await exec(container, `sh ${AUDIT} /work/pk/plan.json 2>&1`);
		expect(r.output).toContain("✗ no placeholders");
		expect(r.exitCode).toBe(1);
	});

	it("passes when plan.md and the packs are clean", async () => {
		await exec(
			container,
			`mkdir -p /work/ok/packs && cp ${CLEAN} /work/ok/plan.json && printf '## Wave 1\\nU-02 serializer\\n' > /work/ok/plan.md && printf '### U-02\\n**Done when** the suite passes\\n' > /work/ok/packs/U-02.md`,
		);
		const r = await exec(container, `sh ${AUDIT} /work/ok/plan.json 2>&1`);
		expect(r.output).toContain("✓ no placeholders");
		expect(r.exitCode).toBe(0);
	});

	it("passes --finish on a completed run", async () => {
		const r = await audit(FINISHED, "--finish");
		expect(r.output).not.toContain("✗");
		expect(r.exitCode).toBe(0);
	});

	it("catches a null requirement verdict at --finish", async () => {
		const r = await audit(
			`${FINISHED} | .requirements[0].verdict = null`,
			"--finish",
		);
		expect(r.output).toContain("✗ finish: no null requirement verdict");
		expect(r.exitCode).toBe(1);
	});

	it("catches a merged unit with no review verdict at --finish", async () => {
		const r = await audit(
			`${FINISHED} | .units[1].review.verdict = null`,
			"--finish",
		);
		expect(r.output).toContain("✗ finish: every merged");
		expect(r.exitCode).toBe(1);
	});

	it("catches a due oracle that never merged at --finish", async () => {
		const r = await audit(
			`${FINISHED} | .requirements[0].oracle.merged = false`,
			"--finish",
		);
		expect(r.output).toContain("✗ finish: every due oracle merged");
		expect(r.exitCode).toBe(1);
	});

	it("catches a unit left running at --finish", async () => {
		const r = await audit(
			`${FINISHED} | .units[1].status = "running"`,
			"--finish",
		);
		expect(r.output).toContain("✗ finish: no unit left running or pending");
		expect(r.exitCode).toBe(1);
	});
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	HOME,
	SCRIPTS_DIR,
	startContainer,
} from "./helpers";

describe("scripts/hooks.sh", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;
		await exec(id, "mkdir -p /scripts");
		await copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		await copyToContainer(id, `${SCRIPTS_DIR}/hooks.sh`, "/scripts/hooks.sh");
		await exec(id, "chmod +x /scripts/hooks.sh");

		await exec(id, `mkdir -p ${HOME}/.oh-my-skills/hooks/sample-hook`);
		await exec(
			id,
			`printf '%s' '{"event":"UserPromptSubmit","matcher":"*","timeout":10}' > ${HOME}/.oh-my-skills/hooks/sample-hook/hook.json`,
		);
		await exec(
			id,
			`printf '#!/bin/bash\necho sample-hook\n' > ${HOME}/.oh-my-skills/hooks/sample-hook/hook.sh`,
		);
		await exec(id, `chmod +x ${HOME}/.oh-my-skills/hooks/sample-hook/hook.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("list shows the available hook as disabled by default", async () => {
		await exec(id, `rm -f ${HOME}/.oh-my-skills/registry.json`);
		const r = await exec(id, `bash /scripts/hooks.sh list`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("sample-hook");
		expect(r.output).toContain("disabled");
	});

	it("enable registers the hook and status reflects it", async () => {
		// Initialize registry before enabling
		await exec(id, `mkdir -p ${HOME}/.oh-my-skills`);
		await exec(
			id,
			`printf '%s' '{"version":"0.1.0","skills":{"claude":[],"copilot":[]},"hooks":{"enabled":[]}}' > ${HOME}/.oh-my-skills/registry.json`,
		);

		const r = await exec(id, `bash /scripts/hooks.sh enable sample-hook`);
		expect(r.exitCode).toBe(0);

		const status = await exec(id, `bash /scripts/hooks.sh status`);
		expect(status.output).toContain("sample-hook");
		expect(status.output).toContain("enabled");

		const settings = JSON.parse(
			(await exec(id, `cat ${HOME}/.claude/settings.json`)).output,
		);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
			"sample-hook/hook.sh",
		);
	});

	it("disable removes the registration", async () => {
		const r = await exec(id, `bash /scripts/hooks.sh disable sample-hook`);
		expect(r.exitCode).toBe(0);

		const status = await exec(id, `bash /scripts/hooks.sh status`);
		expect(status.output).toContain("disabled");
	});

	it("enable without a name errors with usage", async () => {
		const r = await exec(id, `bash /scripts/hooks.sh enable 2>&1`);
		expect(r.exitCode).not.toBe(0);
		expect(r.output).toContain("Usage");
	});

	it("unknown subcommand errors", async () => {
		const r = await exec(id, `bash /scripts/hooks.sh bogus 2>&1`);
		expect(r.exitCode).not.toBe(0);
		expect(r.output).toContain("Unknown hooks command");
	});
});

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

describe("oh-my-skills hooks lifecycle (e2e)", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;

		await exec(id, "mkdir -p /scripts");
		await copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		await copyToContainer(
			id,
			`${SCRIPTS_DIR}/install.sh`,
			"/scripts/install.sh",
		);
		await copyToContainer(
			id,
			`${SCRIPTS_DIR}/uninstall.sh`,
			"/scripts/uninstall.sh",
		);
		await copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		await copyToContainer(id, `${SCRIPTS_DIR}/hooks.sh`, "/scripts/hooks.sh");
		await exec(id, "chmod +x /scripts/*.sh");

		await exec(id, "mkdir -p /tmp/remote-repo");
		await exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		// Ship the REAL handoff hook, not a fixture
		await exec(id, "mkdir -p /tmp/remote-repo/src/hooks");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/hooks/handoff`,
			"/tmp/remote-repo/src/hooks/handoff",
		);

		await exec(id, "mkdir -p /tmp/remote-repo/src/commands/oms-cli");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/tmp/remote-repo/src/commands/oms-cli/oms.sh",
		);
		await exec(id, "mkdir -p /tmp/remote-repo/scripts");
		await exec(id, "cp /scripts/*.sh /tmp/remote-repo/scripts/");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		await exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'initial' && git tag v${VERSION}`,
		);

		await exec(id, `printf '# my bashrc\n' > ${HOME}/.bashrc`);

		await exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("installs the handoff hook canonically without enabling it", async () => {
		const script = await exec(
			id,
			`test -x ${INSTALL}/hooks/handoff/hook.sh && echo ok`,
		);
		expect(script.output).toBe("ok");

		const settings = await exec(
			id,
			`test -f ${HOME}/.claude/settings.json && echo exists || echo absent`,
		);
		expect(settings.output).toBe("absent");
	});

	it("oms hooks list shows handoff as disabled", async () => {
		const r = await exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks list'`,
		);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("handoff");
		expect(r.output).toContain("disabled");
	});

	it("oms hooks enable handoff registers it in settings.json", async () => {
		const r = await exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			(await exec(id, `cat ${HOME}/.claude/settings.json`)).output,
		);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
			`${INSTALL}/hooks/handoff/hook.sh`,
		);
	});

	it("the enabled hook script actually runs and responds to a high-usage transcript", async () => {
		await exec(
			id,
			`printf '%s\\n' '{"message":{"usage":{"input_tokens":180000}}}' > /tmp/e2e-transcript.jsonl`,
		);
		const input = JSON.stringify({
			transcript_path: "/tmp/e2e-transcript.jsonl",
			session_id: "e2e-session",
		});
		const r = await exec(
			id,
			`echo '${input}' | ${INSTALL}/hooks/handoff/hook.sh`,
		);
		expect(r.output).toContain("/handoff");
	});

	it("oms hooks disable handoff removes it from settings.json", async () => {
		const r = await exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks disable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			(await exec(id, `cat ${HOME}/.claude/settings.json`)).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands).not.toContain(`${INSTALL}/hooks/handoff/hook.sh`);
	});

	it("uninstall cleans up a still-enabled hook", async () => {
		await exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`,
		);
		const r = await exec(id, `bash /scripts/uninstall.sh --yes`);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			(await exec(id, `cat ${HOME}/.claude/settings.json`)).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands.some((c: string) => c.includes("handoff/hook.sh"))).toBe(
			false,
		);
	});
});

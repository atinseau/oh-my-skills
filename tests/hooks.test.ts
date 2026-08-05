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

describe("oh-my-skills hooks lifecycle (e2e)", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache git bash jq curl >/dev/null 2>&1");

		exec(id, "mkdir -p /scripts");
		copyToContainer(id, `${SCRIPTS_DIR}/lib.sh`, "/scripts/lib.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/uninstall.sh`, "/scripts/uninstall.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/update.sh`, "/scripts/update.sh");
		copyToContainer(id, `${SCRIPTS_DIR}/hooks.sh`, "/scripts/hooks.sh");
		exec(id, "chmod +x /scripts/*.sh");

		exec(id, "mkdir -p /tmp/remote-repo");
		exec(
			id,
			"cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'",
		);

		// Ship the REAL handoff hook, not a fixture
		exec(id, "mkdir -p /tmp/remote-repo/src/hooks");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/hooks/handoff`,
			"/tmp/remote-repo/src/hooks/handoff",
		);

		exec(id, "mkdir -p /tmp/remote-repo/src/commands/oms-cli");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/tmp/remote-repo/src/commands/oms-cli/oms.sh",
		);
		exec(id, "mkdir -p /tmp/remote-repo/scripts");
		exec(id, "cp /scripts/*.sh /tmp/remote-repo/scripts/");
		copyToContainer(
			id,
			`${PROJECT_DIR}/package.json`,
			"/tmp/remote-repo/package.json",
		);
		exec(
			id,
			`cd /tmp/remote-repo && git add . && git commit -m 'initial' && git tag v${VERSION}`,
		);

		exec(id, `printf '# my bashrc\n' > ${HOME}/.bashrc`);

		exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("installs the handoff hook canonically without enabling it", () => {
		const script = exec(
			id,
			`test -x ${INSTALL}/hooks/handoff/hook.sh && echo ok`,
		);
		expect(script.output).toBe("ok");

		const settings = exec(
			id,
			`test -f ${HOME}/.claude/settings.json && echo exists || echo absent`,
		);
		expect(settings.output).toBe("absent");
	});

	it("oms hooks list shows handoff as disabled", () => {
		const r = exec(id, `bash -c 'source ${INSTALL}/shell && oms hooks list'`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toContain("handoff");
		expect(r.output).toContain("disabled");
	});

	it("oms hooks enable handoff registers it in settings.json", () => {
		const r = exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
			`${INSTALL}/hooks/handoff/hook.sh`,
		);
	});

	it("the enabled hook script actually runs and responds to a high-usage transcript", () => {
		exec(
			id,
			`printf '%s\\n' '{"message":{"usage":{"input_tokens":180000}}}' > /tmp/e2e-transcript.jsonl`,
		);
		const input = JSON.stringify({
			transcript_path: "/tmp/e2e-transcript.jsonl",
			session_id: "e2e-session",
		});
		const r = exec(id, `echo '${input}' | ${INSTALL}/hooks/handoff/hook.sh`);
		expect(r.output).toContain("/handoff");
	});

	it("oms hooks disable handoff removes it from settings.json", () => {
		const r = exec(
			id,
			`bash -c 'source ${INSTALL}/shell && oms hooks disable handoff'`,
		);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands).not.toContain(`${INSTALL}/hooks/handoff/hook.sh`);
	});

	it("uninstall cleans up a still-enabled hook", () => {
		exec(id, `bash -c 'source ${INSTALL}/shell && oms hooks enable handoff'`);
		const r = exec(id, `bash /scripts/uninstall.sh --yes`);
		expect(r.exitCode).toBe(0);

		const settings = JSON.parse(
			exec(id, `cat ${HOME}/.claude/settings.json`).output,
		);
		const commands = (settings.hooks?.UserPromptSubmit ?? []).flatMap(
			(g: any) => g.hooks.map((h: any) => h.command),
		);
		expect(commands.some((c: string) => c.includes("handoff/hook.sh"))).toBe(
			false,
		);
	});
});

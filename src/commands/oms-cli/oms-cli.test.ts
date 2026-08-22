import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	HOME,
	PROJECT_DIR,
	startContainer,
} from "../../../tests/helpers";

describe("oms command", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;
		await exec(id, "mkdir -p /commands/oms-cli");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/commands/oms-cli/oms.sh",
		);
		await exec(id, "chmod +x /commands/oms-cli/oms.sh");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should print usage by default", async () => {
		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Usage: oms");
		expect(result.output).toContain("update");
		expect(result.output).toContain("hooks");
		expect(result.output).toContain("--help");
	});

	it("should print usage with --help", async () => {
		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms --help'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Usage: oms");
		expect(result.output).toContain("update");
		expect(result.output).toContain("hooks");
		expect(result.output).toContain("--help");
	});

	it("should delegate update to the installed update script in manual mode", async () => {
		await exec(id, `mkdir -p ${HOME}/.oh-my-skills/scripts`);
		await exec(
			id,
			`cat > ${HOME}/.oh-my-skills/scripts/update.sh <<'EOF'
#!/bin/bash
printf '%s' "$1" > "$HOME/update-args.txt"
EOF`,
		);
		await exec(id, `chmod +x ${HOME}/.oh-my-skills/scripts/update.sh`);

		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms update'`,
		);
		expect(result.exitCode).toBe(0);

		const recorded = await exec(id, `cat ${HOME}/update-args.txt`);
		expect(recorded.output).toBe("--manual");
	});

	it("should delegate hooks to the installed hooks script", async () => {
		await exec(id, `mkdir -p ${HOME}/.oh-my-skills/scripts`);
		await exec(
			id,
			`cat > ${HOME}/.oh-my-skills/scripts/hooks.sh <<'EOF'
#!/bin/bash
printf '%s' "$*" > "$HOME/hooks-args.txt"
EOF`,
		);
		await exec(id, `chmod +x ${HOME}/.oh-my-skills/scripts/hooks.sh`);

		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms hooks enable sample-hook'`,
		);
		expect(result.exitCode).toBe(0);

		const recorded = await exec(id, `cat ${HOME}/hooks-args.txt`);
		expect(recorded.output).toBe("enable sample-hook");
	});

	it("should print version with --version", async () => {
		await exec(id, `mkdir -p ${HOME}/.oh-my-skills`);
		await exec(
			id,
			`echo '{"version":"1.2.3"}' > ${HOME}/.oh-my-skills/registry.json`,
		);

		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms --version'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toBe("oh-my-skills v1.2.3");
	});

	it("should print version with version subcommand", async () => {
		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms version'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toBe("oh-my-skills v1.2.3");
	});

	it("should fail for unknown subcommands", async () => {
		const result = await exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms unknown 2>&1'`,
		);

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("Unknown oms command");
	});
});

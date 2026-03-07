import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, HOME, PROJECT_DIR } from "../helpers";

describe("oms command", () => {
	let container: StartedTestContainer;
	let id: string;

	beforeAll(async () => {
		container = await new GenericContainer("alpine:latest")
			.withCommand(["sleep", "infinity"])
			.start();
		id = container.getId();

		exec(id, "apk add --no-cache bash >/dev/null 2>&1");
		exec(id, "mkdir -p /commands/oms-cli");
		copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/oms-cli/oms.sh`,
			"/commands/oms-cli/oms.sh",
		);
		exec(id, "chmod +x /commands/oms-cli/oms.sh");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	it("should print usage by default", () => {
		const result = exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Usage: oms");
		expect(result.output).toContain("update");
		expect(result.output).toContain("--help");
	});

	it("should print usage with --help", () => {
		const result = exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms --help'`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Usage: oms");
		expect(result.output).toContain("update");
		expect(result.output).toContain("--help");
	});

	it("should delegate update to the installed update script in manual mode", () => {
		exec(id, `mkdir -p ${HOME}/.oh-my-skills/scripts`);
		exec(
			id,
			`cat > ${HOME}/.oh-my-skills/scripts/update.sh <<'EOF'
#!/bin/bash
printf '%s' "$1" > "$HOME/update-args.txt"
EOF`,
		);
		exec(id, `chmod +x ${HOME}/.oh-my-skills/scripts/update.sh`);

		const result = exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms update'`,
		);
		expect(result.exitCode).toBe(0);

		const recorded = exec(id, `cat ${HOME}/update-args.txt`);
		expect(recorded.output).toBe("--manual");
	});

	it("should fail for unknown subcommands", () => {
		const result = exec(
			id,
			`bash -lc 'source /commands/oms-cli/oms.sh && oms unknown 2>&1'`,
		);

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("Unknown oms command");
	});
});

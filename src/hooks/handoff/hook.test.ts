import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import { copyToContainer, exec, startContainer } from "../../../tests/helpers";

// A transcript is JSONL: one JSON object per line. Each usage-bearing line
// mimics a Claude Code assistant turn.
function usageLine(input: number, cacheRead = 0, cacheCreate = 0): string {
	return JSON.stringify({
		message: {
			usage: {
				input_tokens: input,
				cache_read_input_tokens: cacheRead,
				cache_creation_input_tokens: cacheCreate,
			},
		},
	});
}

describe("handoff hook.sh", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;
		await exec(id, "mkdir -p /hook");
		await copyToContainer(id, `${__dirname}/hook.sh`, "/hook/hook.sh");
		await exec(id, "chmod +x /hook/hook.sh");
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	async function runHook(transcriptPath: string, sessionId: string, env = "") {
		const input = JSON.stringify({
			transcript_path: transcriptPath,
			session_id: sessionId,
		});
		return await exec(
			id,
			`rm -f /root/.oh-my-skills/hooks/.state/handoff-nudged-${sessionId}; echo '${input}' | ${env} /hook/hook.sh`,
		);
	}

	it("stays silent below the threshold", async () => {
		await exec(id, `printf '%s\\n' '${usageLine(1000)}' > /tmp/below.jsonl`);
		const r = await runHook("/tmp/below.jsonl", "session-below");
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("nudges above the default 70% threshold", async () => {
		await exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/above.jsonl`);
		const r = await runHook("/tmp/above.jsonl", "session-above");
		expect(r.exitCode).toBe(0);
		const parsed = JSON.parse(r.output);
		expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("/handoff");
	});

	it("sums input + cache_read + cache_creation tokens", async () => {
		await exec(
			id,
			`printf '%s\\n' '${usageLine(50000, 60000, 50000)}' > /tmp/summed.jsonl`,
		);
		const r = await runHook("/tmp/summed.jsonl", "session-summed");
		expect(r.exitCode).toBe(0);
		expect(r.output).not.toBe(""); // 160000 / 200000 = 80%, above threshold
	});

	it("uses the LAST usage entry in the transcript, not the first", async () => {
		await exec(
			id,
			`printf '%s\\n%s\\n' '${usageLine(150000)}' '${usageLine(1000)}' > /tmp/last.jsonl`,
		);
		const r = await runHook("/tmp/last.jsonl", "session-last");
		expect(r.output).toBe(""); // last entry is well below threshold
	});

	it("only nudges once per session_id", async () => {
		await exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/once.jsonl`);
		const first = await runHook("/tmp/once.jsonl", "session-once");
		expect(first.output).not.toBe("");

		// Re-run WITHOUT clearing the marker this time
		const input = JSON.stringify({
			transcript_path: "/tmp/once.jsonl",
			session_id: "session-once",
		});
		const second = await exec(id, `echo '${input}' | /hook/hook.sh`);
		expect(second.output).toBe("");
	});

	it("exits silently when transcript_path is missing or the file doesn't exist", async () => {
		const r1 = await exec(id, `echo '{}' | /hook/hook.sh`);
		expect(r1.exitCode).toBe(0);
		expect(r1.output).toBe("");

		const r2 = await runHook("/tmp/does-not-exist.jsonl", "session-missing");
		expect(r2.exitCode).toBe(0);
		expect(r2.output).toBe("");
	});

	it("respects OMS_HANDOFF_THRESHOLD and OMS_HANDOFF_CONTEXT_WINDOW overrides", async () => {
		await exec(id, `printf '%s\\n' '${usageLine(1000)}' > /tmp/custom.jsonl`);
		// 1000 / 2000 = 50%, above a 10% threshold
		const r = await runHook(
			"/tmp/custom.jsonl",
			"session-custom",
			"OMS_HANDOFF_THRESHOLD=10 OMS_HANDOFF_CONTEXT_WINDOW=2000",
		);
		expect(r.output).not.toBe("");
	});

	it("exits silently when jq is unavailable", async () => {
		await exec(id, "mv /usr/bin/jq /usr/bin/jq.bak");
		await exec(id, `printf '%s\\n' '${usageLine(150000)}' > /tmp/nojq.jsonl`);
		const r = await runHook("/tmp/nojq.jsonl", "session-nojq");
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
		await exec(id, "mv /usr/bin/jq.bak /usr/bin/jq");
	});

	it("exits silently on malformed (non-JSON) stdin", async () => {
		const r = await exec(id, `echo 'not valid json at all' | /hook/hook.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});

	it("exits silently on wrong-shape JSON stdin (array instead of object)", async () => {
		const r = await exec(id, `printf '[1,2,3]' | /hook/hook.sh`);
		expect(r.exitCode).toBe(0);
		expect(r.output).toBe("");
	});
});

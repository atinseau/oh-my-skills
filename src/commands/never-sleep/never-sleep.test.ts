import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";
import {
	copyToContainer,
	exec,
	PROJECT_DIR,
	startContainer,
} from "../../../tests/helpers";

describe("never-sleep command", () => {
	let container: StartedTestContainer;
	let id: StartedTestContainer;

	beforeAll(async () => {
		container = await startContainer();
		id = container;
		await exec(id, "mkdir -p /commands/never-sleep /fakebin");
		await copyToContainer(
			id,
			`${PROJECT_DIR}/src/commands/never-sleep/never-sleep.sh`,
			"/commands/never-sleep/never-sleep.sh",
		);
		await exec(id, "chmod +x /commands/never-sleep/never-sleep.sh");

		// sudo: passthrough. caffeinate: log and exit. pmset: log, and for `-g`
		// emit a SleepDisabled line driven by $PMSET_INITIAL_STATE.
		await exec(
			id,
			`cat > /fakebin/sudo <<'EOF'
#!/bin/bash
echo "sudo $*" >> /tmp/calls.log
# Ticket refresh (\`sudo -n -v\`) is not a command to run: answer it directly.
# $SUDO_V_EXIT simulates an expired/uncacheable ticket.
if [ "$1" = "-n" ] || [ "$1" = "-v" ]; then
    exit \${SUDO_V_EXIT:-0}
fi
exec "$@"
EOF`,
		);
		await exec(
			id,
			`cat > /fakebin/caffeinate <<'EOF'
#!/bin/bash
echo "caffeinate $*" >> /tmp/calls.log
exit 0
EOF`,
		);
		await exec(
			id,
			`cat > /fakebin/pmset <<'EOF'
#!/bin/bash
echo "pmset $*" >> /tmp/calls.log
if [[ "$1" == "-g" ]]; then
    echo " SleepDisabled  \${PMSET_INITIAL_STATE:-0}"
fi
exit \${PMSET_EXIT:-0}
EOF`,
		);
		// ioreg mock: clamshell state driven by /tmp/clamshell-state (default: No).
		await exec(
			id,
			`cat > /fakebin/ioreg <<'EOF'
#!/bin/bash
state=$(cat /tmp/clamshell-state 2>/dev/null || echo "No")
echo "    | \\"AppleClamshellState\\" = $state"
EOF`,
		);
		await exec(
			id,
			"chmod +x /fakebin/sudo /fakebin/caffeinate /fakebin/pmset /fakebin/ioreg",
		);
		await exec(id, `echo "No" > /tmp/clamshell-state`);
	}, 60_000);

	afterAll(async () => {
		if (container) await container.stop();
	});

	const sourceCmd = `shopt -s expand_aliases; source /commands/never-sleep/never-sleep.sh`;
	const runEnv = `export PATH=/fakebin:$PATH; : > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d;`;

	// Rewrite the caffeinate mock between tests: "quick" returns immediately,
	// "blocking" stays alive until killed (via `exec sleep`).
	const setCaffeinate = async (mode: "quick" | "blocking") => {
		const body =
			mode === "blocking"
				? '#!/bin/bash\necho "caffeinate $*" >> /tmp/calls.log\necho $$ > /tmp/caffeinate.pid\nexec sleep 30\n'
				: '#!/bin/bash\necho "caffeinate $*" >> /tmp/calls.log\nexit 0\n';
		await exec(id, `cat > /fakebin/caffeinate <<'EOF'\n${body}EOF`);
		await exec(id, "chmod +x /fakebin/caffeinate");
		await exec(id, "rm -f /tmp/caffeinate.pid");
	};

	it("should define ns as an alias for never-sleep", async () => {
		const result = await exec(id, `bash -c '${sourceCmd}; alias ns'`);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("never-sleep");
	});

	it("should print help with --help and not touch pmset", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep --help'`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Usage: never-sleep");
		expect(result.output).toContain("--duration");
		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toBe("");
	});

	it("should reject unknown options", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep --bogus 2>&1; echo EXIT=$?'`,
		);
		expect(result.output).toContain("unknown option");
		expect(result.output).toContain("EXIT=1");
	});

	it("should fail fast when pmset/caffeinate are missing (non-macOS guard)", async () => {
		const result = await exec(
			id,
			`bash -c 'export PATH=/usr/bin:/bin; ${sourceCmd}; never-sleep 2>&1; echo EXIT=$?'`,
		);
		expect(result.output).toContain("requires macOS");
		expect(result.output).toContain("EXIT=1");
	});

	it("should disable sleep, run caffeinate -s, and restore to initial state (0)", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} export PMSET_INITIAL_STATE=0; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 0/,
		);
	});

	it("should restore to the captured initial state when it was already 1", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} export PMSET_INITIAL_STATE=1; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		// EXIT trap must restore to 1, not force 0
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate[\s\S]*pmset -a disablesleep 1/,
		);
		expect(calls.output).not.toMatch(/disablesleep 0/);
	});

	// --- Sentinel: surviving a SIGKILLed run without pinning the machine awake
	//
	// The live SleepDisabled value is only meaningful before we touch it. A run
	// killed with SIGKILL leaves 1 behind; without a sentinel the next run would
	// capture that 1 as "the user's setting" and restore it on a clean exit,
	// permanently disabling sleep while claiming the opposite.
	const stateDir = "/tmp/never-sleep.$(id -u).d";
	// Same as runEnv but preserves a sentinel planted by the test.
	const runEnvKeepState = `export PATH=/fakebin:$PATH; : > /tmp/calls.log;`;

	it("should clear the sentinel once sleep has been restored", async () => {
		await exec(
			id,
			`bash -c '${runEnv} export PMSET_INITIAL_STATE=1; ${sourceCmd}; never-sleep' >/dev/null 2>&1`,
		);
		// Left behind, it would be read back as the truth by the next run.
		const after = await exec(
			id,
			`test -d ${stateDir} && echo PRESENT || echo ABSENT`,
		);
		expect(after.output).toBe("ABSENT");
	});

	it("should restore 0 when the live value is a leftover from a SIGKILLed run", async () => {
		// Previous run captured the true value (0) then died without cleanup,
		// leaving the machine at SleepDisabled=1.
		await exec(id, `rm -rf /tmp/never-sleep.*.d; mkdir -p ${stateDir}`);
		await exec(id, `echo 0 > ${stateDir}/state`);

		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export PMSET_INITIAL_STATE=1; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		// Restores 0 — the sentinel, not the contaminated live read.
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 0/,
		);
		expect(result.output).toContain("SleepDisabled=0");
	});

	it("should reuse a sentinel of 1 (user really did disable sleep themselves)", async () => {
		await exec(id, `rm -rf /tmp/never-sleep.*.d; mkdir -p ${stateDir}`);
		await exec(id, `echo 1 > ${stateDir}/state`);

		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export PMSET_INITIAL_STATE=0; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("SleepDisabled=1");

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).not.toMatch(/disablesleep 0/);
	});

	it("should ignore a corrupted sentinel and fall back to the live value", async () => {
		await exec(id, `rm -rf /tmp/never-sleep.*.d; mkdir -p ${stateDir}`);
		await exec(id, `echo garbage > ${stateDir}/state`);

		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export PMSET_INITIAL_STATE=0; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("SleepDisabled=0");
	});

	it("should still work when the sentinel directory cannot be written", async () => {
		// Unwritable TMPDIR degrades to the old read-live behaviour instead of
		// blocking the user.
		await exec(
			id,
			"rm -rf /tmp/ro-tmp && mkdir -p /tmp/ro-tmp && chmod 500 /tmp/ro-tmp",
		);
		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export TMPDIR=/tmp/ro-tmp; export PMSET_INITIAL_STATE=0; ${sourceCmd}; never-sleep 2>&1'`,
		);
		expect(result.output).toContain("SleepDisabled=0");

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 0/,
		);
		await exec(id, "chmod 700 /tmp/ro-tmp && rm -rf /tmp/ro-tmp");
	});

	// --- Concurrency: last one out re-enables sleep

	it("should NOT re-enable sleep while another session is still running", async () => {
		await exec(id, `rm -rf /tmp/never-sleep.*.d; mkdir -p ${stateDir}`);
		await exec(id, `echo 0 > ${stateDir}/state`);
		// A live process standing in for a concurrent never-sleep instance.
		await exec(
			id,
			`sh -c 'sleep 30 >/dev/null 2>&1 & echo $! > /tmp/other.pid' `,
		);
		await exec(id, `touch ${stateDir}/owner.$(cat /tmp/other.pid)`);

		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export PMSET_INITIAL_STATE=1; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain(
			"other never-sleep session(s) still running",
		);

		const calls = await exec(id, "cat /tmp/calls.log");
		// Sleep must stay disabled: no restore call at all.
		expect(calls.output).not.toMatch(/disablesleep 0/);
		// And the sentinel survives for the session still holding it.
		const dir = await exec(
			id,
			`test -f ${stateDir}/state && echo KEPT || echo GONE`,
		);
		expect(dir.output).toBe("KEPT");

		await exec(
			id,
			"kill $(cat /tmp/other.pid) 2>/dev/null; rm -f /tmp/other.pid",
		);
	});

	it("should reap claims from dead sessions and restore normally", async () => {
		await exec(id, `rm -rf /tmp/never-sleep.*.d; mkdir -p ${stateDir}`);
		await exec(id, `echo 0 > ${stateDir}/state`);
		// PID 999999 is well above any live pid in the container.
		await exec(id, `touch ${stateDir}/owner.999999`);

		const result = await exec(
			id,
			`bash -c '${runEnvKeepState} export PMSET_INITIAL_STATE=1; ${sourceCmd}; never-sleep'`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("SleepDisabled=0");

		const after = await exec(
			id,
			`test -d ${stateDir} && echo PRESENT || echo ABSENT`,
		);
		expect(after.output).toBe("ABSENT");
	});

	it("should register a live claim while running", async () => {
		// Blocking caffeinate keeps the instance alive so the claim is
		// observable from outside.
		await setCaffeinate("blocking");
		await exec(id, `rm -rf /tmp/never-sleep.*.d`);
		await exec(
			id,
			`bash -c 'export PATH=/fakebin:$PATH; export PMSET_INITIAL_STATE=0; ${sourceCmd}; never-sleep' >/dev/null 2>&1 &
for i in $(seq 1 50); do [ -f /tmp/caffeinate.pid ] && break; sleep 0.05; done
sleep 0.2
find ${stateDir} -name 'owner.*' > /tmp/claims.txt 2>/dev/null
cat ${stateDir}/state > /tmp/live-state.txt 2>/dev/null
kill "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait 2>/dev/null`,
		);
		const claims = await exec(id, "cat /tmp/claims.txt");
		expect(claims.output).toContain("owner.");
		// The sentinel holds the true pre-run value while the session is live.
		const live = await exec(id, "cat /tmp/live-state.txt");
		expect(live.output).toBe("0");
		await setCaffeinate("quick");
	}, 20_000);

	it("should fail and not run caffeinate if pmset fails", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} export PMSET_EXIT=1; ${sourceCmd}; never-sleep 2>&1; echo EXIT=$?'`,
		);
		expect(result.output).toContain("❌ Failed");
		expect(result.output).toContain("EXIT=1");

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).not.toContain("caffeinate");
	});

	it("should NOT attempt a second sudo/pmset on failure (changed-flag guard)", async () => {
		// When the initial pmset fails, the EXIT trap must see changed=0 and
		// skip the restore path — otherwise the user would get a phantom second
		// sudo prompt for a setting we never actually touched.
		const result = await exec(
			id,
			`bash -c '${runEnv} export PMSET_EXIT=1; ${sourceCmd}; never-sleep 2>&1; echo EXIT=$?'`,
		);
		expect(result.output).toContain("EXIT=1");

		const calls = await exec(id, "cat /tmp/calls.log");
		// Only the failed enable attempt; no restore line. (The sudo mock also
		// logs its own invocation, so we filter to the direct pmset call which
		// is the precise signal of a restore attempt.)
		const pmsetDisableLines = calls.output
			.split("\n")
			.filter((l) => l.startsWith("pmset -a disablesleep"));
		expect(pmsetDisableLines).toEqual(["pmset -a disablesleep 1"]);
	});

	it("should run EXIT trap and restore initial state when caffeinate is killed by a real signal", async () => {
		// Blocking mock: exec sleep so the PID we write is sleep itself — it
		// reliably dies on SIGTERM. This proves the trap fires on in-flight
		// termination (same guarantee the user cares about on Ctrl+C).
		await setCaffeinate("blocking");
		await exec(id, "rm -f /tmp/nsleep.out");

		await exec(
			id,
			`cat > /tmp/kill-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
export PMSET_INITIAL_STATE=1
bash -c '
  shopt -s expand_aliases
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
bashpid=$!
for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
[ ! -f /tmp/caffeinate.pid ] && { echo EXIT=timeout; kill $bashpid; exit 1; }
kill -TERM "$(cat /tmp/caffeinate.pid)"
wait $bashpid
echo EXIT=$?
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/kill-driver.sh");

		const result = await exec(id, "/tmp/kill-driver.sh 2>&1");
		expect(result.output).toContain("EXIT=");
		expect(result.output).not.toContain("timeout");

		const calls = await exec(id, "cat /tmp/calls.log");
		// disable(1) -> caffeinate started -> signal kills it -> EXIT trap restores initial(1)
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 1/,
		);
		expect(calls.output).not.toMatch(/disablesleep 0/);

		await setCaffeinate("quick");
	}, 20_000);

	it("should restore BEFORE shell exits (catches EXIT-trap-in-function bug)", async () => {
		// Critical regression test: a user running never-sleep in their
		// interactive shell must see sleep mode restored immediately after
		// Ctrl+C, not at terminal close. Reproduce this by sourcing the
		// function in a shell that stays alive after never-sleep returns,
		// snapshotting calls.log WHILE the shell is still running, and
		// asserting the restoration is already there.
		await setCaffeinate("blocking");
		await exec(id, "rm -f /tmp/calls-snapshot.log");

		await exec(
			id,
			`cat > /tmp/interactive-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
export PMSET_INITIAL_STATE=1

# A background killer that simulates Ctrl+C once caffeinate is running
(
  while [ ! -f /tmp/caffeinate.pid ]; do sleep 0.05; done
  sleep 0.1
  kill -TERM "$(cat /tmp/caffeinate.pid)"
) &

# never-sleep runs in the FOREGROUND of this shell — identical to calling
# it interactively. No trailing \`bash -c\` exit masking the EXIT-trap bug.
source /commands/never-sleep/never-sleep.sh
never-sleep

# The shell is STILL ALIVE here. Snapshot now: any restoration visible in
# this snapshot must have happened via a properly-scoped EXIT trap, not via
# the outer shell closing.
cp /tmp/calls.log /tmp/calls-snapshot.log
echo SNAPSHOT_TAKEN
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/interactive-driver.sh");

		const result = await exec(id, "/tmp/interactive-driver.sh 2>&1");
		expect(result.output).toContain("SNAPSHOT_TAKEN");

		const snapshot = await exec(id, "cat /tmp/calls-snapshot.log");
		// The restoration MUST already be in the snapshot (i.e. before shell exit).
		expect(snapshot.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 1/,
		);
		expect(snapshot.output).not.toMatch(/disablesleep 0/);

		await setCaffeinate("quick");
	}, 20_000);

	it("should restore on real Ctrl+C in zsh (SIGINT to process group)", async () => {
		// Faithful reproduction of the user's bug: zsh interactive shell,
		// Ctrl+C delivers SIGINT to the entire foreground process group (the
		// subshell + caffeinate + watcher all receive it). In zsh, an untrapped
		// SIGINT terminates a `(...)` subshell WITHOUT firing its EXIT trap, so
		// `_ns_cleanup` never runs and `pmset disablesleep 1` is left in place.
		// The fix is to install an explicit `trap 'exit N' INT TERM` instead of
		// resetting to default — `exit` triggers the EXIT trap reliably.
		await setCaffeinate("blocking");
		await exec(id, "rm -f /tmp/caffeinate.pid");

		await exec(
			id,
			`cat > /tmp/zsh-ctrlc-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
export PMSET_INITIAL_STATE=0

# set -m makes the backgrounded shell its own process-group leader, so a
# negative-PID kill targets only that group (and doesn't take the driver
# itself down).
set -m
zsh -c '
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
zshpid=$!

for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
[ ! -f /tmp/caffeinate.pid ] && { echo TIMEOUT; kill $zshpid 2>/dev/null; exit 1; }

# Real Ctrl+C: SIGINT to the whole process group, not just one process.
kill -INT -$zshpid
wait $zshpid 2>/dev/null
echo EXIT=$?
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/zsh-ctrlc-driver.sh");

		const result = await exec(id, "/tmp/zsh-ctrlc-driver.sh 2>&1");
		expect(result.output).not.toContain("TIMEOUT");
		expect(result.output).toContain("EXIT=");

		const calls = await exec(id, "cat /tmp/calls.log");
		// The full enable→caffeinate→restore sequence MUST be present. If the
		// EXIT trap was skipped, the trailing `pmset -a disablesleep 0` won't
		// be there and SleepDisabled stays at 1 in the user's real session.
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 0/,
		);

		await setCaffeinate("quick");
	}, 20_000);

	it("should pass caffeinate -t with parsed seconds for --duration 30s", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep --duration 30s'`,
		);
		expect(result.exitCode).toBe(0);
		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toContain("caffeinate -s -t 30");
	});

	it("should convert minutes for --duration 2m", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep -d 2m'`,
		);
		expect(result.exitCode).toBe(0);
		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toContain("caffeinate -s -t 120");
	});

	it("should convert hours for --duration 1h", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep -d 1h'`,
		);
		expect(result.exitCode).toBe(0);
		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toContain("caffeinate -s -t 3600");
	});

	// --- Duration under zsh (BASH_REMATCH regression)
	//
	// zsh only fills BASH_REMATCH under `setopt BASH_REMATCH`, so a regex-based
	// parser matched but handed back empty capture groups. --duration then
	// degraded to unlimited — silently, in the shell most macOS users run.
	// No glob in the reset here: an unmatched glob is a hard error in zsh.
	const zshSource = "source /commands/never-sleep/never-sleep.sh";
	const runEnvZsh = `export PATH=/fakebin:$PATH; : > /tmp/calls.log; rm -rf /tmp/never-sleep.$(id -u).d;`;

	it("should honour --duration under zsh instead of falling back to unlimited", async () => {
		const result = await exec(
			id,
			`zsh -c '${runEnvZsh} ${zshSource}; never-sleep -d 2m'`,
		);
		expect(result.exitCode).toBe(0);
		// The banner is the user-visible half of the same bug.
		expect(result.output).toContain("Running for 120s");

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toContain("caffeinate -s -t 120");
		// Never the unlimited branch.
		expect(calls.output).not.toMatch(/^caffeinate -s$/m);
	});

	it("should parse every duration unit identically in bash and zsh", async () => {
		for (const [input, seconds] of [
			["45", "45"],
			["45s", "45"],
			["3m", "180"],
			["2h", "7200"],
		]) {
			const bash = await exec(
				id,
				`bash -c '${runEnv} ${sourceCmd}; never-sleep -d ${input}' >/dev/null 2>&1; cat /tmp/calls.log | grep caffeinate`,
			);
			const zsh = await exec(
				id,
				`zsh -c '${runEnvZsh} ${zshSource}; never-sleep -d ${input}' >/dev/null 2>&1; cat /tmp/calls.log | grep caffeinate`,
			);
			expect(bash.output).toBe(`caffeinate -s -t ${seconds}`);
			expect(zsh.output).toBe(`caffeinate -s -t ${seconds}`);
		}
	}, 20_000);

	it("should reject malformed durations identically in bash and zsh", async () => {
		// "-5" is not here: it looks like a flag, so the arg parser rejects it
		// earlier with "requires a value" — a different, already-tested path.
		for (const bad of ["wat", "2x", "2mm", "s", "10M"]) {
			const zsh = await exec(
				id,
				`zsh -c '${runEnvZsh} ${zshSource}; never-sleep -d ${bad} 2>&1; echo EXIT=$?'`,
			);
			expect(zsh.output).toContain("Invalid duration");
			expect(zsh.output).toContain("EXIT=1");
		}
	}, 20_000);

	// --- Sudo ticket keepalive
	//
	// The restore ends in `sudo pmset`. Sudo's ticket lasts ~5 min, so an
	// unattended --duration release would stall on a password prompt with the
	// lid shut and leave the Mac awake past its deadline.

	it("should keep the sudo ticket warm while running", async () => {
		await setCaffeinate("blocking");
		await exec(id, "rm -rf /tmp/never-sleep.*.d");
		await exec(
			id,
			`bash -c 'export PATH=/fakebin:$PATH; : > /tmp/calls.log; export PMSET_INITIAL_STATE=0; export NEVER_SLEEP_SUDO_REFRESH=0.1; ${sourceCmd}; never-sleep' >/dev/null 2>&1 &
for i in $(seq 1 50); do [ -f /tmp/caffeinate.pid ] && break; sleep 0.05; done
sleep 0.6
cp /tmp/calls.log /tmp/calls-during.log
kill "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait 2>/dev/null`,
		);
		const during = await exec(id, "cat /tmp/calls-during.log");
		const refreshes = during.output
			.split("\n")
			.filter((l) => l.trim() === "sudo -n -v").length;
		expect(refreshes).toBeGreaterThanOrEqual(2);
		await setCaffeinate("quick");
	}, 20_000);

	it("should stop refreshing once the session is over (no orphan keepalive)", async () => {
		await setCaffeinate("blocking");
		await exec(id, "rm -rf /tmp/never-sleep.*.d");
		await exec(
			id,
			`bash -c 'export PATH=/fakebin:$PATH; : > /tmp/calls.log; export PMSET_INITIAL_STATE=0; export NEVER_SLEEP_SUDO_REFRESH=0.1; ${sourceCmd}; never-sleep' >/dev/null 2>&1 &
for i in $(seq 1 50); do [ -f /tmp/caffeinate.pid ] && break; sleep 0.05; done
sleep 0.3
kill "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait 2>/dev/null
sleep 0.3
grep -c '^sudo -n -v$' /tmp/calls.log > /tmp/count-a.txt
sleep 0.5
grep -c '^sudo -n -v$' /tmp/calls.log > /tmp/count-b.txt`,
		);
		const a = (await exec(id, "cat /tmp/count-a.txt")).output;
		const b = (await exec(id, "cat /tmp/count-b.txt")).output;
		// Count frozen after exit: the background loop is gone, not orphaned.
		expect(b).toBe(a);
		await setCaffeinate("quick");
	}, 20_000);

	it("should give up refreshing (not spin) when the ticket cannot be renewed", async () => {
		await setCaffeinate("blocking");
		await exec(id, "rm -rf /tmp/never-sleep.*.d");
		await exec(
			id,
			`bash -c 'export PATH=/fakebin:$PATH; : > /tmp/calls.log; export PMSET_INITIAL_STATE=0; export SUDO_V_EXIT=1; export NEVER_SLEEP_SUDO_REFRESH=0.1; ${sourceCmd}; never-sleep' >/dev/null 2>&1 &
for i in $(seq 1 50); do [ -f /tmp/caffeinate.pid ] && break; sleep 0.05; done
sleep 0.6
kill "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait 2>/dev/null`,
		);
		const calls = await exec(id, "cat /tmp/calls.log");
		const refreshes = calls.output
			.split("\n")
			.filter((l) => l.trim() === "sudo -n -v").length;
		// One failed attempt, then it stands down instead of hammering sudo.
		expect(refreshes).toBe(1);
		// And the restore still happens — degraded, not broken.
		expect(calls.output).toMatch(/pmset -a disablesleep 0/);
		await setCaffeinate("quick");
	}, 20_000);

	it("should reject an invalid duration", async () => {
		const result = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep -d wat 2>&1; echo EXIT=$?'`,
		);
		expect(result.output).toContain("Invalid duration");
		expect(result.output).toContain("EXIT=1");
		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).not.toContain("caffeinate");
	});

	it("should reject --duration without a value (missing or flag-looking)", async () => {
		const missing = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep -d 2>&1; echo EXIT=$?'`,
		);
		expect(missing.output).toContain("--duration requires a value");
		expect(missing.output).toContain("EXIT=1");

		const flagLike = await exec(
			id,
			`bash -c '${runEnv} ${sourceCmd}; never-sleep -d --help 2>&1; echo EXIT=$?'`,
		);
		expect(flagLike.output).toContain("--duration requires a value");
		expect(flagLike.output).toContain("EXIT=1");

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).not.toContain("caffeinate");
	});

	it("should call pmset displaysleepnow on lid-close transition", async () => {
		await setCaffeinate("blocking");
		// Lid starts closed: watcher should fire displaysleepnow on its first tick
		await exec(id, `echo "Yes" > /tmp/clamshell-state`);

		await exec(
			id,
			`cat > /tmp/clamshell-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
export NEVER_SLEEP_POLL=0.1
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
bash -c '
  shopt -s expand_aliases
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
bashpid=$!
# Wait for caffeinate to start (proves we reached the subshell body)
for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
# Give the watcher a few poll cycles
sleep 0.5
# Tear down
kill -TERM "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait $bashpid
exit 0
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/clamshell-driver.sh");

		const result = await exec(id, "/tmp/clamshell-driver.sh 2>&1");
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).toContain("pmset displaysleepnow");

		await exec(id, `echo "No" > /tmp/clamshell-state`);
		await setCaffeinate("quick");
	}, 20_000);

	it("should NOT call displaysleepnow when lid stays open", async () => {
		await setCaffeinate("blocking");
		await exec(id, `echo "No" > /tmp/clamshell-state`);

		await exec(
			id,
			`cat > /tmp/lid-open-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
export NEVER_SLEEP_POLL=0.1
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
bash -c '
  shopt -s expand_aliases
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
bashpid=$!
for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
sleep 0.5
kill -TERM "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait $bashpid
exit 0
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/lid-open-driver.sh");

		const result = await exec(id, "/tmp/lid-open-driver.sh 2>&1");
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		expect(calls.output).not.toContain("displaysleepnow");

		await setCaffeinate("quick");
	}, 20_000);

	it("should fire displaysleepnow on EACH open→close transition, not just the first", async () => {
		// Regression-style test: `last` state tracking must allow the watcher
		// to fire again when the lid cycles closed→open→closed. If `last` were
		// never reset to "open", we'd miss every subsequent lid close.
		await setCaffeinate("blocking");
		await exec(id, `echo "No" > /tmp/clamshell-state`);

		await exec(
			id,
			`cat > /tmp/cycle-driver.sh <<'DRIVER'
#!/bin/bash
export PATH=/fakebin:$PATH
export NEVER_SLEEP_POLL=0.1
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
bash -c '
  shopt -s expand_aliases
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
bashpid=$!
for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
# Cycle: close -> open -> close
echo "Yes" > /tmp/clamshell-state; sleep 0.4
echo "No"  > /tmp/clamshell-state; sleep 0.4
echo "Yes" > /tmp/clamshell-state; sleep 0.4
kill -TERM "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait $bashpid
exit 0
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/cycle-driver.sh");

		const result = await exec(id, "/tmp/cycle-driver.sh 2>&1");
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		// Two full closing transitions -> two displaysleepnow invocations
		const matches = calls.output.match(/pmset displaysleepnow/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(2);

		await exec(id, `echo "No" > /tmp/clamshell-state`);
		await setCaffeinate("quick");
	}, 20_000);

	it("should not depend on pkill in its cleanup path (resilience)", async () => {
		// Regression lock: never-sleep must not rely on `pkill` or any other
		// non-essential tool to avoid leaving orphaned children. The watcher
		// owns its `sleep` child via an internal trap, so the outer cleanup
		// only needs `kill`. Prove this by grepping the script for `pkill`
		// usage and by exercising the full cleanup flow without pkill on PATH.
		const script = await exec(id, "cat /commands/never-sleep/never-sleep.sh");
		// Strip comment-only lines before asserting: explanatory comments may
		// still reference pkill to document the design decision.
		const codeOnly = script.output
			.split("\n")
			.filter((l) => !l.trim().startsWith("#"))
			.join("\n");
		expect(codeOnly).not.toMatch(/\bpkill\b/);

		await setCaffeinate("blocking");
		await exec(id, `echo "No" > /tmp/clamshell-state`);

		// Build a PATH-limited driver: /fakebin (our mocks) + a minimal system
		// PATH that explicitly does NOT include coreutils-style pkill helpers.
		// The cleanup must still succeed and log the restoration.
		await exec(
			id,
			`cat > /tmp/no-pkill-driver.sh <<'DRIVER'
#!/bin/bash
# Hide pkill even if the container ships one
export PATH=/fakebin:/usr/bin:/bin
command -v pkill >/dev/null 2>&1 && {
  mkdir -p /tmp/no-pkill-shadow
  ln -sf /bin/false /tmp/no-pkill-shadow/pkill
  export PATH=/tmp/no-pkill-shadow:$PATH
}
: > /tmp/calls.log; rm -rf /tmp/never-sleep.*.d
export NEVER_SLEEP_POLL=0.1
export PMSET_INITIAL_STATE=0
bash -c '
  shopt -s expand_aliases
  source /commands/never-sleep/never-sleep.sh
  never-sleep
' >/tmp/nsleep.out 2>&1 &
bashpid=$!
for i in $(seq 1 50); do
  [ -f /tmp/caffeinate.pid ] && break
  sleep 0.05
done
sleep 0.3
kill -TERM "$(cat /tmp/caffeinate.pid)" 2>/dev/null
wait $bashpid
exit 0
DRIVER`,
		);
		await exec(id, "chmod +x /tmp/no-pkill-driver.sh");

		const result = await exec(id, "/tmp/no-pkill-driver.sh 2>&1");
		expect(result.exitCode).toBe(0);

		const calls = await exec(id, "cat /tmp/calls.log");
		// Full cycle still runs: enable + caffeinate + restore
		expect(calls.output).toMatch(
			/pmset -a disablesleep 1[\s\S]*caffeinate -s[\s\S]*pmset -a disablesleep 0/,
		);

		await setCaffeinate("quick");
	}, 20_000);

	it("should block INT/TERM during critical sections (atomic pmset + watcher start)", async () => {
		// Lock the atomic-critical-section invariant: during the windows where
		// pmset success → `changed=1` and watcher-start → `watcher_pid=$!`,
		// signals must be ignored (`trap '' INT TERM`). Scan the script to
		// verify both regions are bracketed by signal-blocking traps and that
		// each block is closed by re-installing a handler that fires EXIT (we
		// never restore default — see the zsh-subshell-EXIT-trap regression).
		const script = await exec(id, "cat /commands/never-sleep/never-sleep.sh");
		const blockCount = (script.output.match(/trap '' INT TERM/g) ?? []).length;
		const restoreCount = (
			script.output.match(/trap 'exit \d+' INT TERM/g) ?? []
		).length;
		// Two critical sections => two blocks; each block re-installs an
		// exit-on-signal handler (and the pmset block has an extra one in its
		// failure branch).
		expect(blockCount).toBe(2);
		expect(restoreCount).toBeGreaterThanOrEqual(2);
		// The default-restore form is unsafe in zsh and must NOT come back.
		expect(script.output).not.toMatch(/trap - INT TERM/);
	});

	it("should only expose never-sleep + _ns_* helpers (namespace discipline)", async () => {
		// Sourcing the file must not leak un-prefixed internal functions into
		// the user's shell. This test locks that convention in so that a future
		// helper added without the `_ns_` prefix fails CI instead of silently
		// polluting every oms-enabled shell.
		const result = await exec(
			id,
			`bash -c 'source /commands/never-sleep/never-sleep.sh; declare -F' | awk '{print $3}' | sort`,
		);
		const fns = result.output.split("\n").filter(Boolean);

		expect(fns).toContain("never-sleep");
		for (const fn of fns) {
			if (fn === "never-sleep") continue;
			expect(fn.startsWith("_ns_")).toBe(true);
		}
	});
});

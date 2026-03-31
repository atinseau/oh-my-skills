# oms-run-all — Design Spec

## Summary

Port an existing battle-tested `run-all.sh` script as a new `oms-run-all` shell command. The command runs shell commands across multiple directories in parallel, with live output streaming and sequential chaining support.

## Files

```
src/commands/oms-run-all/
├── oms-run-all.sh        # Shell command (sourced at shell startup)
└── oms-run-all.test.ts   # Docker-based tests
```

## Public API

```bash
# Uniform mode — same command across multiple dirs
oms-run-all "git pull" repo1 repo2

# Mapping mode — different command per dir
oms-run-all repo1="cmd1" repo2="cmd2"

# Sequential — steps separated by --then
oms-run-all repo1="cmd1" --then repo2="cmd2"

# Stream mode — live prefixed output (long-running processes)
oms-run-all --stream repo1="cmd1" repo2="cmd2"

# Help
oms-run-all --help
```

Alias: `oms-ra` -> `oms-run-all`

Paths can be relative (resolved from cwd) or absolute.

## Internal Design

### Namespace isolation

Since the file is `source`d into the user's shell (not executed as a subprocess), all internal helpers are prefixed `__oms_ra_` to avoid polluting the global namespace:

- `__oms_ra_print_status`, `__oms_ra_print_error_block`, `__oms_ra_print_spinner`, `__oms_ra_clear_line`
- `__oms_ra_sanitize`, `__oms_ra_launch_one`, `__oms_ra_wait_with_spinner`
- `__oms_ra_max_name_len`, `__oms_ra_stream_one`, `__oms_ra_run_stream`
- `__oms_ra_print_header`, `__oms_ra_run_step`

Only `oms-run-all` (the entry point) and the alias `oms-ra` are user-facing.

### Temp file management

- `mktemp -d` creates a unique temporary directory per invocation
- `trap` ensures cleanup on EXIT, INT, TERM
- Each job writes `$tmpdir/<sanitized_name>.out` and `$tmpdir/<sanitized_name>.rc`

### Differences from the original script

| Original | oms-run-all |
|----------|-------------|
| `set -euo pipefail` | Removed (incompatible with sourced functions) |
| `#!/usr/bin/env bash` shebang | Removed (sourced, not executed) |
| `/tmp/cl_*.rc`, `/tmp/cl_*.out` | `mktemp -d` + trap cleanup |
| Top-level `main "$@"` | `oms-run-all()` function |
| `$0` in usage | Hardcoded `oms-run-all` |
| No `--help` | `--help` flag added |

### Modes preserved (identical behavior)

1. **Batch uniform** — `oms-run-all "cmd" dir1 dir2` — runs `cmd` in all dirs in parallel, spinner + status
2. **Batch mapping** — `oms-run-all dir1="cmd1" dir2="cmd2"` — per-dir commands, parallel
3. **Sequential** — `--then` separator chains steps; each step runs in parallel internally
4. **Stream** — `--stream` prefix enables live output with colored repo prefixes, waits for Ctrl+C

## Tests

Run inside Alpine Docker containers via testcontainers (same pattern as `oms-git-diff`).

### Setup

- Create 2-3 temp directories as fake "repos" inside the container
- Place simple scripts in them (e.g., `echo "hello from repo1"`)

### Test cases

1. **`--help`** — exits 0, output contains "Usage"
2. **Uniform mode** — `oms-run-all "echo ok" repo1 repo2` — exits 0, output contains checkmarks for both repos
3. **Mapping mode** — `oms-run-all repo1="echo a" repo2="echo b"` — exits 0, both succeed
4. **Sequential (`--then`)** — `oms-run-all repo1="echo step1" --then repo2="echo step2"` — both steps run, output ordered
5. **Failure propagation** — one repo runs `exit 1` — overall exit code is non-zero, error block is shown
6. **Non-existent directory** — error reported
7. **Temp cleanup** — no leftover temp dirs after execution
8. **Stream mode** — `oms-run-all --stream repo1="echo hello"` — output contains repo prefix and "hello" (stream process terminates naturally)

#!/bin/bash

# ---------------------------------------------------------------------------
# oms-run-all — run commands across multiple directories (parallel + pipeline)
#
# This file serves two roles:
#   1. Sourced at shell startup → defines the `oms-run-all` wrapper + alias
#   2. Executed with --exec     → runs the actual parallel command logic
# ---------------------------------------------------------------------------

# ── Sourced mode: define wrapper and exit ──────────────────────────────────

if [[ "${1:-}" != "--exec" ]]; then
    __OMS_RUN_ALL_SCRIPT="${BASH_SOURCE[0]:-${(%):-%x}}"
    alias oms-ra='oms-run-all'

    oms-run-all() {
        if [[ $# -eq 0 || "$1" == "--help" || "$1" == "-h" ]]; then
            cat <<'EOF'
Usage: oms-run-all [dir=command ...] [command dir ...] [--then ...] [--stream ...]

Run commands across multiple directories in parallel.

Syntax:
  dir=command         Run command in dir (explicit mapping)
  command dir1 dir2   Run command in dir1 and dir2 (bare args)
  --then              Start a new batch step (runs after previous step)
  --stream            Start a new stream step (live prefixed output)

Modes:
  batch (default)     Parallel execution, results shown when all complete
  stream              Parallel execution with live interleaved output

Examples:
  oms-run-all "pnpm build" frontend backend
  oms-run-all frontend="pnpm build" backend="cargo build"
  oms-run-all "pnpm test" frontend backend --then "pnpm build" frontend backend
  oms-run-all --stream "pnpm dev" frontend backend

Alias: oms-ra
EOF
            return 0
        fi
        bash "$__OMS_RUN_ALL_SCRIPT" --exec "$@"
    }

    return 0 2>/dev/null || exit 0
fi

# ── Executed mode: parallel command runner ─────────────────────────────────

shift # remove --exec
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────

RED=$'\033[31m'
GREEN=$'\033[32m'
BLUE=$'\033[34m'
DIM=$'\033[2m'
RESET=$'\033[0m'
STREAM_COLORS=(
    $'\033[36m'   # cyan
    $'\033[33m'   # yellow
    $'\033[35m'   # magenta
    $'\033[34m'   # blue
    $'\033[32m'   # green
    $'\033[91m'   # bright red
)

IS_TTY=0
[[ -t 1 ]] && IS_TTY=1

# ── Utilities ─────────────────────────────────────────────────────────────

# Replace / with _ in a path for use as a temp file key.
# Uses realpath when available to normalize ./dir and dir.
sanitize() {
    local p="$1"
    if command -v realpath &>/dev/null && [[ -e "$p" ]]; then
        p=$(realpath "$p")
    fi
    printf '%s' "${p//\//_}"
}

# Print ✓ or ✗ for a completed job.
print_status() {
    local rc="$1" name="$2"
    if [[ "$rc" -eq 0 ]]; then
        printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$name"
    else
        printf '  %s✗%s %s %s(exit %d)%s\n' "$RED" "$RESET" "$name" "$DIM" "$rc" "$RESET"
    fi
}

# Print a framed error block from a log file.
print_error_block() {
    local name="$1" file="$2"
    printf '\n  %s┌─ %s ─────────────────────────────%s\n' "$RED" "$name" "$RESET"
    while IFS= read -r line; do
        printf '  %s│%s %s\n' "$RED" "$RESET" "$line"
    done < "$file"
    printf '  %s└──────────────────────────────────────%s\n' "$RED" "$RESET"
}

# Clear the current line (TTY only).
clear_line() {
    [[ "$IS_TTY" -eq 0 ]] && return
    printf '\r\033[K'
}

# Show a braille spinner with the names of remaining jobs.
print_spinner() {
    [[ "$IS_TTY" -eq 0 ]] && return
    local frame="$1"; shift
    local braille=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local char="${braille[$((frame % ${#braille[@]}))]}"
    clear_line
    printf '  %s%s%s %s' "$BLUE" "$char" "$RESET" "$*"
}

# Return the length of the longest string in the arguments.
max_name_len() {
    local max=0
    for name in "$@"; do
        [[ ${#name} -gt $max ]] && max=${#name}
    done
    printf '%d' "$max"
}

# ── Argument parsing ──────────────────────────────────────────────────────

# Parse step arguments into two parallel arrays: _dirs and _cmds.
# Supports both mapping (dir=cmd) and uniform (cmd dir1 dir2) syntax.
# Results are written to the caller's arrays via nameref.
parse_step_args() {
    local -n _dirs=$1 _cmds=$2
    shift 2
    local bare_cmd="" arg

    for arg in "$@"; do
        if [[ "$arg" == *=* ]]; then
            _dirs+=("${arg%%=*}")
            _cmds+=("${arg#*=}")
        elif [[ -z "$bare_cmd" ]]; then
            bare_cmd="$arg"
        else
            _dirs+=("$arg")
            _cmds+=("$bare_cmd")
        fi
    done
}

# ── Batch mode ────────────────────────────────────────────────────────────

# Launch a single job in the background.
# Writes stdout/stderr to $tmpdir/<key>.out and exit code to $tmpdir/<key>.rc.
launch_one() {
    local dir="$1" cmd="$2" tmpdir="$3"
    local key
    key=$(sanitize "$dir")
    (
        trap 'printf "%d" "$?" > "${tmpdir}/${key}.rc"' EXIT
        if [[ ! -d "$dir" ]]; then
            printf 'directory not found: %s\n' "$dir" > "${tmpdir}/${key}.out"
            exit 1
        fi
        cd "$dir" || exit 1
        FORCE_COLOR=1 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0=color.ui \
        GIT_CONFIG_VALUE_0=always \
        eval "$cmd" > "${tmpdir}/${key}.out" 2>&1
    ) &
}

# Poll for completed jobs, showing a spinner until all are done.
wait_with_spinner() {
    local tmpdir="$1"; shift
    local total=$#
    local frame=0

    while true; do
        local done_count=0
        local remaining=""
        for name in "$@"; do
            if [[ -f "${tmpdir}/$(sanitize "$name").rc" ]]; then
                done_count=$((done_count + 1))
            else
                [[ -n "$remaining" ]] && remaining="$remaining "
                remaining="${remaining}${name}"
            fi
        done
        if [[ $done_count -ge $total ]]; then
            clear_line
            break
        fi
        print_spinner "$frame" "$remaining"
        frame=$((frame + 1))
        sleep 0.1
    done
}

# Run a batch step: launch all jobs in parallel, wait, print results.
run_step() {
    local dirs=() cmds=()
    parse_step_args dirs cmds "$@"

    [[ ${#dirs[@]} -eq 0 ]] && return 0

    local tmpdir
    tmpdir=$(mktemp -d)
    trap 'rm -rf "$tmpdir" 2>/dev/null; trap - INT TERM' INT TERM

    # Print headers and launch jobs
    for ((i=0; i<${#dirs[@]}; i++)); do
        printf '\n  %s▸%s %s %s→ %s%s\n' \
            "$BLUE" "$RESET" "${cmds[$i]}" "$DIM" "${dirs[$i]}" "$RESET"
        launch_one "${dirs[$i]}" "${cmds[$i]}" "$tmpdir"
    done

    wait_with_spinner "$tmpdir" "${dirs[@]}"

    # Collect results
    local step_failed=0
    local failed=()
    for name in "${dirs[@]}"; do
        local rc
        rc=$(cat "${tmpdir}/$(sanitize "$name").rc" 2>/dev/null || echo 1)
        print_status "$rc" "$name"
        if [[ "$rc" -ne 0 ]]; then
            step_failed=1
            failed+=("$name")
        fi
    done

    # Show error output for failed jobs
    for name in "${failed[@]}"; do
        local outfile="${tmpdir}/$(sanitize "$name").out"
        [[ -s "$outfile" ]] && print_error_block "$name" "$outfile"
    done

    rm -rf "$tmpdir"
    trap - INT TERM
    return "$step_failed"
}

# ── Stream mode ───────────────────────────────────────────────────────────

# Launch a single streaming process with color-prefixed live output.
stream_one() {
    local dir="$1" cmd="$2" color="$3" pad="$4"
    local label
    label=$(printf "%-${pad}s" "$dir")

    if [[ ! -d "$dir" ]]; then
        printf '%s%s%s │ %sdirectory not found: %s%s\n' \
            "$color" "$label" "$RESET" "$RED" "$dir" "$RESET"
        return 1
    fi

    (
        cd "$dir" || return 1
        FORCE_COLOR=1 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0=color.ui \
        GIT_CONFIG_VALUE_0=always \
        eval "$cmd" 2>&1 | while IFS= read -r line; do
            printf '%s%s%s │ %s\n' "$color" "$label" "$RESET" "$line"
        done
    ) &
}

# Run a stream step: launch all jobs with live prefixed output, wait for completion.
run_stream() {
    local dirs=() cmds=()
    parse_step_args dirs cmds "$@"

    [[ ${#dirs[@]} -eq 0 ]] && return 0

    local pad
    pad=$(max_name_len "${dirs[@]}")

    # Header
    printf '\n  %s▸ stream mode%s\n' "$BLUE" "$RESET"
    for ((i=0; i<${#dirs[@]}; i++)); do
        local ci=$((i % ${#STREAM_COLORS[@]}))
        printf '    %s%s%s → %s\n' \
            "${STREAM_COLORS[$ci]}" "${dirs[$i]}" "$RESET" "${cmds[$i]}"
    done
    printf '\n'

    # Launch
    local pids=()
    for ((i=0; i<${#dirs[@]}; i++)); do
        local ci=$((i % ${#STREAM_COLORS[@]}))
        stream_one "${dirs[$i]}" "${cmds[$i]}" "${STREAM_COLORS[$ci]}" "$pad"
        pids+=($!)
    done

    # Ctrl+C: kill children and exit
    trap 'for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; exit 130' INT

    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    trap - INT
}

# ── Pipeline orchestrator ─────────────────────────────────────────────────

# Dispatch a step to the right runner and track exit code.
dispatch_step() {
    local mode="$1"; shift
    if [[ "$mode" == "stream" ]]; then
        run_stream "$@"
    else
        run_step "$@" || EXIT_CODE=$?
    fi
}

# Main: split arguments into steps at --then/--stream boundaries,
# then execute each step sequentially.
main() {
    EXIT_CODE=0
    local mode="batch"
    local args=()

    for arg in "$@"; do
        case "$arg" in
            --then|--stream)
                [[ ${#args[@]} -gt 0 ]] && dispatch_step "$mode" "${args[@]}"
                args=()
                [[ "$arg" == "--stream" ]] && mode="stream" || mode="batch"
                ;;
            *)
                args+=("$arg")
                ;;
        esac
    done

    # Flush last step
    [[ ${#args[@]} -gt 0 ]] && dispatch_step "$mode" "${args[@]}"

    exit "$EXIT_CODE"
}

main "$@"

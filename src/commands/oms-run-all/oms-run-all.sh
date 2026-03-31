#!/bin/bash

# ---------------------------------------------------------------------------
# oms-run-all — run commands across multiple directories (parallel + pipeline)
# ---------------------------------------------------------------------------

# Colors
__oms_ra_RED=$'\033[31m'
__oms_ra_GREEN=$'\033[32m'
__oms_ra_BLUE=$'\033[34m'
__oms_ra_DIM=$'\033[2m'
__oms_ra_RESET=$'\033[0m'
__oms_ra_COLORS=(
    $'\033[36m'   # cyan
    $'\033[33m'   # yellow
    $'\033[35m'   # magenta
    $'\033[34m'   # blue
    $'\033[32m'   # green
    $'\033[91m'   # bright red
)

alias oms-ra='oms-run-all'

# --- Internal helpers -------------------------------------------------------

__oms_ra_clear_line() {
    printf '\r\033[K'
}

__oms_ra_sanitize() {
    printf '%s' "$1" | tr '/' '_'
}

__oms_ra_print_status() {
    local rc="$1" repo="$2"
    if [[ "$rc" -eq 0 ]]; then
        printf '  %s✓%s %s\n' "$__oms_ra_GREEN" "$__oms_ra_RESET" "$repo"
    else
        printf '  %s✗%s %s %s(exit %d)%s\n' "$__oms_ra_RED" "$__oms_ra_RESET" "$repo" "$__oms_ra_DIM" "$rc" "$__oms_ra_RESET"
    fi
}

__oms_ra_print_error_block() {
    local name="$1" file="$2"
    printf '\n  %s┌─ %s ─────────────────────────────%s\n' "$__oms_ra_RED" "$name" "$__oms_ra_RESET"
    while IFS= read -r line; do
        printf '  %s│%s %s\n' "$__oms_ra_RED" "$__oms_ra_RESET" "$line"
    done < "$file"
    printf '  %s└──────────────────────────────────────%s\n' "$__oms_ra_RED" "$__oms_ra_RESET"
}

__oms_ra_print_spinner() {
    local frame="$1"; shift
    local braille=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local char="${braille[$((frame % ${#braille[@]}))]}"
    local remaining="$*"
    __oms_ra_clear_line
    printf '  %s%s%s %s' "$__oms_ra_BLUE" "$char" "$__oms_ra_RESET" "$remaining"
}

__oms_ra_launch_one() {
    local dir="$1" cmd="$2" tmpdir="$3"
    local safe
    safe=$(__oms_ra_sanitize "$dir")
    (
        if [[ ! -d "$dir" ]]; then
            printf 'directory not found: %s\n' "$dir" > "${tmpdir}/${safe}.out" 2>&1
            printf '1' > "${tmpdir}/${safe}.rc"
            return
        fi
        cd "$dir" || {
            printf 'cannot cd into: %s\n' "$dir" > "${tmpdir}/${safe}.out" 2>&1
            printf '1' > "${tmpdir}/${safe}.rc"
            return
        }
        FORCE_COLOR=1 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0=color.ui \
        GIT_CONFIG_VALUE_0=always \
        eval "$cmd" > "${tmpdir}/${safe}.out" 2>&1
        printf '%d' "$?" > "${tmpdir}/${safe}.rc"
    ) &
}

__oms_ra_wait_with_spinner() {
    local tmpdir="$1"; shift
    local names=("$@")
    local total=${#names[@]}
    local frame=0

    while true; do
        local done_count=0
        local remaining=()
        for name in "${names[@]}"; do
            local safe
            safe=$(__oms_ra_sanitize "$name")
            if [[ -f "${tmpdir}/${safe}.rc" ]]; then
                done_count=$((done_count + 1))
            else
                remaining+=("$name")
            fi
        done
        if [[ $done_count -ge $total ]]; then
            __oms_ra_clear_line
            break
        fi
        __oms_ra_print_spinner "$frame" "${remaining[*]}"
        frame=$((frame + 1))
        sleep 0.1
    done
}

__oms_ra_print_header() {
    local dirs=() cmd="$1"; shift
    dirs=("$@")
    printf '\n  %s▸%s %s %s→ [%s]%s\n' \
        "$__oms_ra_BLUE" "$__oms_ra_RESET" \
        "$cmd" \
        "$__oms_ra_DIM" \
        "$(IFS=', '; printf '%s' "${dirs[*]}")" \
        "$__oms_ra_RESET"
}

__oms_ra_max_name_len() {
    local max=0
    for name in "$@"; do
        local len=${#name}
        [[ $len -gt $max ]] && max=$len
    done
    printf '%d' "$max"
}

__oms_ra_run_step() {
    # Parse step args: dir=command pairs and bare args
    local mappings=()  # "dir|cmd" pairs
    local bare_cmd=""
    local bare_dirs=()

    for arg in "$@"; do
        if [[ "$arg" == *=* ]]; then
            local dir="${arg%%=*}"
            local cmd="${arg#*=}"
            mappings+=("${dir}|${cmd}")
        else
            if [[ -z "$bare_cmd" ]]; then
                bare_cmd="$arg"
            else
                bare_dirs+=("$arg")
            fi
        fi
    done

    # Convert bare args to mappings
    for dir in "${bare_dirs[@]}"; do
        mappings+=("${dir}|${bare_cmd}")
    done

    [[ ${#mappings[@]} -eq 0 ]] && return 0

    local tmpdir
    tmpdir=$(mktemp -d)
    local names=()
    local cmds=()

    # Print header and launch jobs
    for mapping in "${mappings[@]}"; do
        local dir="${mapping%%|*}"
        local cmd="${mapping#*|}"
        names+=("$dir")
        cmds+=("$cmd")
    done

    # Show header per unique command
    declare -A header_groups
    for i in "${!names[@]}"; do
        local cmd="${cmds[$i]}"
        local dir="${names[$i]}"
        if [[ -z "${header_groups[$cmd]+_}" ]]; then
            header_groups[$cmd]="$dir"
        else
            header_groups[$cmd]="${header_groups[$cmd]}, $dir"
        fi
    done
    for cmd in "${!header_groups[@]}"; do
        local IFS=', '
        read -ra hdirs <<< "${header_groups[$cmd]}"
        __oms_ra_print_header "$cmd" "${hdirs[@]}"
    done
    unset header_groups

    # Launch all jobs
    for i in "${!names[@]}"; do
        __oms_ra_launch_one "${names[$i]}" "${cmds[$i]}" "$tmpdir"
    done

    # Wait with spinner
    __oms_ra_wait_with_spinner "$tmpdir" "${names[@]}"

    # Collect results
    local step_failed=0
    local failed_names=()
    for name in "${names[@]}"; do
        local safe
        safe=$(__oms_ra_sanitize "$name")
        local rc
        rc=$(cat "${tmpdir}/${safe}.rc" 2>/dev/null || echo 1)
        __oms_ra_print_status "$rc" "$name"
        if [[ "$rc" -ne 0 ]]; then
            step_failed=1
            failed_names+=("$name")
        fi
    done

    # Print error blocks for failures
    for name in "${failed_names[@]}"; do
        local safe
        safe=$(__oms_ra_sanitize "$name")
        if [[ -s "${tmpdir}/${safe}.out" ]]; then
            __oms_ra_print_error_block "$name" "${tmpdir}/${safe}.out"
        fi
    done

    rm -rf "$tmpdir"
    return $step_failed
}

__oms_ra_stream_one() {
    local dir="$1" cmd="$2" color="$3" pad="$4"
    local label
    label=$(printf "%-${pad}s" "$dir")

    if [[ ! -d "$dir" ]]; then
        printf '%s%s%s │ %sdirectory not found: %s%s\n' \
            "$color" "$label" "$__oms_ra_RESET" \
            "$__oms_ra_RED" "$dir" "$__oms_ra_RESET"
        return 1
    fi

    (
        cd "$dir" || {
            printf '%s%s%s │ %scannot cd into: %s%s\n' \
                "$color" "$label" "$__oms_ra_RESET" \
                "$__oms_ra_RED" "$dir" "$__oms_ra_RESET"
            return 1
        }
        FORCE_COLOR=1 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0=color.ui \
        GIT_CONFIG_VALUE_0=always \
        eval "$cmd" 2>&1 | while IFS= read -r line; do
            printf '%s%s%s │ %s\n' "$color" "$label" "$__oms_ra_RESET" "$line"
        done
    ) &
}

__oms_ra_run_stream() {
    # Parse step args (same as run_step)
    local mappings=()
    local bare_cmd=""
    local bare_dirs=()

    for arg in "$@"; do
        if [[ "$arg" == *=* ]]; then
            local dir="${arg%%=*}"
            local cmd="${arg#*=}"
            mappings+=("${dir}|${cmd}")
        else
            if [[ -z "$bare_cmd" ]]; then
                bare_cmd="$arg"
            else
                bare_dirs+=("$arg")
            fi
        fi
    done

    for dir in "${bare_dirs[@]}"; do
        mappings+=("${dir}|${bare_cmd}")
    done

    [[ ${#mappings[@]} -eq 0 ]] && return 0

    local names=() cmds=()
    for mapping in "${mappings[@]}"; do
        names+=("${mapping%%|*}")
        cmds+=("${mapping#*|}")
    done

    local pad
    pad=$(__oms_ra_max_name_len "${names[@]}")

    # Header
    printf '\n  %s▸ stream mode%s\n' "$__oms_ra_BLUE" "$__oms_ra_RESET"
    for i in "${!names[@]}"; do
        local ci=$((i % ${#__oms_ra_COLORS[@]}))
        printf '    %s%s%s → %s\n' \
            "${__oms_ra_COLORS[$ci]}" "${names[$i]}" "$__oms_ra_RESET" "${cmds[$i]}"
    done
    printf '\n'

    # Launch streams
    local pids=()
    for i in "${!names[@]}"; do
        local ci=$((i % ${#__oms_ra_COLORS[@]}))
        __oms_ra_stream_one "${names[$i]}" "${cmds[$i]}" "${__oms_ra_COLORS[$ci]}" "$pad"
        pids+=($!)
    done

    # Ctrl+C handler
    trap 'for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; return 130' INT

    # Wait for all children
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null
    done

    trap - INT
    return 0
}

# --- Main entry point -------------------------------------------------------

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

    # Temp cleanup via RETURN trap (safe for sourced functions, bash 4+)
    local __oms_ra_exit_code=0

    # Split args into steps at --then / --stream boundaries
    local steps=()       # serialized: "batch|arg1|arg2" or "stream|arg1|arg2"
    local current_mode="batch"
    local current_args=()

    for arg in "$@"; do
        case "$arg" in
            --then)
                if [[ ${#current_args[@]} -gt 0 ]]; then
                    steps+=("${current_mode}|$(IFS=$'\x1f'; printf '%s' "${current_args[*]}")")
                    current_args=()
                fi
                current_mode="batch"
                ;;
            --stream)
                if [[ ${#current_args[@]} -gt 0 ]]; then
                    steps+=("${current_mode}|$(IFS=$'\x1f'; printf '%s' "${current_args[*]}")")
                    current_args=()
                fi
                current_mode="stream"
                ;;
            *)
                current_args+=("$arg")
                ;;
        esac
    done
    # Flush last step
    if [[ ${#current_args[@]} -gt 0 ]]; then
        steps+=("${current_mode}|$(IFS=$'\x1f'; printf '%s' "${current_args[*]}")")
    fi

    # Execute steps sequentially
    for step in "${steps[@]}"; do
        local mode="${step%%|*}"
        local args_str="${step#*|}"
        local step_args=()
        IFS=$'\x1f' read -ra step_args <<< "$args_str"

        if [[ "$mode" == "stream" ]]; then
            __oms_ra_run_stream "${step_args[@]}"
        else
            __oms_ra_run_step "${step_args[@]}"
            local rc=$?
            if [[ $rc -ne 0 ]]; then
                __oms_ra_exit_code=$rc
            fi
        fi
    done

    return $__oms_ra_exit_code
}

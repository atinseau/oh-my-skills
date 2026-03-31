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
    [[ "${__oms_ra_is_tty:-0}" -eq 0 ]] && return
    printf '\r\033[K'
}

__oms_ra_sanitize() {
    local path="$1"
    if command -v realpath &>/dev/null && [[ -e "$path" ]]; then
        path=$(realpath "$path")
    fi
    printf '%s' "$path" | tr '/' '_'
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
    [[ "${__oms_ra_is_tty:-0}" -eq 0 ]] && return
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
        # Write exit code on any exit (including `exit N` inside eval'd commands)
        trap 'printf "%d" "$?" > "${tmpdir}/${safe}.rc"' EXIT
        if [[ ! -d "$dir" ]]; then
            printf 'directory not found: %s\n' "$dir" > "${tmpdir}/${safe}.out" 2>&1
            exit 1
        fi
        cd "$dir" || {
            printf 'cannot cd into: %s\n' "$dir" > "${tmpdir}/${safe}.out" 2>&1
            exit 1
        }
        FORCE_COLOR=1 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0=color.ui \
        GIT_CONFIG_VALUE_0=always \
        eval "$cmd" > "${tmpdir}/${safe}.out" 2>&1
    ) &
}

__oms_ra_wait_with_spinner() {
    local tmpdir="$1"; shift
    local total=$#
    local frame=0

    while true; do
        local done_count=0
        local remaining=""
        for name in "$@"; do
            local safe
            safe=$(__oms_ra_sanitize "$name")
            if [[ -f "${tmpdir}/${safe}.rc" ]]; then
                done_count=$((done_count + 1))
            else
                [[ -n "$remaining" ]] && remaining="$remaining "
                remaining="${remaining}${name}"
            fi
        done
        if [[ $done_count -ge $total ]]; then
            __oms_ra_clear_line
            break
        fi
        __oms_ra_print_spinner "$frame" "$remaining"
        frame=$((frame + 1))
        sleep 0.1
    done
}

__oms_ra_max_name_len() {
    local max=0
    for name in "$@"; do
        local len=${#name}
        [[ $len -gt "$max" ]] && max=$len
    done
    printf '%d' "$max"
}

# Parse step args into parallel positional params: n dir1 cmd1 dir2 cmd2 ...
# Usage: set -- $(__oms_ra_parse_args "$@") doesn't work for spaces,
# so we use a callback approach: parse into a temp file.
__oms_ra_parse_args() {
    local outfile="$1"; shift
    local bare_cmd="" bare_dirs=""
    local count=0

    : > "$outfile"
    for arg in "$@"; do
        if [[ "$arg" == *=* ]]; then
            printf '%s\n' "${arg%%=*}" >> "$outfile"
            printf '%s\n' "${arg#*=}" >> "$outfile"
            count=$((count + 1))
        else
            if [[ -z "$bare_cmd" ]]; then
                bare_cmd="$arg"
            else
                bare_dirs="${bare_dirs}${bare_dirs:+$'\x1f'}${arg}"
            fi
        fi
    done

    # Convert bare args to pairs
    if [[ -n "$bare_dirs" ]]; then
        local old_ifs="$IFS"
        IFS=$'\x1f'
        for dir in $bare_dirs; do
            printf '%s\n' "$dir" >> "$outfile"
            printf '%s\n' "$bare_cmd" >> "$outfile"
            count=$((count + 1))
        done
        IFS="$old_ifs"
    fi

    printf '%d' "$count"
}

__oms_ra_run_step() {
    local tmpdir
    tmpdir=$(mktemp -d)
    trap 'rm -rf "$tmpdir" 2>/dev/null; kill 0 2>/dev/null; trap - INT TERM; return 130' INT TERM

    local pairfile="$tmpdir/_pairs"
    local count
    count=$(__oms_ra_parse_args "$pairfile" "$@")

    [[ "$count" -eq 0 ]] && { rm -rf "$tmpdir"; trap - INT TERM; return 0; }

    # Read pairs from file into positional processing
    local names="" cmds="" header_shown=""
    local line_num=0
    local cur_dir="" cur_cmd=""
    while IFS= read -r line; do
        if [[ $((line_num % 2)) -eq 0 ]]; then
            cur_dir="$line"
        else
            cur_cmd="$line"
            # Accumulate for display
            names="${names}${names:+$'\x1f'}${cur_dir}"
            cmds="${cmds}${cmds:+$'\x1f'}${cur_cmd}"
            # Print header
            printf '\n  %s▸%s %s %s→ %s%s\n' \
                "$__oms_ra_BLUE" "$__oms_ra_RESET" \
                "$cur_cmd" "$__oms_ra_DIM" "$cur_dir" "$__oms_ra_RESET"
            # Launch job
            __oms_ra_launch_one "$cur_dir" "$cur_cmd" "$tmpdir"
        fi
        line_num=$((line_num + 1))
    done < "$pairfile"

    # Build name list for spinner
    local name_list=()
    local old_ifs="$IFS"
    IFS=$'\x1f'
    for n in $names; do
        name_list+=("$n")
    done
    IFS="$old_ifs"

    # Wait with spinner
    __oms_ra_wait_with_spinner "$tmpdir" "${name_list[@]}"

    # Collect results
    local step_failed=0
    local failed_names=()
    for name in "${name_list[@]}"; do
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
    trap - INT TERM
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
    local tmpdir
    tmpdir=$(mktemp -d)
    local pairfile="$tmpdir/_pairs"
    local count
    count=$(__oms_ra_parse_args "$pairfile" "$@")

    [[ "$count" -eq 0 ]] && { rm -rf "$tmpdir"; return 0; }

    # Read pairs and collect names/cmds
    local all_names=() all_cmds=()
    local line_num=0 cur_dir=""
    while IFS= read -r line; do
        if [[ $((line_num % 2)) -eq 0 ]]; then
            cur_dir="$line"
        else
            all_names+=("$cur_dir")
            all_cmds+=("$line")
        fi
        line_num=$((line_num + 1))
    done < "$pairfile"
    rm -rf "$tmpdir"

    local pad
    pad=$(__oms_ra_max_name_len "${all_names[@]}")

    # Header
    printf '\n  %s▸ stream mode%s\n' "$__oms_ra_BLUE" "$__oms_ra_RESET"
    local ci=0
    for ((ci=0; ci<${#all_names[@]}; ci++)); do
        local color_idx=$((ci % ${#__oms_ra_COLORS[@]}))
        printf '    %s%s%s → %s\n' \
            "${__oms_ra_COLORS[$color_idx]}" "${all_names[$ci]}" "$__oms_ra_RESET" "${all_cmds[$ci]}"
    done
    printf '\n'

    # Launch streams
    local pids=()
    for ((ci=0; ci<${#all_names[@]}; ci++)); do
        local color_idx=$((ci % ${#__oms_ra_COLORS[@]}))
        __oms_ra_stream_one "${all_names[$ci]}" "${all_cmds[$ci]}" "${__oms_ra_COLORS[$color_idx]}" "$pad"
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

    # zsh compat: 0-based array indexing
    [[ -n "$ZSH_VERSION" ]] && setopt local_options KSH_ARRAYS

    local __oms_ra_is_tty=0
    [[ -t 1 ]] && __oms_ra_is_tty=1

    local __oms_ra_exit_code=0
    local current_mode="batch"
    local current_args=()

    for arg in "$@"; do
        case "$arg" in
            --then|--stream)
                if [[ ${#current_args[@]} -gt 0 ]]; then
                    if [[ "$current_mode" == "stream" ]]; then
                        __oms_ra_run_stream "${current_args[@]}"
                        local rc=$?
                        [[ $rc -ne 0 ]] && __oms_ra_exit_code=$rc
                    else
                        __oms_ra_run_step "${current_args[@]}"
                        local rc=$?
                        [[ $rc -ne 0 ]] && __oms_ra_exit_code=$rc
                    fi
                    current_args=()
                fi
                [[ "$arg" == "--stream" ]] && current_mode="stream" || current_mode="batch"
                ;;
            *)
                current_args+=("$arg")
                ;;
        esac
    done

    # Flush last step
    if [[ ${#current_args[@]} -gt 0 ]]; then
        if [[ "$current_mode" == "stream" ]]; then
            __oms_ra_run_stream "${current_args[@]}"
            local rc=$?
            [[ $rc -ne 0 ]] && __oms_ra_exit_code=$rc
        else
            __oms_ra_run_step "${current_args[@]}"
            local rc=$?
            [[ $rc -ne 0 ]] && __oms_ra_exit_code=$rc
        fi
    fi

    return $__oms_ra_exit_code
}

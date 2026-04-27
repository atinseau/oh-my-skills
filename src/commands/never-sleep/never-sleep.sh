#!/bin/bash

alias ns='never-sleep'

# ---------------------------------------------------------------------------
# Private helpers (prefixed _ns_ to avoid polluting the user's shell).
# ---------------------------------------------------------------------------

_ns_show_help() {
    cat <<'EOF'
Usage: never-sleep [options]

Keep the Mac awake even with the lid closed, while letting the display turn
off normally. Requires sudo.

The system stays running; on lid-close a background watcher puts the display
to sleep (triggering the standard macOS lock screen). Re-opening the lid
wakes the display as usual.

Options:
  -d, --duration <TIME>   Max duration, e.g. 30s, 10m, 2h. Default: unlimited.
  -h, --help              Show this help.

Environment:
  NEVER_SLEEP_POLL        Clamshell poll interval in seconds (default: 2).

Alias: ns

Note: if the shell is killed with SIGKILL (kill -9, force-quit), the cleanup
trap cannot run. Restore manually with: sudo pmset -a disablesleep 0
EOF
}

_ns_check_platform() {
    if command -v pmset >/dev/null 2>&1 \
        && command -v caffeinate >/dev/null 2>&1 \
        && command -v ioreg >/dev/null 2>&1; then
        return 0
    fi
    echo "❌ never-sleep requires macOS (pmset, caffeinate, ioreg not found)" >&2
    return 1
}

# Echoes the raw duration (e.g. "30s", "10m") as a number of seconds.
# Returns 1 if the input is malformed.
_ns_parse_duration() {
    local input="$1"
    if [[ "$input" =~ ^([0-9]+)([smh]?)$ ]]; then
        local n="${BASH_REMATCH[1]}"
        local unit="${BASH_REMATCH[2]}"
        case "$unit" in
            ""|s) echo "$n" ;;
            m)    echo $((n * 60)) ;;
            h)    echo $((n * 3600)) ;;
        esac
        return 0
    fi
    return 1
}

# Echoes the current SleepDisabled value (0 or 1), defaulting to 0.
# Matches by key name so column shifts in pmset's output stay safe.
_ns_initial_sleep_state() {
    local s
    s=$(pmset -g 2>/dev/null | awk '$1=="SleepDisabled" {print $NF; exit}')
    echo "${s:-0}"
}

_ns_print_banner() {
    local seconds="$1"
    echo ""
    echo "✅ System sleep: DISABLED (lid-closed included)"
    echo "   Display goes to sleep on lid-close (macOS lock screen applies)"
    if [[ -n "$seconds" ]]; then
        echo "   Running for ${seconds}s (or press Ctrl+C to stop)"
    else
        echo "   Press Ctrl+C to return to normal mode"
    fi
    echo ""
}

# Background loop: poll the clamshell state and force display sleep on each
# open→closed transition. Silent on ioreg failure (empty state matches neither
# branch) — there's no safe recovery, and noise in the user's shell is worse.
# Owns its in-flight `sleep` child explicitly so the outer cleanup doesn't
# need `pkill -P` (or any other optional tool) to avoid orphans.
_ns_clamshell_watcher() {
    local poll="$1"
    local last=""
    local state
    local sleep_pid=""

    trap '[[ -n "$sleep_pid" ]] && kill "$sleep_pid" 2>/dev/null; exit 0' TERM INT

    while :; do
        state=$(ioreg -r -k AppleClamshellState 2>/dev/null \
            | awk '/AppleClamshellState/ {print $NF; exit}')
        if [[ "$state" == "Yes" && "$last" != "closed" ]]; then
            pmset displaysleepnow >/dev/null 2>&1
            last=closed
        elif [[ "$state" == "No" ]]; then
            last=open
        fi
        sleep "$poll" &
        sleep_pid=$!
        wait "$sleep_pid" 2>/dev/null
        sleep_pid=""
    done
}

# EXIT trap body. Sends SIGTERM to the watcher (which self-cleans its own
# in-flight `sleep` child via its own trap), then restores pmset only if we
# actually changed it — avoids a bogus second sudo prompt when the initial
# pmset call failed or was cancelled.
_ns_cleanup() {
    local watcher="$1"
    local initial="$2"
    local changed="$3"

    if [[ -n "$watcher" ]]; then
        kill -TERM "$watcher" 2>/dev/null
    fi

    if [[ "$changed" != "1" ]]; then
        return 0
    fi

    echo ""
    echo "🔓 Restoring previous sleep mode..."
    sudo pmset -a disablesleep "$initial"
    echo "✅ Sleep mode restored (SleepDisabled=$initial)."
}

# ---------------------------------------------------------------------------
# Public entry point.
# ---------------------------------------------------------------------------

never-sleep() {
    local duration=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                _ns_show_help
                return 0
                ;;
            -d|--duration)
                if [[ -z "$2" || "$2" == -* ]]; then
                    echo "never-sleep: --duration requires a value (e.g. 30s, 10m, 2h)" >&2
                    return 1
                fi
                duration="$2"
                shift 2
                ;;
            *)
                echo "never-sleep: unknown option: $1" >&2
                echo "Run 'never-sleep --help' for usage." >&2
                return 1
                ;;
        esac
    done

    _ns_check_platform || return 1

    local seconds=""
    if [[ -n "$duration" ]]; then
        if ! seconds=$(_ns_parse_duration "$duration"); then
            echo "❌ Invalid duration: '$duration' (expected: 30s, 10m, 2h)" >&2
            return 1
        fi
    fi

    local initial_state
    initial_state=$(_ns_initial_sleep_state)

    echo "🔒 Enabling clamshell-aware anti-sleep mode..."

    local poll_interval="${NEVER_SLEEP_POLL:-2}"

    # Subshell so the EXIT trap fires on return (incl. Ctrl+C in interactive
    # shells). Inside we have two critical sections that MUST stay atomic with
    # respect to asynchronous signals:
    #   a) `sudo pmset` success ↔ `changed=1`
    #   b) background-start watcher ↔ `watcher_pid=$!` capture
    # We ignore INT/TERM during each to close the race windows entirely — a
    # signal arriving inside is simply held until we restore the trap, at
    # which point the EXIT trap fires with consistent state.
    #
    # Outside the critical sections we install `trap 'exit 130' INT TERM`
    # rather than restoring the default. Why: in zsh, an untrapped SIGINT
    # terminates a `(...)` subshell WITHOUT firing its EXIT trap, so cleanup
    # that restores SleepDisabled would be skipped on Ctrl+C — leaving the
    # user's machine unable to sleep. Calling `exit` from a signal trap fires
    # the EXIT trap reliably in both bash and zsh.
    (
        local watcher_pid=""
        local changed=0
        trap '_ns_cleanup "$watcher_pid" "$initial_state" "$changed"' EXIT

        trap '' INT TERM
        if ! sudo pmset -a disablesleep 1; then
            trap 'exit 130' INT TERM
            echo "❌ Failed" >&2
            exit 1
        fi
        changed=1
        trap 'exit 130' INT TERM

        _ns_print_banner "$seconds"

        trap '' INT TERM
        _ns_clamshell_watcher "$poll_interval" &
        watcher_pid=$!
        trap 'exit 130' INT TERM

        if [[ -n "$seconds" ]]; then
            caffeinate -s -t "$seconds"
        else
            caffeinate -s
        fi
    ) || return $?
}

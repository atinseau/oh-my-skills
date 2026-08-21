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
  NEVER_SLEEP_POLL          Clamshell poll interval in seconds (default: 2).
  NEVER_SLEEP_SUDO_REFRESH  Sudo ticket refresh interval in seconds
                            (default: 60) — keeps the auto-release from
                            stalling on a password prompt.

Alias: ns

Concurrent sessions are safe: sleep is re-enabled only when the last one exits.

Note: if the shell is killed with SIGKILL (kill -9, force-quit), the cleanup
trap cannot run and sleep stays disabled until the next never-sleep exits
cleanly. To restore immediately: sudo pmset -a disablesleep 0
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
#
# Deliberately built from parameter expansion instead of `[[ =~ ]]`: zsh only
# populates BASH_REMATCH under `setopt BASH_REMATCH`, so the regex version
# matched but handed back empty capture groups. The caller then saw an empty
# duration, silently fell through to the unlimited branch, and `--duration 2h`
# never expired — the exact opposite of what was asked for, with no error.
_ns_parse_duration() {
    local input="$1"
    local n="${input%[smh]}"
    local unit="${input#"$n"}"

    # Reject anything that is not one-or-more digits followed by an optional
    # unit (covers "", "abc", "2x", "2mm", "-5", "s").
    case "$n" in
        ""|*[!0-9]*) return 1 ;;
    esac

    case "$unit" in
        ""|s) echo "$n" ;;
        m)    echo $((n * 60)) ;;
        h)    echo $((n * 3600)) ;;
        *)    return 1 ;;
    esac
}

# Sentinel directory: remembers the *real* pre-never-sleep value of
# SleepDisabled, plus one marker file per live instance. It lives in TMPDIR so
# it disappears on the same reboot that also resets `pmset disablesleep` —
# the two states can never drift apart across boots.
_ns_state_dir() {
    local base="${TMPDIR:-/tmp}"
    printf '%s/never-sleep.%s.d' "${base%/}" "$(id -u)"
}

# Echoes the SleepDisabled value to restore on exit (0 or 1, defaulting to 0).
#
# The live value read from pmset is only trustworthy on the very first run:
# afterwards it reports *our own* 1 back to us. That matters because a run
# killed with SIGKILL cannot run its cleanup and leaves SleepDisabled=1 behind
# — so the next run would read 1, record it as "what the user wants", and
# restore 1 on a clean Ctrl+C. One crash would pin the machine awake forever,
# while cheerfully reporting the state as restored. Persisting the first read
# and reusing it makes every later run converge back to the true value.
#
# Matches by key name so column shifts in pmset's output stay safe.
_ns_initial_sleep_state() {
    local dir persisted s
    dir=$(_ns_state_dir)

    if persisted=$(cat "$dir/state" 2>/dev/null) \
        && [[ "$persisted" == "0" || "$persisted" == "1" ]]; then
        echo "$persisted"
        return 0
    fi

    s=$(pmset -g 2>/dev/null | awk '$1=="SleepDisabled" {print $NF; exit}')
    s="${s:-0}"
    # Best-effort: an unwritable TMPDIR just degrades to the old read-live
    # behaviour rather than blocking the user.
    mkdir -p "$dir" 2>/dev/null && printf '%s\n' "$s" > "$dir/state" 2>/dev/null
    echo "$s"
}

# Registers this instance as a live holder of the disabled-sleep state, keyed by
# a pid `kill -0` can probe later. Without this, two concurrent never-sleep
# sessions would fight: the first one to exit would re-enable sleep under the
# second one's feet.
_ns_claim() {
    local dir
    dir=$(_ns_state_dir)
    mkdir -p "$dir" 2>/dev/null && : > "$dir/owner.$1" 2>/dev/null
}

# Drops this instance's claim, reaps claims whose process is gone (SIGKILLed
# runs), and echoes how many *other* live instances still hold sleep disabled.
# Uses `find` rather than a glob: an unmatched glob is an error in zsh, not an
# empty loop.
_ns_release() {
    local dir owner pid alive=0
    dir=$(_ns_state_dir)

    if [[ -n "$1" ]]; then
        rm -f "$dir/owner.$1" 2>/dev/null
    fi

    for owner in $(find "$dir" -maxdepth 1 -name 'owner.*' 2>/dev/null); do
        pid="${owner##*/owner.}"
        if kill -0 "$pid" 2>/dev/null; then
            alive=$((alive + 1))
        else
            rm -f "$owner" 2>/dev/null
        fi
    done

    echo "$alive"
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

# Background loop keeping the sudo timestamp warm.
#
# The restore path ends in `sudo pmset -a disablesleep 0`. Sudo's ticket lasts
# ~5 min, so on any session longer than that the restore would stop dead on a
# password prompt. With --duration that prompt is fatal: nobody is watching, the
# lid may be shut, and the machine stays awake forever instead of releasing at
# the deadline. Refreshing every 60s keeps the final sudo non-interactive.
#
# `-n` so we never block on a prompt ourselves. If the ticket is gone anyway (or
# sudo is configured not to cache), we stop refreshing rather than loop on a
# failing command — the restore then prompts, which is the old behaviour.
# Owns its in-flight `sleep` child, same contract as the clamshell watcher.
_ns_sudo_keepalive() {
    local interval="${NEVER_SLEEP_SUDO_REFRESH:-60}"
    local sleep_pid=""

    trap '[[ -n "$sleep_pid" ]] && kill "$sleep_pid" 2>/dev/null; exit 0' TERM INT

    while :; do
        sleep "$interval" &
        sleep_pid=$!
        wait "$sleep_pid" 2>/dev/null
        sleep_pid=""
        sudo -n -v 2>/dev/null || return 0
    done
}

# EXIT trap body. Sends SIGTERM to the watcher (which self-cleans its own
# in-flight `sleep` child via its own trap), then restores pmset only if we
# actually changed it — avoids a bogus second sudo prompt when the initial
# pmset call failed or was cancelled — and only if no other never-sleep session
# is still relying on it.
_ns_cleanup() {
    local watcher="$1"
    local initial="$2"
    local changed="$3"
    local keepalive="$4"

    if [[ -n "$watcher" ]]; then
        kill -TERM "$watcher" 2>/dev/null
    fi

    # Stop refreshing before we spend the ticket — it is warm by construction
    # (last refresh under a minute ago), so the restore below stays silent.
    if [[ -n "$keepalive" ]]; then
        kill -TERM "$keepalive" 2>/dev/null
    fi

    local others
    others=$(_ns_release "$watcher")

    if [[ "$changed" != "1" ]]; then
        # Nothing of ours to undo. Drop the sentinel as well if nobody else
        # holds it, so a cancelled sudo prompt leaves no state behind.
        if [[ "$others" == "0" ]]; then
            rm -rf "$(_ns_state_dir)" 2>/dev/null
        fi
        return 0
    fi

    if [[ "$others" != "0" ]]; then
        echo ""
        echo "ℹ️  Sleep stays disabled: $others other never-sleep session(s) still running."
        return 0
    fi

    echo ""
    echo "🔓 Restoring previous sleep mode..."
    sudo pmset -a disablesleep "$initial"
    echo "✅ Sleep mode restored (SleepDisabled=$initial)."
    rm -rf "$(_ns_state_dir)" 2>/dev/null
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
    #   b) background-start watcher/keepalive ↔ pid capture ↔ `_ns_claim`
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
        local keepalive_pid=""
        local changed=0
        trap '_ns_cleanup "$watcher_pid" "$initial_state" "$changed" "$keepalive_pid"' EXIT

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
        _ns_claim "$watcher_pid"
        _ns_sudo_keepalive &
        keepalive_pid=$!
        trap 'exit 130' INT TERM

        if [[ -n "$seconds" ]]; then
            caffeinate -s -t "$seconds"
        else
            caffeinate -s
        fi
    ) || return $?
}

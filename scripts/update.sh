#!/bin/bash

# oh-my-skills auto-updater

set -euo pipefail

DEFAULT_TAG="v0.1.13" # Set by release workflow in tagged installer commits; kept empty on master

# Cache configuration
UPDATE_CACHE_FILE="${HOME}/.oh-my-skills/.update-cache"
UPDATE_CACHE_TTL="${OMS_UPDATE_CACHE_TTL:-86400}" # 24 hours in seconds

load_lib() {
    if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]%/*}/lib.sh" ]]; then
        # shellcheck source=lib.sh
        source "${BASH_SOURCE[0]%/*}/lib.sh"
        return
    fi
    # Running via curl | bash — download lib.sh from the same release tag
    local _lib_tmp
    _lib_tmp="$(mktemp)"
    local _base_url="${OMS_LIB_BASE_URL:-https://raw.githubusercontent.com/atinseau/oh-my-skills/${DEFAULT_TAG}/scripts}"
    curl -fsSL "${_base_url}/lib.sh" -o "$_lib_tmp"
    # shellcheck disable=SC1090
    source "$_lib_tmp"
    rm -f "$_lib_tmp"
}
load_lib
MODE="manual"

parse_args() {
    case "${1:-}" in
        ""|"--manual")
            MODE="manual"
            ;;
        "--auto-check")
            MODE="auto"
            ;;
        "--background-fetch")
            MODE="background"
            ;;
        *)
            log_error "Unknown option: ${1}"
            exit 1
            ;;
    esac
}

get_local_version() {
    local registry="$INSTALL_DIR/registry.json"

    if [[ ! -f "$registry" ]]; then
        echo "unknown"
        return
    fi

    if command -v jq &> /dev/null; then
        jq -r '.version // "unknown"' "$registry"
    else
        grep -oP '"version"\s*:\s*"\K[^"]+' "$registry" 2>/dev/null || echo "unknown"
    fi
}

get_remote_version() {
    # Fetch latest tag from remote, strip v prefix to normalize
    local raw
    raw=$(git ls-remote --tags "$REPO_URL" 2>/dev/null | grep -oE 'refs/tags/v?[0-9.]+$' | sed 's|refs/tags/||' | sort -V | tail -1)
    # Strip leading v for consistent comparison
    echo "${raw#v}"
}

# ─── Cache helpers ────────────────────────────────────────────────────────────

# Write remote version and current timestamp to cache file
# Format: <timestamp> <remote_version>
write_cache() {
    local remote_version="$1"
    local now
    now=$(date +%s)
    echo "${now} ${remote_version}" > "$UPDATE_CACHE_FILE"
}

# Read cache and output: <timestamp> <remote_version>
# Returns 1 if cache does not exist or is malformed
read_cache() {
    if [[ ! -f "$UPDATE_CACHE_FILE" ]]; then
        return 1
    fi
    local content
    content=$(cat "$UPDATE_CACHE_FILE" 2>/dev/null) || return 1
    local ts version
    ts=$(echo "$content" | awk '{print $1}')
    version=$(echo "$content" | awk '{print $2}')
    if [[ -z "$ts" || -z "$version" ]]; then
        return 1
    fi
    echo "$ts $version"
}

# Check if the cache is still fresh (within TTL)
is_cache_fresh() {
    local cache_data
    cache_data=$(read_cache) || return 1
    local ts
    ts=$(echo "$cache_data" | awk '{print $1}')
    local now
    now=$(date +%s)
    local age=$(( now - ts ))
    [[ $age -lt $UPDATE_CACHE_TTL ]]
}

# Get cached remote version (empty string if no cache)
get_cached_remote_version() {
    local cache_data
    cache_data=$(read_cache) || { echo ""; return; }
    echo "$cache_data" | awk '{print $2}'
}

# Invalidate the cache (force re-fetch on next shell open)
invalidate_cache() {
    rm -f "$UPDATE_CACHE_FILE"
}

# Spawn a background process that fetches remote version and writes to cache.
# Detached from the shell so it won't block startup.
spawn_background_fetch() {
    # Re-invoke ourselves with --background-fetch in a detached subshell
    # Redirect all output to /dev/null so nothing leaks into the user's terminal
    (
        REPO_URL="${REPO_URL}" bash "${BASH_SOURCE[0]}" --background-fetch \
            </dev/null >/dev/null 2>&1 &
    )
}

# ─── Repo / update helpers ───────────────────────────────────────────────────

fetch_repo_metadata() {
    cd "$INSTALL_DIR"

    # --force overwrites local tags that diverge from remote (e.g. re-pushed releases)
    if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" == "true" ]]; then
        git fetch origin --tags --force --unshallow 2>/dev/null || git fetch origin --tags --force --depth=200 2>/dev/null || {
            log_error "Failed to fetch repository metadata (shallow repo)"
            return 1
        }
    else
        git fetch origin --tags --force 2>/dev/null || {
            log_error "Failed to fetch repository metadata"
            return 1
        }
    fi
}

get_commit_titles_since_release() {
    local old_version="$1"
    local new_version="$2"

    cd "$INSTALL_DIR"
    git log --pretty=format:'- %s' "v${old_version}..v${new_version}" 2>/dev/null || true
}

update_repo() {
    local new_version="$1"

    cd "$INSTALL_DIR"
    git checkout "v${new_version}" 2>/dev/null || git checkout "origin/master" 2>/dev/null || {
        log_error "Failed to checkout v${new_version} or origin/master"
        return 1
    }

    log_success "Repository updated to ${CYAN}$new_version${NC}"
}

apply_update() {
    local user_shell
    user_shell=$(detect_shell)

    detect_llms
    install_skills
    install_commands
    clean_dev_files
    create_shell_sourcing "update"
    inject_sourcing "$user_shell" "update"
}

prompt_for_update() {
    local local_version="$1"
    local remote_version="$2"

    echo ""
    echo -e "  ${YELLOW}⚡${NC} Update available: ${DIM}v${local_version}${NC} ${MAGENTA}→${NC} ${CYAN}${BOLD}v${remote_version}${NC}"
    echo ""
    confirm "Update now to install the latest commands, skills, and fixes?"
}

print_changelog() {
    local previous_version="$1"
    local commit_titles="$2"

    if [[ -z "$commit_titles" ]]; then
        return 0
    fi

    echo ""
    echo -e "  ${MAGENTA}${BOLD}Changelog since v${previous_version}:${NC}"
    echo ""
    while IFS= read -r line; do
        echo -e "  ${CYAN}${line}${NC}"
    done <<< "$commit_titles"
}

perform_update() {
    local local_version="$1"
    local remote_version="$2"

    echo ""
    log_info "Updating oh-my-skills..."
    fetch_repo_metadata
    local commit_titles
    commit_titles=$(get_commit_titles_since_release "$local_version" "$remote_version")
    update_repo "$remote_version"
    apply_update

    # Invalidate cache after a successful update so next auto-check re-fetches cleanly
    invalidate_cache

    local user_shell
    user_shell=$(detect_shell)

    print_success_box "Update Complete! v${remote_version}" \
        "" \
        "Restart your terminal or run:" \
        "source ~/.${user_shell}rc"

    print_changelog "$local_version" "$commit_titles"
    echo ""
}

# ─── Main logic ───────────────────────────────────────────────────────────────

main() {
    parse_args "${1:-}"

    # ── Background fetch mode: silent, only writes cache, then exits ──
    if [[ "$MODE" == "background" ]]; then
        if [[ ! -d "$INSTALL_DIR" ]]; then
            exit 0
        fi
        local remote_version
        remote_version=$(get_remote_version)
        if [[ -n "$remote_version" && "$remote_version" != "unknown" ]]; then
            write_cache "$remote_version"
        fi
        exit 0
    fi

    # ── Manual mode: synchronous check with full UI ──
    if [[ "$MODE" == "manual" ]]; then
        print_banner
        print_subtitle "Checking for updates..."

        if [[ ! -d "$INSTALL_DIR" ]]; then
            log_warning "oh-my-skills is not installed"
            exit 0
        fi

        echo ""
        log_info "Checking for updates..."

        local local_version
        local_version=$(get_local_version)
        local remote_version
        remote_version=$(get_remote_version)

        log_info "Local:  ${BOLD}$local_version${NC}"
        log_info "Remote: ${BOLD}$remote_version${NC}"

        if [[ "$remote_version" == "unknown" ]]; then
            log_warning "Could not fetch remote version"
            exit 1
        fi

        # Update cache with the fresh result
        write_cache "$remote_version"

        if [[ "$local_version" != "$remote_version" ]]; then
            if prompt_for_update "$local_version" "$remote_version"; then
                perform_update "$local_version" "$remote_version"
            else
                log_info "Update skipped"
            fi
        else
            print_info_box "Everything is up to date!" \
                "" \
                "v${local_version}"
        fi
        return
    fi

    # ── Auto-check mode: cache-first, zero-latency ──
    if [[ ! -d "$INSTALL_DIR" ]]; then
        exit 0
    fi

    local local_version
    local_version=$(get_local_version)

    # If cache is fresh, use cached value (no network call)
    if is_cache_fresh; then
        local cached_version
        cached_version=$(get_cached_remote_version)

        if [[ -n "$cached_version" && "$cached_version" != "unknown" && "$local_version" != "$cached_version" ]]; then
            # Update available — prompt the user
            if prompt_for_update "$local_version" "$cached_version"; then
                perform_update "$local_version" "$cached_version"
            else
                log_info "Update skipped. Run '${CYAN}oms update${NC}' to update manually later."
            fi
        fi
        # Cache is fresh and up-to-date (or unknown) — nothing to do
    else
        # Cache is stale or missing — spawn a background fetch and move on
        # The user will see the notification on the *next* shell open
        spawn_background_fetch
    fi
}

main "$@"

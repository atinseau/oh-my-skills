#!/bin/bash

# oh-my-skills auto-updater

set -euo pipefail

DEFAULT_TAG="" # Set by release workflow in tagged installer commits; kept empty on master

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

fetch_repo_metadata() {
    cd "$INSTALL_DIR"

    if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" == "true" ]]; then
        git fetch origin --tags --unshallow 2>/dev/null || git fetch origin --tags --depth=200 2>/dev/null
    else
        git fetch origin --tags 2>/dev/null
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
    git checkout "v${new_version}" 2>/dev/null || git checkout "origin/master" 2>/dev/null

    log_success "Repository updated to $new_version"
}

apply_update() {
    local user_shell
    user_shell=$(detect_shell)

    detect_llms
    init_registry
    install_skills
    install_commands
    create_shell_sourcing "update"
    inject_sourcing "$user_shell" "update"
}

prompt_for_update() {
    local local_version="$1"
    local remote_version="$2"

    echo ""
    log_warning "Update available: $local_version → $remote_version"
    confirm "Update now to install the latest commands, skills, and fixes?"
}

print_changelog() {
    local previous_version="$1"
    local commit_titles="$2"

    if [[ -z "$commit_titles" ]]; then
        return 0
    fi

    echo ""
    log_info "Changelog since v${previous_version}:"
    printf '%s\n' "$commit_titles"
}

main() {
    parse_args "${1:-}"

    if [[ "$MODE" == "manual" ]]; then
        echo ""
        log_info "=== oh-my-skills Auto-Updater ==="
        echo ""
    fi

    if [[ ! -d "$INSTALL_DIR" ]]; then
        if [[ "$MODE" == "manual" ]]; then
            log_warning "oh-my-skills is not installed"
        fi
        exit 0
    fi

    if [[ "$MODE" == "manual" ]]; then
        log_info "Checking for updates..."
    fi

    local local_version
    local_version=$(get_local_version)
    local remote_version
    remote_version=$(get_remote_version)

    if [[ "$MODE" == "manual" ]]; then
        log_info "Local:  $local_version"
        log_info "Remote: $remote_version"
    fi

    if [[ "$remote_version" == "unknown" ]]; then
        if [[ "$MODE" == "manual" ]]; then
            log_warning "Could not fetch remote version"
            exit 1
        fi
        exit 0
    fi

    if [[ "$local_version" != "$remote_version" ]]; then
        if prompt_for_update "$local_version" "$remote_version"; then
            log_info "Updating oh-my-skills..."
            fetch_repo_metadata
            local commit_titles
            commit_titles=$(get_commit_titles_since_release "$local_version" "$remote_version")
            update_repo "$remote_version"
            apply_update

            echo ""
            log_success "=== Update Complete ==="
            print_changelog "$local_version" "$commit_titles"
            log_info "Restart your terminal to apply changes"
        else
            if [[ "$MODE" == "auto" ]]; then
                log_info "Update skipped. Run 'oms update' to update manually later."
            else
                log_info "Update skipped"
            fi
        fi
    elif [[ "$MODE" == "manual" ]]; then
        log_success "oh-my-skills is up to date"
    fi

    if [[ "$MODE" == "manual" ]]; then
        echo ""
    fi
}

main "$@"

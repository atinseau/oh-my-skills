#!/bin/bash

# oh-my-skills auto-updater

set -euo pipefail

# Configuration
INSTALL_DIR="$HOME/.oh-my-skills"
REPO_URL="${REPO_URL:-https://github.com/atinseau/oh-my-skills.git}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1" >&2; }

confirm() {
    local prompt="$1"
    local response
    read -p "$(echo -e "${YELLOW}?${NC}") $prompt (y/n) " response
    [[ "$response" == "y" || "$response" == "Y" ]]
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

update_repo() {
    log_info "Updating oh-my-skills..."

    cd "$INSTALL_DIR"
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
    git fetch origin "$branch" 2>/dev/null
    git reset --hard "origin/$branch" 2>/dev/null

    log_success "Repository updated"
}

reinstall() {
    # Re-run install to update skills, commands, and shell sourcing
    if [[ -f "$INSTALL_DIR/scripts/install.sh" ]]; then
        bash "$INSTALL_DIR/scripts/install.sh"
    fi
}

main() {
    echo ""
    log_info "=== oh-my-skills Auto-Updater ==="
    echo ""

    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_warning "oh-my-skills is not installed"
        exit 0
    fi

    log_info "Checking for updates..."

    local local_version=$(get_local_version)
    local remote_version=$(get_remote_version)

    log_info "Local:  $local_version"
    log_info "Remote: $remote_version"

    if [[ "$remote_version" == "unknown" ]]; then
        log_warning "Could not fetch remote version"
        exit 1
    fi

    if [[ "$local_version" != "$remote_version" ]]; then
        echo ""
        log_warning "Update available: $local_version → $remote_version"

        if confirm "Do you want to update oh-my-skills?"; then
            update_repo
            reinstall

            echo ""
            log_success "=== Update Complete ==="
            log_info "Restart your terminal to apply changes"
        else
            log_info "Update skipped"
        fi
    else
        log_success "oh-my-skills is up to date"
    fi

    echo ""
}

main "$@"

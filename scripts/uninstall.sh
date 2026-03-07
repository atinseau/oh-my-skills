#!/bin/bash

# oh-my-skills uninstaller

set -euo pipefail

# Configuration
INSTALL_DIR="$HOME/.oh-my-skills"
REGISTRY_FILE="$INSTALL_DIR/registry.json"
SHELL_FILE="$INSTALL_DIR/shell"

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

detect_shell() {
    if [[ -f "$HOME/.zshrc" ]]; then
        echo "zsh"
    elif [[ -f "$HOME/.bashrc" ]]; then
        echo "bash"
    else
        echo "bash"
    fi
}

remove_skills() {
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        log_warning "No registry found, skipping skill removal"
        return 0
    fi

    log_info "Removing installed skills..."

    # Read registry and remove skills
    if command -v jq &> /dev/null; then
        # With jq
        for path in $(jq -r '.skills.claude[]' "$REGISTRY_FILE" 2>/dev/null); do
            if [[ -d "$path" ]]; then
                # Double check the marker before removing
                if [[ -f "$path/SKILL.md" ]] && grep -q "by: oh-my-skills" "$path/SKILL.md" 2>/dev/null; then
                    rm -rf "$path"
                    log_success "Removed Claude skill: $(basename "$path")"
                fi
            fi
        done

        for path in $(jq -r '.skills.copilot[]' "$REGISTRY_FILE" 2>/dev/null); do
            if [[ -d "$path" ]]; then
                if [[ -f "$path/SKILL.md" ]] && grep -q "by: oh-my-skills" "$path/SKILL.md" 2>/dev/null; then
                    rm -rf "$path"
                    log_success "Removed Copilot skill: $(basename "$path")"
                fi
            fi
        done
    else
        # Without jq: grep paths from JSON
        grep -oP '"(/[^"]+)"' "$REGISTRY_FILE" 2>/dev/null | tr -d '"' | while read -r path; do
            if [[ -d "$path" ]] && [[ -f "$path/SKILL.md" ]]; then
                if grep -q "by: oh-my-skills" "$path/SKILL.md" 2>/dev/null; then
                    rm -rf "$path"
                    log_success "Removed skill: $(basename "$path")"
                fi
            fi
        done
    fi
}

remove_sourcing() {
    local user_shell=$1
    local shell_config

    if [[ "$user_shell" == "zsh" ]]; then
        shell_config="$HOME/.zshrc"
    else
        shell_config="$HOME/.bashrc"
    fi

    if [[ ! -f "$shell_config" ]]; then
        log_warning "$shell_config not found"
        return 0
    fi

    if grep -q "oh-my-skills" "$shell_config"; then
        local tmp=$(mktemp)
        grep -v "oh-my-skills" "$shell_config" > "$tmp"
        mv "$tmp" "$shell_config"
        log_success "Removed sourcing from $shell_config"
    else
        log_warning "No oh-my-skills sourcing found in $shell_config"
    fi
}

remove_installation() {
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
        log_success "Removed $INSTALL_DIR"
    fi
}

main() {
    echo ""
    log_info "=== oh-my-skills Uninstaller ==="
    echo ""

    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_warning "oh-my-skills is not installed"
        exit 0
    fi

    if ! confirm "Are you sure you want to uninstall oh-my-skills?"; then
        log_info "Cancelled"
        exit 0
    fi

    local user_shell=$(detect_shell)

    remove_skills
    remove_sourcing "$user_shell"
    remove_installation

    echo ""
    log_success "=== Uninstallation Complete ==="
    log_info "Restart your terminal or run: source ~/.${user_shell}rc"
    echo ""
}

main "$@"

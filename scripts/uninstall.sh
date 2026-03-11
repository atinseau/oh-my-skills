#!/bin/bash

# oh-my-skills uninstaller

set -euo pipefail

DEFAULT_TAG="v0.1.2" # Set by release workflow in tagged installer commits; kept empty on master

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

remove_skills() {
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        log_warning "No registry found, skipping skill removal"
        return 0
    fi

    log_info "Removing installed skills..."

    # Wrappers are files (not directories) that reference ~/.oh-my-skills/skills/
    # This reference serves as the ownership marker to avoid deleting foreign skills.
    if command -v jq &> /dev/null; then
        for path in $(jq -r '.skills.claude[]' "$REGISTRY_FILE" 2>/dev/null); do
            if [[ -f "$path" ]]; then
                if grep -q "oh-my-skills/skills/" "$path" 2>/dev/null; then
                    rm -f "$path"
                    log_success "Removed Claude wrapper: $(basename "$path")"
                fi
            fi
        done

        for path in $(jq -r '.skills.copilot[]' "$REGISTRY_FILE" 2>/dev/null); do
            if [[ -f "$path" ]]; then
                if grep -q "oh-my-skills/skills/" "$path" 2>/dev/null; then
                    rm -f "$path"
                    log_success "Removed Copilot wrapper: $(basename "$path")"
                fi
            fi
        done
    else
        # Without jq: grep paths from JSON
        grep -oE '"(/[^"]+)"' "$REGISTRY_FILE" 2>/dev/null | tr -d '"' | while read -r path; do
            if [[ -f "$path" ]]; then
                if grep -q "oh-my-skills/skills/" "$path" 2>/dev/null; then
                    rm -f "$path"
                    log_success "Removed wrapper: $(basename "$path")"
                fi
            fi
        done
    fi
}

remove_sourcing() {
    local user_shell="$1"
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
        local tmp
        tmp=$(mktemp)
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

    local user_shell
    user_shell=$(detect_shell)

    remove_skills
    remove_sourcing "$user_shell"
    remove_installation

    echo ""
    log_success "=== Uninstallation Complete ==="
    log_info "Restart your terminal or run: source ~/.${user_shell}rc"
    echo ""
}

main "$@"

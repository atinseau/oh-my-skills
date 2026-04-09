#!/bin/bash

# oh-my-skills uninstaller

set -euo pipefail

DEFAULT_TAG="v0.1.13" # Set by release workflow in tagged installer commits; kept empty on master

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

    # Wrappers are files (not directories) that reference ~/.oh-my-skills/skills/
    # This reference serves as the ownership marker to avoid deleting foreign skills.
    if command -v jq &> /dev/null; then
        for path in $(jq -r '.skills.claude[]' "$REGISTRY_FILE" 2>/dev/null); do
            if [[ -f "$path" ]]; then
                if grep -q "oh-my-skills/skills/" "$path" 2>/dev/null; then
                    rm -f "$path"
                    # Remove parent skill directory if now empty (e.g. .claude/skills/<name>/)
                    local parent_dir
                    parent_dir="$(dirname "$path")"
                    if [[ -d "$parent_dir" ]] && [[ -z "$(ls -A "$parent_dir")" ]]; then
                        rmdir "$parent_dir"
                    fi
                    log_success "Removed Claude wrapper: $(basename "$(dirname "$path")")"
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
                    # Remove parent skill directory if now empty (Claude wrappers use subdirectories)
                    local parent_dir
                    parent_dir="$(dirname "$path")"
                    if [[ -d "$parent_dir" ]] && [[ -z "$(ls -A "$parent_dir")" ]]; then
                        rmdir "$parent_dir"
                    fi
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
    local skip_confirm=false
    for arg in "$@"; do
        case "$arg" in
            --yes|-y) skip_confirm=true ;;
        esac
    done

    print_banner
    print_subtitle "Uninstalling..."

    if [[ ! -d "$INSTALL_DIR" ]]; then
        echo ""
        log_warning "oh-my-skills is not installed"
        echo ""
        exit 0
    fi

    if [[ "$skip_confirm" == false ]]; then
        echo ""
        if ! confirm "Are you sure you want to uninstall oh-my-skills?"; then
            echo ""
            log_info "Cancelled"
            echo ""
            exit 0
        fi
    fi

    local user_shell
    user_shell=$(detect_shell)

    init_steps 3

    print_step "Removing skills..."
    remove_skills

    print_step "Cleaning shell config..."
    remove_sourcing "$user_shell"

    print_step "Removing installation..."
    remove_installation

    print_goodbye_box "Uninstallation Complete!" \
        "" \
        "👋 See you next time!" \
        "" \
        "Restart your terminal or run:" \
        "source ~/.${user_shell}rc"
}

main "$@"

#!/bin/bash

# oh-my-skills installer

set -euo pipefail

DEFAULT_TAG="v0.1.3" # Set by release workflow in tagged installer commits; kept empty on master

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

require_git() {
    if ! command -v git &> /dev/null; then
        log_error "git is required to install oh-my-skills"
        exit 1
    fi
}

clone_repo() {
    log_info "Installing oh-my-skills..."

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log_warning "Already installed. Updating..."
        cd "$INSTALL_DIR"
        local branch
        branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
        git pull origin "$branch" 2>/dev/null || log_warning "Could not update repository"
    else
        local target_tag="${TAG:-$DEFAULT_TAG}"
        if [[ -n "$target_tag" ]]; then
            git clone --branch "$target_tag" --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || log_warning "Failed to clone tag '$target_tag', cloning default branch instead"
            log_success "Repository cloned ($target_tag) to $INSTALL_DIR"
        else
            git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || log_warning "Failed to clone repository"
            log_success "Repository cloned to $INSTALL_DIR"
        fi
    fi
}

main() {
    echo ""
    log_info "=== oh-my-skills Installer ==="
    echo ""

    local user_shell
    user_shell=$(detect_shell)
    log_info "Detected shell: $user_shell"

    require_git
    detect_llms
    clone_repo
    init_registry
    install_skills
    install_commands
    create_shell_sourcing "install"
    inject_sourcing "$user_shell" "install"

    echo ""
    log_success "=== Installation Complete ==="
    log_info "Restart your terminal or run: source ~/.${user_shell}rc"
    echo ""
}

main "$@"

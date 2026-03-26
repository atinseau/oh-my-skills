#!/bin/bash

# oh-my-skills installer

set -euo pipefail

DEFAULT_TAG="v0.1.7" # Set by release workflow in tagged installer commits; kept empty on master

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
            log_success "Repository cloned (${CYAN}$target_tag${NC})"
        else
            git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || log_warning "Failed to clone repository"
            log_success "Repository cloned"
        fi
    fi
}

main() {
    print_banner
    print_subtitle "Installing..."

    local user_shell
    user_shell=$(detect_shell)

    init_steps 6

    print_step "Detecting shell..."
    log_info "Detected shell: ${CYAN}${BOLD}$user_shell${NC}"

    print_step "Checking requirements..."
    require_git
    log_success "git is available"
    detect_llms

    print_step "Cloning repository..."
    clone_repo

    print_step "Installing skills..."
    init_registry
    install_skills

    print_step "Installing commands..."
    install_commands

    print_step "Configuring shell..."
    create_shell_sourcing "install"
    inject_sourcing "$user_shell" "install"

    local version
    version=$(get_version)

    print_success_box "Installation Complete! v${version}" \
        "" \
        "Restart your terminal or run:" \
        "source ~/.${user_shell}rc"
}

main "$@"

#!/bin/bash

# oh-my-skills installer

set -euo pipefail

_OMS_BOOTSTRAP_TAG="v1.5.1" # Bootstrap only — real source of truth is lib.sh; patched by release workflow

# ── Bootstrap: load shared library ──────────────────────────────────────────
# Duplicated across install.sh, uninstall.sh, update.sh (bootstrap problem:
# need this code to download lib.sh, but lib.sh is what we're downloading).
# If you change this, update ALL 3 scripts.
load_lib() {
    if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]%/*}/lib.sh" ]]; then
        # shellcheck source=lib.sh
        source "${BASH_SOURCE[0]%/*}/lib.sh"
        return
    fi
    # Running via curl | bash — download lib.sh from the same release tag
    local _lib_tmp
    _lib_tmp="$(mktemp)"
    local _base_url="${OMS_LIB_BASE_URL:-https://raw.githubusercontent.com/atinseau/oh-my-skills/${_OMS_BOOTSTRAP_TAG}/scripts}"
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
        log_warning "Already installed. Refreshing..."
        cd "$INSTALL_DIR"
        # clean_dev_files deletes tracked files (src/, tests/, package.json)
        # after every run, so the checkout is deliberately incomplete between
        # installs: restore it before anything reads from src/. And HEAD is
        # usually detached at a release tag, so `git pull` has no upstream to
        # follow — fetch, then move to the requested ref explicitly.
        git checkout -- . 2>/dev/null || log_warning "Could not restore the checkout"
        git fetch origin --tags --force 2>/dev/null || log_warning "Could not fetch repository"
        local target_tag="${TAG:-$DEFAULT_TAG}"
        if [[ -n "$target_tag" ]] && git checkout "$target_tag" 2>/dev/null; then
            log_success "Repository refreshed (${CYAN}$target_tag${NC})"
        elif git checkout FETCH_HEAD 2>/dev/null; then
            log_success "Repository refreshed"
        else
            log_warning "Could not update repository; reinstalling the current checkout"
        fi
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

    init_steps 7

    print_step "Detecting shell..."
    log_info "Detected shell: ${CYAN}${BOLD}$user_shell${NC}"

    print_step "Checking requirements..."
    require_git
    log_success "git is available"
    detect_llms

    print_step "Cloning repository..."
    clone_repo

    print_step "Installing skills..."
    install_skills

    print_step "Installing commands..."
    install_commands

    print_step "Installing hooks..."
    install_hooks

    local version
    version=$(get_version)

    clean_dev_files

    print_step "Configuring shell..."
    create_shell_sourcing "install"
    inject_sourcing "$user_shell" "install"

    print_success_box "Installation Complete! v${version}" \
        "" \
        "Restart your terminal or run:" \
        "source ~/.${user_shell}rc"
}

main "$@"

#!/bin/bash

# oh-my-skills installer

set -euo pipefail

# Configuration
REPO_URL="${REPO_URL:-https://github.com/atinseau/oh-my-skills.git}"
DEFAULT_TAG="v0.0.5" # Set by release workflow in tagged installer commits; kept empty on master
INSTALL_DIR="$HOME/.oh-my-skills"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
REGISTRY_FILE="$INSTALL_DIR/registry.json"
SHELL_FILE="$INSTALL_DIR/shell"
COMMANDS_DIR="$INSTALL_DIR/commands"

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

require_git() {
    if ! command -v git &> /dev/null; then
        log_error "git is required to install oh-my-skills"
        exit 1
    fi
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

detect_llms() {
    local found=false

    if command -v claude &> /dev/null; then
        log_success "Claude CLI detected"
        found=true
    else
        log_warning "Claude CLI not found"
    fi

    if command -v copilot &> /dev/null; then
        log_success "GitHub Copilot CLI detected"
        found=true
    else
        log_warning "GitHub Copilot CLI not found"
    fi

    if [[ "$found" == false ]]; then
        log_warning "No supported LLM CLI detected, skills won't be installed"
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
            git clone --branch "$target_tag" --depth 1 "$REPO_URL" "$INSTALL_DIR"
            log_success "Repository cloned ($target_tag) to $INSTALL_DIR"
        else
            git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
            log_success "Repository cloned to $INSTALL_DIR"
        fi
    fi
}

get_version() {
    local pkg="$INSTALL_DIR/package.json"
    if command -v jq &> /dev/null; then
        jq -r '.version' "$pkg"
    else
        grep -oP '"version"\s*:\s*"\K[^"]+' "$pkg" 2>/dev/null || echo "unknown"
    fi
}

init_registry() {
    local version
    version=$(get_version)
    echo "{\"version\":\"$version\",\"skills\":{\"claude\":[],\"copilot\":[]}}" > "$REGISTRY_FILE"
    log_success "Registry initialized (v$version)"
}

install_skills() {
    local src_skills_dir="$INSTALL_DIR/src/skills"

    if [[ ! -d "$src_skills_dir" ]]; then
        log_warning "No skills directory found in repository"
        return 0
    fi

    # Reset registry skills (preserve version)
    local tmp=$(mktemp)
    if command -v jq &> /dev/null; then
        jq '.skills = {"claude":[],"copilot":[]}' "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
    else
        echo "{\"version\":\"$(get_version)\",\"skills\":{\"claude\":[],\"copilot\":[]}}" > "$REGISTRY_FILE"
    fi

    for skill_dir in "$src_skills_dir"/*/; do
        if [[ ! -d "$skill_dir" ]]; then continue; fi

        local skill_name=$(basename "$skill_dir")

        # Install for Claude
        if command -v claude &> /dev/null; then
            local claude_dest="$CLAUDE_SKILLS_DIR/$skill_name"
            mkdir -p "$CLAUDE_SKILLS_DIR"
            cp -r "$skill_dir" "$claude_dest"
            log_success "Installed skill '$skill_name' for Claude → $claude_dest"

            # Add to registry
            local tmp=$(mktemp)
            if command -v jq &> /dev/null; then
                jq --arg p "$claude_dest" '.skills.claude += [$p]' "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
            else
                # Fallback without jq: simple sed append
                sed -i.bak "s|\"claude\":\\[|\"claude\":[\"$claude_dest\",|" "$REGISTRY_FILE"
                sed -i.bak 's/,]/]/' "$REGISTRY_FILE"
                rm -f "$REGISTRY_FILE.bak"
            fi
        fi

        # Install for Copilot
        if command -v copilot &> /dev/null; then
            local copilot_dest="$COPILOT_SKILLS_DIR/$skill_name"
            mkdir -p "$COPILOT_SKILLS_DIR"
            cp -r "$skill_dir" "$copilot_dest"
            log_success "Installed skill '$skill_name' for Copilot → $copilot_dest"

            local tmp=$(mktemp)
            if command -v jq &> /dev/null; then
                jq --arg p "$copilot_dest" '.skills.copilot += [$p]' "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
            else
                sed -i.bak "s|\"copilot\":\\[|\"copilot\":[\"$copilot_dest\",|" "$REGISTRY_FILE"
                sed -i.bak 's/,]/]/' "$REGISTRY_FILE"
                rm -f "$REGISTRY_FILE.bak"
            fi
        fi
    done
}

install_commands() {
    local src_commands_dir="$INSTALL_DIR/src/commands"

    if [[ ! -d "$src_commands_dir" ]]; then
        log_warning "No commands directory found in repository"
        return 0
    fi

    # Copy commands to ~/.oh-my-skills/commands/
    mkdir -p "$COMMANDS_DIR"
    cp -R "$src_commands_dir"/. "$COMMANDS_DIR"/
    find "$COMMANDS_DIR" -type f -name "*.sh" -exec chmod +x {} +
    log_success "Commands copied to $COMMANDS_DIR"
}

create_shell_sourcing() {
    # Create the dynamic sourcing script
    cat > "$SHELL_FILE" << 'SHELL_SCRIPT'
#!/bin/bash
# oh-my-skills - dynamic command sourcing
# This file is auto-generated. Do not edit manually.

_OH_MY_SKILLS_DIR="${HOME}/.oh-my-skills"
_OH_MY_SKILLS_COMMANDS_DIR="${_OH_MY_SKILLS_DIR}/commands"
_OH_MY_SKILLS_UPDATE_SCRIPT="${_OH_MY_SKILLS_DIR}/scripts/update.sh"

if [[ "$-" == *i* ]] && [[ -x "$_OH_MY_SKILLS_UPDATE_SCRIPT" ]]; then
    bash "$_OH_MY_SKILLS_UPDATE_SCRIPT" --auto-check
fi

if [[ -d "$_OH_MY_SKILLS_COMMANDS_DIR" ]]; then
    while IFS= read -r -d '' cmd_file; do
        source "$cmd_file"
    done < <(find "$_OH_MY_SKILLS_COMMANDS_DIR" -type f -name "*.sh" -print0)
fi
SHELL_SCRIPT

    chmod +x "$SHELL_FILE"
    log_success "Shell sourcing script created"
}

inject_sourcing() {
    local user_shell=$1
    local shell_config

    if [[ "$user_shell" == "zsh" ]]; then
        shell_config="$HOME/.zshrc"
    else
        shell_config="$HOME/.bashrc"
    fi

    local source_line="source \"$SHELL_FILE\" # oh-my-skills"

    if grep -q "oh-my-skills" "$shell_config" 2>/dev/null; then
        log_warning "Sourcing already present in $shell_config"
        return 0
    fi

    echo "" >> "$shell_config"
    echo "$source_line" >> "$shell_config"
    log_success "Added sourcing to $shell_config"
}

main() {
    echo ""
    log_info "=== oh-my-skills Installer ==="
    echo ""

    local user_shell=$(detect_shell)
    log_info "Detected shell: $user_shell"

    require_git
    detect_llms
    clone_repo
    init_registry
    install_skills
    install_commands
    create_shell_sourcing
    inject_sourcing "$user_shell"

    echo ""
    log_success "=== Installation Complete ==="
    log_info "Restart your terminal or run: source ~/.${user_shell}rc"
    echo ""
}

main "$@"

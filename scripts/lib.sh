#!/bin/bash

# oh-my-skills shared library
# Sourced by install.sh and update.sh

# Configuration
REPO_URL="${REPO_URL:-https://github.com/atinseau/oh-my-skills.git}"
INSTALL_DIR="$HOME/.oh-my-skills"
SKILLS_DIR="$INSTALL_DIR/skills"
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

get_version() {
    local pkg="$INSTALL_DIR/package.json"
    if [[ ! -f "$pkg" ]]; then
        echo "unknown"
        return
    fi
    if command -v jq &> /dev/null; then
        jq -r '.version' "$pkg"
    else
        sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg" 2>/dev/null | head -1 || echo "unknown"
    fi
}

init_registry() {
    local version
    version=$(get_version)
    echo "{\"version\":\"$version\",\"skills\":{\"claude\":[],\"copilot\":[]}}" > "$REGISTRY_FILE"
    log_success "Registry initialized (v$version)"
}

# Extract a YAML frontmatter field from a SKILL.md file
# Usage: extract_frontmatter "field" "file"
extract_frontmatter() {
    local field="$1"
    local file="$2"
    sed -n "/^---$/,/^---$/{ s/^${field}:[[:space:]]*//p; }" "$file" | head -1
}

# Generate a Claude wrapper that points to the canonical skill
generate_claude_wrapper() {
    local skill_path="$1"
    local dest="$2"

    cat > "$dest" << WRAPPER
Follow the instructions in ${skill_path}

Additional user context: \$ARGUMENTS
WRAPPER
}

# Generate a Copilot wrapper that points to the canonical skill
generate_copilot_wrapper() {
    local skill_path="$1"
    local skill_name="$2"
    local skill_description="$3"
    local dest="$4"

    cat > "$dest" << WRAPPER
---
mode: "agent"
description: "${skill_description}"
---

Follow the instructions defined in [${skill_name} skill](${skill_path}).

If the user provides additional context, incorporate it.
WRAPPER
}

install_skills() {
    local src_skills_dir="$INSTALL_DIR/src/skills"

    if [[ ! -d "$src_skills_dir" ]]; then
        log_warning "No skills directory found in repository"
        return 0
    fi

    # Reset registry skills (preserve version)
    local tmp
    tmp=$(mktemp)
    if command -v jq &> /dev/null; then
        jq '.skills = {"claude":[],"copilot":[]}' "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
    else
        echo "{\"version\":\"$(get_version)\",\"skills\":{\"claude\":[],\"copilot\":[]}}" > "$REGISTRY_FILE"
    fi

    # Ensure canonical skills directory exists
    mkdir -p "$SKILLS_DIR"

    for skill_dir in "$src_skills_dir"/*/; do
        if [[ ! -d "$skill_dir" ]]; then continue; fi
        if [[ ! -f "$skill_dir/SKILL.md" ]]; then continue; fi

        local skill_name
        skill_name=$(basename "$skill_dir")

        # 1. Copy canonical skill to ~/.oh-my-skills/skills/<name>.md
        local canonical_path="$SKILLS_DIR/$skill_name.md"
        cp "$skill_dir/SKILL.md" "$canonical_path"
        log_success "Installed canonical skill '$skill_name' → $canonical_path"

        # Extract frontmatter for wrapper generation
        local skill_description
        skill_description=$(extract_frontmatter "description" "$canonical_path")

        # 2. Generate LLM-specific wrappers
        # Claude wrapper
        if command -v claude &> /dev/null; then
            local claude_dir="$HOME/.claude/skills"
            local claude_dest="$claude_dir/$skill_name.md"
            mkdir -p "$claude_dir"
            generate_claude_wrapper "$canonical_path" "$claude_dest"
            log_success "Created Claude wrapper '$skill_name' → $claude_dest"

            local tmp
            tmp=$(mktemp)
            if command -v jq &> /dev/null; then
                jq --arg p "$claude_dest" '.skills.claude += [$p]' "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
            else
                sed -i.bak "s|\"claude\":\\[|\"claude\":[\"$claude_dest\",|" "$REGISTRY_FILE"
                sed -i.bak 's/,]/]/' "$REGISTRY_FILE"
                rm -f "$REGISTRY_FILE.bak"
            fi
        fi

        # Copilot wrapper
        if command -v copilot &> /dev/null; then
            local copilot_dir="$HOME/.copilot/skills"
            local copilot_dest="$copilot_dir/$skill_name.prompt.md"
            mkdir -p "$copilot_dir"
            generate_copilot_wrapper "$canonical_path" "$skill_name" "$skill_description" "$copilot_dest"
            log_success "Created Copilot wrapper '$skill_name' → $copilot_dest"

            local tmp
            tmp=$(mktemp)
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

    mkdir -p "$COMMANDS_DIR"

    # Copy only .sh files, preserving directory structure.
    # Supports both flat (commands/name.sh) and nested (commands/name/file.sh) layouts.
    while IFS= read -r -d '' sh_file; do
        local rel_path="${sh_file#"$src_commands_dir"/}"
        local dest="$COMMANDS_DIR/$rel_path"
        mkdir -p "$(dirname "$dest")"
        cp "$sh_file" "$dest"
        chmod +x "$dest"
    done < <(find "$src_commands_dir" -type f -name "*.sh" -print0)

    log_success "Commands copied to $COMMANDS_DIR"
}

# mode: "install" (default) or "update"
create_shell_sourcing() {
    local mode="${1:-install}"

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

    if [[ "$mode" == "update" ]]; then
        log_success "Shell sourcing script updated"
    else
        log_success "Shell sourcing script created"
    fi
}

# mode: "install" (default) or "update"
# In "update" mode, silently skips if sourcing is already present
inject_sourcing() {
    local user_shell="$1"
    local mode="${2:-install}"
    local shell_config

    if [[ "$user_shell" == "zsh" ]]; then
        shell_config="$HOME/.zshrc"
    else
        shell_config="$HOME/.bashrc"
    fi

    local source_line="source \"$SHELL_FILE\" # oh-my-skills"

    if grep -q "oh-my-skills" "$shell_config" 2>/dev/null; then
        if [[ "$mode" == "install" ]]; then
            log_warning "Sourcing already present in $shell_config"
        fi
        return 0
    fi

    echo "" >> "$shell_config"
    echo "$source_line" >> "$shell_config"
    log_success "Added sourcing to $shell_config"
}

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

# Source of truth for the current release tag.
# Note: each script also has a _OMS_BOOTSTRAP_TAG for the curl|bash case
# (chicken-and-egg: need the tag to download lib.sh, but tag lives here).
# The release workflow patches both locations.
DEFAULT_TAG="v0.1.13"

# ─── Colors — AI Neon palette ─────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Log helpers ──────────────────────────────────────────────────────────────

log_info()    { echo -e "  ${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "  ${GREEN}✓${NC} $1"; }
log_warning() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "  ${RED}✗${NC} $1" >&2; }

# ─── UI components ────────────────────────────────────────────────────────────

# Step counter state
_OMS_STEP_CURRENT=0
_OMS_STEP_TOTAL=0

# Initialize the step counter
# Usage: init_steps <total>
init_steps() {
    _OMS_STEP_TOTAL="$1"
    _OMS_STEP_CURRENT=0
}

# Print a numbered step header
# Usage: print_step "Doing something..."
print_step() {
    _OMS_STEP_CURRENT=$(( _OMS_STEP_CURRENT + 1 ))
    echo ""
    echo -e "  ${MAGENTA}[${_OMS_STEP_CURRENT}/${_OMS_STEP_TOTAL}]${NC} ${BOLD}$1${NC}"
}

# Print the oh-my-skills banner
# Usage: print_banner
print_banner() {
    echo ""
    echo -e "  ${DIM}${MAGENTA}╭───────────────────────────────────────╮${NC}"
    echo -e "  ${DIM}${MAGENTA}│${NC}                                       ${DIM}${MAGENTA}│${NC}"
    echo -e "  ${DIM}${MAGENTA}│${NC}   ${CYAN}${BOLD}⚡ oh-my-skills${NC}                      ${DIM}${MAGENTA}│${NC}"
    echo -e "  ${DIM}${MAGENTA}│${NC}   ${MAGENTA}AI-powered skills for your shell${NC}    ${DIM}${MAGENTA}│${NC}"
    echo -e "  ${DIM}${MAGENTA}│${NC}                                       ${DIM}${MAGENTA}│${NC}"
    echo -e "  ${DIM}${MAGENTA}╰───────────────────────────────────────╯${NC}"
}

# Print a subtitle under the banner
# Usage: print_subtitle "Installing..."
print_subtitle() {
    echo -e "  ${DIM}$1${NC}"
}

# Internal: draw a bordered box with colored border
# Usage: _print_box <color> <title_prefix> <title_pad> <title> [body_lines...]
_print_box() {
    local color="$1" prefix="$2" title_pad="$3" title="$4"
    shift 4

    echo ""
    echo -e "  ${DIM}${color}╭───────────────────────────────────────╮${NC}"
    echo -e "  ${DIM}${color}│${NC}                                       ${DIM}${color}│${NC}"
    echo -e "  ${DIM}${color}│${NC}  ${color}${BOLD}${prefix}${title}${NC}$(printf '%*s' $(( title_pad - ${#title} )) '')${DIM}${color}│${NC}"

    while [[ $# -gt 0 ]]; do
        local line="$1"
        shift
        echo -e "  ${DIM}${color}│${NC}  ${DIM}${line}${NC}$(printf '%*s' $(( 37 - ${#line} )) '')${DIM}${color}│${NC}"
    done

    echo -e "  ${DIM}${color}│${NC}                                       ${DIM}${color}│${NC}"
    echo -e "  ${DIM}${color}╰───────────────────────────────────────╯${NC}"
    echo ""
}

# Public box helpers (preserve existing call signatures and exact padding)
# Usage: print_success_box "Installation Complete!" "v0.1.3" "Restart your terminal or run:" "source ~/.bashrc"
print_success_box() { _print_box "$GREEN" "✓ " 36 "$@"; }
print_info_box()    { _print_box "$CYAN" "" 37 "$@"; }
print_goodbye_box() { _print_box "$MAGENTA" "" 37 "$@"; }

# ─── Core helpers ─────────────────────────────────────────────────────────────

confirm() {
    local prompt="$1"
    local response
    read -p "$(echo -e "  ${MAGENTA}?${NC}") $prompt (y/n) " response
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

# Get the shell config file path for a given shell
# Usage: get_shell_config "zsh" → /root/.zshrc
get_shell_config() {
    local user_shell="$1"
    if [[ "$user_shell" == "zsh" ]]; then
        echo "$HOME/.zshrc"
    else
        echo "$HOME/.bashrc"
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

# Read all skill paths from the registry (claude + copilot)
# Usage: registry_read_paths → one path per line
registry_read_paths() {
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        return 0
    fi
    if command -v jq &> /dev/null; then
        jq -r '.skills.claude[]?, .skills.copilot[]?' "$REGISTRY_FILE" 2>/dev/null
    else
        grep -oE '"(/[^"]+)"' "$REGISTRY_FILE" 2>/dev/null | tr -d '"'
    fi
}

# Append a skill path to the registry for a given LLM
# Usage: registry_append_path "claude" "/path/to/SKILL.md"
registry_append_path() {
    local llm="$1"
    local path="$2"
    local tmp
    tmp=$(mktemp)
    if command -v jq &> /dev/null; then
        jq --arg p "$path" ".skills.${llm} += [\$p]" "$REGISTRY_FILE" > "$tmp" && mv "$tmp" "$REGISTRY_FILE"
    else
        sed -i.bak "s|\"${llm}\":\\[|\"${llm}\":[\"${path}\",|" "$REGISTRY_FILE"
        sed -i.bak 's/,]/]/' "$REGISTRY_FILE"
        rm -f "$REGISTRY_FILE.bak"
    fi
}

# Extract a YAML frontmatter field from a SKILL.md file
# Usage: extract_frontmatter "field" "file"
extract_frontmatter() {
    local field="$1"
    local file="$2"
    sed -n "/^---$/,/^---$/{ s/^${field}:[[:space:]]*//p; }" "$file" | head -1
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

# Remove everything except runtime-required files from the install directory.
# Called after clone/pull to keep the install directory lean.
clean_dev_files() {
    # Safety: abort if INSTALL_DIR is empty or root-like
    if [[ -z "$INSTALL_DIR" || "$INSTALL_DIR" == "/" || "$INSTALL_DIR" == "$HOME" ]]; then
        log_warning "Skipping clean_dev_files: INSTALL_DIR is unsafe ('$INSTALL_DIR')"
        return 0
    fi

    # Allowlist: only these top-level entries are needed at runtime.
    # src/ is intentionally excluded — consumed by install_skills/install_commands before this runs.
    local -a keep=(.git scripts skills commands shell registry.json package.json .update-cache)

    for entry in "$INSTALL_DIR"/* "$INSTALL_DIR"/.*; do
        local base
        base=$(basename "$entry")
        [[ "$base" == "." || "$base" == ".." ]] && continue

        local allowed=0
        for k in "${keep[@]}"; do
            [[ "$base" == "$k" ]] && { allowed=1; break; }
        done

        if [[ $allowed -eq 0 ]]; then
            rm -rf "$entry"
        fi
    done
}

# Remove all installed skills (canonical + LLM symlinks/wrappers) for a clean reinstall.
# Usage: clean_installed_skills [--safe]
#   --safe: verify each path belongs to oh-my-skills before removing (used by uninstall)
clean_installed_skills() {
    local safe=false
    [[ "${1:-}" == "--safe" ]] && safe=true

    # Remove canonical skills (always safe — it's our directory)
    if [[ -d "$SKILLS_DIR" ]]; then
        rm -rf "$SKILLS_DIR"
    fi

    # Remove LLM wrappers/symlinks tracked by the registry
    local paths
    paths=$(registry_read_paths)

    while IFS= read -r path; do
        [[ -z "$path" ]] && continue
        local dir
        dir="$(dirname "$path")"

        if [[ -L "$dir" ]]; then
            # Symlink (Claude) — verify target if safe mode
            if [[ "$safe" == true ]] && ! readlink "$dir" | grep -q "oh-my-skills/skills/"; then
                continue
            fi
            rm -f "$dir"
            if [[ "$safe" == true ]]; then
                log_success "Removed Claude skill: $(basename "$dir")"
            fi
        elif [[ -f "$path" ]]; then
            # Wrapper file (Copilot or legacy Claude)
            if [[ "$safe" == true ]] && ! grep -q "oh-my-skills/skills/" "$path" 2>/dev/null; then
                continue
            fi
            rm -f "$path"
            if [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir")" ]]; then
                rmdir "$dir"
            fi
            if [[ "$safe" == true ]]; then
                log_success "Removed Copilot wrapper: $(basename "$path")"
            fi
        fi
    done <<< "$paths"
}

install_skills() {
    local src_skills_dir="$INSTALL_DIR/src/skills"

    if [[ ! -d "$src_skills_dir" ]]; then
        log_warning "No skills directory found in repository"
        return 0
    fi

    # Clean slate: read registry to know what to remove, then wipe and reinstall
    clean_installed_skills
    init_registry

    # Ensure canonical skills directory exists
    mkdir -p "$SKILLS_DIR"

    for skill_dir in "$src_skills_dir"/*/; do
        if [[ ! -d "$skill_dir" ]]; then continue; fi
        if [[ ! -f "$skill_dir/SKILL.md" ]]; then continue; fi

        local skill_name
        skill_name=$(basename "$skill_dir")

        # 1. Copy canonical skill directory to ~/.oh-my-skills/skills/<name>/
        local canonical_dir="$SKILLS_DIR/$skill_name"
        local canonical_path="$canonical_dir/SKILL.md"
        mkdir -p "$canonical_dir"
        cp "$skill_dir/SKILL.md" "$canonical_path"
        # Copy references/ and other subdirectories if present
        for subdir in "$skill_dir"/*/; do
            if [[ -d "$subdir" ]]; then
                cp -r "$subdir" "$canonical_dir/"
            fi
        done
        log_success "Installed canonical skill '${CYAN}$skill_name${NC}'"

        # Extract frontmatter for wrapper generation
        local skill_description
        skill_description=$(extract_frontmatter "description" "$canonical_path")

        # 2. Create LLM-specific links/wrappers
        # Claude: symlink to canonical skill directory
        if command -v claude &> /dev/null; then
            local claude_link="$HOME/.claude/skills/$skill_name"
            mkdir -p "$HOME/.claude/skills"
            ln -sfn "$canonical_dir" "$claude_link"
            log_success "Linked Claude skill '${CYAN}$skill_name${NC}'"

            local claude_dest="$claude_link/SKILL.md"
            registry_append_path "claude" "$claude_dest"
        fi

        # Copilot: wrapper file (needs specific YAML frontmatter)
        if command -v copilot &> /dev/null; then
            local copilot_dir="$HOME/.copilot/skills"
            local copilot_dest="$copilot_dir/$skill_name.prompt.md"
            mkdir -p "$copilot_dir"
            generate_copilot_wrapper "$canonical_path" "$skill_name" "$skill_description" "$copilot_dest"
            log_success "Created Copilot wrapper '${CYAN}$skill_name${NC}'"

            registry_append_path "copilot" "$copilot_dest"
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
    shell_config=$(get_shell_config "$user_shell")

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

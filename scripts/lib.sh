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
HOOKS_DIR="$INSTALL_DIR/hooks"
CLAUDE_SETTINGS_FILE="$HOME/.claude/settings.json"

# Source of truth for the current release tag.
# Note: each script also has a _OMS_BOOTSTRAP_TAG for the curl|bash case
# (chicken-and-egg: need the tag to download lib.sh, but tag lives here).
# The release workflow patches both locations.
DEFAULT_TAG="" # Source of truth for the current release tag.

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
    echo "{\"version\":\"$version\",\"skills\":{\"claude\":[],\"copilot\":[]},\"hooks\":{\"enabled\":[]}}" > "$REGISTRY_FILE"
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

# Write complete skill lists to the registry (replaces init + N appends)
# Usage: registry_write_skills "claude_path1|claude_path2" "copilot_path1|copilot_path2"
registry_write_skills() {
    local claude_paths="$1"
    local copilot_paths="$2"
    local version
    version=$(get_version)

    if command -v jq &> /dev/null; then
        local claude_json="[]"
        local copilot_json="[]"
        if [[ -n "$claude_paths" ]]; then
            claude_json=$(echo "$claude_paths" | tr '|' '\n' | jq -R . | jq -s .)
        fi
        if [[ -n "$copilot_paths" ]]; then
            copilot_json=$(echo "$copilot_paths" | tr '|' '\n' | jq -R . | jq -s .)
        fi
        local hooks_json='{"enabled":[]}'
        if [[ -f "$REGISTRY_FILE" ]]; then
            hooks_json=$(jq -c '.hooks // {"enabled":[]}' "$REGISTRY_FILE" 2>/dev/null || echo '{"enabled":[]}')
        fi
        jq -n --arg v "$version" --argjson c "$claude_json" --argjson p "$copilot_json" --argjson h "$hooks_json" \
            '{"version":$v,"skills":{"claude":$c,"copilot":$p},"hooks":$h}' > "$REGISTRY_FILE"
    else
        # Without jq: build JSON manually
        local claude_arr=""
        if [[ -n "$claude_paths" ]]; then
            claude_arr=$(echo "$claude_paths" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        fi
        local copilot_arr=""
        if [[ -n "$copilot_paths" ]]; then
            copilot_arr=$(echo "$copilot_paths" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        fi
        local hooks_field='"hooks":{"enabled":[]}'
        if [[ -f "$REGISTRY_FILE" ]]; then
            local existing_hooks
            existing_hooks=$(sed -n 's/.*\("hooks":{[^}]*}\).*/\1/p' "$REGISTRY_FILE" 2>/dev/null | head -1)
            [[ -n "$existing_hooks" ]] && hooks_field="$existing_hooks"
        fi
        echo "{\"version\":\"$version\",\"skills\":{\"claude\":[${claude_arr}],\"copilot\":[${copilot_arr}]},${hooks_field}}" > "$REGISTRY_FILE"
    fi
}

# Read enabled hook names from the registry, one per line.
# Usage: registry_read_enabled_hooks
registry_read_enabled_hooks() {
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        return 0
    fi
    if command -v jq &> /dev/null; then
        jq -r '.hooks.enabled[]?' "$REGISTRY_FILE" 2>/dev/null
    else
        sed -n 's/.*"enabled"[[:space:]]*:[[:space:]]*\[\(.*\)\].*/\1/p' "$REGISTRY_FILE" 2>/dev/null \
            | tr ',' '\n' | tr -d '" ' | grep -v '^$'
    fi
}

# Add a hook name to the registry's enabled list (idempotent). Requires jq.
# Usage: registry_add_enabled_hook "handoff"
registry_add_enabled_hook() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for registry_add_enabled_hook"
        return 1
    fi
    local name="$1"
    local tmp
    tmp=$(mktemp)
    if ! jq -c --arg n "$name" '.hooks.enabled = ((.hooks.enabled // []) + [$n] | unique)' "$REGISTRY_FILE" > "$tmp"; then
        rm -f "$tmp"
        log_error "Failed to update registry with jq"
        return 1
    fi
    mv "$tmp" "$REGISTRY_FILE"
}

# Remove a hook name from the registry's enabled list. Requires jq.
# Usage: registry_remove_enabled_hook "handoff"
registry_remove_enabled_hook() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for registry_remove_enabled_hook"
        return 1
    fi
    local name="$1"
    local tmp
    tmp=$(mktemp)
    if ! jq -c --arg n "$name" '.hooks.enabled = ((.hooks.enabled // []) - [$n])' "$REGISTRY_FILE" > "$tmp"; then
        rm -f "$tmp"
        log_error "Failed to update registry with jq"
        return 1
    fi
    mv "$tmp" "$REGISTRY_FILE"
}

# Merge a hook entry into ~/.claude/settings.json (idempotent — replaces any
# existing entry with the same command). Requires jq. Never touches entries
# for OTHER commands, including hooks the user configured themselves.
# Usage: settings_merge_hook <event> <matcher> <command> <timeout>
settings_merge_hook() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for settings_merge_hook"
        return 1
    fi
    local event="$1" matcher="$2" command="$3" timeout="$4"

    mkdir -p "$(dirname "$CLAUDE_SETTINGS_FILE")"

    # If the file doesn't exist yet, feed jq an in-memory '{}' seed instead of
    # writing directly to $CLAUDE_SETTINGS_FILE — the file itself is only ever
    # written via the tmp+mv below, so a jq failure never touches it.
    local src="$CLAUDE_SETTINGS_FILE"
    local seed=""
    if [[ ! -f "$CLAUDE_SETTINGS_FILE" ]]; then
        seed=$(mktemp)
        echo '{}' > "$seed"
        src="$seed"
    fi

    if ! jq empty "$src" 2>/dev/null; then
        rm -f "$seed"
        log_error "$CLAUDE_SETTINGS_FILE contains invalid JSON — fix it manually before enabling hooks"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    # NOTE: ".hooks" at the top level is the settings.json hooks map; the inner
    # ".hooks" (inside each matcher-group object) is that group's own command
    # list — same field name, two different levels of the schema. Strip the
    # matching command from WITHIN each group's .hooks array (not the whole
    # group) so co-located hooks the user configured themselves survive; only
    # drop a group once its .hooks array is left empty.
    if ! jq --arg event "$event" --arg matcher "$matcher" --arg cmd "$command" --argjson timeout "$timeout" '
        .hooks[$event] = ((.hooks[$event] // [])
            | map(.hooks |= map(select(.command != $cmd)))
            | map(select((.hooks // []) | length > 0))
            + [{matcher: $matcher, hooks: [{type: "command", command: $cmd, timeout: $timeout}]}])
    ' "$src" > "$tmp"; then
        rm -f "$tmp" "$seed"
        log_error "Failed to update $CLAUDE_SETTINGS_FILE with jq"
        return 1
    fi
    rm -f "$seed"
    mv "$tmp" "$CLAUDE_SETTINGS_FILE"
}

# Remove any hook entry matching <command> under <event> from
# ~/.claude/settings.json. Requires jq. Success no-op if the file is absent.
# Usage: settings_remove_hook <event> <command>
settings_remove_hook() {
    if [[ ! -f "$CLAUDE_SETTINGS_FILE" ]]; then
        return 0
    fi
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for settings_remove_hook"
        return 1
    fi
    local event="$1" command="$2"

    if ! jq empty "$CLAUDE_SETTINGS_FILE" 2>/dev/null; then
        log_error "$CLAUDE_SETTINGS_FILE contains invalid JSON — fix it manually"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    # Strip the matching command from WITHIN each group's .hooks array (not
    # the whole group), so co-located hooks the user configured themselves
    # survive; only drop a group once its .hooks array is left empty.
    if ! jq --arg event "$event" --arg cmd "$command" '
        if (.hooks[$event]? // null) == null then .
        else .hooks[$event] = (.hooks[$event]
            | map(.hooks |= map(select(.command != $cmd)))
            | map(select((.hooks // []) | length > 0)))
        end
    ' "$CLAUDE_SETTINGS_FILE" > "$tmp"; then
        rm -f "$tmp"
        log_error "Failed to update $CLAUDE_SETTINGS_FILE with jq"
        return 1
    fi
    mv "$tmp" "$CLAUDE_SETTINGS_FILE"
}

# List canonical hook names available under HOOKS_DIR, one per line.
# Usage: hooks_list_available
hooks_list_available() {
    if [[ ! -d "$HOOKS_DIR" ]]; then
        return 0
    fi
    for hook_dir in "$HOOKS_DIR"/*/; do
        if [[ ! -d "$hook_dir" ]]; then continue; fi
        if [[ ! -f "$hook_dir/hook.json" ]]; then continue; fi
        basename "$hook_dir"
    done
}

# Register a canonical hook into ~/.claude/settings.json and the registry.
# Usage: hook_enable <name>
hook_enable() {
    local name="$1"
    local hook_dir="$HOOKS_DIR/$name"
    local meta="$hook_dir/hook.json"

    if [[ ! -f "$meta" ]]; then
        log_error "Unknown hook '$name' (no $meta — run 'oms update' first?)"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        log_error "jq is required to enable hooks (safe settings.json editing). Install jq and try again."
        return 1
    fi

    local event matcher timeout command
    event=$(jq -r '.event' "$meta")
    matcher=$(jq -r '.matcher // "*"' "$meta")
    timeout=$(jq -r '.timeout // 10' "$meta")
    command="$hook_dir/hook.sh"

    if [[ ! -x "$command" ]]; then
        log_error "Hook script not found or not executable: $command"
        return 1
    fi

    settings_merge_hook "$event" "$matcher" "$command" "$timeout" || return 1
    registry_add_enabled_hook "$name" || return 1
    log_success "Enabled hook '${CYAN}$name${NC}' on ${event}"
}

# Remove a hook's registration from ~/.claude/settings.json and the registry.
# Usage: hook_disable <name>
hook_disable() {
    local name="$1"
    local hook_dir="$HOOKS_DIR/$name"
    local meta="$hook_dir/hook.json"

    if [[ ! -f "$meta" ]]; then
        log_error "Unknown hook '$name' (no $meta)"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        log_error "jq is required to disable hooks (safe settings.json editing). Install jq and try again."
        return 1
    fi

    local event command
    event=$(jq -r '.event' "$meta")
    command="$hook_dir/hook.sh"

    settings_remove_hook "$event" "$command" || return 1
    registry_remove_enabled_hook "$name" || return 1
    log_success "Disabled hook '${CYAN}$name${NC}'"
}

# Disable every currently-enabled hook. Used by uninstall.sh before the
# install directory (and therefore every hook script) is deleted. Tolerates
# missing jq by skipping settings.json cleanup — the target script is about
# to be deleted anyway, so a dangling command entry is harmless (it will
# simply fail with "file not found" and be treated as a non-blocking error
# by Claude Code if ever invoked).
# Usage: disable_all_hooks
disable_all_hooks() {
    local enabled
    enabled=$(registry_read_enabled_hooks)

    if [[ -z "$enabled" ]]; then
        return 0
    fi

    if ! command -v jq &> /dev/null; then
        log_warning "jq not available — leaving hook entries in $CLAUDE_SETTINGS_FILE (they will simply no-op)"
        return 0
    fi

    local name
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        hook_disable "$name" || true
    done <<< "$enabled"
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
    if [[ -z "$INSTALL_DIR" || "$INSTALL_DIR" == "/" || "$INSTALL_DIR" == "$HOME" ]]; then
        log_warning "Skipping clean_dev_files: INSTALL_DIR is unsafe ('$INSTALL_DIR')"
        return 0
    fi

    for entry in "$INSTALL_DIR"/* "$INSTALL_DIR"/.*; do
        local base
        base=$(basename "$entry")

        case "$base" in
            .|..|.git|scripts|skills|commands|hooks|shell|registry.json|.update-cache)
                continue
                ;;
        esac

        rm -rf "$entry"
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
        # Registry creation must not depend on skills existing — install_hooks
        # (and therefore hook_enable/hook_disable) relies on $REGISTRY_FILE
        # being present regardless of whether this repo ships any skills.
        # Only create it if missing: src/skills can be transiently absent on
        # a reinstall (clean_dev_files wipes it, and a no-op `git pull` won't
        # restore it), and unconditionally rewriting here would wipe out
        # skills.claude/copilot paths a previous run already tracked.
        if [[ ! -f "$REGISTRY_FILE" ]]; then
            registry_write_skills "" ""
        fi
        return 0
    fi

    # Clean slate: read registry to know what to remove, then wipe
    clean_installed_skills

    # Ensure canonical skills directory exists
    mkdir -p "$SKILLS_DIR"

    # Accumulate registry paths (pipe-separated)
    local claude_paths=""
    local copilot_paths=""

    for skill_dir in "$src_skills_dir"/*/; do
        if [[ ! -d "$skill_dir" ]]; then continue; fi
        if [[ ! -f "$skill_dir/SKILL.md" ]]; then continue; fi

        local skill_name
        skill_name=$(basename "$skill_dir")

        # 1. Copy canonical skill directory
        local canonical_dir="$SKILLS_DIR/$skill_name"
        local canonical_path="$canonical_dir/SKILL.md"
        mkdir -p "$canonical_dir"
        cp "$skill_dir/SKILL.md" "$canonical_path"
        for subdir in "$skill_dir"/*/; do
            if [[ -d "$subdir" ]]; then
                cp -r "$subdir" "$canonical_dir/"
            fi
        done
        log_success "Installed canonical skill '${CYAN}$skill_name${NC}'"

        local skill_description
        skill_description=$(extract_frontmatter "description" "$canonical_path")

        # 2. Claude symlink
        if command -v claude &> /dev/null; then
            local claude_link="$HOME/.claude/skills/$skill_name"
            mkdir -p "$HOME/.claude/skills"
            ln -sfn "$canonical_dir" "$claude_link"
            log_success "Linked Claude skill '${CYAN}$skill_name${NC}'"

            local claude_dest="$claude_link/SKILL.md"
            if [[ -n "$claude_paths" ]]; then
                claude_paths="${claude_paths}|${claude_dest}"
            else
                claude_paths="$claude_dest"
            fi
        fi

        # 3. Copilot wrapper
        if command -v copilot &> /dev/null; then
            local copilot_dir="$HOME/.copilot/skills"
            local copilot_dest="$copilot_dir/$skill_name.prompt.md"
            mkdir -p "$copilot_dir"
            generate_copilot_wrapper "$canonical_path" "$skill_name" "$skill_description" "$copilot_dest"
            log_success "Created Copilot wrapper '${CYAN}$skill_name${NC}'"

            if [[ -n "$copilot_paths" ]]; then
                copilot_paths="${copilot_paths}|${copilot_dest}"
            else
                copilot_paths="$copilot_dest"
            fi
        fi
    done

    # Write registry once with all accumulated paths
    registry_write_skills "$claude_paths" "$copilot_paths"
    log_success "Registry initialized (v$(get_version))"
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

install_hooks() {
    local src_hooks_dir="$INSTALL_DIR/src/hooks"

    if [[ ! -d "$src_hooks_dir" ]]; then
        log_warning "No hooks directory found in repository"
        return 0
    fi

    mkdir -p "$HOOKS_DIR"

    for hook_dir in "$src_hooks_dir"/*/; do
        if [[ ! -d "$hook_dir" ]]; then continue; fi
        if [[ ! -f "$hook_dir/hook.json" ]]; then continue; fi

        local hook_name
        hook_name=$(basename "$hook_dir")
        local dest="$HOOKS_DIR/$hook_name"
        mkdir -p "$dest"
        cp "$hook_dir/hook.json" "$dest/hook.json"
        if [[ -f "$hook_dir/hook.sh" ]]; then
            cp "$hook_dir/hook.sh" "$dest/hook.sh"
            chmod +x "$dest/hook.sh"
        fi
        log_success "Installed canonical hook '${CYAN}$hook_name${NC}'"
    done
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

#!/bin/bash

# oh-my-skills hooks CLI — enable/disable/list Claude Code hooks.
# Unlike install.sh/uninstall.sh/update.sh, this script is never invoked via
# curl | bash — it only runs post-install via `oms hooks ...`, where lib.sh
# is always present beside it. No bootstrap duplication needed here.

set -euo pipefail

source "${BASH_SOURCE[0]%/*}/lib.sh"

usage() {
    cat <<'EOF'
Usage: oms hooks <command> [name]

Commands:
  list              List available hooks and their enabled status
  status            Alias for list
  enable <name>     Register a hook in ~/.claude/settings.json
  disable <name>    Remove a hook from ~/.claude/settings.json

Options:
  --help            Show this help message
EOF
}

print_status() {
    local available
    available=$(hooks_list_available)

    if [[ -z "$available" ]]; then
        log_warning "No hooks installed"
        return 0
    fi

    local enabled
    enabled=$(registry_read_enabled_hooks)

    local hook_name
    while IFS= read -r hook_name; do
        [[ -z "$hook_name" ]] && continue
        if echo "$enabled" | grep -qx "$hook_name"; then
            log_success "$hook_name (enabled)"
        else
            log_info "$hook_name (disabled)"
        fi
    done <<< "$available"
}

main() {
    local command="${1:-list}"

    case "$command" in
        list|status)
            print_status
            ;;
        enable)
            local name="${2:-}"
            if [[ -z "$name" ]]; then
                log_error "Usage: oms hooks enable <name>"
                return 1
            fi
            hook_enable "$name"
            ;;
        disable)
            local name="${2:-}"
            if [[ -z "$name" ]]; then
                log_error "Usage: oms hooks disable <name>"
                return 1
            fi
            hook_disable "$name"
            ;;
        --help|-h|help)
            usage
            ;;
        *)
            log_error "Unknown hooks command: $command"
            usage
            return 1
            ;;
    esac
}

main "$@"

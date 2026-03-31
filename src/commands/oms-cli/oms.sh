#!/bin/bash

oms() {
    local install_dir="${HOME}/.oh-my-skills"
    local update_script="${install_dir}/scripts/update.sh"
    local command="${1:-help}"

    case "$command" in
        update)
            if [[ ! -f "$update_script" ]]; then
                echo "oh-my-skills update script not found at $update_script" >&2
                return 1
            fi

            shift
            bash "$update_script" --manual "$@"
            ;;
        version|--version|-v)
            local registry="$install_dir/registry.json"
            local version="unknown"
            if [[ -f "$registry" ]]; then
                if command -v jq &>/dev/null; then
                    version=$(jq -r '.version // "unknown"' "$registry")
                else
                    version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$registry" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
                fi
            fi
            echo "oh-my-skills v${version}"
            ;;
        help|""|--help)
            cat <<'EOF'
Usage: oms <command>

Commands:
  update      Update oh-my-skills to the latest version
  version     Show installed version
  help        Show this help message

Options:
  --help      Show this help message
  --version   Show installed version
EOF
            ;;
        *)
            echo "Unknown oms command: $command" >&2
            echo "Run 'oms --help' for usage." >&2
            return 1
            ;;
    esac
}

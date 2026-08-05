#!/bin/bash

# oh-my-skills handoff hook — UserPromptSubmit.
#
# Nudges Claude to suggest running /handoff once estimated context usage
# crosses a threshold. Claude Code hooks have no built-in token/context
# telemetry, so this is a best-effort estimate from the transcript's last
# recorded token usage — not the same number Claude Code's own UI shows.
#
# Portability note: only jq is used to parse the transcript (no tac/tail -r,
# which differ between macOS and the Alpine containers this project tests in).

set -euo pipefail

input="$(cat)"

if ! command -v jq &> /dev/null; then
    exit 0
fi

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null) || exit 0
session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null) || exit 0

if [[ -z "$transcript_path" || ! -f "$transcript_path" || -z "$session_id" ]]; then
    exit 0
fi

context_window="${OMS_HANDOFF_CONTEXT_WINDOW:-200000}"
threshold_pct="${OMS_HANDOFF_THRESHOLD:-70}"

usage_tokens=$(jq -s '
    [.[] | select(.message.usage != null)] | last
    | if . == null then 0
      else (.message.usage.input_tokens // 0)
         + (.message.usage.cache_read_input_tokens // 0)
         + (.message.usage.cache_creation_input_tokens // 0)
      end
' "$transcript_path" 2>/dev/null) || exit 0

if [[ -z "$usage_tokens" || "$usage_tokens" == "null" ]]; then
    exit 0
fi

pct=$(( usage_tokens * 100 / context_window ))

if [[ $pct -lt $threshold_pct ]]; then
    exit 0
fi

state_dir="$HOME/.oh-my-skills/hooks/.state"
mkdir -p "$state_dir" 2>/dev/null || exit 0
marker="$state_dir/handoff-nudged-${session_id}"

if [[ -f "$marker" ]]; then
    exit 0
fi
touch "$marker" 2>/dev/null || exit 0

jq -n --arg pct "$pct" '{
    hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: ("Context usage is estimated at around " + $pct + "% of the context window. If a natural checkpoint exists in the current work, consider proactively suggesting the user run /handoff to save session state before context gets compacted.")
    }
}'

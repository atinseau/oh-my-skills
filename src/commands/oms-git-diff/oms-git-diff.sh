#!/bin/bash

alias oms-gd='oms-git-diff'

oms-git-diff() {
    # Ensure we are inside a git repository
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        echo "oms-git-diff: not a git repository" >&2
        return 1
    fi

    local current
    current=$(git branch --show-current 2>/dev/null)

    if [[ -z "$current" ]]; then
        echo "oms-git-diff: detached HEAD state, cannot determine branch" >&2
        return 1
    fi

    # -----------------------------------------------------------
    # Step 1 — Determine branch type: integration vs feature
    # -----------------------------------------------------------
    local local_head remote_head branch_type
    local_head=$(git rev-parse HEAD)
    remote_head=$(git rev-parse "origin/$current" 2>/dev/null || echo "")

    if [[ -n "$remote_head" && "$local_head" == "$remote_head" ]]; then
        branch_type="integration"
    else
        branch_type="feature"
    fi

    # -----------------------------------------------------------
    # Step 2 — For feature branches, find the base branch
    # -----------------------------------------------------------
    local base_branch=""

    if [[ "$branch_type" == "feature" ]]; then

        # 2a. Check if an open PR already defines the base
        if command -v gh &>/dev/null; then
            base_branch=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null || echo "")
        fi

        # 2b. Closest parent heuristic
        if [[ -z "$base_branch" ]]; then
            local best_branch="" best_count=999999 best_depth=-1

            local ref branch mb count depth
            for ref in $(git branch -r --format='%(refname:short)'); do
                # skip refs that don't start with origin/ (e.g. bare "origin" from HEAD pointer)
                [[ "$ref" != origin/* ]] && continue
                branch="${ref#origin/}"
                # skip current branch and HEAD pointer
                [[ "$branch" == "$current" ]] && continue
                [[ "$branch" == "HEAD" ]] && continue

                mb=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
                count=$(git rev-list --count "$mb..HEAD")
                # depth = how far the merge-base is from root (higher = more recent)
                depth=$(git rev-list --count "$mb")

                if [[ "$count" -lt "$best_count" ]] || { [[ "$count" -eq "$best_count" ]] && [[ "$depth" -gt "$best_depth" ]]; }; then
                    best_count=$count
                    best_depth=$depth
                    best_branch=$branch
                fi
            done

            if [[ -n "$best_branch" ]]; then
                base_branch="$best_branch"
            fi
        fi

        # 2c. Fallback to remote default branch
        if [[ -z "$base_branch" ]]; then
            base_branch=$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "main")
            base_branch="${base_branch#origin/}"
        fi
    fi

    # -----------------------------------------------------------
    # Step 3 — Produce the diff (cascade, first non-empty wins)
    # -----------------------------------------------------------
    local diff_output=""

    # 3a. Commit diff (feature branches only)
    if [[ "$branch_type" == "feature" && -n "$base_branch" ]]; then
        local merge_base
        merge_base=$(git merge-base HEAD "origin/$base_branch" 2>/dev/null || echo "")
        if [[ -n "$merge_base" ]]; then
            diff_output=$(git diff "$merge_base..HEAD" 2>/dev/null)
        fi
    fi

    # 3b. Staged changes
    if [[ -z "$diff_output" ]]; then
        diff_output=$(git diff --staged 2>/dev/null)
    fi

    # 3c. Unstaged changes
    if [[ -z "$diff_output" ]]; then
        diff_output=$(git diff 2>/dev/null)
    fi

    # 3d. Nothing — silent exit
    if [[ -z "$diff_output" ]]; then
        return 0
    fi

    printf '%s\n' "$diff_output"
}

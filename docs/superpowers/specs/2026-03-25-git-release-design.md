# git-release — Skill Design

## Overview

A generic skill that orchestrates the full flow from PR creation to GitHub Release. It delegates PR work to `git-pr-flow`, waits for the PR to be merged, then creates a semver tag and a GitHub Release with auto-generated notes.

## Prerequisites

Same as `git-pr-flow`:
- Inside a git repository
- GitHub CLI installed and authenticated (`gh auth status`)
- Remote `origin` exists

## Workflow

### Step 1 — Call `git-pr-flow`

Invoke the `git-pr-flow` skill. It handles: branch creation, staging, committing, pushing, and PR creation (or update if a PR already exists). It returns the PR URL and PR number.

### Step 2 — Display PR link

Show the PR URL to the user and instruct them to review and merge it on GitHub.

### Step 3 — Poll for merge

Poll `gh pr view <PR_NUMBER> --json state -q '.state'` every **5 seconds** until the state is `MERGED`.

- **Timeout**: 15 minutes.
- **On timeout**: ask the user whether to continue waiting or abandon.

### Step 4 — Determine latest tag

After merge is confirmed:

```
git tag --list 'v*' --sort=-v:refname | head -1
```

Store as `LATEST_TAG`. If no tags exist, use `v0.0.0` as the base for version calculation (so the first proposed versions will be `v0.0.1` / `v0.1.0` / `v1.0.0`).

### Step 5 — Ask for version bump type

Present the user with three options computed from `LATEST_TAG`:

| Type  | Next version |
|-------|-------------|
| patch | `vX.Y.Z+1`  |
| minor | `vX.Y+1.0`  |
| major | `vX+1.0.0`  |

Wait for the user to choose. Store as `NEW_TAG`.

### Step 6 — Create tag and release

```bash
git checkout <DESTINATION_BRANCH>
git pull origin <DESTINATION_BRANCH>
git tag <NEW_TAG>
git push origin <NEW_TAG>
gh release create <NEW_TAG> --generate-notes
```

- `DESTINATION_BRANCH` comes from the `git-pr-flow` execution (Step 1 of that skill asks the user for it).
- No files are modified — version bumping is the responsibility of the target repo's CI.

### Step 7 — Done

Report a success summary:
- PR URL
- Tag created
- Release URL (returned by `gh release create`)

## Key Decisions

- **No file modifications**: the skill only creates a git tag and a GitHub Release. Any version bumping in `package.json`, `Cargo.toml`, etc. is delegated to the repo's CI pipeline.
- **Polling, not manual confirmation**: the skill automatically detects merge status without requiring the user to type "done".
- **Generic**: works on any repo regardless of language, framework, or CI setup.
- **Semver only**: tags must follow `vX.Y.Z` format.

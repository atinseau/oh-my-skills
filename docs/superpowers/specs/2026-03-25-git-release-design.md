# git-release — Skill Design

## Overview

A generic skill that orchestrates the full flow from PR creation to GitHub Release. It delegates PR work to `git-pr-flow`, waits for the PR to be merged, then creates a semver tag and a GitHub Release with auto-generated notes.

## Frontmatter

```yaml
---
name: git-release
description: Orchestrate a full release flow — PR creation via git-pr-flow, wait for merge, then tag and create a GitHub Release. Use when you want to ship a release.
by: oh-my-skills
---
```

## Prerequisites

Same as `git-pr-flow`:
- Inside a git repository
- GitHub CLI installed and authenticated (`gh auth status`)
- Remote `origin` exists

## Workflow

### Step 1 — Call `git-pr-flow`

Invoke the `git-pr-flow` skill. It handles: branch creation, staging, committing, pushing, and PR creation (or update if a PR already exists). It returns the PR URL and PR number.

### Step 2 — Display PR link and retrieve destination branch

Show the PR URL to the user and instruct them to review and merge it on GitHub.

Retrieve the destination branch from the PR:
```
gh pr view <PR_NUMBER> --json baseRefName -q '.baseRefName'
```
Store as `DESTINATION_BRANCH`.

### Step 3 — Poll for merge

Run a **single shell loop** that polls `gh pr view <PR_NUMBER> --json state -q '.state'` every **5 seconds**:

- If state is `MERGED` → exit loop, continue to Step 4.
- If state is `CLOSED` → abort and tell the user: "PR was closed without merging — release aborted."
- **Timeout**: 15 minutes (180 iterations).
- **On timeout**: ask the user whether to continue waiting or abandon.

### Step 4 — Determine latest tag

After merge is confirmed, fetch tags and find the latest semver tag:

```bash
git fetch --tags
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

First, check that the tag does not already exist:
```bash
git tag --list '<NEW_TAG>'
```
If it already exists, tell the user and ask how to proceed (skip tag creation, choose a different version, or abort).

Then create the tag and release:
```bash
git checkout <DESTINATION_BRANCH>
git pull origin <DESTINATION_BRANCH>
git tag <NEW_TAG>
git push origin <NEW_TAG>
gh release create <NEW_TAG> --generate-notes --notes-start-tag <LATEST_TAG>
```

- `--notes-start-tag <LATEST_TAG>` ensures release notes cover exactly the commits since the previous release.
- If `LATEST_TAG` is `v0.0.0` (synthetic, no actual tag exists), omit `--notes-start-tag` and let GitHub use its default.
- No files are modified — version bumping is the responsibility of the target repo's CI.

### Step 7 — Done

Report a success summary:
- PR URL
- Tag created
- Release URL (returned by `gh release create`)

## Key Decisions

- **No file modifications**: the skill only creates a git tag and a GitHub Release. Any version bumping in `package.json`, `Cargo.toml`, etc. is delegated to the repo's CI pipeline.
- **Polling via shell loop**: a single `while` loop in one shell command avoids consuming tokens on each iteration.
- **Detect CLOSED state**: if the PR is closed without merge, the flow aborts immediately instead of waiting until timeout.
- **Generic**: works on any repo regardless of language, framework, or CI setup.
- **Semver only**: tags must follow `vX.Y.Z` format. Pre-release tags are out of scope.

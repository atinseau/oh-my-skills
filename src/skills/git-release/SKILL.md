---
name: git-release
description: Orchestrate a full release flow — PR creation via git-pr-flow, wait for merge, then tag and create a GitHub Release. Use when you want to ship a release.
by: oh-my-skills
---

## Prerequisites

Before anything else, verify these requirements. If any check fails, stop and tell the user what is missing.

1. **Inside a git repository:** `git rev-parse --is-inside-work-tree`
2. **GitHub CLI installed and authenticated:** `gh auth status`
3. **Remote `origin` exists:** `git remote get-url origin`

---

## Quick Path — Tag-only release

If the user specifies that changes are already merged (e.g., "just tag", "skip PR", "already merged"), or if `git status --short` is clean and there are no unpushed commits:

1. Skip Steps 1–3 entirely.
2. Ask which branch to tag (default: the current branch).
3. Continue from Step 4 (Determine latest tag).

---

## Workflow

Execute all steps automatically without asking for confirmation, except where explicitly noted.

---

### Step 1 — Create the pull request

**Call the `git-pr-flow` skill.** It handles branch creation, staging, committing, pushing, and PR creation. Once it completes, capture the PR number and URL from its output.

Store as `PR_NUMBER` and `PR_URL`.

---

### Step 2 — Display PR link and retrieve destination branch

Show the PR URL to the user:

> "PR created: `<PR_URL>`. Please review and merge it on GitHub. I will automatically detect when it is merged."

Retrieve the destination branch:
```
gh pr view <PR_NUMBER> --json baseRefName -q '.baseRefName'
```
Store as `DESTINATION_BRANCH`.

---

### Step 3 — Wait for merge

Run a single shell loop that polls the PR state every 5 seconds:

```bash
elapsed=0; while [ $elapsed -lt 900 ]; do state=$(gh pr view <PR_NUMBER> --json state -q '.state' 2>/dev/null); if [ "$state" = "MERGED" ]; then echo "MERGED"; exit 0; elif [ "$state" = "CLOSED" ]; then echo "CLOSED"; exit 1; fi; sleep 15; elapsed=$((elapsed + 15)); done; echo "TIMEOUT"; exit 2
```

- If the output is `MERGED` → continue to Step 4.
- If the output is `CLOSED` → stop and tell the user: "PR was closed without merging — release aborted."
- If the output is `TIMEOUT` → ask the user whether to continue waiting (re-run the loop) or abandon.

---

### Step 4 — Determine latest tag

Fetch tags and find the latest semver tag:

```bash
git fetch --tags
git tag --list 'v*' --sort=-v:refname | head -1
```

Store as `LATEST_TAG`. If no tags exist, set `LATEST_TAG` to empty (this is the first release).

---

### Step 5 — Ask for version bump type

Parse `LATEST_TAG` into `MAJOR.MINOR.PATCH` components. If `LATEST_TAG` is empty, use `0.0.0` as the base.

**Ask the user** which bump type they want, showing the computed versions:

| Type  | Next version |
|-------|-------------|
| patch | `vMAJOR.MINOR.PATCH+1` |
| minor | `vMAJOR.MINOR+1.0` |
| major | `vMAJOR+1.0.0` |

Wait for the user to choose. Store as `NEW_TAG`.

---

### Step 5b — Verify version consistency

Check if a version-bearing manifest exists in the repository root:
```bash
cat package.json 2>/dev/null | grep '"version"' || cat Cargo.toml 2>/dev/null | grep '^version' || echo "NO_MANIFEST"
```

If a manifest is found, compare its version with `NEW_TAG` (without the `v` prefix):
- **Versions match** → continue.
- **Versions differ** → warn the user: "The manifest version (`<manifest_version>`) does not match the release tag (`<NEW_TAG>`). This may indicate the version was not bumped in code. Continue anyway?" Wait for confirmation before proceeding.

---

### Step 6 — Create tag and release

First, verify the tag does not already exist:
```bash
git tag --list '<NEW_TAG>'
```
If it already exists, tell the user and ask how to proceed (choose a different version or abort).

Before switching branches, verify the working tree is clean:
```bash
git status --short
```
If there are uncommitted changes, stash them (`git stash`) or ask the user how to proceed.

Then create the tag and release:
```bash
git checkout <DESTINATION_BRANCH>
git pull origin <DESTINATION_BRANCH>
git tag <NEW_TAG>
git push origin <NEW_TAG>
```

Create the GitHub Release:
- If `LATEST_TAG` is not empty (a previous release exists):
  ```
  gh release create <NEW_TAG> --generate-notes --notes-start-tag <LATEST_TAG>
  ```
- If `LATEST_TAG` is empty (first release):
  ```
  gh release create <NEW_TAG> --generate-notes
  ```

---

### Done

Report a success summary:
- PR URL
- Tag created
- Release URL (returned by `gh release create`)

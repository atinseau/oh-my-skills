---
name: git-pr-flow
description: Automate branch creation, commit, and pull request opening based on git diff context. Use when you want to commit work and open a pull request.
disable-model-invocation: true
by: oh-my-skills
---

## Workflow

Before starting, collect the current git context by running these commands:
- `git branch --show-current` — current branch
- `git status --short` — working tree status
- `git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'` — default remote branch (fallback: `main`)

Follow these steps in order. Always confirm with the user before executing any destructive or irreversible git operation.

---

### Step 1 — Identify the destination branch

Ask the user: **"What is the destination branch for your pull request?"**

- Default to the remote HEAD branch detected above (typically `main`, `master`, or `develop`).
- Let the user override if needed.

Store this as `DESTINATION_BRANCH`.

---

### Step 2 — Determine the feature branch

Ask the user: **"Are you already on the feature branch you want to open a PR for, or do we need to create a new branch from the current one?"**

- **Already on the feature branch** → skip to Step 4.
- **Need a new branch** (e.g., currently on `develop` with uncommitted work) → continue to Step 3.

---

### Step 3 — Create the feature branch

1. Get the diff between the working tree and `DESTINATION_BRANCH`:
   ```
   git diff DESTINATION_BRANCH
   ```
2. Analyze the diff to understand the scope and nature of the changes.
3. Suggest a branch name following these conventions:
   - Format: `<type>/<short-description>` in kebab-case
   - Types: `feature/`, `fix/`, `chore/`, `refactor/`, `docs/`, `test/`
   - Keep the description short and specific (2–5 words)
   - Examples: `feature/user-authentication`, `fix/login-redirect`, `chore/update-deps`
4. Show the suggestion and ask: **"Does this branch name look good? (or suggest a different one)"**
5. Once confirmed, create and switch to the branch:
   ```
   git checkout -b <confirmed-branch-name>
   ```

---

### Step 4 — Stage changes and craft the commit message

1. Stage all changes:
   ```
   git add -A
   ```
2. Get the staged diff to understand exactly what is being committed:
   ```
   git diff --staged
   ```
3. Write a commit message following the Conventional Commits specification:
   - Format: `<type>(<optional-scope>): <short imperative description>`
   - Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`
   - Subject line: max 72 characters, imperative mood ("add" not "added"), no trailing period
   - Add a body only if the change is genuinely complex or needs context
   - Examples:
     - `feat(auth): add OAuth2 login flow`
     - `fix(api): handle null response from user endpoint`
     - `chore: update Node.js to v20`
4. Show the proposed commit message and ask: **"Does this commit message look good?"**
5. Once confirmed, commit:
   ```
   git commit -m "<confirmed-message>"
   ```

---

### Step 5 — Push the branch

Push the branch and set the upstream tracking:
```
git push -u origin <branch-name>
```

---

### Step 6 — Open the pull request

1. Using the full diff against `DESTINATION_BRANCH` for context, write a PR description using this exact template:

```
## Summary

<!-- One or two sentences describing what this PR does and why. -->

## Changes

<!-- Bullet list of the notable changes. Be specific but concise. -->
-

## Testing

<!-- How to verify these changes: manual steps, automated tests, or both. -->

## Notes

<!-- Optional: breaking changes, migration steps, dependencies, or anything reviewers should know. Leave empty if nothing to add. -->
```

2. Derive the PR title from the commit message — it can be identical or slightly more descriptive.
3. Show the title and full description to the user and ask: **"Does this PR title and description look good?"**
4. Once confirmed, create the PR:
   ```
   gh pr create --base <DESTINATION_BRANCH> --title "<title>" --body "<description>"
   ```

---

### Done

Report a success summary showing:
- The branch name
- The commit message
- The PR URL returned by `gh pr create`

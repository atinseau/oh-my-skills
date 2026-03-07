---
name: git-pr-flow
description: Automate branch creation, commit, and pull request opening based on git diff context. Use when you want to commit work and open a pull request.
by: oh-my-skills
---

## Workflow

Before starting, collect the current git context by running these commands:
- `git branch --show-current` — current branch
- `git status --short` — working tree status
- `git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'` — default remote branch (fallback: `main`)

If `git status --short` returns nothing (clean working tree), stop immediately and tell the user: "Nothing to commit — your working tree is clean."

Execute all steps automatically without asking for confirmation, except where explicitly noted.

---

### Step 1 — Identify the destination branch

Use the remote HEAD branch detected above as `DESTINATION_BRANCH` (typically `main`, `master`, or `develop`). Do not ask the user.

---

### Step 2 — Check for an existing open PR

Now that `DESTINATION_BRANCH` is known, check if an open PR exists from the current branch **toward that exact destination**:
```
gh pr list --head <current-branch> --base <DESTINATION_BRANCH> --state open --json number,title,url 2>/dev/null
```

- **A matching PR exists** → this is an **update flow**. Skip to [Update Flow](#update-flow).
- **No matching PR** → this is a **create flow**. Continue to Step 3.

---

### Step 3 — Determine the feature branch

Infer automatically:
- If the current branch is `DESTINATION_BRANCH` (e.g. `master`, `main`) → a new branch must be created. Continue to Step 4.
- If the current branch is already a feature branch → skip to Step 5.

---

### Step 4 — Create the feature branch

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
4. **Ask the user:** "Does this branch name look good? (or suggest a different one)"
5. Once confirmed, create and switch to the branch:
   ```
   git checkout -b <confirmed-branch-name>
   ```

---

### Step 5 — Stage changes and commit

1. Stage all changes:
   ```
   git add -A
   ```
2. Get the staged diff:
   ```
   git diff --staged
   ```
3. Write a commit message following the Conventional Commits specification:
   - Format: `<type>(<optional-scope>): <short imperative description>`
   - Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`
   - Subject line: max 72 characters, imperative mood ("add" not "added"), no trailing period
   - Add a body only if the change is genuinely complex or needs context
4. Commit immediately without asking for confirmation:
   ```
   git commit -m "<message>"
   ```

---

### Step 6 — Push the branch

```
git push -u origin <branch-name>
```

---

### Step 7 — Open the pull request

1. Using the full diff against `DESTINATION_BRANCH`, write a PR description:

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

2. Derive the PR title from the commit message.
3. Create the PR immediately without asking for confirmation:
   ```
   gh pr create --base <DESTINATION_BRANCH> --title "<title>" --body "<description>"
   ```

---

### Done (create flow)

Report a success summary:
- Branch name
- Commit message
- PR URL returned by `gh pr create`

---

## Update Flow

Triggered when an open PR already exists for the current branch (detected in Step 2).

### U1 — Stage and commit new changes

1. Stage all changes:
   ```
   git add -A
   ```
2. Get the staged diff:
   ```
   git diff --staged
   ```
3. Write a commit message (Conventional Commits) reflecting only the new changes.
4. Commit immediately without asking for confirmation:
   ```
   git commit -m "<message>"
   ```

### U2 — Push

```
git push
```

### U3 — Update the PR title and description

1. Get the full diff of the branch against `DESTINATION_BRANCH`:
   ```
   git diff <DESTINATION_BRANCH>...HEAD
   ```
2. Rewrite the PR title and description from scratch based on the full diff (not just the new commit), using the same template as Step 7.
3. Update the PR without asking for confirmation:
   ```
   gh pr edit <PR_NUMBER> --title "<updated-title>" --body "<updated-description>"
   ```

### Done (update flow)

Report a success summary:
- New commit message
- PR URL
- Confirmation that the PR description was updated

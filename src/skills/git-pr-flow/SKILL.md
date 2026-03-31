---
name: git-pr-flow
description: Automate branch creation, commit, and pull request opening by delegating diff analysis to git-pr-describe. Use when you want to commit work and open a pull request.
by: oh-my-skills
---

## Prerequisites

Before anything else, verify these requirements. If any check fails, stop and tell the user what is missing.

1. **Inside a git repository:** `git rev-parse --is-inside-work-tree`
2. **GitHub CLI installed and authenticated:** `gh auth status`
3. **Remote `origin` exists:** `git remote get-url origin`

---

## Workflow

Collect the current git context:
- `git branch --show-current` → `CURRENT_BRANCH`
- `git status --short` → working tree status

If `git status --short` returns nothing (clean working tree) and there are no unpushed commits, stop immediately and tell the user: "Nothing to commit — your working tree is clean."

Execute all steps automatically without asking for confirmation, except where explicitly noted.

---

### Step 1 — Ask for the destination branch

**Always ask the user:** "What is the destination branch for this PR?"

Store the answer as `DESTINATION_BRANCH`.

---

### Step 2 — Check for an existing open PR

```
gh pr list --head <CURRENT_BRANCH> --base <DESTINATION_BRANCH> --state open --json number,title,url 2>/dev/null
```

- **A matching PR exists** → this is an **update flow**. Skip to [Update Flow](#update-flow).
- **No matching PR** → this is a **create flow**. Continue to Step 3.

---

### Step 3 — Analyze changes with git-pr-describe

**You MUST use the `Agent` tool** to run `git-pr-describe` in a dedicated sub-agent. Do NOT invoke the `git-pr-describe` skill directly in this conversation — the diff output is too large and will cause context compression that breaks the workflow.

Launch the agent with:
- **description:** `"generate PR title and description"`
- **prompt:** `"You are in the repository at <REPO_PATH>. Run the git-pr-describe skill. Return ONLY the raw JSON object it produces (with title and description keys). If the diff is empty, return the single word EMPTY."`

Wait for the agent to return. Parse the JSON from its response.

If the agent returns "EMPTY", stop and tell the user: "No changes detected — nothing to open a PR for."

Store the result as `PR_TITLE` and `PR_DESCRIPTION`.

---

### Step 4 — Determine the feature branch

- If `CURRENT_BRANCH` **is** `DESTINATION_BRANCH` → a new branch must be created. Continue to Step 5.
- If `CURRENT_BRANCH` is already a feature branch → skip to Step 6.

---

### Step 5 — Create the feature branch

A new feature branch is needed because we are on the destination branch.

1. From `PR_TITLE` (Conventional Commits format: `<type>(<scope>): <summary>`), derive a branch name:
   - Map the type to a prefix: `feat` → `feature/`, `fix` → `fix/`, `refactor` → `refactor/`, `docs` → `docs/`, `test` → `test/`, everything else → `chore/`
   - Take the summary part (after the `:`), kebab-case it, limit to 2–5 words
   - Example: `feat(auth): add login endpoint` → `feature/add-login-endpoint`
2. **Ask the user:** "Does this branch name look good? (or suggest a different one)"
3. Once confirmed, create and switch to the branch:
   ```
   git checkout -b <confirmed-branch-name>
   ```

---

### Step 6 — Stage changes and commit

1. Review what will be staged:
   ```
   git status --short
   ```
2. **Safety check:** scan the output for sensitive file patterns (`.env`, `.env.*`, `credentials`, `*.key`, `*.pem`, `secret`, `token`). If any are found, warn the user and ask which files to exclude before staging.
3. Stage all changes:
   ```
   git add -A
   ```
4. Show the staged summary to the user so they can see what will be committed:
   ```
   git diff --staged --stat
   ```
5. Use `PR_TITLE` as the commit subject line — it already follows Conventional Commits format, imperative mood, ≤ 72 chars. Add a body only if the change is genuinely complex.
6. Commit immediately without asking for confirmation:
   ```
   git commit -m "<commit-message>"
   ```

---

### Step 7 — Push the branch

```
git push -u origin <branch-name>
```

If the push fails (e.g. branch protection, diverged history), report the error to the user and stop.

---

### Step 8 — Open the pull request

Use `PR_TITLE` and `PR_DESCRIPTION` directly:
```
gh pr create --base <DESTINATION_BRANCH> --title "<PR_TITLE>" --body "<PR_DESCRIPTION>"
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

1. Review what will be staged:
   ```
   git status --short
   ```
2. **Safety check:** scan the output for sensitive file patterns (`.env`, `.env.*`, `credentials`, `*.key`, `*.pem`, `secret`, `token`). If any are found, warn the user and ask which files to exclude before staging.
3. Stage all changes:
   ```
   git add -A
   ```
4. Look at the staged diff (`git diff --staged`) and write a commit message that describes **only the new incremental changes**, not the whole PR. Follow Conventional Commits format.
5. Commit immediately without asking for confirmation:
   ```
   git commit -m "<commit-message>"
   ```

### U2 — Push

```
git push
```

If the push fails, report the error to the user and stop.

### U3 — Update the PR title and description

1. **You MUST use the `Agent` tool** (same pattern as Step 3): launch a dedicated sub-agent to execute the `git-pr-describe` skill and return the JSON with updated `PR_TITLE` and `PR_DESCRIPTION`.
2. If the sub-agent returns "EMPTY", skip the update and tell the user.
3. Otherwise, update the PR without asking for confirmation:
   ```
   gh pr edit <PR_NUMBER> --title "<PR_TITLE>" --body "<PR_DESCRIPTION>"
   ```

### Done (update flow)

Report a success summary:
- New commit message
- PR URL
- Confirmation that the PR title and description were updated

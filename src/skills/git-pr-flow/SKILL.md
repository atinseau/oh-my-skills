---
name: git-pr-flow
description: Automate branch creation, commit, and pull request opening by delegating diff analysis to git-pr-describe. Use when you want to commit work and open a pull request.
by: oh-my-skills
---

## Prerequisites + Context

Run all prerequisites and context gathering in a single command:
```bash
git rev-parse --is-inside-work-tree && gh auth status 2>&1 && git remote get-url origin && echo "---CONTEXT---" && git branch --show-current && git status --short && echo "---DEFAULT_BRANCH---" && (git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)
```

If any prerequisite fails (git, gh, or remote), stop and tell the user what is missing.

From the output, extract:
- `CURRENT_BRANCH` — the line after `---CONTEXT---`
- Working tree status — the lines between `CURRENT_BRANCH` and `---DEFAULT_BRANCH---`
- `DEFAULT_BRANCH` — the line after `---DEFAULT_BRANCH---` (may be empty if detection fails)

If working tree status is empty (clean working tree) and there are no unpushed commits, stop immediately and tell the user: "Nothing to commit — your working tree is clean."

Execute all steps automatically without asking for confirmation, except where explicitly noted.

---

### Step 1 — Determine the destination branch

If `DEFAULT_BRANCH` was detected, propose it as default: "Destination branch for this PR? (default: `<DEFAULT_BRANCH>`)"

If `DEFAULT_BRANCH` is empty, ask without a default: "What is the destination branch for this PR?"

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

Run `oms-git-diff` to obtain the diff output.

If `oms-git-diff` produces **no output**, stop and tell the user: "No changes detected — nothing to open a PR for."

**Choose the execution mode based on diff size:**

- **Under 200 lines:** analyze the diff directly in this conversation using the `git-pr-describe` skill rules. Skip Step 2 of git-pr-describe (project inspection) — the diff itself provides sufficient context. Return the JSON with `title` and `description` keys.

- **200 lines or more:** delegate to a sub-agent to protect context. Launch the agent with:
  - **description:** `"generate PR title and description"`
  - **prompt:** `"You are in the repository at <REPO_PATH>. Run the git-pr-describe skill but skip Step 2 (project inspection) — the diff provides sufficient context. Return ONLY the raw JSON object it produces (with title and description keys). If the diff is empty, return the single word EMPTY."`

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

1. Review, stage, and summarize in a single command:
   ```bash
   git status --short && git add -A && git diff --staged --stat
   ```
2. **Safety check:** scan the `git status` output (the lines before the `--stat` summary) for sensitive file patterns (`.env`, `.env.*`, `credentials`, `*.key`, `*.pem`, `secret`, `token`). If any are found, unstage them (`git reset HEAD <file>`), warn the user and ask which files to exclude.
3. Use `PR_TITLE` as the commit subject line — it already follows Conventional Commits format, imperative mood, ≤ 72 chars. Add a body only if the change is genuinely complex.
4. Commit immediately without asking for confirmation:
   ```
   git commit -m "<commit-message>"
   ```

---

### Step 7 — Push the branch

```
git push -u origin <branch-name>
```

If the push fails:
- **Diverged history:** suggest `git pull --rebase origin <branch-name>` and retry the push after rebase succeeds.
- **Branch protection or permission error:** report the error to the user and stop.
- **Any other error:** report the raw error to the user and stop.

---

### Step 8 — Open the pull request

Use `PR_TITLE` and `PR_DESCRIPTION` directly. If the user mentioned "draft" or "WIP" at any point during the flow, append `--draft`:
```
gh pr create --base <DESTINATION_BRANCH> --title "<PR_TITLE>" --body "<PR_DESCRIPTION>" [--draft]
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

1. Review and stage in a single command:
   ```bash
   git status --short && git add -A
   ```
2. **Safety check:** scan the `git status` output for sensitive file patterns (`.env`, `.env.*`, `credentials`, `*.key`, `*.pem`, `secret`, `token`). If any are found, unstage them (`git reset HEAD <file>`), warn the user and ask which files to exclude.
3. Look at the staged diff (`git diff --staged`) and write a commit message that describes **only the new incremental changes**, not the whole PR. Follow Conventional Commits format.
4. Commit immediately without asking for confirmation:
   ```
   git commit -m "<commit-message>"
   ```

### U2 — Push

```
git push
```

If the push fails:
- **Diverged history:** suggest `git pull --rebase origin <branch-name>` and retry the push after rebase succeeds.
- **Branch protection or permission error:** report the error to the user and stop.
- **Any other error:** report the raw error to the user and stop.

### U3 — Update the PR title and description

1. Run `oms-git-diff` to obtain the diff output.
2. **Choose the execution mode based on diff size** (same logic as Step 3):
   - **Under 200 lines:** analyze inline using the `git-pr-describe` rules, skipping Step 2 (project inspection).
   - **200 lines or more:** delegate to a sub-agent with the same prompt as Step 3.
3. If the result is empty, skip the update and tell the user.
4. Otherwise, update the PR without asking for confirmation:
   ```
   gh pr edit <PR_NUMBER> --title "<PR_TITLE>" --body "<PR_DESCRIPTION>"
   ```

### Done (update flow)

Report a success summary:
- New commit message
- PR URL
- Confirmation that the PR title and description were updated

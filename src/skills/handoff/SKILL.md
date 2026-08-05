---
name: handoff
description: Use whenever the user says "/handoff", asks to wrap up or end the session, save/capture the current session state, or write down where things stand before stopping. Also use to resume prior work — "continue where we left off", "resume the handoff", "pick up from last time", "what did we do last session" — or when a project has a `.oms/handoffs/` directory and the user's request reads like a continuation rather than a fresh start. Turns a conversation (decisions made, plan/spec status, git state, what's done, what's left) into a timestamped file so a future session — possibly a different agent, empty context, or another day — can resume efficiently without re-deriving everything from scratch.
by: oh-my-skills
---

# Handoff — Session Continuity

Two modes: **Save** (capture the current session) and **Resume** (pick up a prior one). Pick based on what the user is asking for — see Mode selection below.

## Why this exists

Work that spans multiple sessions or context windows loses information at every boundary: the next session has to reread diffs, guess at decisions, and often repeats dead ends already ruled out. A good handoff isn't a transcript — it's the compressed, verifiable state a stranger would need to keep going: what's actually done (not what was discussed), what's left, and any open question that needs the user rather than more re-reading.

## Mode selection

- Default trigger ("/handoff", "wrap up", "save session state", "prepare a handoff") → **Save mode**.
- "resume", "continue from the handoff", "pick up where we left off", "what's the status from last time" → **Resume mode**.
- If ambiguous: prefer Save mode, unless `.oms/handoffs/` already has entries and the request clearly sounds like the start of a session rather than the end of one.

## Save mode

### Step 1 — Locate the handoff directory

Find the project root (top of the git repository, or the current directory if there is no git repo). Create `.oms/handoffs/` there if it doesn't exist yet.

### Step 2 — Gather real state, don't rely on memory

The file must reflect what actually happened, not what the conversation implied happened. Run these and read the output before writing anything:

- `git status` (or `git status --porcelain=v2 --branch` if you want machine-readable) to see the branch and working tree state
- `git diff --stat` and `git diff --cached --stat` for uncommitted/staged changes
- `git log --oneline -10` for recent commits
- If a task/todo-list tool is available in this session, read its current state — completed vs. pending items are usually a more reliable signal of "done" vs. "left" than reconstructing from conversation alone
- Check whether a plan or spec was produced or touched this session: a plan written during a planning step, or files like `PLAN.md`, `SPEC.md`, `docs/plans/*.md`, `*.plan.md`. Cross-reference against the diff/status from above to tell whether it's still current, partially executed, or was abandoned/superseded mid-session

### Step 3 — Name the file

Format: `YYYY-MM-DD-HHmm-<slug>.md`, local time, where `<slug>` is 3-6 kebab-case words naming the actual topic (`refonte-auth-jwt`, not `session` or `handoff`). If a file would land on the exact same minute as an existing one, append `-2`, `-3`, etc. — never overwrite a prior handoff.

### Step 4 — Write the file

Use `templates/handoff.md` as the section structure and fill every section from what you gathered in Step 2 — no generic placeholders, no "worked on the feature" filler.

What makes each section actually useful to a future session:

- **Accomplished must be specific and verifiable.** Name the files that changed and why, the decisions made and their reasoning, the commands that now pass. "Worked on auth" tells a future session nothing it can check; "replaced JWT verification in `src/auth/verify.ts` with the rotating-key scheme because the old one didn't handle key rotation" lets it verify the claim in one glance at the file.
- **Plan / Spec reflects reality, not the original intent.** If a plan existed and the session diverged from it, say what changed and why — don't just link the stale original as if it's still the roadmap.
- **Next steps must be actionable without re-asking the user anything already known.** State the concrete first action. If the very next step genuinely depends on a decision only the user can make, say so explicitly as an open question rather than glossing over it.
- **Never fabricate progress.** If the conversation implies a file was edited but `git diff` shows nothing, or a plan claims something is done but the code disagrees, flag the discrepancy in the file instead of quietly trusting the conversation. A handoff that overstates progress wastes the next session's time worse than no handoff at all.

### Step 5 — Confirm to the user

Report the file path and a 2-3 sentence summary of what's in it. Mention that a future session can resume by asking to "resume the handoff" (or pointing this skill at that project).

## Resume mode

### Step 1 — Find the handoff

If the user names a specific date/file, use it. Otherwise list `.oms/handoffs/*.md` — the filenames sort chronologically, so the lexicographically last one is the most recent — and use that. If the directory is missing or empty, tell the user there's nothing to resume and stop; don't invent one.

### Step 2 — Read it, then verify it against reality

Read the handoff file in full. Then re-check its claims against the current repo state — time may have passed since it was written, and someone (human or agent) may have changed things since:

- `git log --oneline -10` and `git status`, compared against the file's "Repo state" section
- Spot-check a couple of the files/paths listed under "Accomplished" to confirm they still match what the file claims

If reality has drifted (new commits landed, a referenced branch is gone, a file was reverted), surface that to the user before proceeding — don't silently act on a stale handoff as if it were still accurate.

### Step 3 — Orient the user and propose, don't assume

Summarize for the user: what was accomplished, what's still open, and the plan/spec status. Then propose the concrete next step from the file's "Next steps" section as your recommended starting point, and wait for confirmation or redirection before acting on it — a handoff records intent from a past session, not standing authorization to keep going unsupervised.

## Template

`templates/handoff.md` has the exact section structure to fill in Save mode and to expect in Resume mode.

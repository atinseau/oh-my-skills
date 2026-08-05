---
date: {{YYYY-MM-DD HH:mm}}
project: {{repo or directory name}}
branch: {{git branch}}
---

# Handoff: {{short title, a few words}}

## Summary

2-4 sentences: what this session was about, in plain language, written for someone with zero context.

## Context

Why this work exists — the goal, constraint, bug report, or request that started it. Link an issue/ticket if one exists.

## Plan / Spec

- If a plan or spec was written this session: summarize it and state how much of it is actually done vs. still pending vs. abandoned/changed mid-session, and why.
- If a plan/spec already existed in the repo (e.g. `docs/plans/x.md`): reference its path and its current status.
- If none exists: say so explicitly — "No formal plan; decisions were made ad hoc, listed below."

## Accomplished

Concrete, verifiable items only — things a future session can check, not vibes:

- `path/to/file.ext`: what changed and why
- Decision: ... — reasoning: ...
- Verified: `command that now passes`

## Next steps

Ordered, most immediate first. Each one actionable without re-deriving context:

1. ...
2. ...

Open questions that need the user before proceeding (omit this list if there are none):

- ...

## Repo state

- Branch: `...`
- Uncommitted changes: `git diff --stat` output, or "none"
- Staged changes: `git diff --cached --stat` output, or "none"
- Last commits:
  ```
  {{git log --oneline -10 output}}
  ```

## Gotchas

Anything a fresh session would otherwise rediscover the hard way: a flaky test, a misleadingly named file, a dependency behaving unexpectedly, an approach already tried and ruled out.

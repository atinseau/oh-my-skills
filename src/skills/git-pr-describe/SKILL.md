---
name: git-pr-describe
description: Analyze a git diff and produce a high-quality pull request title and description. Use when you want to generate a PR title and body from the current branch changes.
by: oh-my-skills
---

# Generate Pull Request Title & Description

You are a senior software engineer. Your job is to analyze a git diff and produce a high-quality pull request title and description.

## Context Gathering

### Step 1 — Obtain the diff

Run the `oms-git-diff` command to get the relevant diff:
```
oms-git-diff
```

This command automatically:
- Detects whether you are on a **feature branch** or an **integration branch** (e.g. `main`, `stage`, `develop`).
- For feature branches: finds the closest parent branch (via existing PR base, merge-base heuristic, or remote HEAD fallback) and diffs only the developer's commits.
- For integration branches: skips commit diff entirely and looks at staged or unstaged changes.
- Falls back through the cascade: commit diff → `git diff --staged` → `git diff`.

If `oms-git-diff` produces **no output**, tell the user there is nothing to describe and stop here.

### Step 2 — Understand the project

Inspect the repository to understand the project: language, framework, package manager, directory layout. Use this knowledge to give precise, idiomatic descriptions — but never hardcode assumptions about any specific stack.

If the user provides additional context (ticket number, feature name, etc.), incorporate it.

## Output Format

Return a single raw JSON object with exactly two keys. Nothing else — no explanation, no markdown fence, no commentary.

```json
{
  "title": "<string>",
  "description": "<string>"
}
```

The `description` value is a single string containing GitHub-flavored Markdown. Use `\n` for newlines inside the JSON string.

---

## Title Rules

| # | Rule |
|---|------|
| 1 | **Conventional Commits** format: `<type>(<scope>): <summary>` |
| 2 | Allowed types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `perf`, `ci`, `build`, `style`, `revert` |
| 3 | Scope = the dominant area of change (feature name, package, module, directory). Omit scope only if the change is truly cross-cutting. Use `/` for multi-scope when necessary (`auth/api`). |
| 4 | Summary in **imperative mood** ("add", "fix", "remove" — never "added", "fixes", "removing"). |
| 5 | Max **72 characters** total. |
| 6 | **No backticks** — they break terminal copy-paste. |
| 7 | No trailing period. |
| 8 | Written in **English**. |

---

## Description Rules

Write the entire description in **French**. Use the sections below **in order**. **Omit any section that has zero relevant content in the diff.** Never invent or extrapolate — every statement must trace back to an actual change.

### Sections

#### Changements apportés
- Bullet list of the main modifications.
- Group related changes. Be specific: name files, classes, functions, fields, endpoints, config keys when it helps the reviewer.
- Start each bullet with an action verb: *Ajout*, *Suppression*, *Modification*, *Refactorisation*, *Mise à jour*, *Création*, *Extraction*, *Déplacement*, *Remplacement*.

#### Breaking Changes
- Include **only** if the diff introduces backward-incompatible changes (public API contracts, DB schemas, removed exports, renamed env vars, changed function signatures, dropped support, etc.).
- State **what** changed and **what breaks**.

#### Tests
- Summarize added, modified, or deleted test files (unit, integration, e2e, snapshot).
- Mention which behaviors or edge cases are now covered or no longer covered.

#### Migration
- Include **only** if the diff contains a database migration file (any ORM or raw SQL).
- State the file name, the schema change it performs, and any manual steps required before or after deployment.

#### Remarques
- Useful context for the reviewer: known limitations, planned follow-ups, architectural trade-offs, deployment notes, feature flags, new environment variables, performance considerations, etc.

End the description with a line containing only: `🚀`

### Formatting Constraints

- GitHub-flavored Markdown.
- Use `inline code` for file names, class names, field names, CLI commands, and config keys inside the body.
- Concise sentences — no filler, no long paragraphs.
- Do not repeat information across sections.
- Do not add a top-level heading — GitHub already displays the PR title.
- Do not generate checklists (type of change, testing checklist, self-review) — the author fills those from the repo's PR template.

---

## Internal Verification (do not output)

Before returning the JSON, silently check:

1. Title ≤ 72 chars, imperative mood, conventional commit format, zero backticks.
2. Only sections with actual diff-backed content are present.
3. Every single bullet maps to a real change — nothing hallucinated.
4. Description is in French; title is in English.
5. JSON is valid: newlines escaped as `\n`, double quotes escaped as `\"`.
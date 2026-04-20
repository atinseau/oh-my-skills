# Recall

How to read from `.forge/`. Three modes: **proactive** (task start), **pre-flight** (before file edits), **reactive** (user query). Never scan the whole tree. `index.md` is always the entry point.

## Entry point

- Always start with `.forge/index.md`. Max 100 lines by construction.
- The index has frontmatter + body sections per category (Modules, Features, Open Bugs, Patterns, Pitfalls, Decisions, Last Session).
- Each entry is one line with keywords.
- Reading the index is cheap. Reading beyond it is selective.

## Mode 1 — Proactive (task start)

When the user gives a substantive task (feature, bug, refactor), forge runs this BEFORE the agent starts coding:

1. Read `.forge/index.md`.
2. Extract 3-5 salient terms from the user's task description. Include common variants and synonyms (e.g. "login" ⇔ "auth" ⇔ "signin"; "cookie" ⇔ "session").
3. Also extract the task's **action type** (adding a feature? fixing a bug? refactoring? debugging?) — this biases which memory categories matter.
4. Score index entries:
   - ≥ 2 keyword overlaps → **high relevance**
   - 1 overlap → **low relevance**
   - 0 overlaps → **skip**
5. Action-type bias:
   - Feature work → prioritise related features + decisions + patterns
   - Bug work → prioritise prior bugs with path overlap + pitfalls
   - Refactor → prioritise patterns + architectural decisions
6. Read the top 1-3 high-relevance files (include low-relevance if < 2 high-relevance matches).
7. If a matched `modules/<name>.md` is `seeded: true`, enrich it first (see "Lazy module enrichment" below).
8. **Announce what was loaded** in one line so the user sees forge is active:
   > *forge: loaded features/oauth2-login.md, knowledge/pitfalls.md#edge-runtime-cookies*

If no entries match with confidence, stay silent. A negative recall is a valid outcome.

## Mode 2 — Pre-flight (before file edits)

Runs BEFORE every Edit / Write on a non-trivial file (skip for typo fixes, formatting, < 5-line changes).

1. Get the target path `P` from the intended edit.
2. Scan `.forge/bugs/BUG-*.md` and `.forge/knowledge/pitfalls.md` for entries whose `paths_involved:` list contains `P` OR an ancestor directory of `P`.
3. If any match, surface them to the user BEFORE the edit, formatted as warnings:
   ```
   ⚠️ Before editing `<P>`:
   - **Pitfall: edge-runtime-cookies** — `cookies()` sync call crashes in edge runtime. Use `await cookies()`.
   - **BUG-042** (resolved 2026-02-14) — session-expiry race condition. Check that fix still holds.
   ```
4. Proceed with the edit. The warning is informational, not blocking. Claude should verify the pending change doesn't recreate the flagged issue.

If no entries match `P`, skip this mode silently. Pre-flight is additive, not a gate.

**Why `paths_involved` matters:** without it, pre-flight has nothing to match on and degrades to pure keyword recall (which may miss path-specific learnings). Save discipline requires populating `paths_involved` on every bug and pitfall — see `save.md`.

### Limits of pre-flight — DO NOT treat as a safety guarantee

Pre-flight is **path-based, not semantic**. It only fires when the target file path `P` literally matches an entry's `paths_involved` (or an ancestor). Concretely:

- **Won't catch:** editing `src/components/LoginForm.tsx` while a pitfall exists on `src/auth/session.ts` — even if the bug is semantically related (component calls into the auth module). Different paths = no warning.
- **Won't catch:** renamed files. If `paths_involved: [src/auth/old.ts]` and the file has been renamed to `src/auth/new.ts`, the match fails silently.
- **Won't catch:** cross-file regressions. A bug fixed in file A can be recreated in file B if B now holds the same logic — pre-flight reads only the target path.

**Rule for the agent:** "no pre-flight warning" means "no keyword-indexed entry matches this path". It does NOT mean "this edit is safe". Combine pre-flight with Mode 1 (proactive recall by keyword) — both together catch more than either alone. And do not suppress normal reasoning ("is this change risky? what could break?") just because pre-flight was silent.

## Mode 3 — Reactive (user query)

When the user references past work: "how did we...", "what was the decision on...", "last time we did...", "like we did in...".

Same procedure as Mode 1, but the user's explicit query is the keyword source (no need to guess task intent).

## Lazy module enrichment

When a matched `modules/<name>.md` entry has `seeded: true`:

1. Read the `path:` field.
2. List the directory at that path (one level deep; do not recurse).
3. Read 2-3 representative files:
   - Public entry point (`index.*`, `main.*`, `mod.rs`, `lib.rs`, etc.)
   - The largest file (proxy for "most substantive")
   - A file whose name suggests canonical role (`service.ts`, `handler.go`, etc.)
4. Extract: `role:` (one sentence), `key_files:` (2-3 bullets), `keywords:` (3-6 terms from filenames + exported symbols + doc comments).
5. Rewrite `modules/<name>.md`: drop `seeded: true`, add `keywords:` frontmatter field, add `## Role` + `## Key files` body sections.
6. Regenerate `.forge/index.md`.
7. Budget: max **5 file reads per enrichment**.

**Atomicity:** if enrichment aborts before step 5 (read failure, budget exhausted, missing path), leave the stub intact with `seeded: true`. Do NOT write a half-enriched entry. Record a pitfall explaining why enrichment was skipped.

Re-enrichment (drifted modules) follows the same procedure.

### Skip enrichment when:

- Module path no longer exists on disk (deleted, renamed).
- Task only peripherally references the module (low-relevance score).
- The module entry is already non-seeded (enriched in a prior cycle) AND `git log --since="7 days ago" -- <path>` shows no recent commits (no reason to re-enrich).

## Cross-checks

Beyond the primary keyword-matched files, these categorical loads fire when the task has specific concerns:

| Task concern | Also read |
|---|---|
| Testing | `.forge/knowledge/patterns.md` (scan for test patterns) |
| Architectural choice | `.forge/knowledge/decisions.md` |
| Known-risky module (recent bugs in index) | `.forge/knowledge/pitfalls.md` |
| Dependencies | `.forge/knowledge/dependencies.md` |
| **Code review request** | `.forge/knowledge/pitfalls.md` + `.forge/bugs/BUG-*.md` for `paths_involved` overlap with the diff — these become mandatory review checks |

### Cross-check scope limit

- Do not read an entire file if it's long — scan for section headers matching task keywords.
- Stop reading once relevant sections are found.
- A cross-check producing no matching content is valid. Do not force connections.

## Code review — best-effort memory surfacing

**Status: best-effort, not enforced by a sibling skill.** `superpowers:requesting-code-review` does not currently know about forge. The mechanism below is what the agent can do from forge's side alone; whether the downstream reviewer honours it depends on where the review runs.

When the agent is about to request a code review OR is performing a self-review:

1. Compute the set of files touched by the diff.
2. For each file, scan `.forge/bugs/BUG-*.md` and `.forge/knowledge/pitfalls.md` for `paths_involved` overlap.
3. If matches exist, surface them in the review request message body BEFORE dispatching the reviewer:
   > **Forge memory — prior findings for the modified paths:**
   > - BUG-042 (session-expiry race condition) — `src/auth/session.ts`
   > - Pitfall: edge-runtime-cookies — `src/auth/`

**What this does NOT guarantee:**
- The `code-reviewer` subagent runs with its own fresh context. If the dispatch message body doesn't include the checklist explicitly, the reviewer never sees it.
- Human reviewers who read the PR won't see forge's checklist unless it's posted as a PR comment.
- A subagent reviewer with no awareness of forge may ignore the checklist even when included.

**Agent responsibility:** include the forge-memory block **in the prompt body** of the review request, prefixed with "Please verify the diff does not regress any of the following:". This is the only hook we have. Do not claim to the user that "forge checks reviews" unless the checklist is actually in the dispatched prompt.

## What recall does NOT do

- Does not proactively read source code — only files identified through the index or `paths_involved` matching.
- Does not re-enrich already-enriched module files (that's triggered by drift detection, separate concern).
- Does not synthesise memory into a prose summary — returns file contents as-is to the agent's context.
- Does not read files outside the index. If a merge-conflict resolution left an orphan file in `.forge/`, fix it via the merge-conflict procedure in `memory-structure.md` (regenerate the index from disk) — do not bypass the index.
- Does not fetch from remote or network — all reads are local-filesystem.

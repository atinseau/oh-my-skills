# Recall

How to read from `.forge/`. Two modes: **pre-flight** (before file edits) and **reactive** (user query). Plus a lightweight task-start read of `index.md` — no aggressive keyword matching. Never scan the whole tree.

MVP deliberately drops the proactive keyword-scoring recall that fired on every task start. In a memory this small (pitfalls + bugs), keyword matching produces more noise than signal — pre-flight by path is the more reliable mechanism.

## Entry point

- Always start with `.forge/index.md`. Max 100 lines by construction.
- The index has frontmatter + body sections per category (`## Open Bugs`, `## Pitfalls`). Each entry is one line with keywords.
- Reading the index is cheap. Reading beyond it is selective, driven by pre-flight path matching or reactive user queries.

## Task-start read (lightweight)

When a substantive task starts and `.forge/index.md` exists:

1. Read `.forge/index.md` once. That's it for proactive work.
2. Do NOT keyword-score the index against the task. Do NOT pre-load pitfalls.md or bug files on task start.
3. If something in the index jumps out as obviously relevant to the user's task (exact path match, verbatim keyword overlap), mention it in one line. Otherwise, stay silent.

Deeper reads are driven by Mode 1 (pre-flight) and Mode 2 (reactive) below.

## Mode 1 — Pre-flight (before file edits)

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

**Why `paths_involved` matters:** without it, pre-flight has nothing to match on. Save discipline requires populating `paths_involved` on every bug and pitfall — see `save.md`. The `audit.md` manual mode scans these fields and surfaces stale paths.

### Limits of pre-flight — DO NOT treat as a safety guarantee

Pre-flight is **path-based, not semantic**. It only fires when the target file path `P` literally matches an entry's `paths_involved` (or an ancestor). Concretely:

- **Won't catch:** editing `src/components/LoginForm.tsx` while a pitfall exists on `src/auth/session.ts` — even if the bug is semantically related (component calls into the auth module). Different paths = no warning.
- **Won't catch:** renamed files. If `paths_involved: [src/auth/old.ts]` and the file has been renamed to `src/auth/new.ts`, the match fails silently. Run `forge audit` to detect these.
- **Won't catch:** cross-file regressions. A bug fixed in file A can be recreated in file B if B now holds the same logic — pre-flight reads only the target path.

**Rule for the agent:** "no pre-flight warning" means "no keyword-indexed entry matches this path". It does NOT mean "this edit is safe". Do not suppress normal reasoning ("is this change risky? what could break?") just because pre-flight was silent.

## Mode 2 — Reactive (user query)

When the user references past work: "how did we...", "what was the decision on...", "last time we did...", "like we did in...".

1. Read `.forge/index.md`.
2. Extract salient terms from the user's explicit query (no guessing of task intent — the user said what they want).
3. Score index entries: ≥ 2 keyword overlaps → high relevance; 1 overlap → low relevance; 0 → skip.
4. Read the top 1-3 high-relevance files (include low-relevance if < 2 high-relevance matches).
5. Announce what was loaded in one line:
   > *forge: loaded knowledge/pitfalls.md#edge-runtime-cookies*

If no entries match with confidence, say so and proceed without memory. Negative recall is a valid outcome.

## Code review — best-effort memory surfacing

**Status: best-effort, not enforced by a sibling skill.** `superpowers:requesting-code-review` does not currently know about forge. The mechanism below is what the agent can do from forge's side alone; whether the downstream reviewer honours it depends on where the review runs.

When the agent is about to request a code review OR is performing a self-review:

1. Compute the set of files touched by the diff.
2. For each file, scan `.forge/bugs/BUG-*.md` and `.forge/knowledge/pitfalls.md` for `paths_involved` overlap.
3. If matches exist, surface them in the review request message body BEFORE dispatching the reviewer:
   > **Forge memory — prior findings for the modified paths:**
   > - BUG-042 (session-expiry race condition) — `src/auth/session.ts`
   > - Pitfall: edge-runtime-cookies — `src/auth/`

**Agent responsibility:** include the forge-memory block **in the prompt body** of the review request, prefixed with "Please verify the diff does not regress any of the following:". This is the only hook we have. Do not claim to the user that "forge checks reviews" unless the checklist is actually in the dispatched prompt.

## What recall does NOT do

- Does not proactively read source code — only files identified through the index or `paths_involved` matching.
- Does not do aggressive keyword scoring on task start (MVP deliberately drops this — noise dominated signal in a pitfall-only memory).
- Does not synthesise memory into a prose summary — returns file contents as-is to the agent's context.
- Does not read files outside the index. If a merge-conflict resolution left an orphan file in `.forge/`, fix it via the merge-conflict procedure in `memory-structure.md` (regenerate the index from disk) — or run `forge audit` to surface it.
- Does not fetch from remote or network — all reads are local-filesystem.

# Recall

How to read from `.forge/` on demand. Never scan the whole tree. `index.md` is always the entry point. Be selective — over-reading defeats the purpose.

## Entry point

- Always start with `.forge/index.md`. Max 100 lines by construction.
- The index has frontmatter + body sections per category (Modules, Features, Open Bugs, Patterns, Pitfalls, Decisions, Last Session).
- Each entry is one line with keywords.
- Reading the index is cheap. Reading beyond it is selective.

## Keyword match

1. Extract 3-5 salient terms from the user's current task or question. Include common variants and synonyms where relevant (e.g. "login" ⇔ "auth" ⇔ "signin").
2. Scan each index entry's `keywords:` list for overlaps.
3. Score per entry:
   - ≥ 2 keyword overlaps → **high relevance**
   - exactly 1 overlap → **low relevance**
   - 0 overlaps → **skip**
4. Sort by relevance. High relevance entries are candidates for loading; low relevance are candidates only if there are fewer than 2 high-relevance matches.

## Lazy load

- Read the top 1-3 high-relevance files. Stop at 3 even if more match — forge is selective.
- If nothing scores high-relevance, do NOT over-read. Proceed with the task using ambient context. A negative recall is a valid outcome — forge is not required to produce a hit.
- Never read `.forge/` tree-walking style. Always go through the index.

## Lazy module enrichment

When a matched `modules/<name>.md` entry has `seeded: true` in its frontmatter (i.e. it's a stub, not yet enriched), enrich it before reading:

1. Read the `path:` field.
2. List the directory at that path (one level deep; do not recurse).
3. Read 2-3 representative files:
   - The public entry point (`index.*`, `main.*`, `mod.rs`, `lib.rs`, etc.)
   - The largest file in the directory (proxy for "most substantive")
   - A file whose name suggests canonical role (e.g. `service.ts`, `handler.go`)
4. Extract:
   - `role:` — one sentence on what the module does
   - `key_files:` — 2-3 bullets: `- <path> (role)`
   - `keywords:` — 3-6 terms drawn from filenames, exported symbols, doc comments
5. Rewrite `modules/<name>.md`: drop `seeded: true`, add `keywords:` to frontmatter, add `## Role` + `## Key files` body sections (see `memory-structure.md` for the enriched format).
6. Regenerate `.forge/index.md` to reflect the enriched entry's new keywords.
7. Budget: maximum **5 file reads per enrichment**. If 5 files weren't enough to understand the module, that's a signal the module is too large — note this in a pitfall entry for later.

**Atomicity:** if enrichment aborts before step 5 (read failure, budget exhausted, missing path), leave the stub intact with `seeded: true`. Do NOT write a half-enriched module entry. Record a pitfall entry explaining why enrichment was skipped.

Re-enrichment (when an enriched module has drifted) follows the same procedure and same 5-file cap.

### Enrichment: what to skip

Skip enrichment and proceed with ambient context if:

- The module path no longer exists on disk (deleted, renamed).
- The task only peripherally references the module (low-relevance score, not high).
- The module was enriched within the last 7 days and there are no recent commits touching its path (check with `git log --since="7 days ago" -- <path>`).

In those cases, keep `seeded: true` and do not burn file reads on a stale or irrelevant enrichment.

## Cross-checks

When the current task has a specific concern, also load the relevant knowledge file:

- Task involves testing → also read `.forge/knowledge/patterns.md` (scan for test patterns).
- Task touches an architectural choice → also read `.forge/knowledge/decisions.md`.
- Task touches a known-risky area (module has recent bug entries in the index) → also read `.forge/knowledge/pitfalls.md`.
- Task mentions dependencies → also read `.forge/knowledge/dependencies.md`.

Cross-checks are ADDITIONS to the main load, not replacements. Keep them bounded: read only the sections that match task keywords within those files.

### Cross-check scope limit

Cross-checks must stay bounded. When reading a knowledge file for a cross-check:

- Do not read the entire file if it's long — scan for section headers that match task keywords.
- Stop reading once the relevant section(s) are found.
- A cross-check that produces no matching content is a valid outcome. Do not force a connection.

## What recall does NOT do

- Does not proactively read source code — only files identified through the index.
- Does not re-enrich already-enriched module files (that's triggered by drift detection, separate concern).
- Does not synthesise memory into a prose summary — returns the file contents as-is to the agent's context.
- Does not read files not listed in the index. If a merge-conflict resolution left an orphan file in `.forge/`, fix it via the merge-conflict procedure in `memory-structure.md` (regenerate the index from disk) — do not bypass the index.
- Does not fetch from remote or network — all reads are local-filesystem.

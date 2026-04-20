# Triggers

Forge auto-invokes on 6 signals. Each signal specifies a **detect** (what the agent observes) and an
**action** (save / recall / refresh). Check these signals at natural moments: start of work, feature
completion, debugging sessions, and when the user references past context. Do NOT invoke forge
outside these signals.

## Trigger matrix

| # | Signal | Action |
|---|---|---|
| 1 | First task in a codebase with no `.forge/` | Bootstrap |
| 2 | Feature completed | Save feature (+ optional pattern/decision) |
| 3 | Reusable pattern surfaces | Save pattern |
| 4 | Pitfall discovered | Save pitfall (+ bug if applicable) |
| 5 | Memory may be stale | Desync probe + refresh ask |
| 6 | User references past context | Recall |

Note: `<author-slug>` referenced in trigger actions below is derived from `git config user.email` per the rule in `memory-structure.md` → "Session files" (take part before `@`, lowercase, non-alphanumerics → `-`, truncate 20 chars, fallback `unknown`).

## Trigger 1 — Bootstrap

**Detect:**
- The user begins work on a project directory.
- `.forge/index.md` does NOT exist.

**Action:**
1. Shallow scan: list project root and one level deep. Do NOT recurse.
2. Read `README.md` (fall back to `README.txt` / `README.rst`).
3. Read any manifest present: `package.json`, `Cargo.toml`, `Package.swift`, `pyproject.toml`,
   `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `Makefile`, `composer.json`, `justfile`.
4. Write `.forge/context.md`:
   - Frontmatter: `languages:`, `frameworks:`, `package_manager:`, `build_cmd:`, `test_cmd:`,
     `lint_cmd:` (leave empty if nothing can be inferred — do not guess), `detected_at: <ISO date>`,
     `last_consolidation: <same ISO date as detected_at>`.
   - Body: 3-8 sentences on what distinguishes this project (stack specifics, structure, monorepo
     layout, auth approach, etc.). Extract the essence of any README architecture note; otherwise
     describe what is inferable from the manifest.
5. Write `.forge/index.md` with just `updated: <ISO date>` frontmatter and an empty body (no
   sections yet — entries are added as other triggers fire).
6. Do NOT pre-scan modules. Module files are created lazily on first reference (see `recall.md`).

## Trigger 2 — Feature completed

**Detect:**
- The user indicates completion: "done", "ship it", "that's it", "ready", or similar.
- OR the agent has finished implementing + verifying a feature (tests pass, manual check done,
  verification-before-completion cleared).

**Action:**
1. Pick a slug for the feature (kebab-case, 2-4 words).
2. Write `.forge/features/<slug>.md` using `skills/forge/templates/feature.md`. Target 15-30 lines.
3. Scan the work for secondary memorables:
   - Reusable pattern → append an entry to `.forge/knowledge/patterns.md` using
     `skills/forge/templates/pattern.md` shape. Check for dedup (see `save.md`).
   - Architectural decision with non-obvious rationale → append to `.forge/knowledge/decisions.md`
     using `skills/forge/templates/decision.md` shape.
4. Update `.forge/index.md` — add the feature entry under `## Features`, and any new pattern or
   decision entries under their sections.
5. Update `last_consolidation` in `.forge/context.md` to the current ISO date.

## Trigger 3 — Reusable pattern

**Detect:**
- During coding, a solution shape will clearly repeat (test idiom, error-handling pattern,
  concurrency shape, workflow). The agent recognises this because it either already solved the same
  shape earlier in the session, or knows it will be applied again immediately.

**Action:**
1. Read `.forge/knowledge/patterns.md` (if it exists) — scan existing patterns for overlapping
   keywords.
2. If an existing pattern covers this concern, UPDATE that entry (extend `## Where applied` with the
   new location) rather than adding a duplicate.
3. Otherwise, APPEND a new entry (separated by `---`) using `skills/forge/templates/pattern.md`.
   Target 10-25 lines.
4. Update `.forge/index.md` — add/refresh the entry under `## Patterns`.
5. Update `last_consolidation`.

## Trigger 4 — Pitfall

**Detect:**
- During debugging or discovery, the agent learns something that should warn future work: a breaking
  assumption, a wrong default, a subtle behaviour, a library quirk.

**Action:**
1. Read `.forge/knowledge/pitfalls.md` (if it exists) — check for an existing entry on the same
   concern.
2. If present, UPDATE it (add a note or refine the workaround).
3. Otherwise, APPEND a new entry with short frontmatter (`name` or short title + `keywords`) and
   body explaining the trap and how to avoid or fix it. Target 10-25 lines.
4. If the pitfall produced or was caused by a concrete bug that was then fixed: ALSO write
   `.forge/bugs/BUG-<NNN>.md` using `skills/forge/templates/bug.md` (find next ascending number).
   The bug file and the pitfall entry cross-reference each other.
5. Update `.forge/index.md` — entries under `## Pitfalls` and `## Open Bugs` as applicable.
6. Update `last_consolidation`.

## Trigger 5 — Sync / desync

**Detect** (probe at task start when `.forge/index.md` already exists):

Run:
```bash
git log --since="<last_consolidation>" --oneline -- . ":(exclude).forge/"
```
to list commits that touched code (outside `.forge/`) since the last consolidation.

Run:
```bash
git log --since="<last_consolidation>" --name-only --pretty=format: -- package.json Cargo.toml Package.swift pyproject.toml go.mod Gemfile pom.xml build.gradle composer.json
```
(omit manifests absent from the project; dedupe output) to list manifest files changed since
`last_consolidation`.

Do NOT use `git diff <date>..HEAD` — `git diff` requires revisions on both sides, not dates.

Additionally (or instead, for projects without git): check that file paths referenced by memory (in
`modules/<name>.md` `path:` fields, `features/<name>.md` file lists, enriched module `## Key files`)
still exist on disk.

**Action:**

If either the git probe or the path check returns non-empty:
1. Summarise the changes in one short paragraph (N commits, which manifests, which paths are stale).
2. Ask the user: *"Memory was last consolidated on `<last_consolidation>`. Refresh dependencies and
   module listings? (y/n)"*
3. If **yes** — bounded refresh:
   - Re-parse manifests; rewrite `.forge/knowledge/dependencies.md` entirely.
   - For directories that exist on disk but not in `.forge/modules/`: create a seeded stub
     (`seeded: true` frontmatter, no body).
   - For entries in `.forge/modules/` whose `path:` no longer exists: set `status: removed` in
     frontmatter (keep the file — preserves keyword history for past features or bugs that reference
     the module).
   - Do NOT re-enrich existing non-seeded module entries.
   - Update `last_consolidation` to now.
4. If **no** — record staleness:
   - Create (or append to) the current session log:
     `.forge/sessions/<today>-<task-slug>-<author-slug>.md`.
   - Add a `## Known staleness` section listing the detected changes verbatim.
   - Proceed with known-stale memory. Keyword matches may miss newer code.

## Trigger 6 — Recall

**Detect:**
- The user's language references past work: "how did we…", "what was the decision on…", "last time
  we did…", "like we did in…".
- OR the current task touches an area where prior context might apply (feature that extends an
  existing one, bug in a module with prior bugs, change to a known pattern).

**Action:**
1. Read `.forge/index.md`.
2. Extract 3-5 salient keywords from the user's task or question (and common variants).
3. Scan the index entries for matches. Score: 2+ keyword overlaps = high relevance, 1 = low, 0 = skip.
4. Read the 1-3 highest-relevance files.
5. If a matched `modules/<name>.md` entry is `seeded: true`, enrich it first per `recall.md` before
   reading the enriched content.
6. Do NOT read the whole `.forge/` tree.
7. If no entries match with confidence, do NOT over-read — proceed with the task using ambient
   context. A negative recall is a valid outcome.

## Not invoked for

- One-shot scripts or throwaway code.
- Single-file fixes that produce no new project-level insight.
- Routine tasks: typos, formatting, pure renames, mechanical refactors with no new reasoning.
- Tasks the user explicitly says are "quick and dirty" or "not worth remembering".
- Projects where no `.forge/` exists AND the user has not signalled memory is wanted. (Bootstrap is
  Trigger 1 — invoked on first substantive work, not on drive-by edits.)

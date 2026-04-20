# Triggers

Forge auto-invokes on 7 signals. Each specifies a **detect** (what the agent observes) and an
**action** (save / recall / refresh). Check these at natural moments: start of work, file edits,
completion, debugging, decision points, and when the user references past context.

## Trigger matrix

| # | Signal | Action |
|---|---|---|
| 1 | First task in a codebase with no `.forge/` | Bootstrap (mines git + code) |
| 2 | Feature completed | Save feature (+ optional pattern/decision) |
| 3 | Reusable pattern surfaces | Save pattern |
| 4 | Pitfall discovered | Save pitfall (+ bug if applicable) |
| 5 | Decision made among options | Save decision |
| 6 | Memory may be stale | Desync probe + refresh ask |
| 7 | Recall needed (task start, file edit, user query) | Surface relevant memory |

Note: `<author-slug>` referenced below is derived from `git config user.email` per the rule in `memory-structure.md` → "Session files" (take part before `@`, lowercase, non-alphanumerics → `-`, truncate 20 chars, fallback `unknown`).

## Trigger 1 — Bootstrap (mines the codebase)

**Detect:**
- The user begins work on a project directory.
- `.forge/index.md` does NOT exist.

**Action — bounded intelligent scan (budget: max 25 file reads):**

1. **Shallow scan:** list project root and one level deep. Do NOT recurse.
2. **Manifest + README:** read `README.md` (fall back to `README.txt` / `README.rst`); read any manifest present: `package.json`, `Cargo.toml`, `Package.swift`, `pyproject.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `Makefile`, `composer.json`, `justfile`.
3. **Git hot spots** (if `.git/` exists):
   ```bash
   git log --since="6 months ago" --stat --pretty=format: | awk '/^ [^|]*\|/ {print $1}' | sort | uniq -c | sort -rn | head -10
   ```
   This surfaces the 10 most-touched files in recent history — hot spots deserve module seeds.
4. **Git bug signals** (if `.git/` exists):
   ```bash
   git log --since="6 months ago" --pretty="%s" | grep -iE '^(fix|bug|resolve)' | head -20
   ```
   Extract recurring subject keywords (e.g. "session", "auth", "rate-limit") — these hint at fragile areas worth remembering as pitfalls later.
5. **Architectural sniff:** read 3-5 files from hot spots (entry points: `index.*`, `main.*`, `src/app/layout.*`, `src/lib/*.ts`, etc.). Infer: framework idioms, state management, auth approach, layering.
6. **Write `.forge/context.md`:**
   - Frontmatter: `languages:`, `frameworks:`, `package_manager:`, `build_cmd:`, `test_cmd:`, `lint_cmd:` (leave empty if nothing inferred — do not guess), `detected_at: <ISO>`, `last_consolidation: <same ISO>`.
   - Body: 3-8 sentences condensing what distinguishes this project (stack specifics, structure, non-obvious conventions spotted during the sniff).
7. **Seed `modules/<name>.md` stubs** for the top 3-5 hot-spot directories (`seeded: true`, `path:`, nothing else).
8. **Seed `knowledge/decisions.md`** with 1-3 entries inferring architectural choices (e.g. "JWT over NextAuth — inferred from custom `lib/jwt.ts` and absence of `next-auth` in deps"). Mark these as inferred: `created: <ISO>`, `inferred: true` in frontmatter — user can later confirm or correct.
9. **Write `.forge/index.md`** with `updated: <ISO>` frontmatter and sections populated from steps 7-8.
10. **Stop on budget exhaustion:** if 25 file reads are consumed before step 8, proceed to step 9 with what exists. Bootstrap is bounded; rest accumulates via other triggers.

## Trigger 2 — Feature completed

**Detect:**
- The user indicates completion: "done", "ship it", "that's it", "ready", or similar.
- OR the agent has finished implementing + verifying a feature (tests pass, manual check done, verification-before-completion cleared).

**Action:**
1. Pick a slug for the feature (kebab-case, 2-4 words).
2. Write `.forge/features/<slug>.md` using `skills/forge/templates/feature.md`. Target 15-30 lines. Include `paths_involved: [<touched file paths>]` in frontmatter.
3. Scan the work for secondary memorables:
   - Reusable pattern → Trigger 3.
   - Architectural decision with non-obvious rationale → Trigger 5.
4. Update `.forge/index.md` — add the feature entry under `## Features`.
5. Update `last_consolidation` in `.forge/context.md` to the current ISO date.

## Trigger 3 — Reusable pattern

**Detect:** during coding, a solution shape will clearly repeat (test idiom, error-handling pattern, concurrency shape, workflow). The agent recognises this either because it already solved the same shape earlier in the session, or knows it will be applied again immediately.

**Action:**
1. Read `.forge/knowledge/patterns.md` (if it exists) — apply semantic dedup (see `save.md`).
2. If an existing pattern covers this concern: UPDATE conservatively (extend `## Where applied`, preserve `created:` and `## Pattern` body).
3. Otherwise, APPEND a new entry (separated by `---`) using `skills/forge/templates/pattern.md`. Target 10-25 lines.
4. Update `.forge/index.md` — `## Patterns` section.
5. Update `last_consolidation`.

## Trigger 4 — Pitfall

**Detect:** during debugging or discovery, the agent learns something that should warn future work: a breaking assumption, a wrong default, a subtle behaviour, a library quirk.

**Action:**
1. Read `.forge/knowledge/pitfalls.md` (if it exists) — apply semantic dedup.
2. If present, UPDATE (add a note or refine the workaround). Otherwise, APPEND a new entry with frontmatter (`name`, `keywords`, `paths_involved: [<files/modules where this applies>]`) and body. Target 10-25 lines.
3. If the pitfall produced or was caused by a concrete bug that was then fixed: ALSO write `.forge/bugs/BUG-<NNN>.md` using `skills/forge/templates/bug.md` (find next ascending number). The bug file and pitfall entry cross-reference each other.
4. Update `.forge/index.md` — `## Pitfalls` and `## Open Bugs` as applicable.
5. Update `last_consolidation`.

## Trigger 5 — Decision made

**Detect:** the agent considered 2+ concrete options and chose one with non-obvious rationale. Typical signals: "we could use X or Y, chose X because…", "picked approach A over B for …", "rejected the simpler path because …". Usually surfaces during feature work or architectural discussion.

**Action:**
1. Propose the save inline to the user: *"Save this decision? (one-line summary / skip)"*. A single clarifying line is enough — do NOT stall the task.
2. If user confirms (or says nothing and the decision is clearly non-trivial):
   - Read `.forge/knowledge/decisions.md` (if it exists) — apply semantic dedup.
   - APPEND a new entry using `skills/forge/templates/decision.md` (or UPDATE an existing related one). Target 15-30 lines.
3. Update `.forge/index.md` — `## Decisions` section.
4. Update `last_consolidation`.
5. If user says "skip", do NOT save. Record nothing — a rejected save is a signal the decision isn't actually memorable.

## Trigger 6 — Sync / desync

**Detect** (probe at task start when `.forge/index.md` already exists):

```bash
git log --since="<last_consolidation>" --oneline -- . ":(exclude).forge/"
```
Lists commits that touched code (outside `.forge/`) since last consolidation.

```bash
git log --since="<last_consolidation>" --name-only --pretty=format: -- package.json Cargo.toml Package.swift pyproject.toml go.mod Gemfile pom.xml build.gradle composer.json
```
(omit missing manifests; dedupe) lists manifest files changed since `last_consolidation`.

Do NOT use `git diff <date>..HEAD` — `git diff` requires revisions on both sides, not dates.

Additionally (or instead, for projects without git): check that file paths in `modules/<name>.md:path`, `features/<name>.md` file lists, and enriched module `## Key files` still exist on disk.

**Action:**

If either probe returns non-empty:
1. Summarise changes in one short paragraph (N commits, which manifests, which paths are stale).
2. Ask: *"Memory was last consolidated on `<last_consolidation>`. Refresh dependencies and module listings? (y/n)"*
3. If **yes** — bounded refresh:
   - Re-parse manifests; rewrite `.forge/knowledge/dependencies.md` entirely.
   - Directories on disk but not in `.forge/modules/`: create seeded stubs.
   - Entries in `.forge/modules/` whose `path:` no longer exists: set `status: removed` (keep file for keyword history).
   - Do NOT re-enrich existing non-seeded module entries.
   - Update `last_consolidation` to now.
4. If **no** — record staleness in the current session log under `## Known staleness`. Proceed.

## Trigger 7 — Recall (proactive + pre-flight + reactive)

Three modes share one trigger because they all read from memory.

### 7a. Proactive recall at task start

**Detect:** the user gives the agent a substantive task (feature, bug, refactor) that will involve editing code. `.forge/index.md` exists.

**Action** (runs automatically, no user prompt):
1. Read `.forge/index.md`.
2. Extract 3-5 salient keywords from the user's task (+ synonyms).
3. Score index entries: 2+ keyword overlaps = high, 1 = low, 0 = skip.
4. Load the top 1-3 high-relevance files. If a matched module is `seeded: true`, enrich it first (see `recall.md`).
5. Briefly announce what was loaded (e.g. *"Loaded: features/oauth2-login.md, knowledge/pitfalls.md#edge-runtime-cookies"*) so the user sees forge is active.

If no entries match with confidence, stay silent — a negative recall is a valid outcome.

### 7b. Pre-flight file warnings

**Detect:** the agent is about to use Edit / Write on a file path `P`. Before the edit, check `.forge/index.md` and `paths_involved` fields in pitfalls/bugs entries.

**Action:**
1. Scan `.forge/knowledge/pitfalls.md` and `.forge/bugs/BUG-*.md` for entries where `paths_involved` contains `P` (or an ancestor path).
2. If any match, surface them to the user BEFORE the edit:
   > ⚠️ Before editing `<P>`:
   > - **Pitfall: edge-runtime-cookies** — `cookies()` sync call crashes in edge; use `await cookies()`.
   > - **BUG-042** (resolved 2 months ago) — session-expiry race condition. Check that fix still holds.
3. Proceed with the edit. The warning is informational, not blocking.

Skip this check for trivial edits (< 5 line changes, typo fixes, formatting).

### 7c. Reactive recall on user query

**Detect:** the user's language references past work: "how did we…", "what was the decision on…", "last time we did…", "like we did in…".

**Action:** same as 7a (keyword match + lazy load), but the user's query is the explicit source of keywords.

## Not invoked for

- One-shot scripts or throwaway code.
- Single-file fixes that produce no new project-level insight.
- Routine tasks: typos, formatting, pure renames, mechanical refactors with no new reasoning.
- Tasks the user explicitly says are "quick and dirty" or "not worth remembering".
- Projects where no `.forge/` exists AND the user has not signalled memory is wanted. (Bootstrap is Trigger 1 — invoked on first substantive work, not on drive-by edits.)

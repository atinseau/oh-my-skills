# Trigger 6 — Sync / desync

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
4. If **no** — if a session file will be written later in the cycle, add a `## Known staleness` section to it listing the detected changes verbatim. If no session file is expected (nothing memorable in this cycle), skip silently — the next consolidation will re-detect the drift. Proceed with LOAD on known-stale memory either way.

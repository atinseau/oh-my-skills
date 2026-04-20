# Audit (manual mode)

`.forge/` ages silently. Paths rename, bugs stop being relevant, duplicates accumulate. Audit surfaces rot so the user can fix it — forge never auto-deletes or auto-rewrites during audit. The output is a report; the user decides the follow-up.

## Detect

Manual invocation only. Triggers:

- Explicit: "forge audit", "audit memory", "check forge", "audit .forge/", or any variant where the user asks forge to review its own memory health.
- Implicit: the user reports stale warnings, suspicious recall, or asks "what's in `.forge/`?" / "is `.forge/` still clean?".

NEVER run audit automatically (not on task start, not on save, not on bootstrap). NEVER write, rename, or delete during audit — audit is read-only.

## Procedure

Budget: max 30 file reads. Read-only.

### 1. Stale paths (dead `paths_involved`)

For each entry in `.forge/knowledge/pitfalls.md` and every `.forge/bugs/BUG-*.md`:

1. Extract `paths_involved: [...]` from frontmatter.
2. For each path, test existence on disk (file or directory).
3. If absent:
   - Try `git log --all --diff-filter=R --follow -- <path>` to detect a rename; suggest the new path if found.
   - Otherwise flag as "missing — file deleted or never committed".

Without this check, pre-flight warnings degrade to silence on renamed/deleted files.

### 2. Orphans (files in `.forge/` but not in `index.md`)

1. Walk `.forge/` recursively.
2. List every `.md` file.
3. Compare with entries referenced in `index.md`.
4. Flag any file not referenced — it should either be indexed or deleted.

### 3. Ghost index entries (in `index.md` but no backing file)

For each entry in `index.md`:

1. Resolve the backing file (e.g. `- BUG-042 — ...` → `bugs/BUG-042.md`; `- <name> — keywords: ...` under `## Pitfalls` → entry named `<name>` in `knowledge/pitfalls.md`).
2. If missing, flag as ghost entry — should be removed from the index.

### 4. Stale entries (old + untouched code)

For each pitfall entry and each resolved `bugs/BUG-*.md`:

1. Read `date:` (pitfall) or `resolved:` (bug) from frontmatter.
2. If > 6 months old:
   - Run `git log --since="<that-date>" -- <each path in paths_involved>`.
   - If no commits since that date on any of the involved paths, flag as "stale — code untouched since entry was written; may no longer apply".

Stale ≠ wrong. The entry may still be valid. Flag is informational.

### 5. Semantic duplication candidates

For each pair of entries in `knowledge/pitfalls.md`:

1. Compute keyword overlap from `keywords:` frontmatter.
2. If ≥ 3 keywords shared OR `paths_involved` fully overlap, flag as "possible duplicate — manual review recommended".

The agent does not merge duplicates automatically — consolidation is a human judgment call.

## Output shape

Print a structured report (stdout only, no writes). Group by category, include file references so the user can jump directly to each finding:

```
=== Forge audit — 2026-04-20 ===

Stale paths (2)
  - knowledge/pitfalls.md#edge-runtime-cookies
      paths_involved: src/auth/old-session.ts
      status: missing on disk
      hint: possible rename to src/auth/session.ts (git log --follow)
  - bugs/BUG-012.md
      paths_involved: src/api/client.ts
      status: missing on disk
      hint: no rename found

Orphans (1)
  - .forge/bugs/BUG-099.md (not referenced in index.md)

Ghost index entries (0)

Stale entries (1)
  - knowledge/pitfalls.md#jwt-refresh-timing
      date: 2025-09-14 (> 6 months)
      paths_involved: src/auth/jwt.ts (no commits since 2025-08)

Possible duplicates (1)
  - pitfalls#session-race + pitfalls#jwt-refresh-timing
      shared keywords: jwt, session, race

Summary: 4 findings across 4 categories. No changes written. Review and fix manually.
```

If all categories are empty:

```
=== Forge audit — 2026-04-20 ===

No findings. Memory is healthy.
```

## What audit does NOT do

- **No auto-deletion.** Ever.
- **No auto-rewrite of paths.** The agent suggests renames; the user confirms and applies.
- **No semantic rewrite of entries.** Merging two pitfalls is a human call.
- **No git commit.** Audit writes nothing to disk.
- **No network.** All reads are local filesystem + `git log`.

## After audit — applying fixes

Fixes run through the normal save path. Each is a distinct, user-approved operation:

- **Path rename** — update `paths_involved` in the affected entry, regenerate `.forge/index.md`, update `last_consolidation` in `context.md`.
- **Deletion** (stale or ghost) — remove the file / entry block, regenerate index, update `last_consolidation`.
- **Merge duplicates** — rewrite as a single entry, preserve the oldest `date:`, take the union of `keywords` and `paths_involved`, regenerate index.

See `save.md` for the compact-discipline and index-regeneration rules that apply to any write.

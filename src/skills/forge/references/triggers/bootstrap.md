# Trigger 1 — Bootstrap (mines the codebase)

**Detect:**
- The user begins work on a project directory.
- `.forge/index.md` does NOT exist.

**Action — bounded intelligent scan (budget: max 20 file reads):**

1. **Shallow scan:** list project root and one level deep. Do NOT recurse.
2. **Manifest + README:** read `README.md` (fall back to `README.txt` / `README.rst`); read any manifest present: `package.json`, `Cargo.toml`, `Package.swift`, `pyproject.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `Makefile`, `composer.json`, `justfile`.
3. **Git hot spots** (if `.git/` exists) — informational only, used to shape `context.md`:
   ```bash
   git log --since="6 months ago" --stat --pretty=format: | awk '/^ [^|]*\|/ {print $1}' | sort | uniq -c | sort -rn | head -10
   ```
   Surfaces the 10 most-touched files — tells you which areas are alive, which are stable.
4. **Git bug signals** (if `.git/` exists) — informational only:
   ```bash
   git log --since="6 months ago" --pretty="%s" | grep -iE '^(fix|bug|resolve)' | head -20
   ```
   Extract recurring subject keywords (e.g. "session", "auth", "rate-limit") — these hint at fragile areas. Do NOT seed pitfalls from them (MVP: pitfalls are only saved when a real one is discovered during work — Trigger 2).
5. **Architectural sniff:** read 3-5 files from hot spots (entry points: `index.*`, `main.*`, `src/app/layout.*`, `src/lib/*.ts`, etc.). Infer: framework idioms, state management, auth approach, layering.
6. **Write `.forge/context.md`:**
   - Frontmatter: `languages:`, `frameworks:`, `package_manager:`, `build_cmd:`, `test_cmd:`, `lint_cmd:` (leave empty if nothing inferred — do not guess), `detected_at: <ISO>`, `last_consolidation: <same ISO>`.
   - Body: 3-8 sentences condensing what distinguishes this project (stack specifics, structure, non-obvious conventions spotted during the sniff).
7. **Write `.forge/index.md`** with `updated: <ISO>` frontmatter and a `# Index` heading. Sections (`## Open Bugs`, `## Pitfalls`) are omitted on bootstrap — no content yet. That is a valid empty state.
8. **Stop on budget exhaustion:** if 20 file reads are consumed before step 7, write what exists and proceed to step 7. Bootstrap is bounded; the rest accumulates via other triggers.

## Out of MVP bootstrap scope

The previous version of forge seeded `modules/<name>.md` stubs and `knowledge/decisions.md` entries inferred from the codebase. Both are dropped:

- **Module stubs** — lazy enrichment on recall added complexity (seeded flag, atomic enrichment, 5-file read budget) for benefit we could not measure. Modules, if re-added later, will be populated on demand, not seeded at bootstrap.
- **Inferred decisions** — guessing "chose custom JWT over NextAuth" from file layout is unreliable; users can describe real decisions in ADRs or PR bodies. Forge MVP does not invent decisions.

If future demand justifies either, reintroduce them with a dedicated trigger, not a bootstrap-time inference.

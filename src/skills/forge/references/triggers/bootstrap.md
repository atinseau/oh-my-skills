# Trigger 1 — Bootstrap (mines the codebase)

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

# Forge v2 — Project Memory Skill

**Status**: Design
**Date**: 2026-04-20
**Replaces**: forge v1.0.2 (deleted from `src/skills/forge/`, full history preserved in branch `feat/forge` commits)

## 1. Why v2

v1.x tried to be a full development framework (7-step loop, TDD enforcement, architecture guard, QA discipline, 20 universal rules). Two problems:

1. **60% duplication with superpowers.** `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, `requesting-code-review` already exist as focused, battle-tested skills. Forge v1 reinvented them.
2. **Heavy opinion-load.** The discipline parts (TDD, architecture rules, QA) are opinionated and universally invoked — most users would abandon after one cycle.

What forge uniquely brings is **persistent project memory** — something no other skill in the ecosystem provides. v2 strips to that essential value.

## 2. What v2 is

A **project memory skill**. Auto-invoked when relevant. Compact format. Lazy + intelligent loading. No discipline imposed beyond "what's worth remembering".

It composes with (does not replace) existing superpowers skills:
- Claude uses `test-driven-development` for TDD
- Claude uses `systematic-debugging` for bugs
- Claude uses `forge` for "remember / recall this project's context"

## 3. Cardinal principles

1. **Auto-invoked, not always-on** — forge activates on specific signals (see §6 triggers), not on every task.
2. **Save only what's memorable** — no log-everything ceremony. A no-op cycle doesn't produce a session file.
3. **Compact format** — 10-30 lines per entry, keyword-indexed, scannable.
4. **Lazy loading** — `.forge/index.md` is the light entry point; deeper files load only when keywords match the current task.
5. **No discipline imposed** — forge remembers; other skills enforce.

## 4. Skill layout

```
src/skills/forge/
├── SKILL.md                      # Triggers + save/recall workflow (~80 lines)
├── references/
│   ├── memory-structure.md       # .forge/ layout, frontmatter schemas, index format, merge conflicts
│   ├── save.md                   # When to save, which template, how to stay compact
│   ├── recall.md                 # On-demand loading, keyword match, lazy enrichment
│   └── triggers.md               # The 6 auto-invocation signals
└── templates/
    ├── feature.md                # Feature completed — goal, learnings, follow-ups
    ├── bug.md                    # Bug resolved — symptom, root cause, fix, lesson
    ├── pattern.md                # Reusable pattern — idiom, test shape, workflow
    ├── decision.md               # Architectural decision — context, choice, rationale
    └── session.md                # Session log (compact, only when memorable)
```

No `profiles/` directory. No `qa-runner.md`, `tdd.md`, `investigation.md`, `architecture-guard.md`, `profile-authoring.md`. No `project-bootstrap.md` as a separate reference — bootstrap is a trigger, folded into `triggers.md`.

## 5. Per-project artefact: `.forge/`

```
.forge/
├── index.md                          # Table of contents, max 100 lines, derived
├── context.md                        # Project summary: languages, frameworks, commands, last_consolidation
├── modules/
│   └── <name>.md                     # One file per module, built lazily on first reference
├── knowledge/
│   ├── patterns.md                   # Reusable patterns (cumulative, appended)
│   ├── pitfalls.md                   # Traps + workarounds (cumulative, appended)
│   ├── decisions.md                  # Architectural decisions (cumulative, appended)
│   └── dependencies.md               # Extracted from manifests
├── features/<name>.md                # One file per completed feature
├── bugs/BUG-<NNN>.md                 # One file per resolved bug
└── sessions/<date>-<topic>-<author-slug>.md   # Only when the session produced memorable learning
```

**Changes from v1:**
- `config.md` renamed to `context.md` (clearer: it's not just config, it's the project's condensed context).
- `architecture/modules.md` becomes `modules/<name>.md` (one file per module, not a shared file with `## <name>` blocks). Simpler, composable, no block-level merge conflicts.
- `knowledge/patterns.md` and `knowledge/decisions.md` added (new template types).
- `qa/` directory removed — QA is out of scope. If a project tracks QA, it's via `patterns.md` (test patterns) or `decisions.md` (testing-strategy decisions).

### Compact formats — examples

**`context.md`:**
```markdown
---
languages: [typescript, sql]
frameworks: [nextjs-15, drizzle]
package_manager: bun
build_cmd: bun run build
test_cmd: bun test
lint_cmd: bun run lint
detected_at: 2026-04-20
last_consolidation: 2026-04-20
---

# MyApp — Next.js SaaS

Auth via custom JWT (no NextAuth). Postgres via Drizzle. Tailwind + shadcn for UI.
Monorepo: web app at `apps/web`, shared schema at `packages/schema`.
```

8-line body. Everything else is either in `modules/` or `knowledge/`.

**`session.md`** (only written when memorable):
```markdown
---
date: 2026-04-20
author: arthur-tweak
task: add-login-page
result: pass
keywords: [auth, login, server-action]
---

## Learnings
- Server Actions: `cookies()` sync in edge runtime crashes. Use `await cookies()`.
- `.safeParse()` + branch is 3× faster than try/catch + narrows types better.

## Follow-ups
- Rate-limit /login
```

~15 lines. No "what was asked" (Claude has it in context). No "iterations" unless >1.

**`pattern.md`** (new):
```markdown
---
name: zod-safe-parse-branching
keywords: [validation, zod, error-handling]
created: 2026-04-20
---

## Pattern
`const r = schema.safeParse(input); if (!r.success) return errorResponse(r.error);`

## Why here
Replaces try/catch for Zod validation in server actions. Narrower types, ~3× faster.

## Where applied
- `app/(auth)/login/actions.ts`
- `app/(auth)/register/actions.ts`
```

## 6. The 6 triggers (auto-invocation)

SKILL.md `description` frontmatter lists these so Claude invokes forge on match:

1. **Starting work on an unfamiliar codebase** — if the user's first task in a project references code paths Claude hasn't seen, forge is invoked to either bootstrap `.forge/` (if absent) or load relevant memory (if present).
2. **Completing a feature worth remembering** — forge writes `features/<name>.md` + potentially `patterns.md` / `decisions.md` entries.
3. **A reusable pattern surfaces** — test style, architecture idiom, workflow that will be used again. Forge writes `patterns.md` entry.
4. **A pitfall is discovered** — bug that future work should be warned about. Forge writes `pitfalls.md` entry (or updates bug file if fixed).
5. **Project state may have drifted from memory** — after `git pull`, after noticing file paths in memory no longer exist, after manual edits. Forge runs the desync probe and asks the user.
6. **Needing to recall past context on a topic** — user references "how did we do X" / "what was the decision on Y". Forge reads index, matches keywords, loads relevant files.

**Not invoked for:**
- Every cycle of development
- One-shot scripts
- Single-file throwaway edits
- Code that hasn't produced anything memorable

### `description` frontmatter (the Claude-routing signal)

```yaml
description: Project memory layer. Auto-invoke when starting work on an unfamiliar codebase, completing a feature worth remembering, discovering a reusable pattern, learning a pitfall, detecting that memory may be stale (post-pull/sync), or recalling past context the user references. Compose with test-driven-development / systematic-debugging / verification-before-completion from superpowers — forge remembers, those skills enforce discipline. Do NOT invoke for one-shot scripts, throwaway edits, or routine tasks that produce nothing memorable.
```

## 7. Save discipline (references/save.md)

When a trigger fires that requires writing:

1. **Pick the right template** — feature / bug / pattern / decision / session.
2. **Stay compact** — target the line counts from §5 examples. No redundant fields.
3. **Always set `keywords:`** — 3-6 terms that will match a future recall query.
4. **Update `index.md`** after any save (regenerate from directory content).
5. **Update `last_consolidation`** in `context.md`.
6. **Deduplicate** — before writing a pattern or pitfall, check if an equivalent already exists. If yes, update rather than add.

### When NOT to save

- Task produced no new learning (implemented exactly as Claude would have without forge).
- Task is a typo fix, formatting change, rename, or pure refactor with no new insight.
- The "learning" would be a generic programming observation, not something specific to this project.

If nothing is memorable, **no session file is written** for that cycle. Forge is not a diary; it's a knowledge base.

## 8. Recall discipline (references/recall.md)

When a trigger fires that requires reading:

1. **Read `index.md` first** — always the entry point. Never scan the whole `.forge/`.
2. **Keyword match** — compare the user's task language against keywords in the index.
3. **Lazy load** — read only the 1-3 files that match. If a matched module file is a stub (not yet enriched), enrich it now:
   - Read `path` from module stub
   - List directory, read 2-3 representative files (entry point, largest, or named like `index.*` / `main.*`)
   - Extract keywords (3-6), role (one sentence), key_files (2-3)
   - Rewrite the module file with enriched content
   - Regenerate `index.md`
   - Budget: max 5 files read per enrichment
4. **If no match** — don't over-read. Claude proceeds with the task using only what it already knows.

### When to also check knowledge/

- Task mentions testing → also read `knowledge/patterns.md` (for test patterns)
- Task mentions architecture choice → also read `knowledge/decisions.md`
- Task touches a risky area (file recently in a bug) → also read `knowledge/pitfalls.md`

## 9. Triggers detail (references/triggers.md)

For each of the 6 triggers:

### Trigger 1 — Bootstrap
Detect: user's first task in a project directory where `.forge/index.md` does not exist.
Action: shallow scan (root + one level, read README + manifest), write initial `context.md` (languages, frameworks, commands from manifest), empty `index.md`. No deep scan. Module files are created lazily on first reference.

### Trigger 2 — Feature completed
Detect: user says "done", "that's it", "ship it", or Claude determines the requested feature is fully implemented and tested.
Action: write `features/<name>.md` using template. Check if any learnings justify also writing `patterns.md` or `decisions.md` entries.

### Trigger 3 — Reusable pattern
Detect: during coding, Claude identifies a solution that will be used again (a specific idiom, a test shape, a workflow).
Action: write or update `knowledge/patterns.md` entry.

### Trigger 4 — Pitfall
Detect: during debugging or discovery, Claude learns something that should warn future work (a subtle behaviour, a wrong default, a breaking assumption).
Action: write or update `knowledge/pitfalls.md` entry. If the pitfall caused a bug, also write `bugs/BUG-<NNN>.md`.

### Trigger 5 — Sync / desync
Detect: at task start, `git log --since=<last_consolidation> -- . ":(exclude).forge/"` returns commits. OR file paths referenced in memory no longer exist on disk.
Action: ask user to refresh (y/n). Yes → bounded refresh (re-extract deps, mark removed modules). No → record `## Known staleness` note in next session log.

### Trigger 6 — Recall
Detect: user references "how did we…", "what was the…", "last time we…", or Claude needs context on an area that memory might cover.
Action: read `index.md`, match keywords, lazy-load matching files.

## 10. Composition with superpowers

Forge does not replicate:
- TDD enforcement → `test-driven-development` handles this
- Bug investigation → `systematic-debugging` handles this
- Code review / completion verification → `requesting-code-review` / `verification-before-completion` handle this
- Planning → `writing-plans` / `subagent-driven-development` handle this

When Claude is coding a feature:
- It uses `test-driven-development` for the TDD loop
- It uses `systematic-debugging` if a bug surfaces
- When the feature is done, `forge` trigger #2 fires → feature is memorized
- Next cycle, `forge` trigger #6 fires on relevant query → past context recalled

Forge and superpowers are **orthogonal**. No overlap. No competition.

## 11. Merge conflict policy (carried from v1)

`.forge/` is committed to git. Policy by file type:

- `index.md` — discard both sides, regenerate from current `.forge/` content.
- `modules/<name>.md` — per-file conflicts resolved manually; keep the more enriched version.
- `knowledge/*.md` — cumulative; take union, deduplicate.
- `sessions/<date>-<topic>-<author-slug>.md` — per-author naming eliminates collisions by construction.
- `features/*.md`, `bugs/*.md` — genuine divergence; resolve by hand.
- `context.md` — take the later `last_consolidation`.

## 12. Out of scope

- Profile system (was 2 profiles in v1; too narrow to be useful, too much maintenance).
- Development cycle / build-test-judge loop (superpowers covers this implicitly).
- Architecture rules / TDD enforcement / QA discipline (other skills' job).
- Investigation process (superpowers handles).
- 20 universal guidelines (moralizing, not memory).
- Code review (superpowers handles).

## 13. Success criteria

- `src/skills/forge/` exists with the §4 layout — 1 SKILL.md + 4 references + 5 templates. Total content < 600 lines across all files.
- Claude correctly auto-invokes forge on the 6 triggers (verified by reading `description` and sanity-checking invocation against test scenarios).
- Running forge on a fresh Next.js scaffold produces a `.forge/` with just `context.md` + empty `index.md`. No module files pre-created.
- Claude completing a feature triggers forge to write `features/<name>.md` + potentially `patterns.md` entry. No `session.md` is written if the feature produced no specific project-level learning.
- On a second task in the same project, forge's recall surfaces the prior feature's learnings if keywords match; stays silent otherwise.
- After `git pull` with real changes, forge's desync trigger fires and asks the user.
- No duplication with superpowers skills (forge does not define TDD, debugging, verification, or review processes).

## 14. Identified risks

- **Trigger false positives** — Claude invokes forge when it shouldn't. Mitigation: the `description` explicitly lists negative cases ("do NOT invoke for one-shot scripts"); early real-world usage will show the calibration.
- **Trigger false negatives** — Claude misses a real save opportunity (learning lost). Mitigation: users can explicitly ask "save this" and forge responds.
- **Stale memory accumulation** — `patterns.md`, `pitfalls.md`, `decisions.md` grow unboundedly. Mitigation: dedup on save; users can prune manually. Out of scope for v2: automatic pruning.
- **Auto-invoke conflicts with other skills** — forge fires at the same time as another skill. Mitigation: forge's actions (read/write `.forge/`) don't interfere with other skills' actions (run tests, edit code). Orthogonal by construction.

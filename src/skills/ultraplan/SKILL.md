---
name: ultraplan
description: Use when the user says "/ultraplan", asks to plan a feature or turn a spec or PRD into an implementation plan, has existing plans to merge or reconcile, asks to parallelize work across subagents, or has a plan that is slow, sequential or token-hungry to execute. Prefer it over a generic plan-writing step — it decides up front whether parallel execution pays, and hands over an ordinary sequential plan when it does not.
by: oh-my-skills
---

# Ultraplan

Compiles a spec, or existing plans, into waves of units with disjoint write-sets, run by parallel workers in isolated worktrees against frozen contracts, every requirement judged by an oracle its implementer did not write. Costs roughly **2–4× the tokens** of a sequential run; buys wall-clock only when the work is **wide**, and is a loss when it is a **chain**.

## Step 0 — shape test, before spending anything

Decline the fan-out when any of these holds:

1. the harness cannot run workers concurrently, **or** cannot point each at its own directory — asked in the **single** question batch of the run, together with the ambiguity-triage questions and the reachable model tiers. A second batch exists only for a question that reconnaissance surfaces and the codebase cannot answer
2. the work is one dependency chain: a migration sequence, an API change rippling through its callers, a delicate refactor
3. the work is too small to amortise a fan-out: the sequential baseline, sized per requirement before decomposing, is below **~11** effort (S = 2, M = 3, L = 5), or fewer than **3** write-sets could run at once without needing each other's behavior. "One area of the codebase" is a collision hint (shared registries, barrels), not a criterion
4. ambiguity that cannot be resolved now (user unavailable, or genuinely open)
5. no test suite worth the name
6. the user is token-constrained rather than time-constrained

Judge 2 and 3 from the requirement list and a glance at the files the spec names — not a full reconnaissance — and revisit them after reconnaissance if the plan goes ahead. Below ~11 no width clears 1.5×: wave 0a (2) + the longest unit (≥2) + wiring (≥2) + three gated batches (≥1.2) already cost ~7. On a decline, hand over a **sequential plan**: numbered requirements with inferred ones marked · steps in dependency order, each with the files it touches and the command that proves it · interfaces worth deciding up front, stated inline · one sentence naming the criterion that triggered. No branch, no worktree, no `plan.json`. The speedup check at the end of compilation is a backstop, not this decision. If the user disputes the criterion, compile in full and report the honest number, even below 1.

## Modes

| Mode | When | Read |
|---|---|---|
| **Forge** | a spec, PRD or issue; no plan | `references/compile.md` |
| **Merge** | one or more plans exist | `references/compile.md`, section "Merge delta" |
| **Execute** | a compiled plan; the user asks to run it | `references/execute.md` |

Oracles, reviews, verdicts, checkpoints: `references/conformance.md`. Shape, not rules: `references/example.md`. No spec and no plan: help write the spec first.

## Invariants

1. Within a wave, write-sets are disjoint **and** resource-sets are disjoint — ports, test databases, seeded fixtures, sandboxes, browser profiles, locked build caches. Git isolates files, not the machine.
2. A dependency that is only about **shape** — type, signature, schema, route, prop, event name, config key, error code, CLI flag — is frozen in **wave 0a** before any consumer runs. Wave 0a is a unit (id, write-set, acceptance), `infrastructural`, written by the orchestrator, committed first.
3. Dependency installs, codegen and lockfile changes: orchestrator, wave 0a, never inside a parallel unit.
4. A pack is complete when an agent that has never seen the repository needs no exploratory search. Profiles vary verbosity, never completeness.
5. Every unit has an acceptance command. Every requirement has an oracle written by an agent that implements none of its units, or an explicit manual exemption. Unit tests stay inside the unit.
6. No verdict is `null` in a finished run. A held or dropped lineage gets `not satisfied — blocked by U-xx` the moment it is held.
7. Plan time touches git not at all: Forge and Merge write `.oms/plans/<slug>/` and nothing else. Execute creates `plan/<slug>` and worktrees in a sibling directory; the user's checkout is never modified — the one exception is sequential mode on a harness without worktrees, announced before starting. Sequential mode is run from `references/execute.md`, never improvised from this summary.
8. Workers commit and report. Only the orchestrator merges. A merge conflict is a decomposition bug: abort, reassign the file, re-brief.
9. The orchestrator is one agent and the run's ceiling: batch merges, gate once per batch, never re-read what a report summarised, never re-verify what an acceptance command proved, update `plan.json` with targeted `jq` writes, commit it once per batch. Artifacts travel as **files**, never pasted into prompts: packs, worker reports, review packages.
11. Every decision the orchestrator takes on the user's behalf during a run is a **ruling** in `plan.json` — what, why, cost if wrong — and the final report lists them all.
10. One dated kebab-case slug names the plan directory, the branch and the worktree root.

## Profiles

Default `balanced`, and say so. Width is not a profile: take the whole harness cap unless the user is rate-limited or the worktrees will not fit on disk.

| | `light` | `balanced` | `max` |
|---|---|---|---|
| Reviewers | one session per batch, one scoped diff per unit | units with dependents, or whose brief settled an open point | one per unit |
| Worker tier | cheapest that passes acceptance | mid; cheap for mechanical units | strong on ambiguous units, mid elsewhere |
| Gate per batch | typecheck + oracles now due | + affected area's tests | + full suite |
| Packs | contract reference + one exemplar | targeted line ranges and excerpts | full pattern files quoted |

Oracles run in every profile. The reviewer column is binding.

## Harness

Ask; do not introspect. Answerable: "can you run several agents at once, each in its own directory?" Not answerable: the exact cap — assume a small number and record which. Model identifiers are verified in this harness or written `unrouted`; never a guessed name.

## Pipeline

1. Find inputs on disk (not in the conversation), pick the mode, apply step 0.
2. Ambiguity triage → decisions recorded in the plan (codebase-decidable) or one question batch (user + harness).
3. Requirements `R-nn`, inferred ones marked, re-extracted independently (`templates/briefs.md`), diffed.
4. Reconnaissance in the orchestrator, once: explorers return findings, not files.
5. Units by who-writes-which-files; coverage map; `infrastructural` label for wiring, e2e, migrations, docs.
6. Compile: edges → contracts → acceptance trap → resources → waves → tiers → metrics.
7. Packs as files under `.oms/plans/<slug>/packs/` (`templates/pack.md`), oracle specifications (`references/conformance.md`), the spec's global constraints copied verbatim into `constraints[]`.
8. Emit `.oms/plans/<slug>/plan.md` + `plan.json`, run `scripts/audit.sh`, present: metrics line, decisions, inferred requirements, contracts beside the requirement text each encodes. Projected speedup below ~1.5 → sequential plan, keep coverage map, contracts and oracle specs. Offer Execute; never start it unasked.

## Red flags — stop and re-read the rule

| "I'll just…" | Reality |
|---|---|
| compile first, the shape test can wait | step 0 is the decision; the metric is a backstop |
| split finer so the ratio clears 1.5 | one-unit-per-file; a chain is the honest answer — decline |
| small feature, but it cuts into 3 neat units | below ~11 effort the floor (~7) eats the gain; decline |
| sum the units for the baseline | baseline from the requirement list, before the cut |
| typecheck passed, skip the smoke test | a typecheck opens no connection; two worktrees, one real test each |
| copy `.env` into every worktree | six suites truncate one database; per-worktree db/port/cache or no shared wave |
| merge it, the stray write is harmless | out-of-bounds is decided before the merge; hold the lineage |
| hand-resolve this one conflict | abort; the file gets an owner; the loser is rebased and re-briefed |
| leave the verdict, it fills in later | `null` reads as a pass; write `blocked by U-xx` now |
| edit the oracle so it passes | reopen the unit with the oracle's output |
| quote the full contract, safer | once committed: path + the lines consumed |
| the workers can share the checkout this once | silent overwrite, unrecoverable; sequential mode instead |
| they asked for a plan — start executing | different consent; offer, do not start |

# Compile — from a spec or existing plans to a wave plan

Input: a spec, PRD or issue (Forge), or one or more plans (Merge — see the delta at the end). Output: `.oms/plans/<slug>/plan.md` + `plan.json` from `templates/`. Plan time touches git not at all.

## 1. Ambiguity triage

- [ ] List every point where two competent engineers would build something different — data shape, ownership, failure behavior, the edge case the spec skipped. Not style.
- [ ] **Decidable from the codebase** → resolve during reconnaissance, record as a decision in the plan.
- [ ] **Needs the user** → the run's single question batch, which also carries the step-0 harness questions (concurrency, per-worker directories, reachable models). Wait for it.
- [ ] A question surfaced by reconnaissance that the codebase cannot answer → a second batch, labelled as such; never folded silently into an assumption.
- [ ] Anything still unresolved when workers would start → freeze it in a contract, or do not fan out.
- [ ] Spec too thin to triage (no acceptance criteria) → say so, help write the spec first.
- [ ] Copy the spec's project-wide rules — version floors, dependency limits, portability, naming and copy rules — verbatim into `constraints[]`. Every pack, oracle brief and reviewer brief carries them.

## 2. Requirements

- [ ] Rewrite the spec as a flat numbered list `R-01 …`. One requirement = one behavior a user could accept or reject at one boundary; clauses of a spec bullet that are checked by the same test stay in one requirement. A feature yields four to ten.
- [ ] Implied-but-unstated requirements (auth, error and empty states, i18n, telemetry) get ids, marked `inferred`.
- [ ] Independent re-extraction: a separate agent, the spec alone, no sight of your list (`templates/briefs.md`). Diff. Anything only one side found is a miss or an inferred requirement to state.

```
R-01  A signed-in user sees an "Export CSV" button on the orders page
R-02  The export contains only that user's orders
R-03  Exports are limited to 5 per hour per user; the 6th returns 429
R-04  Every export is written to an audit log with user id and row count
```

## 3. Reconnaissance — once, in the orchestrator

- [ ] Explorers, one area each, briefed with `templates/briefs.md#explorer`: files that change (paths), the convention with **one exemplar and 15–30 quoted lines with real line numbers**, the verifying command read from the project's config. Under 200 words of prose. No reading outside the area, no line range not opened.
- [ ] Note anything in the spec the codebase contradicts.
- [ ] Meanwhile: finish the requirement list, sketch the likely contracts.
- [ ] Revisit step 0 criteria 2 and 3 now, with the baseline breakdown in hand.

## 4. Units

- [ ] One agent-session each: big enough that spawning pays, small enough that write-sets stay disjoint.
- [ ] Group by **who writes which files**, never by feature area or by layer (frontend / backend / tests).
- [ ] Each unit: outcome, size, write-set, resource-set, read-set, acceptance command, `covers`.
- [ ] Coverage map, explicit: requirement with no unit = gap; unit with no requirement = scope creep — cut or get approved. Wiring, e2e, migrations, docs are `infrastructural` and list what they serve.
- [ ] A unit's tests stay inside it; an acceptance command with no test to run is invalid.
- [ ] Never: one unit per file · drop a requirement · widen a unit past what one agent can verify · lower an acceptance command so it always passes. Work that resists parallelisation stays a chain and says so.

```
U-01 contracts + migration        infrastructural, serves all
U-02 CSV serializer               R-02
U-03 export route                 R-02 R-04
U-04 rate limiter                 R-03
U-05 orders page button           R-01
U-06 wiring + end-to-end test     infrastructural, serves all
```

## 5. Edges

Draw the graph; classify every edge:

- **True** — B needs A's *behavior*, or writes files A writes. B waits.
- **Interface** — B needs only A's *shape*: name, signature, type, column, route path, response body, prop, event name, error code, config key, CLI flag. Write the shape down; the edge disappears.

```
Naive: migration → rate limiter → route → serializer → UI button → tests     path: 6
After classification:
  route → serializer      interface  (signature)
  route → rate limiter    interface  (signature + error code)
  UI → route              interface  (path, params, content-type, error codes)
  route → migration       true       (its tests hit the table — section 7)
Compiled:
  wave 0a  contracts + migration                        orchestrator
  wave 1   serializer | route | rate limiter | UI       4 units, disjoint
  wave 2   wiring + end-to-end test                     path: 3
```

## 6. Contracts — wave 0a

- [ ] Everything an interface edge depends on, one writer: types, interfaces, function and hook signatures · schema and migrations · routes (path, method, params, bodies, status and error codes) · event and message names with payloads · component props, slots, emitted events · config keys, env vars, feature flags · shared fixture and test-data shapes · error taxonomies and message keys.
- [ ] Wave 0a is a unit: id, write-set, acceptance command, `infrastructural`, executed by the orchestrator. Also home to dependency installs, codegen, lockfile changes.
- [ ] Keep it small: a declaration belongs only if it **cuts an edge**.
- [ ] At plan time quote each declaration literally in the plan. At execute time they are committed: packs cite the path plus the lines consumed.
- [ ] A unit never edits a contract: it stops and reports.

## 7. Acceptance-command trap

- [ ] For each unit: does its acceptance need something *to exist* that a contract only *describes* (a migrated table, a generated client)? Then either (preferred) put that small prerequisite in wave 0a, or narrow the acceptance to what the unit verifies alone and let the gate catch the rest.

## 8. Resources

- [ ] Shared registry files — barrels, route registries, i18n bundles, DI containers, changelogs — belong to **one wiring unit, one wave later**; the parallel wave stays out.
- [ ] Every unit declares `uses` **positively**: how its acceptance reaches shared state, or `[]` meaning "touches none". Audit question: does any unit run tests against a database, port or browser without declaring one?
- [ ] Resources: ports, test databases, seeded fixtures, external sandboxes, browser profiles, build caches and artifact directories with an exclusive lock, append-only files (audit logs, counters). A unit's tests must pass twice in a row on the same checkout: gates re-run the suite.
- [ ] Parameterise first — database name or schema from an env var, port offset per unit, transaction rolled back per test — then declare exclusive only what cannot be shared. Whatever collapse remains goes into the projected width before a speedup is quoted.
- [ ] A resource collision schedules exactly like a file collision. It is re-checked at execute time when worktrees are created.

## 9. Waves and sizing

1. Layer topologically over **true edges only**. `dependsOn` in `plan.json` holds true edges only — an interface edge left there re-serialises the runtime while the metrics still report the speedup.
2. Within a wave, check write-sets and resource-sets pairwise. Collision → split, merge, or hand to the wiring unit.
3. Critical path starts in wave 1: the long blocking unit first.
4. A wave is as wide as it naturally is; note the cap beside it. Wider than the cap drains in two passes, still better than two waves with a gate between.
5. Size on the fixed scale **S = 2, M = 3, L = 5**: S one file or a mechanical change mirroring an exemplar · M a feature slice, a few files plus tests · L a screen or subsystem. Nothing above L: split it. Critical path is measured in effort, not hops.
6. Compute the path **against the cap**: schedule the longest units into the first pass, re-measure.

## 10. Tiers

- **cheap** — mechanical, fully specified: fixtures, repetitive edits, formatting, a migration whose columns are written down, boilerplate mirroring an exemplar.
- **mid** — bounded implementation with resolved design, read-heavy exploration, ordinary feature work with a clear acceptance command.
- **strong** — ambiguity that survived the spec, cross-cutting design, security or data-loss judgment, anything expensive to detect when wrong.

Turn count beats token price: the cheapest tier takes two to three times the turns on multi-step work. **cheap** only when the pack is a transcription — one or two files, an exemplar to mirror, a contract to satisfy; **mid** is the floor for every other unit, for reviewers and for oracle writers; escalate to **strong** for uncertainty, never for length or importance. Record `tier` and `model` separately; `model` is a verified identifier or `null` (unrouted). Routing unavailable → absorb hardness with structure: split the strong unit, freeze another contract, tighten its acceptance, or keep it in the orchestrator.

## 11. Metrics

```
sequential baseline 36 · units 14 · waves 5
critical path 15 (S,L,M,L) · cap adjustment +1 · orchestrator lane 2
projected speedup 36 / 18 = 2.0x · tokens ~3x sequential
```

- **Baseline** — computed **before decomposing**, from the requirement list: size each requirement S/M/L as if one agent did it end to end, sum, add the work any cut pays (migration, wiring, e2e, docs). Never summed from the plan's units. Record the per-requirement sizes in `metrics.baselineBreakdown` so the number can be contested line by line.
- **Denominator** — critical path against the cap **+ orchestrator lane**: ~0.4 effort per merge batch and per gate (typecheck + affected tests; more for a full suite) + any unit kept in the orchestrator + Merge-mode baseline oracles. Past ~20 units the lane dominates: fewer, larger batches or a lighter gate, never more width.
- **Report** — the adjusted figure, never the raw ratio; tokens and wall-clock separately; between ~1.2 and 1.8 a range and "close"; a single confident figure only when the band is cleared comfortably; human latency (the contracts checkpoint) and retries stated as outside the number.
- **Decline** — below ~1.5: sequential plan, keep coverage map, contracts, oracle specs; drop only the wave structure and per-unit worktrees. Near 1.0: look again for interface edges marked true. Never split finer to move the number.

## 12. Emit and present

- [ ] `templates/plan.md` + `templates/plan.json`; one pack file per unit and per oracle under `.oms/plans/<slug>/packs/<id>.md` per `templates/pack.md`; oracle specs per `references/conformance.md`.
- [ ] Vendor the scripts into `.oms/plans/<slug>/scripts/` (`SKILL.md` § Scripts); `scripts/audit.sh plan.json` from the plan directory passes; plus by hand: every acceptance command exists in this repo, every pack answers "where do I look?", nothing from the spec is unaccounted for.
- [ ] Present: metrics line · decisions · inferred requirements · wave-0a contracts, each beside the requirement text it encodes.
- [ ] Offer Execute. Do not start it.

## Merge delta

Apply step 0 first — recompiling a chain does not make it wide. Single-plan recompile ("make this faster"): skip the overlap and contradiction steps.

1. **Inventory reality.** List plans by path, read all of them fully. `git log`, `git status`, spot-check files each plan claims to create; mark each step done / partial / untouched. Say so if plans target different codebase versions.
2. **Recover requirements** from the plans as evidence of intent (`R-nn`, inferred marked), re-extracted independently from the plans alone, diffed.
3. **Specify baseline oracles** against existing behavior, marked `baseline`: run first at execute time, before wave 0a.
4. **Normalize** every step into the unit shape with provenance `from: plan-a.md#step-4`.
5. **Classify overlaps** pairwise on write-sets: duplicate (keep one, record both sources) · complementary (same files, different concerns → one unit) · contradictory (never resolve yourself).
6. **Escalate contradictions** in one batch: each plan's proposal, its cost, your pick and why. Exception: a plan made stale by work already on the branch — resolve, record as a resolved conflict.
7. **Ledger** before compiling: every input unit → kept / merged with / dropped, with a reason. Then re-check coverage per requirement after the drops: uncovered = abandoned-and-recorded, or a hole.
8. **Compile** as above. Re-derive every edge from write-sets and interfaces — inherited narrative order is false `dependsOn`. Attach oracles to coverage; carry baseline verdicts.
9. **Present** the usual metrics plus: contradictions resolved, duplicates merged, drops, requirements recovered and inferred, still covered; then the ledger and the contracts.

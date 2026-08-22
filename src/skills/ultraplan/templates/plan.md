# <Feature name>

> Compiled by Ultraplan · mode: forge|merge · profile: light|balanced|max · <YYYY-MM-DD>
> Sources: <spec or plan paths>
> Harness: parallel workers yes|no (cap N, <stated|assumed>) · isolated worktrees yes|no · tiers cheap=<id> mid=<id> strong=<id>, or unrouted
> Branch: `plan/<slug>` · worktree root: <absolute path> — created at execute time only

**sequential baseline N · critical path N (S,L,M,L) · cap adjustment +N · orchestrator lane N · projected speedup N.N× · tokens ~Nx sequential**

<!-- Speedup < 1.5: say a sequential run is the better tool, present the rest as an ordered plan, keep coverage map, contracts and oracle specs. -->

## Decisions

- <decision> — <decided from: the spec | convention <path> | the user>

Inferred requirements (strike any that don't apply):

- <R-id> <requirement>

## Reconciliation ledger <!-- Merge mode only -->

| Source | Fate | Note |
|---|---|---|
| plan-a.md#3 | U-02 | kept |
| plan-a.md#7 | dropped | already on the branch (commit …) |

## Requirements, coverage and oracles

| Requirement | Units | Oracle | Due | Re-arms | Baseline | Verdict |
|---|---|---|---|---|---|---|
| R-01 <text> | U-04, U-05 | `tests/oracles/R-01.spec.ts` | after U-05 merges (wave 2) | no | — | — |
| R-02 <text> | U-03 | manual: <criterion>, final review | — | no | — | — |

## Wave 0a — U-01 frozen contracts · infrastructural · S · orchestrator

Each contract beside the requirement text it encodes:

```ts
// src/types/<x>.ts            ← R-02 "<requirement text>"
```

Also here: <migrations, generated clients, dependency installs, lockfile changes>.

## Wave 1 — <N units in parallel>

One block per unit, in the `templates/pack.md` format.

## Wave 2 — <…>

## Gates

| After | Command |
|---|---|
| wave 0a | `<typecheck or cheapest whole-project check>` |
| wave 0a, before the first fan-out | `<one real acceptance command, concurrently in two throwaway worktrees with the ignored config materialised>` |
| every merge batch | `<typecheck> && <oracles now due> (+ affected tests / full suite per profile)` |
| final | `<lint> && <typecheck> && <full suite> && <every oracle re-run>` |

## Risks and sequential remainders

- <work left as a chain, and why>

## Conformance report <!-- filled at execute time; checkpoint 3 -->

| Requirement | Verdict | Evidence |
|---|---|---|
| R-01 | — | — |

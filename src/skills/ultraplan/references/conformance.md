# Conformance — oracles, reviews, verdicts, checkpoints

An acceptance command guards a test the same agent wrote from the same reading: it proves consistency, never correctness. Conformance is a separate mechanism.

## Oracles

- One per **requirement** (four to ten for a feature), never per unit. Id `O-nn` matching `R-nn`.
- An executable check of observable behavior at the boundary the contracts froze — HTTP route, exported function, CLI invocation, rendered screen.
- Specified from the **requirement's own words**, never from the unit brief; written at execute time by an agent that implements none of the units it judges; never in the orchestrator's lane.
- Plan time **specifies** (`templates/plan.json → requirements[].oracle`): what it asserts, at which boundary, `dueAfterUnit` = the last covering unit from the coverage map. Nothing is written to disk at plan time.
- Due before the **gate that follows the merge of its last covering unit**; never before wave 1.
- `universallyQuantified` ("on every endpoint", "all money in cents", "every screen keyboard-navigable") → `rearms: true`: due again at every later merge that adds a member of the set.
- Not mechanically checkable (visual design, copy, ergonomics) → `testable: false` + `manualCriterion`, checked at the final review.
- Never edit an oracle to make it pass; reopen the unit.

The same orchestrator reading produced contract, brief and oracle spec, so a misread *spec* passes all three. Two partial defences: independent requirement re-extraction, and the human contracts checkpoint — each contract shown beside the requirement text it encodes.

## What is checked, by what, when

| Object | Against | Trigger | Blocks |
|---|---|---|---|
| the plan | the spec | once, before execution | human |
| frozen contracts | the spec | after wave 0a, before fan-out | human |
| a unit | its brief | its merge | no |
| a requirement | observable behavior | the merge closing its last covering unit | its oracle gates; the reviewer does not |
| the whole change | spec and plan | final: integration worktree vs original branch | human |

Triggers are merges, never a clock. Reviewers are separate agents on the integration worktree (a concurrency slot); the gate is a command in the orchestrator's lane (once per batch).

## Reviewers

Brief per `templates/briefs.md#reviewer`: the requirement or brief in its original words, `constraints[]`, the contracts it consumes, and the **review package** — one file written by `scripts/review-package` (commits, stat, diff `-U10` scoped to the declared write-set) that the reviewer reads in one call. At `light`, one session per batch, still one package per unit. Withhold the implementer's report and rationale. The reviewer's lens is **Missing / Extra / Misunderstood** → `partial` / `out-of-bounds` / `contradicts-spec`; it treats any claim it cannot see in the diff as unverified; it returns `⚠️ cannot verify: <what>` for a requirement that lives outside the diff, and the orchestrator resolves each one itself before writing the verdict. The orchestrator never pre-judges a finding: a brief containing "do not flag", "at most minor" or "the plan chose" is a brief written to avoid a review. Context is a package and a paragraph, never the codebase. `balanced` reviews only the units the profile names.

## Verdicts

```
target: R-03 | U-07
verdict: satisfied | partial | not satisfied | contradicts-spec | out-of-bounds
evidence: <what in the diff satisfies it, or precisely what is missing>
```

- Those five words are the requirement vocabulary everywhere: state file, gate, report. Blocked = `not satisfied`, evidence `blocked by U-xx`. Units add exactly one word, `not reviewed` (never merged; evidence says what happened).
- `contradicts-spec` → the user, at the next integration cycle; dependents held. Only from a reviewer, never inferred from a worker's deviations.
- `out-of-bounds` → decided by the orchestrator **before merging** (changed paths vs write-set), not by a reviewer.
- Verdicts accumulate in `plan.json` as they arrive. Report and state file never disagree.
- **Never null** in a finished run: held or dropped lineage → `not satisfied — blocked by U-xx` for every requirement it covers, immediately; the unit → `not reviewed`, evidence `dropped` or `held behind U-xx`.

## Rulings

A conflict, ambiguity or plan defect found during execution is decided by the orchestrator, never parked on a question — the spec is the authority, the plan its argument — and every such decision is appended to `rulings[]`: `{ "what", "why", "costIfWrong", "at": "<unit or gate>" }`. Three things still stop the run: a contract revision after merges (checkpoint 4), a requirement change (the user's), and a plan so broken that every path is a guess.

## Spec turns out wrong

Fix it in the spec **and** the plan, not only the code. The spec is the user's: propose, get agreement, then edit. Changes a contract → contract-revision procedure (`references/execute.md`). Changes a requirement → the user decides.

## Human checkpoints — exactly three, plus one conditional

1. The compiled plan: requirements, decisions taken on the user's behalf, inferred items.
2. The frozen contracts after wave 0a, each beside its requirement text. Ask early; batch with other questions — it blocks on a person and usually costs more than the run.
3. The final diff, integration worktree vs the starting branch, every requirement's verdict and evidence beside it.
4. (conditional) A contract revised after units merged against it — cannot inherit checkpoint 2's approval.

# Execute — runbook

The orchestrator owns integration and stays thin. `$REPO` and `$WT` do not survive between shell calls in most harnesses: re-derive them at the top of every call or use literal absolute paths, and record both in `plan.json`.

```sh
REPO=$(git rev-parse --show-toplevel)
WT="$(dirname "$REPO")/$(basename "$REPO")-ultraplan/<slug>"
```

## Preflight

- [ ] **Consent** before the first wave, unless the user already said to run it.
- [ ] **Capabilities**: concurrent workers (how many), per-worker directories. No concurrency → ordered run, contracts and oracles kept, say so. No directory targeting → sequential mode (below). Never concurrent workers in one shared checkout.
- [ ] **Test suite** exists; otherwise say the conformance machinery has nothing to stand on and agree a replacement first.
- [ ] **Model identifiers** exist here; otherwise substitute the harness default and note it.
- [ ] **Plan valid**: `scripts/audit.sh plan.json`, plus by hand: every acceptance command and gate command exists in this repository (binary, script, test path).
- [ ] **Ignored files** the worktrees will not carry — list them, then ask the user which the test suite needs:

  ```sh
  git -C "$REPO" status --ignored --porcelain | grep '^!!'
  ```

- [ ] **Speedup < ~1.5** → sequential run; still use the integration worktree where the harness has worktrees.

## Integration worktree

Outside the repository, sibling directory, absolute paths only. Never reuse an existing plan branch or worktree path on a fresh start. Two runs on one machine still share ports and databases: offset one.

```sh
git -C "$REPO" worktree add -b plan/<slug> "$WT/integration" <base-branch>
mkdir -p "$WT/integration/.oms/plans/<slug>"
cp "$REPO/.oms/plans/<slug>/"* "$WT/integration/.oms/plans/<slug>/"
git -C "$WT/integration" add -f .oms/plans/<slug> && git -C "$WT/integration" commit -m "<slug>: plan"
```

`-f`: `.oms/` is often gitignored. Materialise the ignored files from preflight into the integration worktree as well, with their own DB name / ports — the gates run here. From here the committed copy is the state of record; the user's copy is stale — say so at handover. Everything below runs with `git -C "$WT/integration"`.

### Resume

Reattach — no `-b`, or nothing if the worktree still exists:

```sh
git -C "$REPO" worktree add "$WT/integration" plan/<slug>
```

Then reconcile the file against the disk — **on resume only**, patterns scoped to this slug:

```sh
git -C "$REPO" worktree list
git -C "$REPO" branch --list 'u/<slug>/*' 'o/<slug>/*'
git -C "$WT/integration" log --oneline plan/<slug>
```

Read the committed `plan.json` first; a unit it records as merged is merged (its branch was deleted). Surviving branch: commits already in the plan branch → merged · unmerged commits → finished work, integrate it · no commits → interrupted worker, drop and relaunch. Tree contents: trust git. Verdicts, deviations, baseline readings: only the file has them. Write the file back to match before launching anything.

## Baseline oracles (Merge plans)

Before wave 0a, on the plan branch as created: each `requirements[].oracle.baseline` gets its own branch `o/<slug>/<R-id>-baseline`, its own worker, merged by the orchestrator, result in `baselineVerdict` — a separate object from the run oracle. Red here is the starting position; tell the units covering those requirements.

## Wave 0a

1. Write the frozen declarations — types, schema, migrations, route signatures, shared fixtures — plus dependency installs and codegen.
2. Cheapest whole-project check: typecheck, else import/syntax pass; if only the test suite exists, say gates cost more. Commit.
3. **Concurrency smoke test**, before anything is shown to the user: two throwaway worktrees, the ignored config materialised into both, one real unit-level acceptance command in each, **concurrently**. Not the typecheck. It is a row in the gate table.
4. Checkpoint 2: the contracts, each beside its requirement text.

## Launch

Ready = every `dependsOn` merged (observed at the next integration cycle). Launch everything ready, up to the cap.

```sh
git -C "$REPO" worktree add -b u/<slug>/<id> "$WT/<id>" plan/<slug>
```

- [ ] Materialise the ignored files from preflight — with a **per-worktree** database name or schema, port offset and cache directory derived from the unit id through the environment. Config copied unchanged into several worktrees = the collision the plan declared, arriving now; either parameterise or those units do not share a wave.
- [ ] Dependencies: install, or link from a shared store — never from the user's checkout. Check disk cost first; cap concurrent worktrees below the harness cap if needed. A build cache with an exclusive lock (Cargo target dir) is per-worktree or declared in `uses`.
- [ ] **Re-render the pack**: each quoted contract → path + the lines consumed. Sequential mode: also rescope the acceptance to the unit's files.
- [ ] Hand over pack + contract paths + return-report format (`templates/pack.md`). Commit and report, never merge.
- [ ] `plan.json`: `status: running` + branch, **at launch**.

**Oracles are units**: branch `o/<slug>/<R-id>` from the plan branch, own worktree, write-set = its spec files only, a resource-set, commit → report → merged in the same loop. Launch writers from wave 1 as slots free up, in due-date order. A due oracle not merged **fails the gate**: finish it, merge it, re-gate. Check the file exists before running it (runners exit 0 on an empty glob). Writer failed → verdict `not satisfied — oracle not written`.

## Integrate — per reported unit

1. Uncommitted changes in `$WT/<id>`? Commit them.

   ```sh
   git -C "$WT/<id>" status --porcelain
   ```

2. Bounds, **before merging**:

   ```sh
   git -C "$WT/integration" diff --name-only plan/<slug>...u/<slug>/<id>
   ```

   Outside the write-set → do not merge. Hold the lineage (verdicts `not satisfied — blocked by U-xx`, oracles' due dates pushed). Then either re-brief to revert the unowned paths, or amend the plan to grant them after checking nothing in flight claims them. Never adopt silently.

3. Merge serially:

   ```sh
   git -C "$WT/integration" merge --no-ff u/<slug>/<id>
   ```

4. Conflict → decomposition bug:

   ```sh
   git -C "$WT/integration" merge --abort
   ```

   Give the file an owner (usually the wiring unit: amend its write-set, re-render its pack; if it already merged, reopen it). Note what the loser was adding. Rebase the loser onto the plan branch before retrying. Finish the batch without it, gate, treat it as a new arrival next batch.

5. Read `deviations`: a changed contract, a rename, an "also fixed" neighbour breaks siblings. Store them in `plan.json`, not in your context.
6. Clean up, and update `plan.json` (status, review verdict, deviations) with a targeted `jq` write — never read-modify-write the whole file:

   ```sh
   git -C "$REPO" worktree remove "$WT/<id>"
   git -C "$WT/integration" branch -d u/<slug>/<id>
   ```

   `branch -d` from the integration worktree, not `$REPO` (its HEAD is the user's branch). Dropped unit: `--force` / `-D`, deliberately.

## Integrate — per batch

```sh
git -C "$WT/integration" add -f .oms/plans/<slug> && git -C "$WT/integration" commit -m "<slug>: state after batch N"
```

- [ ] Gate: the profile's check + oracles now due. One gate per batch.
- [ ] Reviews the merges unlocked: units per profile, requirements whose last covering unit landed. `contradicts-spec` → user now, dependents held.
- [ ] Write every field the batch changed before committing: `units[].status`, `units[].review`, `units[].deviations`, `requirements[].verdict` + `evidence`, `requirements[].oracle.merged` / `.status`, and `baselineVerdict` when a baseline ran.
- [ ] `plan.json` committed = the handoff if the session ends.

## Failures

| Event | Do | Write |
|---|---|---|
| unit fails acceptance | retry once with the output appended to its pack → escalate one tier (single-model harness: split into `U-05a`/`U-05b`, replacing the original in `requirements[].units`) → stop the lineage, drop worktree and branch | dependents `held`; their requirements `not satisfied — blocked by U-xx` |
| oracle fails after merge | not a unit failure: reopen the unit with the oracle's output; never edit the oracle | unit `reopened` |
| reopen a merged unit | recreate from the integration branch as it stands, branch `u/<slug>/<id>-r2`, original pack + oracle output | `reopened` |
| contract wrong, nothing merged against it | stop the wave, fix in the orchestrator, commit, relaunch affected units from the new base | — |
| contract wrong, units merged against it | stop launching · checkpoint 4 with the human · change and commit the contract · reopen affected units **in series** (`-r2`, each from integration after the previous merged) · suspend the gate until the last merges, then gate + every oracle those units cover. Past ~⅓ of merged units or a chain longer than the sequential baseline: recompile from the corrected spec | `contractRevisions[]`: contract, change, invalidated units |
| spec wrong | the user; no retry count answers a question nobody asked | — |
| orchestrator context full | packs were too thin, reports too fat; resume from `plan.json` | — |

## Finish

1. Full project verification on the integration worktree **and every oracle re-run**, not only those due.
2. Report what happened: changes by area · every requirement with verdict and evidence (never blank; Merge: baseline verdict beside it) · what was verified, commands and numbers · what still fails, quoted · what was left out and why · deviations and the unit that introduced them.
3. Hand over the branch and the diff against the starting branch. Merging, pushing and opening a PR are the user's.

## Sequential mode

Either capability missing. Say so; quote no speedup. Keeps contracts (wave 0a first), the coverage map, packs, oracles and verdicts.

- Worktrees but no concurrency: integration worktree, checkout untouched, width one.
- Neither: the user's tree — ask first, they commit or stash — `git -C "$REPO" switch -c plan/<slug>`.
- Units in dependency order, one at a time; acceptance scoped to the unit's files; global checks at the gate.

```sh
git -C "$REPO" add -- <the unit's write-set>
git -C "$REPO" commit -m "U-02: <outcome>"
```

Out-of-bounds = anything in `git status --porcelain` outside the write-set. Failed unit:

```sh
git -C "$REPO" checkout -- <tracked paths in the write-set>
git -C "$REPO" clean -f -- <the write-set>
```

Delivery unchanged: a branch, and a diff against where the user started.

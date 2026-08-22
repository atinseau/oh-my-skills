# Sub-agent briefs

## explorer — reconnaissance, one area each

```
Report on <area> in this repo. Return findings, not file dumps.
1. Which files would change to <do X>? Give paths.
2. What is the existing convention for <Y>? Name one exemplar file, and quote
   the 15-30 lines that show the pattern, with their real line numbers.
3. What command verifies this area? Read it from the project's own config.
Under 200 words of prose plus the paths and that one excerpt. Do not read
files outside <area>, and never cite a line range you did not open.
```

## re-extractor — independent requirement list

Give the spec (Forge) or the source plans (Merge) alone. No sight of your list.

```
Read <spec or plans>. Enumerate every verifiable requirement it states or clearly
implies, one per line, numbered. Mark implied ones "(inferred)". Return the list
and nothing else.
```

Diff against yours. Anything on one side only is a miss or an inferred requirement to state.

## oracle writer — one per requirement, at execute time

Must implement none of the units covering the requirement. Gets a pack (`templates/pack.md`) whose outcome is the requirement's own wording, whose write-set is the oracle's spec file only, and whose `Uses` declares the resources the check needs.

```
Write an executable test asserting, at <boundary: route | exported function |
CLI | screen>, that: <requirement text, verbatim>. Project constraints:
<constraints[] verbatim>. Assert observable behavior
only; do not read the implementing units' code or tests. <re-arm note if
universally quantified>. File: <path>. Commit on <branch>; do not merge.
```

## reviewer — one scoped diff per unit

Give: the requirement or brief in the words it was written · `constraints[]` verbatim · the contracts it consumes · the path of the review package written by `<plan dir>/scripts/review-package.sh` (a header, commits, stat, and a diff scoped to the write-set — `-U10`, dropped to `-U3` when the full-context diff is too big to read in one call, which the header states). Withhold the implementer's report and rationale. Never add "do not flag", "at most minor" or "the plan chose" — let the finding come and rule on it in `rulings[]`. At `light`, one session per batch, still one package per unit.

```
Read the review package at <path> once: it is your whole view of the change.
Its header says how big it is. If the header says it was reduced or is too
large to read in one call, put that first on the "cannot verify" line — do not
review a fraction and report a clean verdict.
Judge it against the requirement and constraints below, not against its tests —
the test may encode the same misunderstanding as the code. Anything not visible
in the diff is an unverified claim. Look for what is Missing (→ partial or not
satisfied), Extra (→ out-of-bounds), Misunderstood (→ contradicts-spec). Do not
read the codebase beyond the package. Return exactly:
target: <R-id | U-id>
verdict: satisfied | partial | not satisfied | contradicts-spec | out-of-bounds
evidence: <file:line in the diff that satisfies it, or precisely what is missing>
cannot verify: <requirement clauses that live outside this diff, or "none">
```

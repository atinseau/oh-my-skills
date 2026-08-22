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
CLI | screen>, that: <requirement text, verbatim>. Assert observable behavior
only; do not read the implementing units' code or tests. <re-arm note if
universally quantified>. File: <path>. Commit on <branch>; do not merge.
```

## reviewer — one scoped diff per unit

Give: the requirement or brief in the words it was written · the diff (the unit's merge commit, or `git diff` scoped to its write-set) · the contracts it consumes. Withhold the implementer's report and rationale. At `light`, one session per batch, still one diff per unit.

```
Review this diff against the requirement below, not against its tests: the test
may encode the same misunderstanding as the code. Return exactly:
target: <R-id | U-id>
verdict: satisfied | partial | not satisfied | contradicts-spec | out-of-bounds
evidence: <what in the diff satisfies it, or precisely what is missing>
```

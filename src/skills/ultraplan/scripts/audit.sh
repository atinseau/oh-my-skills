#!/usr/bin/env sh
# Ultraplan plan.json audit. Usage: audit.sh <plan.json> [--finish]
# Exit 1 on any finding. Requires jq.
set -u
P="${1:?usage: audit.sh <plan.json> [--finish]}"; MODE="${2:-}"
command -v jq >/dev/null 2>&1 || { echo "audit: jq is required"; exit 1; }
fail=0
check() { # $1 label, $2 jq filter producing one line per finding
  out=$(jq -r "$2" "$P" 2>&1)
  if [ -n "$out" ]; then echo "✗ $1"; echo "$out" | sed 's/^/    /'; fail=1; else echo "✓ $1"; fi
}

check "every requirement has a covering unit" \
  '.requirements[] | select(.units|length==0) | .id'
check "every unit covers a requirement or is infrastructural" \
  '.units[] | select((.covers|length==0) and (.infrastructural|not)) | .id'
check "coverage map references existing unit ids" \
  '[.units[].id] as $ids | .requirements[] | .id as $r | .units[] | select(($ids|index(.))==null) | "\($r) → \(.)"'
check "write-sets disjoint within a wave" \
  '[.units[] | {w:.wave, id:.id, p:.writes[]}] | group_by([.w,.p]) | .[] | select(length>1) | "wave \(.[0].w): \(.[0].p) ← \([.[].id]|join(", "))"'
check "resource-sets disjoint within a wave" \
  '[.units[] | {w:.wave, id:.id, r:.uses[]?}] | group_by([.w,.r]) | .[] | select(length>1) | "wave \(.[0].w): \(.[0].r) ← \([.[].id]|join(", "))"'
check "dependsOn holds existing ids, all in earlier waves (true edges only)" \
  '(.units | map({key: .id, value: .wave}) | from_entries) as $w | .units[] | .id as $me | .wave as $mw | .dependsOn[] | select(($w[.] // null)==null or $w[.] >= $mw) | "\($me) → \(.)"'
check "every unit has an acceptance command" \
  '.units[] | select((.acceptance // "")=="") | .id'
check "every unit declares a resource-set (array, possibly empty)" \
  '.units[] | select(.uses==null or (.uses|type)!="array") | .id'
check "every pack names a worktree and a branch" \
  '.units[] | select((.worktree // "")=="" or (.branch // "")=="") | .id'
check "testable oracles have a path and a due unit; untestable ones a manual criterion" \
  '.requirements[] | select((.oracle.testable and (.oracle.path==null or .oracle.dueAfterUnit==null)) or ((.oracle.testable|not) and (.oracle.manualCriterion // "")=="")) | .id'
check "oracle due unit is one of the covering units" \
  '.requirements[] | select(.oracle.testable) | .oracle.dueAfterUnit as $d | select((.units|index($d))==null) | "\(.id) due after \($d)"'
check "universally quantified requirements re-arm" \
  '.requirements[] | select(.universallyQuantified and .oracle.testable and (.oracle.rearms|not)) | .id'
check "a wave-0 infrastructural unit exists" \
  '[.units[] | select(.wave==0 and .infrastructural)] | select(length==0) | "no wave-0 contracts unit"'
check "every contract is written by a wave-0 unit and consumed only by later waves" \
  '([.units[] | select(.wave==0) | .writes[]]) as $w0 | (.units | map({key:.id, value:.wave}) | from_entries) as $wv | .contracts[] | .path as $p | (select(($w0|index($p))==null) | "\($p): not in any wave-0 write-set"), (.consumedBy[] | select(($wv[.] // 1) < 1) | "\($p): consumed by wave-0 unit \(.)")'
check "testable oracles declare a resource-set and a branch" \
  '.requirements[] | select(.oracle.testable) | select((.oracle.uses|type)!="array" or ((.oracle.branch // "")=="")) | .id'
check "gate table has wave-0a, smoke test, per-batch and final rows" \
  '[.gates[].after] as $g | ["wave-0a","wave-0a, before the first fan-out","every-merge-batch","final"] | .[] | select(($g|index(.))==null) | "missing gate: \(.)"'
check "baseline estimated (non-zero) and speedup reported" \
  '.metrics | select((.sequentialBaseline // 0)==0 or (.projectedSpeedup // 0)==0) | "metrics incomplete"'

if [ "$MODE" = "--finish" ]; then
  check "finish: no null requirement verdict" \
    '.requirements[] | select(.verdict==null) | .id'
  check "finish: every merged/held/dropped/failed unit has a review verdict" \
    '.units[] | select(.status!="pending" and .status!="running" and .status!="split" and .review.verdict==null) | .id'
  check "finish: every due oracle merged" \
    '[.units[] | select(.status=="merged") | .id] as $m | .requirements[] | select(.oracle.testable) | .oracle.dueAfterUnit as $d | select((($m|index($d))!=null) and (.oracle.merged|not)) | .id'
  check "finish: no unit left running or pending" \
    '.units[] | select(.status=="pending" or .status=="running") | .id'
fi
exit $fail

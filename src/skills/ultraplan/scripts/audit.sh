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
# jq trap: inside `index(.)` the dot is the *input to index*, not the piped
# value — `$ids|index(.)` compares $ids with itself and always matches. Every
# membership test below binds the needle to a variable first.

check "no duplicate requirement or unit ids" \
  '[ ([.requirements[].id] | group_by(.) | .[] | select(length>1) | "duplicate requirement id: \(.[0])"),
     ([.units[].id]        | group_by(.) | .[] | select(length>1) | "duplicate unit id: \(.[0])") ] | .[]'
check "every requirement has a covering unit" \
  '.requirements[] | select(.units|length==0) | .id'
check "every unit covers a requirement or is infrastructural" \
  '.units[] | select((.covers|length==0) and (.infrastructural|not)) | .id'
check "coverage map references existing unit ids" \
  '[.units[].id] as $ids | .requirements[] | .id as $r | .units[] | . as $u | select(($ids|index($u))==null) | "\($r) → \($u)"'
check "unit coverage references existing requirement ids" \
  '[.requirements[].id] as $rs | .units[] | .id as $i | .covers[] | . as $c | select(($rs|index($c))==null) | "\($i) covers \($c)"'
check "every unit declares a write-set" \
  '.units[] | select((.writes|type)!="array" or (.writes|length)==0) | .id'
check "write-sets disjoint within a wave, directory containment included" \
  '[.units[] | .wave as $w | .id as $i | .writes[]? | {w:$w, id:$i, p:(sub("/+$";""))}] as $all
   | $all[] as $a | $all[] as $b
   | select($a.w == $b.w and $a.id < $b.id
            and ($a.p == $b.p or ($a.p|startswith($b.p + "/")) or ($b.p|startswith($a.p + "/"))))
   | "wave \($a.w): \($a.id) \($a.p) ↔ \($b.id) \($b.p)"'
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
check "oracle spec files are unique and collide with no unit write-set" \
  '[ ([.requirements[] | select(.oracle.testable) | .oracle.path] | group_by(.) | .[] | select(length>1) | "two oracles write \(.[0])"),
     ([.units[] | .writes[]?] as $uw | .requirements[] | select(.oracle.testable) | .id as $r | .oracle.path as $p
      | select(($uw|index($p))!=null) | "\($r): oracle \($p) is also a unit write-set") ] | .[]'
check "universally quantified requirements re-arm" \
  '.requirements[] | select(.universallyQuantified and .oracle.testable and (.oracle.rearms|not)) | .id'
check "a wave-0 infrastructural unit exists" \
  '[.units[] | select(.wave==0 and .infrastructural)] | select(length==0) | "no wave-0 contracts unit"'
check "every contract is written by a wave-0 unit and consumed only by later waves" \
  '([.units[] | select(.wave==0) | .writes[]]) as $w0 | (.units | map({key:.id, value:.wave}) | from_entries) as $wv | .contracts[] | .path as $p | (select(($w0|index($p))==null) | "\($p): not in any wave-0 write-set"), (.consumedBy[] | select(($wv[.] // 1) < 1) | "\($p): consumed by wave-0 unit \(.)")'
check "no unit past wave 0 writes a contract" \
  '[.contracts[].path] as $cp | .units[] | select(.wave > 0) | .id as $i | .writes[]? | . as $p | select(($cp|index($p))!=null) | "\($i) writes contract \($p)"'
check "testable oracles declare a resource-set and a branch" \
  '.requirements[] | select(.oracle.testable) | select((.oracle.uses|type)!="array" or ((.oracle.branch // "")=="")) | .id'
check "gate table has wave-0a, smoke test, per-batch and final rows" \
  '[.gates[].after] as $g | ["wave-0a","wave-0a, before the first fan-out","every-merge-batch","final"][] | . as $need | select(($g|index($need))==null) | "missing gate: \($need)"'
check "baseline breakdown recorded" \
  '.vocabulary.sizeScale as $sc | .metrics | select(.baselineBreakdown==null) | "no baselineBreakdown"'
check "baseline sum matches breakdown" \
  '.vocabulary.sizeScale as $sc | .metrics | select(.baselineBreakdown!=null) | ([.baselineBreakdown[] | $sc[.]] | add) as $sum | select($sum != .sequentialBaseline) | "breakdown sums to \($sum), sequentialBaseline is \(.sequentialBaseline)"'
check "baseline estimated (non-zero) and speedup reported" \
  '.metrics | select((.sequentialBaseline // 0)==0 or (.projectedSpeedup // 0)==0) | "metrics incomplete"'
check "metrics unit and wave counts match the plan" \
  '.metrics as $m | [ (select($m.units != (.units|length)) | "metrics.units \($m.units), plan has \(.units|length)"),
                      (select($m.waves != ([.units[].wave]|unique|length)) | "metrics.waves \($m.waves), plan has \([.units[].wave]|unique|length) distinct waves") ] | .[]'
check "worthFanningOut agrees with the projected speedup" \
  '.metrics | select(.worthFanningOut != null and ((.projectedSpeedup >= 1.5) != .worthFanningOut)) | "worthFanningOut=\(.worthFanningOut) with projectedSpeedup=\(.projectedSpeedup)"'

check "constraints[] declared (an array, empty allowed)" \
  'select((.constraints|type)!="array") | "constraints missing"'
check "rulings[] present" \
  'select((.rulings|type)!="array") | "rulings missing"'
PLANDIR=$(dirname "$P")
PH='TBD|TODO|implement later|fill in details|add appropriate|handle edge cases|similar to U-|write tests for the above'
# Collect whatever prose exists. `ls a b` fails as a whole when b is missing,
# so a plan whose packs are not written yet must not silently skip the scan.
set --
[ -f "$PLANDIR/plan.md" ] && set -- "$@" "$PLANDIR/plan.md"
for f in "$PLANDIR"/packs/*.md; do [ -f "$f" ] && set -- "$@" "$f"; done
if [ "$#" -gt 0 ]; then
  hits=$(grep -nEi "$PH" "$@" 2>/dev/null | grep -v 'audit\|placeholder' || true)
  if [ -n "$hits" ]; then echo "✗ no placeholders in plan.md / packs"; echo "$hits" | sed 's/^/    /'; fail=1; else echo "✓ no placeholders in plan.md / packs"; fi
else
  echo "✓ no placeholders in plan.md / packs (none found beside plan.json)"
fi

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

#!/usr/bin/env sh
# Write one review package — header, commits, stat, diff — to a file the
# reviewer reads in one call.
# Usage: review-package <integration-worktree> <base> <head> <outfile> [-- <write-set paths…>]
#
# The reviewer is told the package is its whole view of the change, so a
# package too big to read in one call degrades the review silently: it returns
# a verdict on the part it saw and reports nothing missing. Above
# REVIEW_PACKAGE_MAX_BYTES (default 150000) the diff context therefore drops
# from -U10 to -U3, and both the header and this script's stdout say so —
# the orchestrator never reads the package, so stdout is its only channel.
#
# Hand the reviewer the path, never the text.
set -eu
WT="${1:?usage: review-package <worktree> <base> <head> <outfile> [-- paths]}"; BASE="${2:?base}"; HEAD="${3:?head}"; OUT="${4:?outfile}"; shift 4
[ "${1:-}" = "--" ] && shift
MAX=${REVIEW_PACKAGE_MAX_BYTES:-150000}
git -C "$WT" rev-parse --verify --quiet "$BASE" >/dev/null || { echo "bad base: $BASE" >&2; exit 2; }
git -C "$WT" rev-parse --verify --quiet "$HEAD" >/dev/null || { echo "bad head: $HEAD" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"

TMP="$OUT.diff.$$"
trap 'rm -f "$TMP"' EXIT INT TERM

CTX=10
git -C "$WT" diff -U$CTX "$BASE..$HEAD" -- "$@" > "$TMP"
BYTES=$(wc -c < "$TMP" | tr -d ' ')
NOTE="full context"
if [ "$BYTES" -gt "$MAX" ]; then
  CTX=3
  git -C "$WT" diff -U$CTX "$BASE..$HEAD" -- "$@" > "$TMP"
  BYTES=$(wc -c < "$TMP" | tr -d ' ')
  NOTE="context reduced from -U10 to -U3: the full-context diff exceeded $MAX bytes"
fi
if [ "$BYTES" -gt "$MAX" ]; then
  NOTE="$NOTE. Still $BYTES bytes at -U3 — too large to review in one call: say so in your verdict rather than reviewing part of it"
fi

COMMITS=$(git -C "$WT" rev-list --count "$BASE..$HEAD")
FILES=$(git -C "$WT" diff --name-only "$BASE..$HEAD" -- "$@" | wc -l | tr -d ' ')

{
  echo "# Review package $BASE..$HEAD"; echo
  echo "## Package"
  echo "- commits: $COMMITS · files: $FILES · diff: $BYTES bytes at -U$CTX"
  echo "- $NOTE"; echo
  echo "## Commits"; git -C "$WT" log --oneline "$BASE..$HEAD"; echo
  echo "## Files changed"; git -C "$WT" diff --stat "$BASE..$HEAD" -- "$@"; echo
  echo "## Diff"; cat "$TMP"
} > "$OUT"

echo "wrote $OUT: $COMMITS commit(s), $FILES file(s), $BYTES bytes at -U$CTX — $NOTE"

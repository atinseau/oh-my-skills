# Trigger 3 — Recall (task-start + pre-flight + reactive)

Three modes share one trigger because they all read from memory. See `references/recall.md` for the full procedures and the MVP rationale.

### 3a. Task-start index read (lightweight)

**Detect:** the user gives the agent a substantive task (feature, bug, refactor) that will involve editing code. `.forge/index.md` exists.

**Action:**
1. Read `.forge/index.md` once. That's it.
2. Do NOT keyword-score or pre-load pitfalls/bug files. Deeper reads are driven by Mode 3b (pre-flight) and Mode 3c (reactive).
3. If something in the index jumps out as obviously relevant to the user's task (exact path match, verbatim keyword overlap), mention it in one line. Otherwise, stay silent.

### 3b. Pre-flight file warnings

**Detect:** the agent is about to use Edit / Write on a file path `P`. Skip for trivial edits (< 5 line changes, typo fixes, formatting).

**Action:**
1. Scan `.forge/knowledge/pitfalls.md` and `.forge/bugs/BUG-*.md` for entries where `paths_involved` contains `P` (or an ancestor path).
2. If any match, surface them to the user BEFORE the edit:
   > ⚠️ Before editing `<P>`:
   > - **Pitfall: edge-runtime-cookies** — `cookies()` sync call crashes in edge; use `await cookies()`.
   > - **BUG-042** (resolved 2 months ago) — session-expiry race condition. Check that fix still holds.
3. Proceed with the edit. The warning is informational, not blocking.

### 3c. Reactive recall on user query

**Detect:** the user's language references past work: "how did we…", "what was the decision on…", "last time we did…", "like we did in…".

**Action:**
1. Read `.forge/index.md`.
2. Extract salient terms from the user's explicit query.
3. Score index entries: ≥ 2 keyword overlaps → high, 1 → low, 0 → skip.
4. Load the top 1-3 high-relevance files (include low-relevance if < 2 high-relevance matches).
5. Announce what was loaded in one line (e.g. *"forge: loaded knowledge/pitfalls.md#edge-runtime-cookies"*).

If no entries match with confidence, say so and proceed without memory. Negative recall is a valid outcome.

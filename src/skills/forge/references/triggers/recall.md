# Trigger 7 — Recall (proactive + pre-flight + reactive)

Three modes share one trigger because they all read from memory.

### 7a. Proactive recall at task start

**Detect:** the user gives the agent a substantive task (feature, bug, refactor) that will involve editing code. `.forge/index.md` exists.

**Action** (runs automatically, no user prompt):
1. Read `.forge/index.md`.
2. Extract 3-5 salient keywords from the user's task (+ synonyms).
3. Score index entries: 2+ keyword overlaps = high, 1 = low, 0 = skip.
4. Load the top 1-3 high-relevance files. If a matched module is `seeded: true`, enrich it first (see `recall.md`).
5. Briefly announce what was loaded (e.g. *"Loaded: features/oauth2-login.md, knowledge/pitfalls.md#edge-runtime-cookies"*) so the user sees forge is active.

If no entries match with confidence, stay silent — a negative recall is a valid outcome.

### 7b. Pre-flight file warnings

**Detect:** the agent is about to use Edit / Write on a file path `P`. Before the edit, check `.forge/index.md` and `paths_involved` fields in pitfalls/bugs entries.

**Action:**
1. Scan `.forge/knowledge/pitfalls.md` and `.forge/bugs/BUG-*.md` for entries where `paths_involved` contains `P` (or an ancestor path).
2. If any match, surface them to the user BEFORE the edit:
   > ⚠️ Before editing `<P>`:
   > - **Pitfall: edge-runtime-cookies** — `cookies()` sync call crashes in edge; use `await cookies()`.
   > - **BUG-042** (resolved 2 months ago) — session-expiry race condition. Check that fix still holds.
3. Proceed with the edit. The warning is informational, not blocking.

Skip this check for trivial edits (< 5 line changes, typo fixes, formatting).

### 7c. Reactive recall on user query

**Detect:** the user's language references past work: "how did we…", "what was the decision on…", "last time we did…", "like we did in…".

**Action:** same as 7a (keyword match + lazy load), but the user's query is the explicit source of keywords.

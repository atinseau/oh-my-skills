# Investigation — Systematic Debugging

6-step process for finding and fixing bugs. Loaded when the task is a bug fix or when a test fails during the cycle.

## When to Use

- User reports a bug
- A test fails during the TEST step
- QA fails during Step 5 (QA)
- The build fails and the cause is not obvious

## The 6 Steps

### Step 1: REPRODUCE

Make the bug observable and repeatable.

**Via test:**
Write a test that demonstrates the broken behavior. The test must fail with the current code.

```pseudocode
test "BUG-<NNN>: describe the broken behaviour" {
  sut := Module(MockDependency())
  result := sut.brokenAction()
  assert result == expectedCorrectBehaviour
  // This test FAILS — proving the bug exists
}
```

**Via QA:**
If the bug is reproducible via the project's QA flow, run that flow (`.forge/qa/` scripts) to capture the broken state and describe it in `.forge/bugs/BUG-<NNN>.md`.

### Step 2: ISOLATE

Narrow down which module is responsible.

1. Read `.forge/architecture/modules.md` — which modules could be involved?
2. Read the source files of candidate modules
3. If the bug spans modules, bisect:
   - Add logging or assertions at module boundaries
   - Determine where the correct value becomes incorrect
4. Identify the SINGLE module that owns the bug

### Step 3: ROOT CAUSE

Find WHY, not just WHERE.

Ask these questions:
- What assumption does this code make that is violated?
- When did this assumption become invalid? (A recent change? Always broken?)
- Is this a data issue, a timing issue, a logic issue, or an API misuse?
- Can I express the root cause in one sentence?

If you can't explain it in one sentence, you haven't found it yet.

Format: "When [condition], [module] [does wrong thing] because [reason]."

### Step 4: FIX

Modify ONLY the module identified in Step 2.

Rules:
- The fix should be minimal — change as little as possible
- Do not refactor surrounding code as part of the fix
- Do not fix other bugs you notice — document them in `.forge/bugs/` for later
- If the fix requires changing a protocol, update all conformances

### Step 5: VERIFY

1. Run the reproduction test from Step 1 — it must now PASS
2. Run ALL tests for the affected module — no regressions
3. If the bug was QA-relevant, re-run the project's QA flow and confirm it passes
4. Verify no unexpected changes elsewhere

### Step 6: DOCUMENT

Create or update `.forge/bugs/BUG-<NNN>.md`:

```markdown
---
id: BUG-<NNN>
status: resolved
keywords: [keyword1, keyword2]
created: YYYY-MM-DD
---

# BUG-<NNN>: {Title}

## Symptom
{What the user sees}

## Root cause
{One sentence: why this bug exists}

## Fix
{What was changed and why}

## Verification
{How we confirmed the fix: reference the reproduction test and, if relevant, the QA flow used.}

## Lesson
{Pattern to avoid in the future}
```

The **Lesson** is the most important field. It prevents the same class of bug from recurring.

## Good lesson examples

- "Never mutate a shared collection before the replacement is ready — use atomic swap: `new = compute(); shared = new`."
- "Always validate decoded data from persistent storage — migrations or manual edits can leave stale formats that silently decode to empty defaults."
- "Concurrency warnings are real bugs, not noise — if the compiler/linter flags a race, fix the design instead of suppressing it."
- "When launching background work, captured values must be safe to share — wrapping them in escape hatches hides the race, doesn't fix it."

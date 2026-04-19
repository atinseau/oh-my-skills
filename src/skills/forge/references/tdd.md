# Test-Driven Development

No code without a test. The test must fail before the implementation exists.

## Core rule

Write the test first. Run it. Watch it fail. Then write the implementation.

**Exception — adding tests to existing code**: when the task is purely to improve coverage on already-working code, the test may pass immediately. If it passes unexpectedly on new code, you have not tested what you think — the test is wrong or the implementation already existed. If a "new" test passes and reveals a silent bug, switch to investigation mode before proceeding.

## TDD cycle

1. Write the test — describe the behaviour you want
2. Run it — verify it fails
3. Write minimal code — just enough to make the test pass
4. Run it — verify it passes
5. Refactor — clean up, extract, simplify
6. Run it — verify it still passes
7. Proceed to the next ACT step

## Test naming

One test = one behaviour. The name describes exactly what is verified.

Good: `searchReturnsResultsRankedByRelevance`, `bookmarkTogglePersistsToDatabase`
Bad: `testSearch`, `testEverything`, `test1`

## Mocking via interfaces

Every service has an interface (Swift: `protocol`, Rust: `trait`, TypeScript: `interface`). Tests inject a mock that conforms to that interface — never a concrete production dependency.

```
interface SearchService {
  search(query): Result[]
}

class FakeSearchService implements SearchService {
  search(query) { return fixedResults }
}

test("search returns ranked results") {
  service = FakeSearchService()
  results = service.search("query")
  assert results[0].score >= results[1].score
}
```

The active profile refines the syntax — this file is about the discipline.

## Integration tests

At least one test must traverse the entire pipeline end-to-end.

```
test("full pipeline returns relevant results") {
  raw = parse(input)
  chunks = chunk(raw)
  embeddings = embed(chunks)
  results = search(embeddings, query)
  assert results.length > 0
}
```

Use an in-memory or ephemeral store — never hit the real database or network. (This applies to unit and integration tests. QA flows under `.forge/qa/` may legitimately exercise real infrastructure when the strategy calls for it.)

## Performance tests

When the task is a performance issue, write a timed test first — assert the bound before optimising.

```
test("search completes within 200ms") {
  start = clock.now()
  search(query)
  elapsed = clock.elapsed(start)
  assert elapsed < 200ms
}
```

Use your language's timing primitive: `Instant::now()` in Rust, `performance.now()` in JS/TS, `Date` in most others.

## Anti-patterns

- Implementation before test
- Test that passes without the implementation (you are not testing what you think)
- Tests that do not fail when the code is broken
- Mocking via monkey-patching instead of an interface
- One test covering multiple unrelated behaviours

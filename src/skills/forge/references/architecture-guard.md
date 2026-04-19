# Architecture Guard

Verification rules applied at every ACT step on every file you create or modify.

## Checks

Run these on every file you create or modify.

### 1. File size limit

Max 300 lines per file.
If exceeded after your change: identify the secondary responsibility, extract it into a new file, update `.forge/architecture/modules.md`.

### 2. Single responsibility

One file = one responsibility. Generic roles (profiles may refine):

- UI / view (presentation only)
- state holder (ViewModel / store / controller)
- service (one domain operation, typically I/O)
- model (data types)
- interface / protocol / trait (contract definition)
- test (tests for one module)

If a file holds mixed roles, split it.

### 3. Interface contracts

Every service has an interface/protocol/trait. Consumers depend on the interface, not the concrete type.

```pseudocode
interface SearchEngine {
  search(query: string): Result[]
}
class ConcreteSearchEngine implements SearchEngine { ... }
class SearchViewModel {
  constructor(engine: SearchEngine) { ... }
}
```

Consumer depends on `SearchEngine`, not `ConcreteSearchEngine`.

### 4. No god objects

Rough thresholds (indicative): ~8 stored properties, ~10 public methods.
If exceeded: group related properties/methods, extract each group into a dedicated type, original type holds references.

### 5. Dependency injection

Dependencies via constructor/parameter. No hidden singletons.

```pseudocode
// Good
constructor(database: Database, engine: SearchEngine) { ... }

// Bad
const db = GlobalRegistry.instance  // hidden singleton
```

### 6. No hardcoded values

Named constants or configuration for magic numbers, URLs, timeouts. No inline literals spread across the codebase.

```pseudocode
// Good
const MAX_RETRIES = 3
fetch(config.apiUrl, timeout: config.requestTimeout)

// Bad
fetch("https://api.example.com", timeout: 5000)
```

### 7. Errors visible, never silent

No empty `catch`. No error suppression without a written justification comment. Errors reach the caller or the user; they are not swallowed.

## When a check fails

Do not proceed to BUILD. Fix the violation in the current ACT step. Note the fix in the session log (MEMORIZE).
If the fix requires touching files outside the current task scope, document it in `.forge/knowledge/pitfalls.md` as technical debt and proceed.

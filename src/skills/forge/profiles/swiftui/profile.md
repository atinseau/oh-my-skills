---
name: swiftui
description: Apple platforms (iOS, macOS, watchOS, tvOS) using SwiftUI and Swift Testing.
detect:
  files: [Package.swift, "*.xcodeproj", "*.xcworkspace"]
commands:
  build: xcodebuild build -scheme <scheme> -destination '<destination>'
  test: xcodebuild test -scheme <scheme> -destination '<destination>'
  lint: swiftlint
---

# SwiftUI profile

Apple platforms — iOS, macOS, watchOS, tvOS. Uses SwiftUI for views and Swift Testing for tests.

## When this profile activates

When any of these files exists at the project root: `Package.swift`, `*.xcodeproj`, `*.xcworkspace`.

## Rules

### Architecture
- Protocol for every service (dependency injection via constructor).
- No `@unchecked Sendable`. Fix the design instead of suppressing the warning.
- `@MainActor` on ViewModels. `actor` for I/O services (database, network, filesystem).
- Use `any Protocol` existentials for dependency holders, not concrete types:
  ```swift
  private let engine: any SearchEngineProtocol
  ```

### SwiftUI views
- Views = pure display. Zero business logic.
- `@State` for local UI state only — never for data that outlives the view.
- Extract sub-views when the body crosses 50 lines.
- `accessibilityIdentifier()` on every interactive element. Convention: `<screen>-<element>` (e.g. `settings-reset-button`, `search-query-field`).
- `.task { ... }` modifier for async work, not `.onAppear { Task { ... } }`.
- Previews with representative mock data.

### Error handling
- No force unwrap (`!`). If you truly know it's non-nil, use `guard let` with a descriptive failure.
- No `try?` without a written justification comment explaining why a silent failure is acceptable.
- Errors visible to the user (alert, error state) — never silent.

### Tests
- Swift Testing framework preferred for new tests (`@Test`, `@Suite`, `#expect`). Existing XCTest tests are acceptable; do not rewrite without cause.
- Mocks via protocols. Every service has a protocol; production and mock both conform.
- Database tests use in-memory databases (`AppDatabase.empty()` or equivalent); never hit the real DB.
- If `swift-snapshot-testing` (PointFree) is a project dependency, use it for view snapshot tests. Otherwise rely on the project's QA flow in `.forge/qa/`.

### Concurrency
- `@MainActor` on ViewModels, on UI-driving types, and on anything touching SwiftUI state.
- `actor` for services holding mutable state used across tasks.
- Never `@unchecked Sendable` — if the compiler complains, the design is wrong.
- `Task.detached` only when explicitly escaping the current actor; captured values must be genuinely `Sendable`.

## Notes for the agent

### Resolving `<scheme>` at bootstrap
Run:
```bash
xcodebuild -list 2>/dev/null | grep -A 20 "Schemes:"
```
Take the first non-test scheme. Prefer one matching the project name.

### Resolving `<destination>` at bootstrap
- For `macOS` apps (platform in `Package.swift` includes `.macOS`, or the Xcode project target is macOS): `platform=macOS`.
- For iOS apps: `platform=iOS Simulator,name=iPhone 16` (or the latest available simulator). Verify with:
  ```bash
  xcrun simctl list devices | grep -E "iPhone [0-9]+ "
  ```
- If the project targets multiple platforms, ask the user which is the primary for this work session.

Persist the resolved values into `.forge/config.md` by substituting them in the `build_cmd` / `test_cmd` lines.

### On dependency change
After modifying `Package.swift`, run:
```bash
xcodebuild -resolvePackageDependencies
```
before BUILD. Update `.forge/knowledge/dependencies.md` at MEMORIZE.

### Large projects
For projects with 1000+ Swift files, bump the Bash tool timeout to 300000 (5 min) on BUILD and TEST. Xcode incremental builds are fast (~5s) but clean builds can take several minutes.

### Crash diagnosis
If an app crashes on launch during QA:
```bash
ls -lt ~/Library/Logs/DiagnosticReports/ | head -5
```
Read the most recent crash report; document findings in `.forge/knowledge/pitfalls.md`.

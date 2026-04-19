# Profile Authoring

A profile contributes detection patterns, optional build/test/lint commands, and high-level architecture & process rules for a language or framework. Profiles are short and focused — they guide the agent, not the linter.

## Directory layout

v1: one file — `profiles/<name>/profile.md`.
A profile can later become a directory with sub-files if content grows (e.g. `profiles/<name>/rules/concurrency.md`, `profiles/<name>/rules/tests.md`). That's acceptable; keep the directory named `profiles/<name>/` and the entry point `profile.md`.

## Frontmatter schema

Required fields:
- `name` — string; must match the directory name
- `description` — one-line human description
- `detect` — object with:
  - `files: [<glob>, <glob>]` — globs tested against project root
  - `contents: [{file: <path>, matches: <regex>}]` — optional, for content-based detection

Optional field:
- `commands` — object with `build`, `test`, `lint`. Any can be omitted.
  - Use `<placeholder>` syntax (angle brackets) for values the agent resolves at bootstrap.

Example:

```yaml
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
```

## Body content

Free-form markdown. Recommended sections (in order):

### `## When this profile activates`
One sentence restating the detection logic in human terms.

### `## Rules`
Grouped by theme. Each theme is a `### Subsection`. Common themes:
- Architecture
- Concurrency (if relevant to the language)
- Error handling
- Tests
- Language paradigms (ownership, type safety, etc.)

Rules are **short, actionable bullets**, not essays. Each rule is something the agent should apply or check in code.

### `## Notes for the agent`
Anything the agent needs at bootstrap or during cycles: how to resolve `<placeholder>` values (e.g., detect scheme via `xcodebuild -list`); post-dependency-update commands; large-project timeouts; monorepo considerations.

## Rule scope — what belongs in a profile

**Cardinal rule:** architecture & process concerns only.

| Allowed | Not allowed |
|---|---|
| Architecture (file size, SRP, DI, module boundaries) | Formatting (indent, quotes, semicolons) — linter territory |
| Process (TDD patterns specific to the stack, error-handling idioms) | Naming conventions — linter territory |
| Language paradigms (concurrency model, ownership, type safety) | Import order — linter territory |
| Safety invariants (`no force unwrap`, `no unsafe without justification`) | Tactical preferences ("prefer `map` over `for`") — review territory |

If a linter can enforce it, it does NOT belong in a profile.

## Detection patterns

- **File patterns**: globs tested against project root. Prefer the most specific marker (e.g. `next.config.*` over `package.json`, which is ambiguous).
- **Content patterns**: use when file presence is ambiguous. Example: a profile for "React SPA" might require `react` in `package.json` dependencies, not just the file's existence.

## Command placeholders

- Syntax: `<placeholder>` (angle brackets).
- Resolved once at bootstrap by the agent, persisted in `.forge/config.md`.
- Typical placeholders: `<scheme>`, `<destination>`, `<target>`, `<workspace>`.
- Each placeholder should be documented in `## Notes for the agent` — how to find the value, or when to ask the user.

## Multi-profile interaction

A project can have multiple active profiles (e.g., `typescript` + `nextjs` + `react`).
- Typically only ONE profile provides `commands` (the "build owner"); others contribute rules only.
- The agent arbitrates at bootstrap. If multiple profiles declare `commands`, the agent asks the user which profile owns the build.
- Profile authors: prefer to omit `commands` unless your profile is the natural build owner. This avoids conflicts.

## Checklist for a new profile

Before submitting:
- [ ] frontmatter is valid YAML (parseable by a standard YAML loader)
- [ ] `detect.files` matches only projects of this type (tested on 2+ real projects)
- [ ] `commands` placeholders (if any) are documented in "Notes for the agent"
- [ ] Rules are architecture & process only — zero formatting/linting rules
- [ ] Rules are short, actionable bullets — not prose
- [ ] Under 150 lines total (if larger, split into directory layout per `## Directory layout`)
- [ ] Tested that the profile activates correctly on a real project (bootstrap detects it)

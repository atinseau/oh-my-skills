---
name: rust
description: Rust projects using Cargo. Applies to binaries, libraries, and workspaces.
detect:
  files: [Cargo.toml]
commands:
  build: cargo build
  test: cargo test
  lint: cargo clippy -- -D warnings
---

# Rust profile

Cargo-based Rust projects — binaries, libraries, workspaces.

## When this profile activates

When `Cargo.toml` exists at the project root. For workspaces, this is the top-level `Cargo.toml` with `[workspace]`; individual member crates also have one. The agent resolves workspace structure at bootstrap.

## Rules

### Architecture
- Modules ≤ 300 lines (the universal cap applies; restate for emphasis in Rust projects where large `mod.rs` files drift common).
- Public API surface is explicit: declare with `pub` or `pub(crate)`. Avoid unintentional re-exports via `pub use *`.
- Crate boundaries mirror domain boundaries. If a module has zero coupling with the rest, consider extracting a sub-crate in a workspace.
- `unsafe` blocks require a written safety comment immediately above, documenting the invariants the caller must uphold:
  ```rust
  // SAFETY: `ptr` is non-null and aligned; we hold the only mutable reference.
  unsafe { *ptr = value; }
  ```

### Error handling
- Errors via `Result<T, E>`. Define error types with `thiserror` (or an equivalent) — concrete, typed, convertible.
- No `unwrap()` or `expect()` in production code paths without a justification comment. They are acceptable in tests, examples, and `main.rs` when paired with a clear message explaining the invariant.
- No panic in library code. Libraries return `Result`; only binaries may panic on unrecoverable conditions.
- Error conversion via `From` / `?`. Avoid manual `.map_err(...)` when a `From` impl exists or can be added.

### Concurrency
- Prefer `async` + `tokio` for I/O-bound work. Use `std::thread` only when async adds no value (CPU-bound, no `.await` in the path).
- Do NOT `.await` while holding a `std::sync::Mutex` guard. Use `tokio::sync::Mutex` or restructure to release before awaiting.
- `Send + Sync` bounds on shared state are written explicitly, not left to the compiler to infer where reviewers miss them.
- For channels: `tokio::sync::mpsc` for async contexts, `std::sync::mpsc` or `crossbeam` for sync contexts.

### Tests
- Unit tests in `#[cfg(test)] mod tests { ... }` at the bottom of the source file they test.
- Integration tests in `tests/` directory, one file per scenario. Each test file is a separate crate; use `common/mod.rs` for shared fixtures.
- Mocks via traits + dependency injection. Constructors take `impl Trait` or `Arc<dyn Trait + Send + Sync>`; never concrete types.
- `cargo test` must pass. `cargo clippy -- -D warnings` must be clean.
- Prefer `assert_eq!` / `assert!` with a message when the failure context isn't obvious.

### Type safety
- Use the type system to encode invariants: `NonZeroU32`, `NonEmpty<T>`, newtype wrappers around primitive IDs.
- Parse, don't validate: convert untrusted input into a typed representation at the boundary, then trust it inside.
- Avoid `Option<Option<T>>` and `Result<Result<T>>` — flatten or redesign.

## Notes for the agent

### Commands
No placeholders in the base commands — Cargo is self-contained. Persist the commands as-is into `.forge/config.md`.

### Dependency changes
Cargo fetches automatically on `cargo build` after `Cargo.toml` edits; no separate resolve command needed. Update `.forge/knowledge/dependencies.md` at MEMORIZE when a dependency changes.

### Workspaces
Detect workspaces by checking the top-level `Cargo.toml` for a `[workspace]` section. The `workspace.members` field lists member crates.

- Single workspace, building everything: `cargo <cmd>` at the workspace root works.
- Targeting one member: use `cargo <cmd> -p <member>` or run inside the member directory.
- If the project is a workspace with 3+ members, ask the user at bootstrap which member(s) the current session targets. Persist the choice in `.forge/config.md` Decisions.

### Formatting vs lint
`rustfmt` handles formatting; don't include formatting rules in this profile. If `rustfmt.toml` exists, the project has a custom format — respect it. Run `cargo fmt --check` as part of lint if present:

```bash
cargo fmt --check && cargo clippy -- -D warnings
```

### Feature flags
Many crates have optional features. For non-default feature sets:
- Build: `cargo build --no-default-features --features <feature-list>`
- Test all feature combinations: `cargo hack test --feature-powerset` if `cargo-hack` is installed.

If the project uses non-default features, record the canonical combination in `.forge/config.md`.

### Performance work
Use `criterion` for micro-benchmarks (if already a dependency). Use `cargo flamegraph` or `perf` for profiling. Record findings in `.forge/qa/` or `.forge/knowledge/`.

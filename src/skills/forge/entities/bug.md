# Bug

Used by: `.forge/bugs/BUG-<NNN>.md` (`<NNN>` zero-padded ascending: 001, 002, …).

## Frontmatter

- `id: BUG-<NNN>` — matches filename
- `status: open | resolved`
- `keywords: [<list>]`
- `paths_involved: [<path>, <path>]` — **mandatory**; powers pre-flight warnings (see `recall.md`)
- `created: <ISO date>`
- `resolved: <ISO date>` — set when status flips to resolved

## Body

`## Symptom` / `## Root cause` / `## Fix` / `## Verification` / `## Lesson`

## Example (filled)

```markdown
---
id: BUG-001
status: resolved
keywords: [jwt, session, expiry]
paths_involved: [src/auth/jwt.ts, src/auth/middleware.ts]
created: 2026-04-20
resolved: 2026-04-21
---

## Symptom
Login token not refreshed on expiry — user silently logged out.

## Root cause
`middleware.ts` checked `exp` but never called the refresh endpoint.

## Fix
Added refresh call in `jwt.ts` before rejecting expired tokens.

## Verification
`bun test src/auth/` passes; manual check on staging shows session persists across the `exp` boundary.

## Lesson
Refresh before rejecting; don't assume the client handles it.
```

## Blank (copy this to start)

```markdown
---
id: BUG-<NNN>
status: resolved
keywords: [<kw1>, <kw2>]
paths_involved: [<path/to/file>, <path/to/module/>]   # files or directories where the bug manifested — enables pre-flight warnings
created: <YYYY-MM-DD>
resolved: <YYYY-MM-DD>
---

## Symptom
<What the user observed.>

## Root cause
<One sentence: why this bug existed.>

## Fix
<Minimal description of the change.>

## Verification
<How we confirmed the fix (test, manual check, QA flow).>

## Lesson
<Pattern to avoid in the future. The most important field.>
```

# Module schema

Used by: `.forge/modules/<name>.md` (one file per module, built lazily on first reference).

## Frontmatter

- `name` — module identifier (matches filename)
- `path` — directory or file path
- `keywords: [<3-6 terms>]` — absent when `seeded: true`
- `status: active | removed` — `removed` keeps file for keyword history (optional)
- `seeded: true` — stub created at first reference, not yet enriched (optional)

## Body

Absent when `seeded: true`. When enriched: `## Role` (one sentence), `## Key files` (2-3 bullets), `## Dependencies` (optional).

## Examples

Seeded stub:

```markdown
---
name: auth
path: src/auth/
seeded: true
---
```

Enriched:

```markdown
---
name: auth
path: src/auth/
keywords: [jwt, session, login, middleware]
---

## Role
Handles authentication via custom JWT.

## Key files
- `src/auth/jwt.ts` (sign/verify tokens)
- `src/auth/middleware.ts` (route guard)
```

## Save template

See `skills/forge/templates/module.md` for the ready-to-fill blank.

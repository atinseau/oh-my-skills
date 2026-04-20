# Pattern schema

Used by: `.forge/knowledge/patterns.md` (cumulative; entries separated by `---`).

## Frontmatter

- `name` — short identifier (kebab-case)
- `keywords: [<list>]`
- `created: <ISO date>`

## Body

- `## Pattern` — what the pattern is; 2-4 sentences
- `## Why here` — why it fits this project specifically
- `## Where applied` — files or modules that use it

## Example

```markdown
---
name: zod-safe-parse-branching
keywords: [validation, zod, error-handling]
created: 2026-04-20
---

## Pattern
Use `schema.safeParse()` instead of `schema.parse()` everywhere.
Check `.success` and branch; never let Zod throw into an unhandled path.

## Why here
API routes return structured JSON errors — throwing breaks that contract.

## Where applied
- `app/api/**/*.ts` (all route handlers)
- `src/lib/validators.ts`
```

## Save template

See `skills/forge/templates/pattern.md` for the ready-to-fill blank.

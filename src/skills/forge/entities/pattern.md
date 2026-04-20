# Pattern

Used by: `.forge/knowledge/patterns.md` (cumulative; entries separated by `---`).

## Frontmatter

- `name` — short identifier (kebab-case)
- `keywords: [<list>]`
- `created: <ISO date>`

## Body

- `## Pattern` — what the pattern is; 2-4 sentences
- `## Why here` — why it fits this project specifically
- `## Where applied` — files or modules that use it

## Example (filled)

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

## Blank (copy this to start)

```markdown
---
name: <pattern-slug>
keywords: [<kw1>, <kw2>, <kw3>]
created: <YYYY-MM-DD>
---

## Pattern
<One-liner or short code example showing the shape.>

## Why here
<1-2 sentences: what problem this solves in this project.>

## Where applied
- `<path>`
- `<path>`
```

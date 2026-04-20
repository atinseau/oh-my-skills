# Pitfall schema

Used by: `.forge/knowledge/pitfalls.md` (cumulative; entries separated by `---`).

## Frontmatter

- `name` — short identifier for the pitfall
- `keywords: [<list>]`
- `paths_involved: [<path>, <path>]` — **mandatory**; files/directories where this pitfall applies. Powers pre-flight warnings (see `recall.md` → "Pre-flight").
- `date: <ISO date>`

## Body

One-sentence description of the trap, then a `**Workaround**:` line with the fix.

## Example

```markdown
---
name: edge-runtime-cookies
keywords: [nextjs, edge, cookies]
paths_involved: [src/middleware.ts, app/api/]
date: 2026-04-20
---

`cookies()` from `next/headers` throws in Edge Runtime — it requires Node.js runtime.

**Workaround**: set `export const runtime = 'nodejs'` at the top of any route that reads cookies.
```

## Save template

No template — pitfalls are written inline as entries in `knowledge/pitfalls.md`, separated by `---`. Use the frontmatter + body structure above.

# Context schema

Used by: `.forge/context.md` (single file at root of memory).

## Frontmatter

- `languages: [<list>]` — programming languages detected
- `frameworks: [<list>]` — frameworks and major libraries
- `package_manager: <name>` — e.g. bun, npm, pnpm
- `build_cmd`, `test_cmd`, `lint_cmd` — empty string is valid
- `detected_at: <ISO 8601 date>` — bootstrap time, never changes
- `last_consolidation: <ISO 8601 date>` — updated on every forge write; drives the sync/desync trigger

## Body

3-8 sentences on stack specifics, structure, and conventions worth remembering. Not a full architecture document — a condensed briefing.

## Example

```markdown
---
languages: [typescript, sql]
frameworks: [nextjs-15, drizzle]
package_manager: bun
build_cmd: bun run build
test_cmd: bun test
lint_cmd: bun run lint
detected_at: 2026-04-20
last_consolidation: 2026-04-20
---

# MyApp — Next.js SaaS

Auth via custom JWT (no NextAuth). Postgres via Drizzle. Tailwind + shadcn for UI.
Monorepo: web app at `apps/web`, shared schema at `packages/schema`.
```

## Save template

See `skills/forge/templates/context.md` for the ready-to-fill blank.

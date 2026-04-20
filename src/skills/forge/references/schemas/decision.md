# Decision schema

Used by: `.forge/knowledge/decisions.md` (cumulative; entries separated by `---`).

## Frontmatter

- `name` — short identifier (kebab-case)
- `keywords: [<list>]`
- `created: <ISO date>`
- `inferred: true` — optional; set by bootstrap when inferring from existing code (not an explicit session decision)

## Body

- `## Context` — why the decision was needed
- `## Options considered` — bullet list of alternatives evaluated
- `## Chosen` — what was picked and one-line rationale
- `## Consequences` — trade-offs or downstream effects to be aware of

## Example

```markdown
---
name: custom-jwt-over-nextauth
keywords: [auth, jwt, nextauth, decision]
created: 2026-04-20
---

## Context
Need session management; NextAuth felt heavyweight for a simple JWT flow.

## Options considered
- NextAuth — full-featured but adds abstraction layers
- Custom JWT — lean, full control, fits existing Drizzle user table

## Chosen
Custom JWT. Fewer dependencies; team already comfortable with manual token handling.

## Consequences
Must implement refresh rotation and revocation manually.
```

## Save template

See `skills/forge/templates/decision.md` for the ready-to-fill blank.

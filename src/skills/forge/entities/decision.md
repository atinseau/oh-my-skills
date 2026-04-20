# Decision

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

## Example (filled)

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

## Blank (copy this to start)

```markdown
---
name: <decision-slug>
keywords: [<kw1>, <kw2>]
created: <YYYY-MM-DD>
---

## Context
<1-2 sentences: what problem triggered the decision.>

## Options considered
- <Option A> — <one-line pro/con>
- <Option B> — <one-line pro/con>

## Chosen
<Which option + one-sentence rationale.>

## Consequences
<What this choice means going forward (constraints, trade-offs accepted).>
```

# Session schema

Used by: `.forge/sessions/<date>-<topic>-<author-slug>.md`.
Written **only** when the session produced a project-level learning — routine sessions don't produce a file.

## Filename

`<date>` (`YYYY-MM-DD`) + `<topic>` (2-4 word kebab-case slug) + `<author-slug>`.
For `<author-slug>` derivation, see `memory-structure.md` → "Session filename rule".

## Frontmatter

- `date: <ISO date>`
- `author: <full email>`
- `topic: <short description>`
- `result: pass | fail`
- `keywords: [<list>]`
- `iterations: <n>` — optional; include only when >1

## Body

- `## Learnings` — bullet list of memorable findings
- `## Follow-ups` — optional; tasks or questions deferred
- `## Known staleness` — optional; added when a Trigger 6 refresh was declined

## Example

```markdown
---
date: 2026-04-20
author: arthurtweak@gmail.com
topic: oauth2 login implementation
result: pass
keywords: [oauth2, login, google, session]
---

## Learnings
- Google's `hd` param gates OAuth to a hosted domain — handy for internal tools.
- State cookie must be `SameSite=Lax` to survive the redirect back from Google.

## Follow-ups
- Implement refresh-token rotation before going to prod.
```

## Save template

See `skills/forge/templates/session.md` for the ready-to-fill blank.

# Feature schema

Used by: `.forge/features/<name>.md` (one file per completed feature).

## Frontmatter

- `name` — matches filename
- `status: in-progress | done | abandoned`
- `keywords: [<list>]`
- `paths_involved: [<path>]` — optional; main files touched
- `created: <ISO date>`

## Body

`## Goal` (one sentence) / `## Approach` (2-4 sentences) / `## Files` (bullets) /
`## Learnings` (1-3 bullets) / `## Follow-ups` (optional)

## Example

```markdown
---
name: oauth2-login
status: done
keywords: [oauth2, login, google, session]
paths_involved: [src/auth/, app/api/auth/]
created: 2026-04-20
---

## Goal
Add Google OAuth2 login alongside email/password.

## Approach
Authorization Code flow. State param in short-lived cookie.
Token exchange in API route; session written via existing JWT helper.

## Files
- `app/api/auth/callback/route.ts` (new)
- `src/auth/jwt.ts` (extended)

## Learnings
- Google's `hd` param restricts to a hosted domain — useful for internal tools.

## Follow-ups
- Add refresh-token rotation (deferred).
```

## Save template

See `skills/forge/templates/feature.md` for the ready-to-fill blank.

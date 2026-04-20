# Feature

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

## Example (filled)

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

## Blank (copy this to start)

```markdown
---
name: <feature-slug>
status: done
keywords: [<kw1>, <kw2>, <kw3>]
created: <YYYY-MM-DD>
---

## Goal
<One sentence: what this feature does for the user.>

## Approach
<2-4 bullets on the implementation shape. Non-obvious only.>

## Files
- `<path>` (role)
- `<path>` (role)

## Learnings (1-3 bullets)
- <Project-specific insight worth remembering.>

## Follow-ups
- <Known deferred work.>
```

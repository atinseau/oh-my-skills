# Worked plan — team workspaces

Spec: invitations by email, three roles, an audit trail, an admin screen, expiry.

```
R-01  An owner creates a workspace and invites people by email
R-02  The invite email links to an accept page; accepting creates a membership
R-03  Roles owner/admin/member are enforced on every workspace endpoint      ← universally quantified
R-04  Every membership change is written to an audit log
R-05  Admin screen lists members and pending invites, and changes roles
R-06  Invites expire after 7 days, cannot be accepted, and are purged nightly
```

## Edges

| Edge | Kind | Resolution |
|---|---|---|
| endpoints → `requireRole()` | interface | freeze signature + 403 code; endpoints stub it in their tests |
| endpoints → audit writer | interface | freeze `writeAudit(event)` |
| accept → issue | interface | freeze token format + verification signature |
| admin screen → endpoints | interface | freeze route table, payloads, status codes |
| email sender → template | interface | freeze the props |
| everything → schema | **true** | migration must have run for any DB test |
| purge job test → real invites | **true** | needs `issue` to work |
| invite UI → admin shell | **true** | renders inside it |
| invite UI → issue behavior | **true** | drives the real endpoint |
| e2e → all | **true** | |
| wiring → every unit adding a route | **true** | single owner, one wave later |

## Plan

```
WAVE 0a  U-01 contracts · S · migration, types, role enum + error codes, deps · orchestrator

WAVE 1   U-02 requireRole() guard            M
         U-03 workspace CRUD endpoints       M
         U-04 invite issue + token mint      M
         U-05 invite accept                  M
         U-06 audit log writer               S
         U-07 invite email + sender          S
         U-08 admin shell + members table    L   ◄ critical
         O-01…O-06 oracle writers, deadline-scheduled into slack

WAVE 2   U-09 wiring: routes, barrels, i18n  S   infrastructural, serves all
         U-10 role enforcement sweep         M
         U-11 nightly purge job              M   ⚑ exclusive test DB

WAVE 3   U-12 admin invite flow              M   ◄ critical (renders inside U-08)

WAVE 4   U-13 e2e invite → accept → visible  L   ⚑ test DB · infrastructural
         U-14 docs and changelog             S   infrastructural

baseline 36 (from the requirements, before the cut) · units 14 · waves 5
critical path U-01 → U-08 → U-12 → U-13 = 15 (S,L,M,L)
cap 6: wave 1 has 7 units → U-08 in the first pass, +1
orchestrator lane: 5 batches × ~0.4 ≈ 2
speedup 36 ÷ 18 = 2.0× · tokens ~26 sessions vs 1 ≈ 3× at balanced
```

`U-11` and `O-06` (the purge oracle) both want the test database exclusively; their files are disjoint, so only the resource-set keeps them from running together.

## Timeline

```
                  0    5    10   15
  U-01 contracts  ██                ◄
  U-06 / U-07       ██
  U-02…U-05         ███
  U-08 admin shell  █████           ◄
  U-09 / U-10 / U-11   ██ / ███
  U-12 invite ui         ███        ◄
  U-14 docs                 ██
  U-13 e2e                  █████   ◄
  orchestrator         ██ ██ █ █  █   merge batch + gate each
```

## Integration lane

```
R-01 U-03 U-04 U-07 → last U-04 (t5)     R-04 U-03 U-05 U-06 → last U-05 (t5)
R-02 U-05 U-07      → last U-05 (t5)     R-05 U-08 U-12      → last U-12 (t10)
R-03 U-02 U-10      → last U-10 (t8), re-arms
R-06 U-04 U-05 U-11 → last U-11 (t8)

t4   merge U-06 U-07             reviews ×2   gate: typecheck
t5   merge U-02 U-03 U-04 U-05   reviews ×4   gate + O-01 O-02 O-04
t7   merge U-08 U-09             reviews ×2   gate: typecheck
t8   merge U-10 U-11             reviews ×2   gate + O-03 O-06
t10  merge U-12                  review       gate + O-05, O-03 re-armed (U-12 adds endpoints)
t12  merge U-14                  review       gate: typecheck
t15  merge U-13                  review       gate: full suite, every oracle re-run → checkpoint 3
```

Blocking on the happy path: checkpoint 1 before t0, checkpoint 2 between t0 and t2, checkpoint 3 at the end.

## Failure cases

| | |
|---|---|
| U-12 fails acceptance | retry once with output → escalate a tier or split → hold; `R-05: not satisfied — blocked by U-12` written now |
| U-03 and U-04 both edit the route registry | abort; registry goes to U-09; loser rebased and re-briefed |
| O-06 fails at t8 | reopen U-11 on `u/<slug>/U-11-r2` with the oracle output; oracle untouched |
| token format wrong after U-04/U-05 merged | stop launching; checkpoint 4; fix + commit; reopen U-04 then U-05 in series; gate after the last |

# Worker pack

One file per unit and per oracle at `.oms/plans/<slug>/packs/<id>.md`; the worker receives the path, never the text. Complete = a worker that has never seen the repository runs no exploratory search. Commands and paths are the project's own, read from its config.

```markdown
### U-04 — Serialize orders to CSV
Wave 1 · size M · tier mid (<model id or unrouted>) · covers R-02

**Where you work**
- Worktree: `/abs/path/to/repo-ultraplan/<slug>/U-04` — run every command with
  `git -C` against this path; write nothing outside it.
- Branch: `u/<slug>/U-04`, already checked out there.

**Outcome**
`serializeOrders(rows: OrderExportRow[]): string` returns RFC 4180 CSV with a header
row, ISO-8601 dates in UTC, and amounts as decimal strings, never floats.

**Constraints** (project-wide, verbatim from the spec)
- No new dependencies.
- Node 20+; no Bun-only APIs in `src/lib`.

**Owns (may write)**
- src/lib/export/orders-csv.ts
- src/lib/export/orders-csv.test.ts

**Uses (exclusive)**
- none — tests touch no database, port, browser or shared fixture

**Reads**
- src/types/export.ts — the frozen `OrderExportRow` type, quoted below
- src/lib/export/invoices-csv.ts:1-60 — the exemplar: same layout, escaping helper,
  test style. Match it.

**Frozen contract** — `src/types/export.ts`, committed in your checkout
```ts
export type OrderExportRow = { id, createdAt (ISO-8601 UTC), customerEmail,
                               totalCents, currency: 'EUR' | 'USD' }
```

**Done when**
`bun test src/lib/export/orders-csv.test.ts` passes and `bun check-types` is clean.

**Non-goals**
- Do not touch the route handler or the UI — other units own them this wave.
- Do not edit `src/lib/export/index.ts` — the wiring unit owns it.
- Do not change `OrderExportRow`. If it is wrong, stop and report.
- Do not read outside the read-set. If it is incomplete, say so in your report
  instead of exploring.

**When you're done**
Commit on your branch. Write your full report (what you built, tests run with
output, anything unexpected) to `/abs/path/to/repo-ultraplan/<slug>/reports/U-04.md`,
then return ONLY the 6-line report below. Do not merge.
```

Field rules:

- **Where you work** — absolute path and branch, in every pack including oracles'. A worker not told its directory commits in the user's checkout.
- **Outcome** — observable result, not a procedure.
- **Constraints** — `constraints[]` copied verbatim, in every pack including oracles'. Empty is stated as "none".
- **Uses (exclusive)** — stated either way; `none` is a claim.
- **Reads** — line ranges plus a one-line reason each; exactly one exemplar.
- **Frozen contract** — full text only at plan time; once committed, path + the lines consumed.
- **Done when** — the exact command. Isolated worktree: a project-wide check is safe. Sequential mode: the unit's own files only.
- **Non-goals** — always the three: neighbouring units' files, the shared registry, the read-set boundary; always the escape hatch on contracts.
- Left out: architecture, the feature's rationale, other units' business. Verbosity follows the profile; completeness does not.

## Return report — exactly this, nothing else

```
unit: U-04
status: done | failed | blocked
branch: <branch>, committed: yes | no
files written: <paths>
acceptance: <command> → pass | fail (last 10 lines on failure)
deviations: <anything done differently from the pack, or "none">
```

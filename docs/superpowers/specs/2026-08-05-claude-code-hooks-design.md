# Claude Code hooks infrastructure + `handoff` hook

**Status:** Approved for planning
**Date:** 2026-08-05

## Problem

Long-running Claude Code sessions lose context at every boundary — the model has no built-in way to prompt the user to checkpoint before context fills up and gets compacted, silently discarding detail. The `handoff` skill (already shipped) lets a session save a rich, resumable summary on demand, but it only helps if someone remembers to invoke it before context pressure gets high.

oh-my-skills has no way to ship a Claude Code hook at all today — only skills (`src/skills/`) and shell commands (`src/commands/`). This spec adds hooks as a first-class, generic artifact type, and ships one hook (`handoff`) as its first consumer: it watches context usage via `UserPromptSubmit` and nudges Claude to suggest `/handoff` once usage crosses a threshold.

## Goals

- A reusable `src/hooks/` artifact type, installed the same way skills/commands are (single source of truth, canonical copy under `~/.oh-my-skills/`), so future hooks don't require touching the installer.
- Registering a hook into Claude Code's global config (`~/.claude/settings.json`) is **opt-in**, via a new `oms hooks` command — never done silently during `curl | bash` install or `oms update`.
- The `handoff` hook: proactively nudges Claude (not the user directly) to suggest running `/handoff` once estimated context usage crosses ~70%, once per session.
- Ship this safely: merging into a shared, sensitive global config file must never corrupt it or clobber hooks the user configured themselves.

## Non-goals

- Exact token accounting matching Claude Code's own UI indicator — this is a best-effort estimate from transcript data, explicitly documented as such (Claude Code hooks have no built-in token/context telemetry).
- Per-project hook scope for v1 (rejected in design discussion — global scope was chosen since `/handoff` and oh-my-skills itself are both already global-scope tools).
- A hook triggered off `PreCompact` — confirmed via Claude Code docs that `PreCompact` fires at/after context is already full, too late for a "you still have time to act" nudge. Out of scope for v1; could be a future complementary hook.
- A general hook-authoring framework/DSL — each hook is a plain shell script; no abstraction beyond a `hook.json` metadata file.

## Architecture

### 1. Source artifact type: `src/hooks/<name>/`

```
src/hooks/
└── handoff/
    ├── hook.json       # {"event": "UserPromptSubmit", "matcher": "*", "timeout": 10}
    ├── hook.sh         # entrypoint executed by Claude Code
    └── hook.test.ts    # co-located tests, same pattern as src/commands/<name>/<name>.test.ts
```

`hook.json` schema (v1 — one event per hook directory; a hook needing multiple events would ship as multiple directories sharing a script, until real demand justifies a richer schema):

```json
{
  "event": "UserPromptSubmit",
  "matcher": "*",
  "timeout": 10
}
```

### 2. Canonical install (always happens — `install.sh` / `update.sh`)

Exactly like skills: `src/hooks/<name>/` is copied to `~/.oh-my-skills/hooks/<name>/` on every install/update, unconditionally. This step never touches `~/.claude/settings.json` — it's inert until explicitly enabled. `hook.sh` is `chmod +x`'d at copy time (mirrors `install_commands`).

`uninstall.sh` additionally runs the disable-all-hooks routine (below) *before* deleting `~/.oh-my-skills`, so `settings.json` never keeps a dangling `command` path.

### 3. Registration: `oms hooks` command

New subcommand group added to the existing `oms` dispatcher (`src/commands/oms-cli/oms.sh`), delegating to a new `scripts/hooks.sh` — same shape as how `oms update` delegates to `scripts/update.sh`.

```
oms hooks list              # available hooks (from canonical dir) + enabled/disabled status
oms hooks enable <name>     # merge into ~/.claude/settings.json
oms hooks disable <name>    # remove from ~/.claude/settings.json
oms hooks status            # short summary (enabled hooks + last-nudge state if relevant)
```

`enable`/`disable` **require `jq`**. This is a deliberate exception to the project's usual "jq with sed/grep fallback" convention (see `CLAUDE.md` conventions): `settings.json` is a shared file the user owns and Claude Code depends on globally, and hand-rolled text surgery on arbitrary pre-existing JSON is a real corruption risk. If `jq` is missing, the command prints a clear error (what's missing, how to install it) and exits non-zero without touching the file. `list`/`status` degrade to reading only oh-my-skills' own `registry.json`, which already has a non-jq fallback path, so they still work without `jq`.

**Merge logic (`enable <name>`):**

1. Resolve `hook.json` for `<name>` from `~/.oh-my-skills/hooks/<name>/hook.json`; error if missing.
2. Read `~/.claude/settings.json` (create `~/.claude/` and initialize `{}` if absent).
3. Via `jq`, remove any existing entry under `.hooks[<event>]` whose `.hooks[].command` equals our canonical script path (idempotency — re-running `enable` doesn't duplicate), then append `{"matcher": ..., "hooks": [{"type": "command", "command": "<abs path to hook.sh>", "timeout": ...}]}`.
4. Write the result to a temp file, then `mv` it over `settings.json` atomically (never a partial write on interruption).
5. Record `<name>` in `registry.json` under a new `hooks.enabled` array.

**Disable logic:** the mirror operation — filter out any `.hooks[<event>]` entries whose `command` matches our canonical path, write atomically, remove `<name>` from `registry.json`'s `hooks.enabled`.

Because entries are matched by their `command` path (unique per hook, under `~/.oh-my-skills/hooks/`), enable/disable never touches hook entries the user configured themselves for the same event — merge-not-replace, per Claude Code's own documented settings resolution behavior.

### 4. `registry.json` shape change

```json
{
  "version": "...",
  "skills": { "claude": [...], "copilot": [...] },
  "hooks": { "enabled": ["handoff"] }
}
```

Additive change; existing `skills` handling is untouched. Scripts reading the registry must tolerate a missing `hooks` key (older installs / fresh `init_registry`).

## The `handoff` hook itself

**Event:** `UserPromptSubmit` — the only event that fires with enough lead time to matter; `PreCompact` fires once context is already full (confirmed against Claude Code docs).

**Detection (best-effort, `jq`-only — no `tac`/`tail -r`, which aren't portable between macOS and the project's Alpine test containers):**

1. Read stdin JSON, extract `transcript_path` and `session_id`. If either is missing or the transcript file doesn't exist, exit 0 silently (never fail the user's prompt over a missing file).
2. `jq -s` (slurp) the transcript JSONL, take the last entry with a non-null `.message.usage`, sum `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
3. Compare against `${OMS_HANDOFF_CONTEXT_WINDOW:-200000}`. If usage / window < `${OMS_HANDOFF_THRESHOLD:-70}` %, exit 0.

**Anti-spam:** once above threshold, check `~/.oh-my-skills/hooks/.state/handoff-nudged-<session_id>`. If present, exit 0 (already nudged this session). Otherwise, `touch` it and emit the nudge.

**Output (non-blocking, exit 0):**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Context usage is around <pct>% of the estimated window. If a natural checkpoint exists in the current work, consider proactively suggesting the user run /handoff to save session state before context gets compacted."
  }
}
```

The message is phrased as a suggestion to *Claude's judgment*, not a forced action — it can pick a natural moment rather than interrupting mid-task, and the anti-spam marker means it only gets this nudge once per session regardless of how much further context climbs.

## Error handling

- Missing `jq` at `enable`/`disable` time → clean abort, no file touched, actionable message.
- `~/.claude/settings.json` missing or empty → treated as `{}`, hooks key created fresh.
- Malformed existing `settings.json` (invalid JSON) → `jq` will fail to parse; abort before writing anything, tell the user their settings.json has invalid JSON and point at the path so they can fix it themselves. Never attempt to overwrite a file we can't parse.
- The `handoff` hook script itself never blocks the user's prompt or exits non-zero for expected conditions (missing transcript, below threshold, already nudged) — only unexpected internal errors would use a non-zero exit, which Claude Code treats as non-blocking (stderr shown in transcript, prompt proceeds).
- `uninstall.sh`'s disable-all step tolerates `jq` being unavailable by skipping settings cleanup with a warning (rather than failing the whole uninstall) — better to leave a stale (harmless, since the target script is about to be deleted anyway) entry than to abort uninstall entirely. Note the dangling command will simply no-op (file not found) if ever invoked.

## Testing

Per `CLAUDE.md` conventions, this changes lifecycle-script behavior and therefore needs test coverage (unlike skills, which aren't unit-tested):

- `tests/hooks.test.ts` (new, Alpine/testcontainers, same infra as `install.test.ts`): `enable`/`disable` merge and remove correctly, idempotent re-`enable`, pre-existing unrelated hooks in `settings.json` are preserved, missing-`jq` produces a clean error and no file mutation, malformed pre-existing `settings.json` aborts safely, `uninstall.sh` cleans up enabled hooks.
- `src/hooks/handoff/hook.test.ts` (co-located, same pattern as command tests): fixture transcripts below/above threshold, missing/absent `transcript_path`, already-nudged marker suppresses a second nudge, custom `OMS_HANDOFF_THRESHOLD`/`OMS_HANDOFF_CONTEXT_WINDOW` env vars respected.
- `bash -n` syntax validation extended to `scripts/hooks.sh` alongside the existing lifecycle scripts.

## Open items for implementation planning

- Exact `jq` filter expressions for merge/remove (straightforward but worth getting precise in the plan, including the idempotency check).
- Whether `oms hooks list` needs to read `hook.json` for every hook under the canonical dir or whether a lighter static listing suffices for v1 (only one hook shipping).

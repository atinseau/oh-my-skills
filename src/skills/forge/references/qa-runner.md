# QA Runner

Forge does not prescribe a QA method. It prescribes that every project has one — built by the agent, owned by the agent, persisted in `.forge/qa/`, and reused across every cycle. The method varies. The discipline is constant.

## When to build the QA strategy

On the first Step 5 (QA) pass where `.forge/qa/index.md` does not exist, stop and build the strategy before doing anything else.

> **"What you build now will be used for months. Understanding the app is cheaper than discovering regressions in prod."**

Do not shortcut this. A strategy that takes two minutes to write is not a strategy.

## Required discipline

Answer the 7 questions below explicitly. Write the answers in `.forge/qa/index.md`. This file is the strategy — concrete, specific to this project, not generic.

### 1. App nature

What kind of software is this? Options: native UI (iOS/macOS/Android), web UI (SPA/SSR), CLI tool, daemon/service, library, HTTP API, gRPC API, embedded, or mixed. Be specific — "web UI (Next.js SSR with REST backend)" beats "web app". This answer drives everything else.

### 2. Primary user journey

Write the concrete step sequence the user follows to accomplish the core value of the app. Not abstract. Not "user authenticates" — write "User opens the app, clicks Login, types credentials, presses Enter, sees the dashboard with their name". One sentence per step. If the project has multiple critical journeys, list all of them.

### 3. Host tools inventory

Probe the host machine exhaustively. Run this snippet and record what is available:

```bash
for tool in playwright xdotool osascript screencapture curl wrk ab \
            adb xcrun simctl wscat httpie chromedriver geckodriver \
            pytest jest cargo vitest k6 artillery hey siege; do
  command -v $tool >/dev/null 2>&1 && echo "$tool: available"
done
```

Also check language-specific runners the project already uses (look at `package.json`, `Cargo.toml`, `pyproject.toml`, `Makefile`, etc.). Extend the probe above with anything project-specific. Record the full output in `qa/index.md` — not a summary, the actual results.

### 4. Adapted strategy

Choose a strategy — or a mix — justified against what you found in questions 1–3:

- **Visual** — capture screenshots/recordings, diff against baseline. Fits native UI and web UI.
- **Programmatic** — call the system (HTTP, CLI invocation, function call) and assert on output. Fits APIs, CLIs, libraries.
- **Metric** — measure performance, timing, throughput. Fits any system with latency requirements.
- **Mixed** — combine the above. Required when journeys span multiple layers.

Write one sentence explaining why you chose this strategy for this specific project. If available tools constrain the choice, say so.

### 5. Tooling construction

Create scripts under `.forge/qa/` that implement the strategy. The agent owns this folder entirely — add fixtures, helpers, snapshots, golden files, whatever the strategy needs. Rules:

- Scripts must be executable: `chmod +x .forge/qa/scripts/*.sh` (or equivalent)
- Test each script before declaring it ready
- Scripts must be runnable in CI and locally without manual steps
- If a script requires setup (env vars, running server, etc.), document it in `qa/index.md`

There are no restrictions on what the agent puts in `.forge/qa/`. Carte blanche.

### 6. Objective pass/fail

Write one criterion per flow. The criterion must be binary — either it passes or it fails. "Looks fine" is not a criterion. Examples spanning different app types:

- `screenshot diff < 2%` (visual, web/native UI)
- `exit 0 AND stdout contains "Build succeeded"` (CLI)
- `HTTP 200 AND response.user.id matches fixture` (REST API)
- `p95 latency < 500ms over 100 requests` (performance)
- `output file checksum matches golden artifact` (file-producing tool)
- `gRPC status OK AND response.items.length == 3` (gRPC API)
- `process exits within 5s AND stderr is empty` (daemon/service)

Every flow in `qa/index.md` must have a criterion. No exceptions.

### 7. Extensibility

When a new task introduces a flow the existing strategy does not cover, extend `qa/index.md` and the tooling. Do not bypass the strategy for "small" tasks. The strategy evolves; the discipline is constant. Add the new flow, write its criterion, build or update a script, then run QA.

## Recommended structure of `.forge/qa/`

Not mandatory — the agent can justify a different layout if the project warrants it. A reasonable default:

```
.forge/qa/
├── index.md              # Strategy: answers to the 7 questions, flows table with pass/fail criteria
├── flows/<name>.md       # One file per user journey, detailing steps and expected outcomes
├── scripts/              # Runners and helpers the agent built
├── fixtures/             # Test data, mock responses, seed files
└── snapshots/            # Baseline screenshots or golden outputs (if strategy is visual/artifact)
```

## Anti-patterns

- Declaring `QA: pass` without running anything objective
- Skipping QA because "unit tests cover it" — unit tests verify code; QA verifies the product
- Copying a strategy from another project without adapting it to this project's nature and journey
- Writing an abstract, generic strategy — "we will test the main flows" is not a strategy
- Spending two minutes on `qa/index.md` — if it was fast, it is wrong
- Letting `qa/index.md` go stale while tasks evolve and new flows are added
- Using QA scripts that require manual observation to determine pass/fail

## What this file is NOT

- Not a tool catalogue — tools are host-dependent, the agent discovers them at question 3
- Not a strategy template — each project is different, copying this file as-is produces nothing
- Not a test runner — this is discipline, not execution

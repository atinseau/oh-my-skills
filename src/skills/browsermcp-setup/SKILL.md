---
name: browsermcp-setup
description: Guide the user through the full installation of Browser MCP — an MCP server + Chrome extension that lets AI applications automate the browser. Covers Node.js check, extension install, connection test, and global MCP registration for Claude Code or GitHub Copilot CLI.
by: oh-my-skills
---

## Trigger detection

This skill activates in two ways:

**1. Explicit request** — the user directly asks to install Browser MCP or the `@browsermcp/mcp` server.

**2. Implicit intent** — the user describes a task that requires real browser interaction and cannot be done without a browser automation tool. Examples:
- "Can you test this user flow in the browser?"
- "Go to this URL and fill in the form"
- "Click on this button and tell me what happens"
- "Navigate to my app and check if the login works"
- "Take a screenshot of this page"
- Any task involving navigation, clicks, form filling, scraping, or visual inspection of a live webpage

In the implicit case, **do not start installing immediately**. First explain the value to the user:

> To perform browser actions, I need the **Browser MCP** server — an MCP server + Chrome extension that lets me control your browser locally. Your activity stays on your device.
> Would you like me to set it up? It only takes a minute.

Wait for explicit confirmation before proceeding.

---

## Already installed check

Before doing anything else, check if Browser MCP is already registered:

```
claude mcp list 2>/dev/null | grep browsermcp
cat ~/.copilot/mcp-config.json 2>/dev/null | grep browsermcp
```

- **Found in either config** → Stop and tell the user:

  > Browser MCP is already installed. No action needed.

- **Not found** → Continue with Step 1.

---

## Overview

Browser MCP bridges AI applications and your Chrome browser via the Model Context Protocol. It runs as a local MCP server and communicates with a Chrome extension installed in your browser. Your activity never leaves your device.

Execute all steps automatically without asking for confirmation, except where explicitly noted.

---

## Step 1 — Check Node.js

Run:
```
node --version
```

- **Node.js not found** → Stop immediately and tell the user:

  > **Error: Node.js is required to run Browser MCP.**
  > Please install it from https://nodejs.org (LTS recommended), then restart your terminal and run this skill again.

- **Node.js found** → Continue.

---

## Step 2 — Install the Chrome extension

Tell the user:

> **Install the Browser MCP Chrome extension:**
> https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc
>
> Once installed, the extension icon should appear in your Chrome toolbar.
> **Let me know when it's done.**

Wait for the user to confirm before continuing.

---

## Step 3 — Test the MCP server connection

Send an MCP `initialize` handshake to verify the server starts and responds correctly:

```
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' | perl -e 'alarm 5; exec @ARGV' npx --yes @browsermcp/mcp@latest
```

Inspect the output:

- **Response contains `"name":"Browser MCP"`** → connection successful. Continue.
- **No response or error (other than a stack overflow on shutdown, which is harmless)** → Stop and tell the user:

  > **Error: Could not connect to the Browser MCP server.**
  > Make sure Node.js is properly installed and that `npx` is available in your PATH.
  > You can try running `npx @browsermcp/mcp@latest` manually to diagnose the issue.

---

## Step 4 — Detect the active AI CLI

Check which AI CLI is available on the system:

```
claude --version 2>/dev/null
gh copilot --version 2>/dev/null
```

- **Only `claude` detected** → Set `TARGET_CLI = claude` and continue immediately. Do not ask the user.
- **Only `gh copilot` detected** → Set `TARGET_CLI = copilot` and continue immediately. Do not ask the user.
- **Both detected** → **Ask the user:** "Both Claude Code and GitHub Copilot CLI are installed. Which one(s) do you want to register Browser MCP for? (claude / copilot / both)"
- **Neither detected** → Stop and tell the user:

  > Neither `claude` nor `gh copilot` was found. Please install one of them first, then re-run this step.

Store the choice as `TARGET_CLI` (values: `claude`, `copilot`, or `both`).

---

## Step 5 — Register Browser MCP globally

### If `TARGET_CLI` includes `claude`

Run:
```
claude mcp add --scope user browsermcp -- npx @browsermcp/mcp@latest
```

This stores the server in `~/.claude.json` and makes it available in all Claude Code sessions.

> **Known issue:** Claude Desktop (not Claude Code) may start the MCP server twice, which can show a warning. It still works correctly.

---

### If `TARGET_CLI` includes `copilot`

Check if `~/.copilot/mcp-config.json` exists:

```
cat ~/.copilot/mcp-config.json 2>/dev/null
```

- **File exists** → merge the `browsermcp` entry into the existing `mcpServers` object, preserving all other entries.
- **File does not exist** → create it.

Write or update `~/.copilot/mcp-config.json` with:

```json
{
  "mcpServers": {
    "browsermcp": {
      "type": "local",
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"],
      "tools": ["*"]
    }
  }
}
```

---

## Done

Report a success summary:

- Node.js version detected
- Chrome extension: installed by user
- MCP connection test: passed
- Registered for: `<TARGET_CLI>`
- Config location:
  - Claude Code → `~/.claude.json`
  - Copilot CLI → `~/.copilot/mcp-config.json`

Then tell the user:

> **Browser MCP is ready.**
> Open a new Claude Code or Copilot CLI session — the `browsermcp` server will be available automatically.
> Make sure the Chrome extension is active in your browser before running any browser automation.

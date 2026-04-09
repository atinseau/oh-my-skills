# Explore Mode

Cartograph a page or component. Open it, take snapshots, document everything.

**Trigger:** "explore [url or page name]" -- or any request without a specific mode.

## Algorithm

### 1. Check existing knowledge

- Read `{discovery_root}/scenarios/_index.md`
- Check `## Unexplored Leads` -- if a previously blocked lead is now unblocked (mock added, code analyzed), explore it and promote to scenario
- Glob `{discovery_root}/map/` for files matching the target page
- If map exists and recent (`Last explored` + `git log --oneline --since="[Last explored date]" -- src/` shows no relevant changes) --> tell the user what's already known, ask what to focus on
- If map exists but stale --> re-explore (snapshot and compare structure)
- If no map exists --> full exploration

### 2. Open the page

- `playwright-cli open [url]`
- `playwright-cli snapshot --depth=3` (shallow first to save tokens)
- Check for errors: `playwright-cli console error`
- If console shows 404s --> **stop**. Report the missing mock routes. Don't explore a broken page.

### 3. Identify zones

- From the shallow snapshot, list the major sections (toolbar, sidebar, content, panels...)
- Each zone becomes a section in the map file

### 4. Deep-dive each zone

- `playwright-cli snapshot [ref]` on each zone's root element
- Document every interactive element in the map table format (see Map File Format in SKILL.md)
- Click elements that reveal new UI (dropdowns, panels, modals, drawers). Snapshot after each.
- Skip elements whose effect is obvious from context (standard pagination, sort indicators already documented)
- Record state transitions: "clicking [ref] --> [what changed]"

Snapshots taken during this step are **ephemeral** -- use them to extract element data (roles, text, structure) into the map file, then discard them. Do not save snapshot files to disk.

**Depth budget:** Document the main zones and their first-level interactions. If a zone opens a complex sub-UI (modal with tabs, nested drawers), document its existence and create an Unexplored Lead for the deep-dive -- don't explore recursively in the same session unless the user asks.

### 5. Save artifacts

- Write/update `{discovery_root}/map/[page-name].md` with the following structure:
  - `**Last explored:** YYYY-MM-DD` (today's date)
  - `## Layout` -- one sentence describing the page structure
  - `## Zones` -- each zone as a subsection with an element table:
    `| Element | Role | Text/Label | Notes |`
  - `## States` -- table of observed states:
    `| State | Trigger | Key changes |`
  - `## Interactions` -- checkboxes tracking what has been explored (not tested):
    `- [x] Click "Tab" --> panel visible`
    `- [ ] Drag node from palette --> (needs mock)`
- If interactions could not be explored (missing mock, unknown trigger, missing infra), mark them `[ ]` in Interactions with the blocker in parentheses, and add an entry to `## Unexplored Leads` in `_index.md`
- If scenarios were identified during exploration, update `{discovery_root}/scenarios/_index.md` using **domain-grouped** format. Add scenarios under a `### [Domain]` heading that matches the page's domain (infer from route/page purpose, or ask the user if ambiguous). Example:
  ```
  ### Workflow Editor
  | Scenario | Page | Status | Priority | Spec |
  |----------|------|--------|----------|------|
  | [create-workflow](./create-workflow.md) | editor | discovered | critical | -- |
  ```
  The map file itself stays purely descriptive -- do not add scenario references or coverage info to the map.
- `playwright-cli close`

### 6. Report to user

> "I explored X zones and Y interactive elements. I identified Z possible scenarios [list them]. Want me to flesh out the scenarios?"

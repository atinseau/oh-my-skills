# Snapshot Management

Snapshots are the source of truth for UI state. They store the full accessibility tree at a given state — useful for comparing before/after, detecting regressions, and giving context to Bug mode's Phase 2 (reads them to understand UI structure without opening a browser).

**Naming convention:** always `{page}--{state}.yaml` with **double dash** separator. Examples:
- `workflow-detail--default.yaml`
- `workflow-detail--triggers-empty.yaml`
- `workflow-list--actions-dropdown.yaml`

**When to save:**
- One per distinct state — not per interaction
- Always save the default state (baseline for comparison)
- Save before/after critical transitions (empty → data, closed → open)

**When NOT to save:**
- Hover states, transient tooltips
- Loading spinners
- Duplicate states (same layout, different data)

**How to keep small:**
- Use `playwright-cli snapshot --depth=4` to limit nesting
- Use `playwright-cli snapshot [ref]` for a specific zone
- Strip to the relevant zone when saving

**Freshness:**
- Snapshots have no expiration — valid until the UI changes
- When re-validating a map, snapshot and compare structure (ignore refs — they change every session)
- If structure changed → update the map, re-save snapshot, set `Last validated` to today

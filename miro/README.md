# Miro Integration

**Category:** Integrations  
**Version:** 1.1.0  
**Author:** WB Games Studio  
**Entry points:** (not yet published — see status note below)  
**Status:** Registered in marketplace but source files are missing from the share

---

## Overview

The Miro Integration is planned to provide in-app browsing, embedding, and editing of Miro boards via the Miro REST API, routed through Tauri's HTTP proxy. Board content would be indexed by the RAG engine for AI context.

> **Important:** This extension is registered in `registry.json` but the source files (`MiroView.jsx`, `MiroPopover.jsx`, `manifest.json`) do **not currently exist** in this folder on the share. This means the extension appears as installable in the Marketplace but will fail silently on install because there are no files to copy.
>
> The host frame (`App.jsx`) has a fallback Miro component built in for this reason — the core app will show a placeholder Miro view even without this extension installed.

---

## Planned Features

### Board Browser
- Browse all Miro boards accessible to the configured workspace.
- Thumbnail preview grid.
- Open any board in the Miro web app via the system browser.

### Inline Embed
- Embed Miro boards as an iframe within the Ledger (read-only preview). Requires Miro OAuth token with `boards:read` scope.

### RAG Indexing
- Board content (sticky notes, text cards, shapes) exported as text chunks and indexed by the RAG Engine as a knowledge source with `sourceKind: 'reference'`.
- Useful for design boards that contain spec text, decision records, or research notes.

### Sidebar Popover
- Connection status and quick sync controls in a compact `IntegrationButton` popover.

---

## Dependencies

- None planned

---

## Current Status

| Item | Status |
|------|--------|
| Registry entry | ✅ Present |
| Folder on share | ✅ Created (empty) |
| `manifest.json` | ❌ Missing |
| Source files | ❌ Missing |
| Host app fallback | ✅ Present in `App.jsx` |

To publish this extension: create `manifest.json`, `MiroView.jsx`, and `MiroPopover.jsx` in this folder, then bump the version and update the `provides` field in `registry.json`.

---

## API Reference (Miro REST v2)

The Miro REST API base URL is `https://api.miro.com/v2/`. All requests require an OAuth 2.0 bearer token. Relevant endpoints:

- `GET /boards` — List all boards the user has access to
- `GET /boards/{board_id}/items` — Get all items (sticky notes, shapes, text) on a board
- `GET /boards/{board_id}` — Get board metadata

HTTP requests would route through `appAPI.httpRequestJson()` to avoid CORS, the same pattern used by Confluence and Jira integrations.

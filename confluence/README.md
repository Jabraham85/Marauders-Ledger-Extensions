# Confluence Integration

**Category:** Integrations  
**Version:** 1.1.1  
**Author:** WB Games Studio  
**Entry points:** `ConfluenceView.jsx` (full view), `ConfluencePopover.jsx` (sidebar button)

---

## Overview

The Confluence Integration syncs your Atlassian Confluence wiki into The Marauder's Ledger via the Confluence REST API, routed through Tauri's HTTP proxy to bypass browser CORS restrictions. Once connected, your pages are searchable in-app, browsable by space, and automatically fed into the RAG engine as a knowledge source so the AI Assistant can reference them.

---

## Features

### Setup (ConfluenceView — Connection Wizard)
A three-step setup wizard appears when not yet connected:
1. **Domain** — Enter your Atlassian domain (e.g. `wbg-avalanche.atlassian.net`). Defaults to the WB Games Avalanche domain.
2. **Email** — Your Atlassian account email.
3. **API Token** — An Atlassian API token. A "Get Token" button opens the Atlassian token management page in the system browser.

Credentials are stored in `localStorage` (never sent off-device except to the Atlassian API itself).

### Page Browser (ConfluenceView — Connected State)
- **Space filter** — Dropdown to filter pages to a specific Confluence space.
- **Search** — Client-side search across page titles and content excerpts.
- **Pagination** — Pages are fetched in batches. A "Load more" button fetches the next batch when more are available. A total count is shown.
- **Sync** — A "Sync Now" button re-fetches all pages from the API and updates the cache.
- **Open in browser** — Each page has an "Open in Confluence" button that opens the full page in the system browser via `openExternal`.
- **Last sync timestamp** — Shows when data was last fetched.

### Sidebar Popover (ConfluencePopover)
A compact popover accessible from the sidebar integration button. Shows connection status and quick actions: sync, disconnect, and open the full Confluence view.

---

## How It Works

All API calls go through `window.electronAPI` (the host bridge), specifically:

| Method | What it does |
|--------|-------------|
| `confluenceGetStatus()` | Returns `{ connected, domain }` |
| `confluenceConnect({ domain, email, token })` | Authenticates and stores credentials |
| `confluenceDisconnect()` | Clears stored credentials |
| `confluenceGetData()` | Returns `{ pages, spaces, lastSync, hasMore, totalAvailable }` from the local cache |
| `confluenceSync()` | Fetches fresh pages from the Confluence REST API |
| `confluenceLoadMore()` | Fetches the next batch of pages |

The host bridge (`tauriApiLayer.js`) stores synced page data in `localStorage` under `producerTrackerConfluenceData`. HTTP requests to Atlassian go through the Tauri `http_request` Rust command to avoid CORS.

---

## RAG Integration

When the RAG Engine extension is installed, Confluence pages are automatically available as a knowledge source. The RAG service reads the Confluence data from the same `localStorage` cache and chunks each page for indexing. No extra configuration is needed — connecting Confluence and enabling RAG is all that is required.

---

## Dependencies

- None (works independently)
- Enhances: **RAG Engine**, **Glossary and Spellcheck**, **Quick Links**

---

## Technical Notes

- `ConfluenceView.jsx` uses `window.electronAPI` (legacy name) rather than `window.appAPI`. Both point to the same bridge object; this is a naming artefact from before the bridge was renamed.
- The setup wizard tracks step state locally. Completing step 3 calls `confluenceConnect` and then re-runs `loadData()`.
- Page search is purely client-side on the cached data — no API call is made when you type in the search box.
- `hasMore` is set by the bridge when the API indicates more pages exist beyond the current batch.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Confluence Integration** and click **Install**.
3. Enable it from the Extensions page.
4. Open the Confluence view from the sidebar and complete the three-step connection wizard.

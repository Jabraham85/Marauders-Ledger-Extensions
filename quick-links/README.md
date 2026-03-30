# Quick Links

**Category:** Tools  
**Version:** 1.5.2  
**Author:** Jose Abraham  
**Entry point:** `QuickLinksView.jsx`  
**View ID:** `quick-links`

---

## Overview

Quick Links is a frequency-tracked bookmark hub for the websites, desktop apps, Confluence pages, and Jira tickets you use every day. Every time you click a link, its visit count increments and the list re-sorts to keep your most-used items at the top. You do not have to organise anything manually — the most important links surface themselves.

---

## Features

### Link Types

| Type | Icon | What it stores |
|------|------|---------------|
| Website | 🌐 | URL, opened in system browser |
| App | 💻 | Local file path to an `.exe` or `.lnk`, launched via `appAPI.openExternal` |
| Confluence | 📘 | Confluence page URL; display name parsed from URL or picked from synced pages |
| Jira | 🎯 | Jira ticket URL; ticket key parsed from URL or picked from synced issues |

### Frequency Tracking and Sorting
- Every click increments `visitCount` for that link.
- The list is sorted by `visitCount` descending, then by `dateAdded` descending as a tiebreaker.
- Pinned links always appear at the top regardless of visit count.
- A subtle visit count indicator is shown on each card.

### Folders
- Links can be placed into named folders.
- Folders are collapsible.
- Drag and drop reordering within and between folders (pointer-event-based — not HTML5 drag-and-drop).
- An "Unfiled" virtual folder holds links not assigned to any folder.

### Adding Links
- **Manual URL entry** — Paste any URL into the "Add Link" form. Quick Links auto-detects whether it is a Confluence URL, Jira URL, or generic website based on URL patterns.
- **Confluence picker** — If the Confluence Integration is connected, a searchable picker shows all synced Confluence pages. Select one to add it instantly without pasting a URL.
- **Jira picker** — If the Jira Ticket Tool is installed, a searchable picker shows Jira issues from the `avalanche-jira/v1/blob` localStorage cache. Select a ticket to link it with the correct key and summary.
- **App browser** — A file picker that lists installed apps detected via the PowerShell scan (if available).

### Search
- A search bar filters all links by title and URL client-side. No API calls.

### Actions on Each Link Card
Every card has explicit labeled action buttons (no hidden single-click ambiguity):
- **Open in Browser** / **Open in Ledger** / **Launch App** — depends on link type
- **Copy Link** — copies URL to clipboard
- **Pin / Unpin** — toggles pinned status
- **Move to Folder** — dropdown to assign to a folder
- **Delete** — removes the link

---

## Confluence and Jira URL Parsing

Quick Links includes URL parsers that extract human-readable names from raw URLs:

**Confluence URL patterns:**
- `/display/<space>/<title>` → `{ space, title }`
- `/wiki/spaces/<space>/pages/<id>/<title>` → `{ space, title }`
- `/wiki/spaces/<space>` → `{ space }`

**Jira URL patterns:**
- `/browse/<TICKET-123>` → `{ ticketId: 'TICKET-123' }`
- `selectedIssue=<TICKET-123>` → `{ ticketId: 'TICKET-123' }`

---

## Data Persistence

Links and folders are stored in `localStorage`:

| Key | Contents |
|-----|---------|
| `quickLinks_v1` | Array of link objects `{ id, title, url, type, visitCount, pinned, folderId, dateAdded }` |
| `quickLinks_folders_v1` | Array of folder objects `{ id, name, collapsed }` |
| `quickLinks_appCache_v1` | Cached list of detected installed apps |

---

## Drag and Drop

Reordering uses pointer events:

1. `onPointerDown` on the drag handle (`≡` glyph) starts tracking. `touch-action: none` prevents scroll interference.
2. A ghost element (`position: fixed; pointer-events: none; z-index: 99999`) follows the cursor.
3. `document.elementsFromPoint(x, y)` walks the element list looking for `data-drop-target` attributes to identify the hovered drop zone.
4. `onPointerUp` finalises the reorder.

This pattern works in the Tauri WebView2 sandbox where HTML5 drag-and-drop events are unreliable.

---

## Dependencies

- None (standalone)
- Enhanced by: **Confluence Integration** (page picker), **Jira Ticket Tool** (ticket picker)

---

## Technical Notes

- `QuickLinksView.jsx` is ~1,300 lines. All logic and UI are in a single file.
- The app detection cache (`quickLinks_appCache_v1`) is built by calling `appAPI.scanInstalledApps()` (if available) and stored for the session. It is not rebuilt automatically — a "Refresh Apps" button in settings triggers a rescan.
- The Confluence page picker reads directly from `appAPI.confluenceGetData()` — no extra storage. If Confluence is not connected, the picker shows a helpful empty state with a link to the Confluence settings.
- The Jira picker reads from `localStorage.getItem('avalanche-jira/v1/blob')` directly rather than calling an appAPI method. This means it works even if the Jira Ticket Tool is not currently active in the UI, as long as the service ran at least once this session and populated the blob.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Quick Links** and click **Install**.
3. Enable it from the Extensions page.
4. Add your first link using the "Add Link" button and start building your personal hub.

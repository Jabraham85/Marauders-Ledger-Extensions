# Jira Ticket Tool (Avalanche Jira)

**Category:** Integrations  
**Version:** 3.4.0  
**Author:** WB Games Studio  
**Entry points:** `AvalancheView.jsx` (main view), `AvalancheSettings.jsx` (settings panel), `service.cjs` (background service)  
**View ID:** `avalanche-jira-view`

---

## Overview

The Jira Ticket Tool is a full Jira client built for the WB Games Avalanche production pipeline. It replicates the field mapping and workflow conventions used by the Avalanche desktop app, so you get the same Jira experience — fetch, list, Kanban board, inline editing, ticket creation, sprint management — without switching windows. All data is synced to a local cache and exposed on the interop bus so other extensions can read ticket data.

---

## Features

### Main View (AvalancheView.jsx)
- **Project selector** — Switch between any Jira project you have access to.
- **Board views** — Toggle between list view and Kanban board. Kanban groups tickets by status column (To Do, In Progress, In Review, Done).
- **Ticket list** — Shows issue key, summary, status, priority, assignee, and updated date. Sortable columns.
- **Ticket detail** — Click any ticket to open a full detail panel: summary, description (Atlassian Document Format rendered), status, priority, assignee, reporter, created/updated, epic, sprint, components, labels, fix versions, original/remaining estimates, attachments, comments, subtasks, and issue links.
- **Inline editing** — Edit summary, description, status, priority, assignee, and other fields directly in the detail panel. Changes are pushed to the Jira API immediately.
- **Create ticket** — A "New Ticket" button opens a creation form with all standard fields plus WB-specific custom fields.
- **Sprint filter** — Filter the board to a specific active sprint.
- **Search** — Full-text search across the cached tickets.
- **Refresh** — Manual sync button re-fetches tickets from the API.
- **CSV export** — Export the current ticket list as a CSV with the full Avalanche field set (matching `avalanche/config.py` field list).

### Settings Panel (AvalancheSettings.jsx)
- Jira domain (defaults to `wbg-avalanche.atlassian.net`)
- Atlassian email
- API token (stored in `localStorage` as `avalanche-jira-config-overlay`)
- Default project keys for auto-load
- Sync interval configuration

### Background Service (service.cjs)
- Runs on extension init (called by `App.jsx` with 80ms stagger).
- Reads config from `localStorage` overlay merged with `appAPI.getSharedContext().extensionConfig`.
- Publishes interop events on the `avalanche-jira/*` channel:
  - `avalanche-jira/sync/request` — Consumed by the view to trigger a data refresh.
  - `avalanche-jira/sync/background_complete` — Emitted after a background sync finishes.
- Exposes the synced ticket blob on `localStorage` under `avalanche-jira/v1/blob` so the **Quick Links** extension and others can read Jira data without depending on the full extension.
- Analytics tracking via `appAPI.analyticsTrack` (fire-and-forget).

---

## Data Model

Tickets are fetched using `FETCH_ISSUE_FIELDS_ALL = "*all"` which returns every system and custom field from Jira. The following custom fields are specifically mapped:

| Custom Field | Meaning |
|-------------|---------|
| `customfield_10014` | Epic Link |
| `customfield_10011` | Epic Name |
| `customfield_10020` | Sprint |

The full field list for CSV export (24 columns) mirrors the Avalanche desktop app's export format exactly, including ADF description rendering and epic/parent hierarchy.

---

## Interop Bus Integration

Other extensions can subscribe to Jira events:

```javascript
window.appAPI.interopSubscribe('avalanche-jira/sync/background_complete', (evt) => {
  console.log('Jira sync done:', evt.payload);
});
```

The ticket blob is also directly readable:

```javascript
const blob = JSON.parse(localStorage.getItem('avalanche-jira/v1/blob') || '{}');
// blob.issues = array of Jira issues
```

---

## Dependencies

- None (works independently with valid Jira credentials)

---

## Technical Notes

- `AvalancheView.jsx` is a large bundled single-file view (~4600 lines) that inlines constants, utilities, and all sub-components. This is intentional — it avoids relative import complexity in the extension sandbox.
- HTTP requests to Jira go through `appAPI.httpRequestJson()` (Tauri HTTP proxy) to bypass CORS.
- ADF (Atlassian Document Format) descriptions are rendered by a lightweight inline parser — not a full ADF renderer. Complex ADF nodes (tables, media) fall back to plain text.
- Config is read from two sources merged: the shared context `extensionConfig` (set by an admin) and the local `avalanche-jira-config-overlay` (set by the user in Settings). The overlay wins.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Jira Ticket Tool** and click **Install**.
3. Enable it from the Extensions page.
4. Open Extensions → Options → Jira Ticket Tool Settings and enter your Jira domain, email, and API token.

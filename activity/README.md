# Activity Feed

**Category:** Views  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `ActivityFeed.jsx`

---

## Overview

Activity Feed shows a chronological, grouped audit trail of everything that has happened inside The Marauder's Ledger. Every time a task is created, updated, moved, or deleted — or a department or note is changed — an entry is appended to `state.activityLog`. This extension presents that log in a readable timeline grouped by calendar day.

It answers questions like "what changed today?" or "when was that task moved to Done?"

---

## Features

- **Day-grouped timeline** — Events are grouped under bold date headers (e.g. "Monday, March 24, 2026"). The most recent day appears first.
- **Event type icons** — Each event type has a distinct coloured icon ring: green for task creation, blue for moves, amber for updates, red for deletions, purple for department changes, indigo for note changes.
- **Relative timestamps** — Events show a human-readable relative time: "just now", "5m ago", "3h ago", "2d ago". Older events fall back to a formatted date.
- **Type filter** — A dropdown at the top lets you filter by event category: All Events, Tasks, Departments, Notes.
- **Load more** — Initially shows the 50 most recent events. A "Load more" button appends the next 50.
- **Event count badge** — The total number of logged events is shown next to the filter dropdown.
- **Empty state** — If no events exist yet (fresh install), a friendly empty state illustration is shown.

---

## Event Types

| Type | Description |
|------|-------------|
| `task_created` | A new task was added to a department |
| `task_moved` | A task's status changed (e.g. Todo → In Progress) |
| `task_updated` | A task's fields were edited |
| `task_deleted` | A task was deleted |
| `dept_created` | A new department was created |
| `dept_updated` | A department was renamed or edited |
| `dept_deleted` | A department was deleted |
| `note_created` | A note was added |
| `note_deleted` | A note was deleted |

---

## How It Works

The feed reads `state.activityLog` from `useStore()`. The activity log is an array of event objects, each containing at minimum `{ type, timestamp, ...eventSpecificFields }`. The log is written by the store's action handlers (`updateTask`, `createDept`, etc.) every time a user action occurs.

Events are sliced to `showCount` (default 50) before grouping, so the grouping is efficient. Each group is keyed by a locale-formatted full date string.

---

## Dependencies

- None
- Uses `useStore` from `../store/useStore`
- Uses `useTheme` / `W` from `../theme/ThemeProvider`

---

## Technical Notes

- `ActivityFeed.jsx` is a single self-contained component (~116 lines).
- The activity log is persisted to `localStorage` as part of the main store state via `platformStore.jsx`. There is no separate persistence in this extension.
- The log is never trimmed automatically by the store — very active users may accumulate thousands of entries. The "show 50, load more 50" pattern keeps render performance acceptable regardless of log size.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Activity Feed** and click **Install**.
3. Enable it from the Extensions page.

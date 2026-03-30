# GrudgeDB

**Category:** Tools  
**Version:** 1.2.7  
**Author:** WB Games Audio  
**Entry points:** `CueTrackerView.jsx` (main view), `CueTrackerSettings.jsx` (settings panel), `service.cjs` (background service)  
**View ID:** `cue-tracker`

---

## Overview

GrudgeDB is a specialised audio production tool for game development. It tracks music cues, sound effects, and ambient audio across game missions, tying each cue to a Wwise project structure, version history, timecode, and Jira ticket. Multiple audio team members can work simultaneously using a shared JSON database on the network drive, with real-time sync and automatic revision history.

---

## Features

### Cue Management
- **Mission hierarchy** — Cues are organised under Projects → Missions. Missions are collapsible. Cues within a mission can be reordered.
- **Cue types** — Each cue is categorised as `IN GAME`, `CINEMATIC`, `MENU`, or `AMBIENT`.
- **Audio lanes** — Cues belong to a lane: `Music`, `SFX`, or `Ambience`.
- **Status workflow** — Five statuses with colour coding:
  - Draft (grey)
  - WIP (gold)
  - In Progress (blue)
  - Needs Review (red)
  - Approved (green)
- **Timecode fields** — IN and OUT timecodes in `HH:MM:SS:FF` (SMPTE) format. The view auto-calculates duration.
- **Wwise folder browser** — A file picker that browses the configured Wwise project folder on the network drive, letting you select the exact `.wav` or `.wem` file for a cue.
- **WAV preview** — Click a cue's file path to preview the audio in-app using the browser's Web Audio API.
- **Version comments** — Each cue has a versioned comment thread. Comments are timestamped and attributed to the current user.

### Jira Integration
- **Ticket linking** — Each mission can be linked to a Jira ticket key (e.g. `AUDIO-101`).
- **Auto-search** — Typing in the Jira ticket field auto-searches Jira (via `cueTrackerAPI.getJiraIssue()`) and shows ticket summary previews.
- **Ticket display** — Linked tickets show their current status badge inline on the mission header.

### Multi-User Sync
- **Shared database** — The primary data store is a JSON file at a configurable network path (e.g. `S:\JoseAbraham\audio\cue-tracker-db.json`).
- **Optimistic updates** — Changes are written to `localStorage` immediately (for instant UI feedback) then flushed to the shared file.
- **Auto-refresh** — The view polls the shared file every 30 seconds and merges remote changes.
- **Conflict resolution** — Last-write-wins at the cue level. The full cue object is the atomic unit — partial field conflicts are not resolved.

### Revision History
- Every save to the shared database creates a timestamped backup in the `history/` subfolder (e.g. `history/2026-03-24T14-30-00_Jose.json`).
- The history panel shows a list of all snapshots with date, time, and author. Click any snapshot to preview it or restore it.
- `cueTrackerAPI.getHistory()` and `cueTrackerAPI.restoreFromHistory(filename)` are exposed for other extensions to access.

---

## `window.cueTrackerAPI` (Background Service)

The service patches `window.cueTrackerAPI` with:

| Method | Description |
|--------|-------------|
| `getProjects()` | Returns all projects from the current database |
| `getActiveProject()` | Returns the currently selected project |
| `getCues()` | Returns all cues across all missions for the active project |
| `getJiraIssue(ticketKey)` | Fetches a Jira issue via the Jira integration credentials |
| `getSyncStatus()` | Returns `{ lastSync, error, sharedPath }` |
| `getHistory()` | Returns list of available history snapshots |
| `restoreFromHistory(filename)` | Restores the database from a history snapshot |

---

## Settings Panel (CueTrackerSettings.jsx)
- **Shared database path** — Path to the shared `cue-tracker-db.json` file on the network drive.
- **Wwise project path** — Root path for the Wwise project, used by the folder browser.
- **Jira configuration** — Domain, email, API token, and default project keys for ticket linking.
- **Sync interval** — How often (in seconds) to poll the shared file for remote changes.
- **Username** — Override the display name used in version comments and history attribution.

---

## File Structure

| File | Purpose |
|------|---------|
| `CueTrackerView.jsx` | Main view (~2,500 lines) — cue CRUD, Wwise browser, audio preview, history panel |
| `CueTrackerSettings.jsx` | Settings panel for paths, Jira config, sync options |
| `service.cjs` | Background service — patches `window.cueTrackerAPI`, exposes Jira lookup |
| `cue-tracker-db.json` | Live shared database (on the share drive at configured path) |
| `history/` | Timestamped backup snapshots directory |

---

## Dependencies

- None (Jira linking works independently of the Jira Ticket Tool extension, using its own credentials)

---

## Technical Notes

- All file I/O goes through Tauri's `marketplace_read_text_file` and `marketplace_write_text_file` Rust commands via `window.electronAPI.tauriInvoke`.
- The `history/` folder accumulates `.tmp.*` files if a write is interrupted. These are safe to delete manually. A cleanup routine runs on service init to prune temp files older than 24 hours.
- Audio preview uses `new AudioContext()` + `decodeAudioData()`. Only files accessible via the Tauri filesystem bridge can be previewed — remote HTTP URLs are not supported.
- Timecode parsing supports both `:` and `;` separators (drop-frame vs non-drop-frame SMPTE).

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **GrudgeDB** and click **Install**.
3. Enable it from the Extensions page.
4. Open Extensions → Options → GrudgeDB Settings and configure the shared database path and Wwise project path.

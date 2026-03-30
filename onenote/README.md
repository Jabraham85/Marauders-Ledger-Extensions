# OneNote Integration

**Category:** Integrations  
**Version:** 1.1.0  
**Author:** WB Games Studio  
**Entry point:** `OnenotePopover.jsx` (sidebar button)

---

## Overview

The OneNote Integration connects The Marauder's Ledger to Microsoft OneNote (desktop) via PowerShell COM automation, bridged through Tauri. When active, it replaces the Ledger's built-in notes experience with your real OneNote notebooks, letting you navigate sections and pages without leaving the app.

---

## Features

### Sidebar Popover (OnenotePopover)
An `IntegrationButton` in the sidebar opens a compact popover:
- **Connect** — Detects locally installed OneNote notebooks via `onenoteDetect()`. Reports the count of found notebooks on success.
- **Connected state** — Shows a purple "Connected" indicator with the number of notebooks detected. Lists each notebook name.
- **Page navigation** — Browse sections and pages within each notebook. Clicking a page calls `onenoteOpenPage(pageId)` to open it in OneNote.
- **Create page** — A "New Page" button creates a new page in the selected section via `onenoteCreatePage({ section, title })`.
- **Disconnect** — Clears the connection state.

### Note Landing (NotesLanding.jsx) and DeptNotes (DeptNotes.jsx)
When OneNote is connected, these components replace the built-in department notes panel:
- `NotesLanding` — Shown when no department is selected; prompts user to choose a notebook/section to associate with the Ledger.
- `DeptNotes` — Shown within a department view; syncs and displays the notes for the associated OneNote section alongside the department board.

---

## How It Works

| Method | What it does |
|--------|-------------|
| `onenoteDetect()` | Runs PowerShell to detect installed OneNote and enumerate notebooks. Returns `{ ok, notebooks: [...] }` |
| `onenoteGetNotebooks()` | Fetches the full notebook/section/page hierarchy |
| `onenoteOpenPage(pageId)` | Opens a specific page in the OneNote desktop app via COM |
| `onenoteCreatePage({ section, title })` | Creates a new page via COM |
| `oonenoteSync()` | Re-reads the notebook list |

These bridge methods use the `Microsoft.Office.OneNote.Interop` COM API via PowerShell, relayed through Tauri.

---

## Requirements

- **Microsoft OneNote (desktop)** must be installed.
- The legacy COM-based OneNote API is required. The UWP/Store version of OneNote may not expose all COM interfaces.
- Windows 10/11 only.

---

## Dependencies

- None

---

## Technical Notes

- `OnenotePopover.jsx` follows the same `IntegrationButton` pattern as the Outlook popover. Connection state is managed via props (`onenoteStatus`, `onOnenoteStatusChange`) provided by the host frame.
- Notebook data is stored locally in memory during the session. The connection state (connected: true/false) is persisted by the parent component.
- The bridge checks for `window.electronAPI?.onenoteDetect` before calling — gracefully degrades if the Tauri build does not include the PowerShell module.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **OneNote Integration** and click **Install**.
3. Enable it from the Extensions page.
4. Click the notebook icon in the sidebar and click **Connect to OneNote**.

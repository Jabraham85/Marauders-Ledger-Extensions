# Data Backup and Export

**Category:** Tools  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `Sidebar.jsx` (non-standard — see notes)

---

## Overview

Data Backup and Export lets you save a complete snapshot of your Ledger data to a JSON file and restore it later, or export your tasks to a CSV for use in spreadsheets and reporting tools. It is useful as a manual backup before major changes and for sharing task data with stakeholders who do not have access to the Ledger.

---

## Features

- **Full JSON export** — Exports all Ledger state (departments, tasks, notes, activity log, settings) as a single JSON file. The filename is stamped with the current date and time.
- **JSON import** — Select a previously exported JSON file to restore the full state. A confirmation prompt prevents accidental overwrites of current data.
- **CSV task export** — Exports all tasks across all departments as a flat CSV file with columns: Department, Task Title, Status, Priority, Deadline, Assignee, Description.
- **Import validation** — Imported JSON is validated for schema conformance before being applied. If the file is malformed or from an incompatible version, an error is shown.
- **Backup history** — (Planned) A list of recent backup timestamps stored in `localStorage`.

---

## How It Works

JSON export reads the full state from `useStore()` and serialises it to a Blob download. JSON import reads the file, parses it, validates the schema, and calls `useStore()`'s bulk-replace action.

CSV export flattens `state.departments → tasks` and formats them as RFC 4180 CSV with proper quoting for fields containing commas or newlines.

File download uses the browser's `<a href="blob:...">` download pattern. File selection for import uses a hidden `<input type="file">`.

---

## Dependencies

- None

---

## Known Issues and Technical Notes

> **Important:** `Sidebar.jsx` in this extension folder is a copy of the full host frame Sidebar component. This is a development artefact — the extension was originally built by copying and modifying the Sidebar. The actual backup/export UI is embedded within this Sidebar copy rather than in a standalone view component.

> **This extension is NOT standalone-loadable** from the marketplace in the conventional sense. It does not have a `provides.view` or `provides.settings` entry point. The backup functionality is rendered as part of the host Sidebar rather than as a separate sidebar nav item. This is a known structural issue with this extension.

- There is no `provides` block in the registry entry for this extension. This means `marketplaceInstall` will copy the files but `runtimeViews.js` will not create a sidebar entry for it.
- The `Sidebar.jsx` copy in this folder diverges from the host frame's current Sidebar — any changes to the host frame Sidebar are not automatically reflected here.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Data Backup and Export** and click **Install**.
3. Enable it from the Extensions page.
4. Access backup/export options from the bottom of the Sidebar or the Extensions Options tab.

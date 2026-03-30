# Game Design Studio

**Category:** Views  
**Version:** 1.3.1  
**Author:** WB Games Studio  
**Entry point:** `GameDesignBoardView.jsx`  
**Default enabled:** Yes

---

## Overview

Game Design Studio is a native visual board editor built for game design workflows. It replaces sticky notes and slide decks with a persistent, shareable canvas where missions, systems, and design artefacts live as typed nodes connected by Bézier arrows. Boards are saved to the shared network drive and to `localStorage` as a fallback, so the whole team can collaborate on the same design document without leaving the Ledger.

---

## Features

### Board Canvas
- **Drag-to-move nodes** — Pointer-event-based drag (not HTML5 drag-and-drop). Nodes snap to a 10px grid.
- **Corner resize** — Eight resize handles on each node. Corner handles preserve aspect ratio when held. Minimum node size enforced.
- **Multi-select** — Rubber-band selection by dragging on empty canvas. Move or delete multiple nodes at once.
- **Pan and zoom** — Middle-mouse drag to pan. Scroll wheel to zoom. Fit-to-view button.
- **Bézier edges with arrows** — Connect any two nodes. Edges are drawn with cubic Bézier curves with arrowheads. Edge labels can be set inline.
- **Asset protocol images** — Nodes of type `image` support `asset://` paths as well as standard `https://` URLs, meaning UE5 cooked asset thumbnails can be embedded directly.

### Node Types
Each node has a typed template that controls its default size, colour, and available fields:

| Type | Use |
|------|-----|
| `mission` | A mission unit with playtime, season, term, and stage column |
| `system` | A game system or mechanic |
| `feature` | A feature or deliverable |
| `note` | Free-form sticky note |
| `image` | Embedded image (URL or asset:// path) |
| `milestone` | Deadline or release milestone |

### Node Inspector
Clicking a node opens the **Node Inspector** panel on the right. From here you can edit all fields, change node type, set tags, add a description, link to a Jira ticket, and delete the node.

### Flow Checklist
A collapsible **Flow Checklist** panel tracks completion of design checklist items associated with the board. Items can be checked off and persist with the board.

### Templates
The **Template Picker** lets you start a new board from a pre-defined layout. Built-in templates include standard sprint boards and mission structure layouts. Custom templates can be saved from any existing board and stored in `localStorage` under `producerTrackerGameDesignCustomTemplates`.

### Board Management
- Multiple boards per project — boards are keyed by `projectId`.
- Board access codes — boards can be locked with a one-time access code. The code is hashed with a salt using a simple XOR+rotate algorithm; the hash is stored on the board, not the plaintext code.
- CSV export — mission nodes on a board can be exported as a CSV file (`projectId, missionLabel, missionId, playtime, season, term, column`).
- Board validation — `validateBoard()` checks for orphaned edges, invalid node references, and schema conformance on load.

### Paste Overlay
The `PasteOverlay` component intercepts Ctrl+V on the canvas and parses pasted content: plain text becomes a new note node, image URLs become image nodes, JSON board data triggers a merge-import dialog.

---

## File Structure

| File | Purpose |
|------|---------|
| `GameDesignBoardView.jsx` | Root view component; board CRUD, layout, toolbar |
| `BoardCanvas.jsx` | SVG/HTML canvas; node rendering, edge rendering, pointer events |
| `NodeInspector.jsx` | Right-panel form for editing a selected node's fields |
| `FlowChecklist.jsx` | Collapsible checklist panel |
| `TemplatePicker.jsx` | Template selection modal |
| `PasteOverlay.jsx` | Paste-detection and import handler |
| `gameDesignDefaults.js` | Default project ID, node type labels, stage defaults |
| `gameDesignSchema.js` | Board/node/edge data model, factory functions, validation, serialisation |
| `board.json` | Example/default board data |

---

## Data Persistence

Boards are stored in two places:

1. **Network share** (primary) — `appAPI.writeTextFile(boardPath, json)` where `boardPath` is derived from the configured shared path and the `projectId`. All team members reading the same path see the same board.
2. **localStorage** (fallback) — Key `producerTrackerGameDesignBoards`. Used when the share is unreachable or on first load before the share is configured.

On load, the extension attempts the network share first, then falls back to localStorage. On save, it writes to both.

---

## Dependencies

- None
- Imports `gameDesignDefaults`, `gameDesignSchema`, `gameDesignLock` from `../../platform/` (host frame modules, not bundled with the extension)

---

## Technical Notes

- This extension imports from `../../platform/` (the host frame's platform directory) rather than from sibling files. This works because the extension is installed into `userData/extensions/gameDesign/` and the host resolves relative paths upward.
- The board lock system uses `hashCodeWithSalt` (XOR + rotate, not cryptographic). It is designed as a simple "no accidental edits" guard, not a security mechanism.
- `board.json` in the extension folder is a development sample board and is not loaded at runtime — it is used for testing the schema during development.

---

## Installation

Game Design Studio is **enabled by default** on fresh installs. It will appear in the sidebar immediately after install. No configuration required — it works with localStorage even without a shared drive path configured.

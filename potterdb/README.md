# Harry Potter Lore (Potter DB)

**Category:** AI  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `CitationDisplay.jsx` (shared component, no standalone view)

---

## Overview

The PotterDB extension syncs Wizarding World lore from the [Potter DB](https://potterdb.com) API into The Marauder's Ledger's AI knowledge base. It adds 5,000+ characters, 300+ spells, and 160+ potions as indexed chunks so the AI Assistant can answer lore questions accurately and cite specific sources.

The extension also provides the `CitationDisplay` module — a shared set of React components used by the AI chat view to render inline source citations with colour-coded badges.

---

## What It Provides

### Lore Data (indexed by RAG Engine)
- **Characters** — Name, house, wand, patronus, birth/death dates, species, ancestry, and biographical description for all major Wizarding World characters.
- **Spells** — Name, incantation, effect, and category for all known spells.
- **Potions** — Name, effect, ingredients, difficulty, and characteristics for all known potions.
- **Books** — Titles, release dates, and summaries for all Harry Potter books.

Data is fetched from the PotterDB REST API (`https://api.potterdb.com/v1/`) on demand and stored in the RAG index.

### CitationDisplay Module (CitationDisplay.jsx)
Exports three reusable components used throughout the app whenever AI-generated content with citations is displayed:

| Export | Description |
|--------|-------------|
| `CitationBadge` | Inline `[N]` badge. Colour-coded by source type. Clickable if the source has a URL. |
| `CitedText` | Wraps a string containing `[N]` references and replaces them with `CitationBadge` components. |
| `openInBrowser` | Utility function — opens a URL via `electronAPI.openExternal` or `window.open`. |
| `sourceTypeInfo` | Returns label and colour class for a source type string. |

**Source type colours:**

| Source type | Colour |
|-------------|--------|
| `confluence` | Blue |
| `kb` / knowledge base | Purple |
| `potterdb` | Amber |
| `slack` | Green |
| Custom (with display name) | Grey |

---

## How It Works

This extension has **no `provides` entry points** in its manifest — it does not register a sidebar view or a settings panel. It operates entirely as a data provider:

1. When enabled, the RAG Engine detects PotterDB as a registered source kind and queries `appAPI.potterdbGetLore()` during index builds.
2. The `potterdbGetLore()` method (provided by this extension's service, if present) fetches data from the PotterDB API and returns chunks ready for indexing.
3. Chunks are tagged with `sourceKind: 'potterdb'` so the professor agents can weight them appropriately (relevant for narrative/lore queries via the Fig agent).

---

## Dependencies

- None (works standalone for the citation component)
- Enhances: **RAG Engine** (lore data), **AI Assistant** (citation rendering)

---

## Technical Notes

- `CitationDisplay.jsx` exports named exports (`CitationBadge`, `CitedText`, `openInBrowser`, `sourceTypeInfo`). It is imported by `AiChatView.jsx` and `RagView.jsx` using the module alias `potterdb/CitationDisplay` (resolved by the extension sandbox's module registry).
- The extension has no background service in the current version — lore indexing is triggered explicitly by the user via the RAG Engine settings panel rather than automatically on startup, in keeping with the "no auto-heavy-ops" design principle.
- Because there is no `provides.entries`, this extension will never create a sidebar nav item or be auto-loaded by `App.jsx`. It is purely a passive data/component provider.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Harry Potter Lore (Potter DB)** and click **Install**.
3. Enable it from the Extensions page.
4. Open Extensions → Options → Procedural RAG Engine and click "Index PotterDB" to fetch and index the lore data.

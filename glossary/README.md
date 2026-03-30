# Glossary and Spellcheck

**Category:** Tools  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `GlossaryView.jsx`  
**Dependency:** Confluence Integration

---

## Overview

Glossary and Spellcheck automatically extracts technical terminology from your Confluence wiki and builds a custom dictionary for the Ledger. This prevents your project's proprietary terms — engine systems, feature names, internal codenames — from being flagged as misspellings in notes and task descriptions. The glossary is browsable so team members can also look up what unfamiliar terms mean.

---

## Features

- **Auto-extraction** — Reads all synced Confluence pages and extracts candidate technical terms using a frequency + capitalization heuristic. Terms that appear in title case or ALL CAPS across multiple pages are promoted to the glossary.
- **Glossary browser** — A searchable, filterable table of all extracted terms with their source page, context snippet, and occurrence count.
- **Spellcheck dictionary** — Exports the extracted term list in a format compatible with browser spellcheck APIs. When enabled, these terms are added to the custom dictionary so they are no longer underlined as errors.
- **Manual additions** — Add your own terms to the glossary that may not appear in Confluence (e.g. verbal codenames, abbreviations).
- **Export** — Download the full glossary as a CSV or plain-text word list.

---

## How It Works

`GlossaryView.jsx` reads Confluence data via `window.electronAPI`:

1. Calls `electronAPI.confluenceGetData()` to get the locally cached page list.
2. Processes each page's text content through a term extraction pipeline:
   - Tokenises page text.
   - Identifies tokens matching a technical term pattern (CamelCase, ALLCAPS, or title-case multi-word phrases).
   - Counts occurrences across the corpus.
   - Filters to terms appearing at least twice.
3. Merges extracted terms with manually added terms from `localStorage`.
4. Renders the combined list in the glossary table.

The spellcheck integration uses the browser's `navigator.userAgent`-gated custom dictionary API where available. In the Tauri WebView2 environment, this injects terms via JavaScript into the WebView2 spellcheck dictionary.

---

## Dependencies

- **Confluence Integration** (must be connected and synced — glossary is empty without Confluence data)

---

## Technical Notes

- `GlossaryView.jsx` uses `window.electronAPI` (legacy bridge name) directly — it predates the rename to `appAPI` and has not been updated.
- Term extraction is heuristic, not NLP-based. It will pick up some false positives (generic capitalized words from headings) and miss some true positives (terms always written in lowercase). Manual curation of the extracted list is recommended.
- The glossary data is stored in `localStorage` as `producerTrackerGlossary`. It is rebuilt from Confluence data on each view load plus manual entries.

---

## Installation

1. Install and connect the **Confluence Integration** first.
2. Open the Marketplace tab in The Marauder's Ledger.
3. Find **Glossary and Spellcheck** and click **Install**.
4. Enable it from the Extensions page.
5. The glossary will auto-populate on first view load from your Confluence data.

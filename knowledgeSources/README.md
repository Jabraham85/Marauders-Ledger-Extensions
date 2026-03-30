# Knowledge Sources

**Category:** AI  
**Version:** 1.0.4  
**Author:** WB Games Studio  
**Entry point:** `KnowledgeSourcesPanel.jsx` (settings panel)  
**Dependency:** AI Assistant

---

## Overview

Knowledge Sources lets you expand the AI Assistant's knowledge base by adding your own files, URLs, wiki crawls, or entire folder trees. Everything you add is chunked and indexed by the RAG Engine so the AI can reference it when answering questions. This is how you feed project-specific documents — design specs, tech docs, changelogs, exported wikis — into the AI without putting them in Confluence.

---

## Features

### Source Types

| Type | What it accepts |
|------|----------------|
| **File** | Any text-readable file: `.txt`, `.md`, `.csv`, `.json`, `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.cs`, `.cpp`, `.h`, `.sql`, `.ps1`, `.yaml`, `.html`, and many more |
| **URL** | A single web page — content is fetched and extracted |
| **Crawl** | A wiki or site URL — crawls linked pages recursively up to a configurable depth |
| **Folder** | A local folder path — reads all supported text files inside |

### Source Management
- **Add sources** — A form with source type selector, path/URL input, and a display label.
- **Source list** — Each source shows its label, type icon, chunk count, and index status (indexed / not yet indexed).
- **Toggle active/inactive** — Each source can be toggled on or off without deleting it. Inactive sources are excluded from RAG searches.
- **Delete source** — Remove a source and its indexed chunks.
- **Re-index** — Force a re-index of a specific source if its content has changed.

### Chunking
Text content is split into chunks before indexing. The default chunk size is 1,000 characters with paragraph/line/word boundary detection:

1. Try to break on `\n\n` (paragraph boundary)
2. Fall back to `\n` (line boundary)
3. Fall back to ` ` (word boundary)

This preserves semantic coherence across chunks.

### Source Kind Labels
Sources are tagged with a `sourceKind` that the RAG Engine and citation display use:

| Kind | Description |
|------|-------------|
| `wiki` | Crawled wiki/site |
| `reference` | Reference documentation |
| `chat` | Chat logs or conversation exports |
| `files` | File system folder |
| `tasks` | Task exports |
| `kb` | General knowledge base |
| `custom` | User-defined |

---

## How It Works

`KnowledgeSourcesPanel` communicates with the RAG Engine through `window.appAPI`:

| Method | What it does |
|--------|-------------|
| `ragCustomSources()` | Returns the list of currently configured sources |
| `ragAddSource(sourceConfig)` | Adds a new source and triggers indexing |
| `ragRemoveSource(sourceId)` | Removes a source and its index data |
| `ragToggleSource({ id, active })` | Enables or disables a source |
| `ragReindexSource(sourceId)` | Re-reads and re-indexes a source's content |

These methods are implemented by the RAG Engine service (`ragService.js`) when it patches `appAPI` on startup.

---

## Supported File Extensions

The extension reads any file whose extension is in this set (case-insensitive):

`.txt .md .markdown .csv .json .jsonl .ndjson .js .jsx .mjs .cjs .ts .tsx .css .scss .html .htm .xml .svg .yaml .yml .toml .ini .cfg .conf .log .sql .sh .ps1 .bat .cmd .py .rs .go .java .c .h .cpp .hpp .cs .lua .usf .hlsl .glsl .vert .frag .uproject .uplugin`

Binary files (images, executables, compiled assets) are not supported and will be skipped.

---

## Dependencies

- **AI Assistant** (must be installed and enabled first)
- **RAG Engine** (strongly recommended — without it, sources are added but not searchable)

---

## Technical Notes

- `KnowledgeSourcesPanel.jsx` is a settings panel — it renders inside the Extensions Options tab, not as a standalone sidebar view.
- File reading happens in the renderer process via `appAPI.readTextFile()` (Tauri bridge). No file size limit is enforced at this layer, but very large files (>10 MB) may cause noticeable UI lag during chunking.
- URL fetching and site crawling is done via `appAPI.httpRequestJson()` (Tauri HTTP proxy) to avoid CORS restrictions.
- `SettingsBridge.jsx` in this folder provides the hook point for the host frame to mount this panel within the Extensions Options tab.
- Sources persist in `localStorage` as part of the RAG config under `producerTrackerRagConfig.customSources`.

---

## Installation

1. Install and enable the **AI Assistant** extension first.
2. Open the Marketplace tab in The Marauder's Ledger.
3. Find **Knowledge Sources** and click **Install**.
4. Enable it from the Extensions page.
5. Open Extensions → Options → Knowledge Sources and add your first source.

# Procedural RAG Engine

**Category:** AI  
**Version:** 1.4.6  
**Author:** WB Games Studio  
**Entry points:** `RagView.jsx` (settings panel), `ragService.js` (background service)  
**Dependency:** AI Assistant

---

## Overview

The Procedural RAG Engine (Retrieval-Augmented Generation) is the knowledge retrieval backbone for the AI Assistant. When you ask a question, the RAG engine searches across hundreds of thousands of indexed chunks from Confluence, custom knowledge sources, task data, and other integrated sources — and injects the most relevant ones as context into the LLM prompt. The result is AI answers grounded in your actual project data rather than hallucinated generalities.

Version 1.4.0 introduced BM25 full-text indexing, the Porter stemmer, LLM query expansion, and LLM reranking. Version 1.4.6 adds the Deep Dive mode.

---

## Architecture

### Search Pipeline (5 steps)

1. **Classify** — Determine query intent and select the appropriate professor agent (Fig, Sharp, Ronen, Weasley, or Hecat) based on keyword signals.
2. **Query expansion** (optional) — Call `appAPI.aiChat` to generate 4–7 semantically related expansion terms. Results are cached per query string. Falls back silently if the LLM is unavailable.
3. **Retrieval** — Either BM25 (default) or Classic concentric-ring search:
   - **BM25** — Okapi BM25 scoring (`k1=1.2`, `b=0.75`) against an inverted posting-list index. Terms are boosted by tier: exact match (1.0) > synonym match (0.7) > stem match (0.6).
   - **Classic** — Concentric rings of increasing radius around seed chunks. Slower but finds topically adjacent chunks that BM25 misses.
4. **Assemble** — Deduplicate, trim to token budget, and format the numbered context string `[1] title: content`.
5. **LLM reranking** (optional) — Score the top 25 candidates 0–10 via a dedicated LLM call. Blend with BM25 score at 40/60 ratio. Falls back silently if LLM is unavailable.

### Inverted Index (BM25)
Built at load time from all indexed source chunks. Posting lists map stemmed terms to `{ chunkId, tf }` (term frequency). BM25 scoring uses document length normalisation so short focused chunks are not buried under long rambling ones.

### Porter Stemmer
Full five-step Porter (1980) algorithm (~120 lines). Step 1a–1c handle plurals and past tense. Steps 2–5 handle derivational suffixes. Significantly more accurate than the previous flat 27-rule suffix stripper.

### Professor Agents
Five domain-specialised agents, each with distinct:
- **Domain exclusions** — Chunks from irrelevant source kinds are filtered out before scoring.
- **Specialty weights** — Source kinds matching the agent's domain receive a score multiplier.
- **Prompt personality** — The system prompt injected into the LLM is tailored to the agent's expertise.

| Agent | Domain |
|-------|--------|
| Fig (The Chronicler) | Lore, narrative, character, story design |
| Sharp (The Investigator) | Bugs, root cause, task signals, recent changes |
| Ronen (The Artificer) | Unreal Engine, C++, asset paths, technical systems |
| Weasley (The Organiser) | Workflows, deadlines, task ownership, process |
| Hecat (The Scholar) | Cross-domain; no exclusions, even specialty weights |

### Deep Dive Mode
An exhaustive multi-round search designed for complex questions:
1. Runs a pre-flight size estimate: counts how many chunks would be retrieved and estimates tokens.
2. Shows the user the estimate (e.g. "~3,200 chunks, ~128K tokens") and requires explicit confirmation before proceeding.
3. Runs BM25 + Classic retrieval in parallel.
4. Runs up to 3 refinement rounds, each time expanding the query based on gaps in the previous round's results.
5. Assembles the largest context window the LLM supports.

---

## Settings Panel (RagView.jsx)

The settings panel renders inside Extensions → Options. It contains:

### Data Sources
- List of all indexed sources with chunk counts and enable/disable toggles.
- Shared path configuration (network drive path where source data lives).

### Search Pipeline
- **Engine toggle** — BM25 or Classic.
- **Query expansion** — Enable/disable LLM expansion (off by default; adds ~2s latency per query).
- **LLM reranking** — Enable/disable reranking (off by default; adds ~3s latency per query). Guarded: only shown if `appAPI.aiChat` is available.

### Professor Agents
- List of agents with their active status, domain description, and weight configuration.
- Per-source-kind weight sliders for each agent.

### Test Search
- **Standard mode** — Enter a query, see the top results with scores and source labels.
- **Compare mode** — Run the same query through both BM25 and Classic engines simultaneously. Results shown side-by-side with timing and score columns. Used to validate engine quality on real queries.

---

## `appAPI` Methods Provided

The service patches `window.appAPI` with:

| Method | Description |
|--------|-------------|
| `ragSearch({ query, topK, agentId })` | Run a search and return ranked chunks |
| `ragCompareSearch({ query, topK })` | Run both engines and return side-by-side results |
| `ragGetConfig()` | Return current RAG config |
| `ragSetConfig(partial)` | Update and persist config |
| `ragCustomSources()` | List configured custom sources |
| `ragAddSource(cfg)` | Add a new source |
| `ragRemoveSource(id)` | Remove a source |
| `ragToggleSource({ id, active })` | Enable/disable a source |
| `ragGetAgents()` | Return professor agent definitions |
| `ragGetEngineInfo()` | Return engine stats (index size, chunk count, etc.) |
| `ragDeepDive({ query, onProgress })` | Run Deep Dive mode with progress callbacks |

---

## Data Sources Indexed

Out of the box, the RAG engine indexes:

| Source | Description |
|--------|-------------|
| Confluence pages | From the Confluence integration cache |
| Custom sources | Files, URLs, crawls added via Knowledge Sources |
| Task data | Department tasks from `useStore` state |
| Knowledge base | Static KB files on the share |
| PotterDB | Wizarding World lore (if the PotterDB extension is enabled) |

---

## Configuration

Stored in `localStorage` under `producerTrackerRagConfig`:

```json
{
  "sharedPath": "S:\\JoseAbraham\\RAG",
  "searchEngine": "bm25",
  "queryExpansion": false,
  "reranking": false,
  "topK": 5,
  "minRelevance": 0.10,
  "agents": { ... }
}
```

---

## Dependencies

- **AI Assistant** (for LLM expansion and reranking calls)
- Enhanced by: **Knowledge Sources**, **Confluence Integration**, **PotterDB Lore**

---

## Technical Notes

- `ragService.js` is ~2,300 lines of zero-dependency vanilla JS. It is loaded as a CommonJS-style service module.
- The inverted index is rebuilt in memory each time the service initialises (on app start). For the current dataset (~264K chunks), build time is under 2 seconds on modern hardware.
- Index data is NOT persisted to `localStorage` — it is always rebuilt from the source chunks on startup. This keeps localStorage from growing unboundedly.
- LLM expansion queries are cached in a module-scoped `Map` keyed by the query string. Cache is cleared on service restart.
- The BM25 implementation uses integer arithmetic where possible to avoid floating-point accumulation errors across large posting lists.

---

## Installation

1. Install and enable the **AI Assistant** extension first.
2. Open the Marketplace tab in The Marauder's Ledger.
3. Find **Procedural RAG Engine** and click **Install**.
4. Enable it from the Extensions page.
5. Open Extensions → Options → Procedural RAG Engine and configure the shared data path.
6. Use the **Compare Mode** in Test Search to validate BM25 vs Classic quality on your real queries.

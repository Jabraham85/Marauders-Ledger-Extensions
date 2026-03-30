# AI Assistant

**Category:** AI  
**Version:** 2.4.0  
**Author:** WB Games Studio  
**Entry points:** `AiChatView.jsx` (main view), `aiLlmService.js` (background service)  
**View ID:** `ai-chat`

---

## Overview

The AI Assistant is the LLM client for The Marauder's Ledger. It supports multiple AI providers (Ollama, OpenAI, and custom OpenAI-compatible endpoints), routes queries through specialised "professor" agents, integrates with the RAG Engine for knowledge-grounded answers, and maintains persistent chat threads across restarts. It is the foundation that the RAG Engine and Knowledge Sources extensions build upon.

---

## Features

### Chat Interface (AiChatView.jsx)
- **Thread persistence** — Multiple named chat threads, each stored in `localStorage`. Threads survive app restarts. Create new threads, rename them, delete them.
- **Professor agent routing** — Five professor agents, each with a specialised domain and prompt personality:

| Agent | Name | Domain |
|-------|------|--------|
| Fig | The Chronicler | Lore, identities, story design |
| Sharp | The Investigator | Root causes, bugs, evidence chains |
| Ronen | The Artificer | Unreal systems, asset paths, technical architecture |
| Weasley | The Organiser | Workflows, tasks, deadlines, ownership |
| Hecat | The Scholar | Broad cross-domain queries |

- **RAG-augmented answers** — When the RAG Engine is installed and enabled, every query automatically runs a knowledge search before calling the LLM. The retrieved chunks are injected into the system prompt as numbered source references (`[1]`, `[2]`, etc.).
- **Source citations** — AI answers render inline citation badges from the `potterdb/CitationDisplay` module. Each badge is colour-coded by source type (Confluence = blue, Knowledge Base = purple, PotterDB = amber) and links to the original page when available.
- **Extended search mode** — A toggle that instructs the RAG engine to use its Deep Dive mode (more sources, multi-round retrieval) before answering. Uses the `EXTENDED_THOUGHT_RAG_PLAYBOOK` prompt from `ledger/ragPlaybooks`.
- **Cost estimation** — For OpenAI and compatible providers, token counts are estimated and a per-query cost is shown in the UI.
- **Markdown rendering** — LLM responses are rendered with lightweight Markdown: bold, headings, code blocks, bullet points.
- **Copy response** — One-click copy of the full response text.
- **Regenerate** — Retry the last query with the same or a different agent.

### Background Service (aiLlmService.js)
The service patches `window.appAPI` with all LLM methods that the rest of the app and other extensions use:

| Method | What it does |
|--------|-------------|
| `aiChat({ message, systemPrompt, config })` | Send a single message to the LLM and return the response string |
| `aiGetConfig()` | Return the current LLM config |
| `aiSetConfig(partial)` | Update and persist part of the config |
| `aiTestConnection()` | Ping the LLM endpoint and return latency |
| `aiGetPresets()` | Return the list of built-in provider presets |
| `aiEstimateCost({ inputTokens, outputTokens })` | Return cost estimate based on current provider pricing |

---

## Provider Configuration

| Provider | API URL | Format | Notes |
|---------|---------|--------|-------|
| **Ollama** | `http://localhost:11434/api/chat` | `ollama` | Local, free, default |
| **Luna** | `/proxy/luna/api/chat/completions` | `openai` | WB Games internal LLM proxy |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | `openai` | Requires API key |
| **Custom** | User-defined | `openai` | Any OpenAI-compatible endpoint |

Configuration is stored in `localStorage` under `producerTrackerAiConfig`.

### HTTP Routing
- Local endpoints (localhost, 127.0.0.1, relative paths) use `fetch()` directly.
- Remote endpoints route through the Tauri `http_request` Rust command to bypass CORS.

---

## RAG Integration

When the RAG Engine extension is active, `aiChat` is called with a pre-built context string from `ragSearch()` prepended to the system prompt. The AI view checks for `appAPI.ragSearch` availability at render time and enables the RAG UI controls only if it is present.

The `aiLlmService.js` also exposes `appAPI.aiChat` for the RAG engine to call during LLM query expansion and LLM reranking.

---

## Dependencies

- None (works standalone with Ollama or a configured API key)
- Enhanced by: **RAG Engine**, **Knowledge Sources**, **PotterDB Lore**

---

## Technical Notes

- `AiChatView.jsx` (~1130 lines) uses plain `var` declarations throughout to avoid `const`/`let` Sucrase sandbox edge cases in the extension loader.
- `aiLlmService.js` is a CommonJS-style service module (uses `var`, no `import`/`export`) so it can be evaluated with `Function()` in the extension sandbox's service loader.
- The LLM call has a 90-second timeout (`LLM_CALL_TIMEOUT_MS = 90000`) enforced via `Promise.race`.
- Thread data is stored per-thread in `localStorage` as `ai_thread_<threadId>`. The thread index is stored as `ai_thread_index`.
- Agent descriptions are duplicated in the view (`AGENT_DESCRIPTIONS`) as a fallback for cases where `ragGetAgents()` is unavailable.
- `AIImprovePanel.jsx` provides an in-place text improvement panel used by other views (not directly part of the chat flow).
- `SettingsBridge.jsx` is a small bridge component for exposing AI settings within the Extensions Options panel. Note: this file uses `React.createElement` without a local React import and depends on React being available in the sandbox scope — a known quirk that works in the current sandbox but is technically fragile.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **AI Assistant** and click **Install**.
3. Enable it from the Extensions page.
4. Open the AI Chat view from the sidebar and configure your LLM provider in the settings panel (top-right gear icon).
5. For local AI: install [Ollama](https://ollama.com) and run `ollama pull llama3.2` — no API key needed.

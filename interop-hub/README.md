# Interop Hub

**Category:** Tools  
**Version:** 1.1.0  
**Author:** WB Games Studio  
**Entry points:** `InteropHubView.jsx` (main view), `InteropHubSettings.jsx` (settings panel)  
**View ID:** `interop-hub`

---

## Overview

Interop Hub is the diagnostic and monitoring dashboard for The Marauder's Ledger's cross-extension communication system. Every message published on the interop bus flows through here in real time. It also runs a compatibility scan against all installed extensions to surface manifest errors, missing fields, and integration guidance — useful when developing or troubleshooting extensions.

---

## Features

### Event Stream (InteropHubView.jsx)
- **Live event feed** — Shows all events published on `window.appAPI.interopPublish()` in real time, with timestamp, channel name, source extension, and payload preview.
- **Channel filter** — Filter the stream to a specific channel (e.g. `avalanche-jira/sync/*` or `chess/game/*`).
- **Pause/resume** — Pause the live stream to inspect a specific event without it scrolling away.
- **Event detail** — Click any event to expand the full JSON payload in a formatted inspector.
- **Event counter** — Shows total events received since the Hub was opened.
- **Clear** — Clears the event log for a fresh capture.

### Compatibility Scanner
- **Extension audit** — Scans all installed and enabled extensions against a set of manifest validation rules:
  - `manifest.id` present and matches registry id
  - `manifest.name` present
  - `manifest.version` present
  - `category` is one of the valid values (`views`, `integrations`, `ai`, `tools`, `appearance`, `community`)
  - `provides.entries.view` file exists (if a view is declared)
  - `provides.view.id` does not collide with reserved host view IDs
- **Severity levels** — Issues are classified as errors (red) or warnings (amber). Extensions with zero issues show a green checkmark.
- **Legacy app modules** — Extensions like `calendar`, `allTasks`, `activity`, `darkMode`, etc. are identified as "legacy app modules" that pre-date the provides system and are exempt from strict manifest validation.
- **Integration guidance** — For extensions that publish on the bus, shows which channels they use and which other extensions can subscribe to them.

### Settings Panel (InteropHubSettings.jsx)
- **Strict manifest mode** — Toggle whether legacy extensions are exempt from validation. Enable for full audits during extension development.
- **Retained events** — Configure how many past events to keep in the live stream buffer (default: 500).
- **Diagnostic ping** — Send a `interop-hub/diagnostics/ping` event to the bus to verify the interop system is working.

---

## How It Works

Interop Hub subscribes to `window.appAPI.interopSubscribe('*', handler)` (wildcard subscription) on mount and unsubscribes on unmount. Each received event is pushed to a local state array (capped at the configured retention limit).

The compatibility scanner reads the installed extension list from `appAPI.listDiscoveredExtensions()` and for each extension reads its local `manifest.json` via `appAPI.readTextFile()`. It then runs the `analyzeExtension()` function which produces a scored report with errors and warnings.

---

## Active Interop Channels

Channels currently active in the extension ecosystem:

| Channel | Published by | Consumed by |
|---------|-------------|-------------|
| `avalanche-jira/sync/request` | Jira Ticket Tool view | Jira Ticket Tool service |
| `avalanche-jira/sync/background_complete` | Jira Ticket Tool service | Anyone interested |
| `chess/game/your-turn` | Chess service | Chess view (notifications) |
| `chess/challenge/received` | Chess service | Chess view (lobby) |
| `chess/chat/new-message` | Chess service | Chess view (chat) |
| `interop-hub/diagnostics/ping` | Interop Hub settings | Interop Hub view |

---

## Dependencies

- None

---

## Technical Notes

- `InteropHubView.jsx` is ~350 lines. The event feed uses a `useRef` buffer to avoid triggering a full re-render on every event when the stream is paused.
- The compatibility scanner's `analyzeExtension()` function explicitly enumerates the `LEGACY_APP_MODULE_IDS` set and skips strict validation for them.
- Wildcard subscription (`'*'`) is supported by the interop bus's internal `_listeners` map using a special catch-all key.
- The event log does NOT persist across page refreshes — it is an in-memory session capture only.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Interop Hub** and click **Install**.
3. Enable it from the Extensions page.
4. Useful primarily for extension developers — open it alongside another extension you are building to monitor its interop events in real time.

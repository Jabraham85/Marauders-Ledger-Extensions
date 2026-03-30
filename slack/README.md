# Slack Integration

**Category:** Integrations  
**Version:** 1.1.0  
**Author:** WB Games Studio  
**Entry points:** `SlackDigestView.jsx` (full view), `SlackPopover.jsx` (sidebar button)  
**View ID:** `slack`  
**Status:** Suspended (hidden from Marketplace)

---

## Overview

The Slack Integration syncs messages from your Slack workspace into The Marauder's Ledger via the Slack API, routed through Tauri's HTTP proxy. It provides a searchable message digest grouped by date, with channel filtering and AI-context integration. Synced messages feed into the RAG engine as a knowledge source so the AI Assistant can reference recent team conversations.

> **Note:** This extension is currently marked `"suspended": true` in `registry.json` and does not appear in the Marketplace. It is functional but awaiting a Slack API credentials flow before being re-enabled for general use.

---

## Features

### Slack Digest View (SlackDigestView.jsx)
- **Message feed** — All synced Slack messages displayed in a chronological, date-grouped list (Today, Yesterday, then full date strings).
- **Channel filter** — Dropdown to filter messages to a specific channel.
- **Search** — Client-side full-text search across message text. Matches are highlighted in yellow.
- **Chatter filter** — Toggle to show or hide messages classified as "chatter" (casual conversation not relevant to work). Classification is done by the sync process on the bridge side.
- **Sync** — A "Sync Now" button calls `electronAPI.slackSync()` to fetch new messages from the Slack API.
- **Message context** — Each message shows: author, channel name, relative timestamp, message text, and reaction emoji counts.

### Slack Popover (SlackPopover.jsx)
A compact `IntegrationButton` sidebar popover:
- **Connect** — Enter your Slack workspace token (Bot token with `channels:read`, `messages:read` scopes).
- **Connected state** — Shows workspace name and a "Sync" quick action.
- **Disconnect** — Clears the stored token.

---

## How It Works

| Bridge Method | What it does |
|--------------|-------------|
| `slackGetStatus()` | Returns `{ connected, workspace }` |
| `slackConnect({ token })` | Stores the bot token and verifies the connection |
| `slackDisconnect()` | Clears credentials |
| `slackSync()` | Fetches new messages from configured channels |
| `slackGetMessages()` | Returns locally cached messages |
| `slackGetChannels()` | Returns list of synced channels |

Messages are stored in the Ledger's central store under `state.slack.messages` and persist via `platformStore.jsx`.

---

## RAG Integration

When enabled alongside the RAG Engine, synced Slack messages are indexed as a knowledge source with `sourceKind: 'chat'`. The Sharp agent (The Investigator) weights chat sources higher than other agents, making it particularly good at finding answers buried in Slack threads.

---

## Dependencies

- None

---

## Why It's Suspended

The extension requires a Slack Bot Token with workspace permissions. The current version asks users to paste a raw token into a text field, which is not ideal from a security perspective. A proper OAuth flow is planned before this extension is re-enabled in the Marketplace.

To use it now: manually set `"suspended": false` in `registry.json`, refresh the Marketplace, and install. You will need to create a Slack app with the `channels:history`, `channels:read`, and `users:read` scopes and paste your Bot User OAuth Token into the settings.

---

## Technical Notes

- `SlackDigestView.jsx` reads messages from `state.slack` in the Ledger store — the sync process (in the bridge) writes them there, not the extension.
- Message classification ("chatter" vs substantive) is a simple heuristic in the bridge: messages under 20 characters, emoji-only messages, and replies to chatter are classified as chatter.
- The search highlight uses `String.replace` with a regex and maps the parts to JSX — safe for all Unicode content but does not support regex special characters in the search query (they are escaped with `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`).

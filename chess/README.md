# Wizard's Chess

**Category:** Community  
**Version:** 1.3.6  
**Author:** WB Games Studio  
**Entry points:** `ChessView.jsx` (main view), `ChessSettings.jsx` (settings panel), `service.cjs` (background service)  
**View ID:** `chess`

---

## Overview

Wizard's Chess is a fully featured two-player chess game with a Hogwarts aesthetic, synchronised over the shared network drive. Challenge colleagues to live games, play timed speed chess, review move histories, or play solo against a simple bot. The chess pieces use Unicode glyphs styled in cream and near-black with gold shadow effects on a warm parchment-coloured board.

---

## Features

### Gameplay
- **Full chess rules** — Legal move validation for all pieces including castling (both sides), en passant, and pawn promotion. Check, checkmate, and stalemate detection.
- **Pointer drag-to-move** — Pieces are dragged using pointer events (not HTML5 drag-and-drop, which does not work in the Tauri sandbox). A ghost piece follows the cursor; valid target squares show gold highlight dots.
- **Move history** — Every move is recorded in algebraic-style notation. A replay panel lets you step through the game move by move.
- **Undo request** — Either player can request an undo. The opponent must accept or decline. Both players' states are updated atomically on the shared drive.
- **Pawn promotion** — When a pawn reaches the back rank, a promotion picker modal appears with Queen, Rook, Bishop, and Knight options.

### Time Controls
| Mode | Duration |
|------|---------|
| 1 min | Bullet |
| 3 min | Blitz |
| 5 min | Blitz |
| 10 min | Rapid |
| 30 min | Classical |
| Casual | Untimed |

A countdown clock is shown for each player. Running out of time triggers a loss.

### Multiplayer (Shared Drive)
- **Lobby** — A player list showing who is online (heartbeat <60s = online, <5min = away, otherwise offline).
- **Challenges** — Send a game challenge to any online player with your preferred time control. The opponent receives a notification popup.
- **Live sync** — The active game file is polled every 5 seconds. Opponent moves appear automatically.
- **In-game chat** — An encrypted chat panel within each game. Messages are XOR-encoded with a shared key derived from the game ID to prevent casual spoofing (not a security mechanism).
- **Leaderboard** — A wins/losses/draws table for all players, sorted by win rate.

### Solo Mode
- **Play both sides** — Control both white and black yourself. Useful for analysis.
- **vs Bot** — Three difficulty levels:
  - Easy: random legal moves
  - Medium: one-ply minimax (captures and checks preferred)
  - Hard: two-ply minimax with basic material evaluation

### Notifications (Background Service)
The `service.cjs` polls the shared drive every 5 seconds for:
- New challenges targeting the current player → shows a notification toast
- New moves in active games → "your turn" alert in the lobby
- New chat messages → chat badge counter

Polling uses `window.electronAPI.tauriInvoke('marketplace_read_text_file')` to read the shared JSON files.

---

## File Structure

| File | Purpose |
|------|---------|
| `ChessView.jsx` | Main view (~2,700 lines) — board, lobby, move history, chat, leaderboard |
| `ChessSettings.jsx` | Settings panel — username, shared folder path, poll interval, notification preferences |
| `service.cjs` | Background service — polls for challenges, moves, and chat; maintains heartbeat |
| `shared/` | Network drive folder containing game state files (not shipped in the extension folder) |

### Shared Drive Files (at configured path)
| File | Contents |
|------|---------|
| `players.json` | Active players, heartbeat timestamps, stats |
| `challenges.json` | Pending challenge records |
| `games/<gameId>.json` | Full game state per active game |

---

## `window.chessAPI`

The background service exposes a public API on `window.chessAPI`:

| Method | Description |
|--------|-------------|
| `getOnlinePlayers()` | Returns players with heartbeat within the last 5 minutes |
| `getActiveGames()` | Returns games where the current player has a pending move |
| `getMyStats()` | Returns the current player's wins/losses/draws |

---

## Hogwarts Theme Details

The board uses a warm parchment/dark wood colour scheme:

| Element | Light mode | Dark mode |
|---------|-----------|----------|
| Light squares | `#E8D5B5` (parchment) | `#4a3d30` |
| Dark squares | `#7B5B3A` (warm brown) | `#2e2118` |
| Selected square | `#6B8E4E` (forest green) | `#4a6633` |
| Valid move dot | Gold `rgba(211,166,37,0.55)` | Same |
| White pieces | Cream `#FFF8DC` with gold glow | Same |
| Black pieces | Near-black `#1a0f0a` with shadow | Same |

---

## Dependencies

- None

---

## Technical Notes

- The chess engine (legal move generation, check detection) is implemented from scratch in `ChessView.jsx`. It is not based on any external library.
- The bot uses minimax with alpha-beta pruning. At depth 2 (hard mode) it evaluates material balance only — no positional heuristics. Response time is typically under 200ms.
- **Known issue:** `shared/players.json.tmp.*` temporary files accumulate on the shared drive when a write is interrupted. The service attempts to clean up its own temp files but files from crashed sessions may persist. Safe to delete manually.
- Chat encryption is XOR with a game-ID-derived key — it is obfuscation only, not security.
- The `writeJsonFile` function in the service uses an atomic write pattern: write to `.tmp.<timestamp>.<random>`, then use a PowerShell rename-if-succeed script to atomically replace the target. This prevents partial reads by other players during a write.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Wizard's Chess** and click **Install**.
3. Enable it from the Extensions page.
4. Open Extensions → Options → Wizard's Chess Settings and set your display name and shared folder path.
5. Challenge a colleague from the lobby tab, or start a solo game immediately.

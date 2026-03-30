# Minesweeper

**Category:** Community  
**Version:** 1.0.0  
**Author:** Studio Tools  
**Entry point:** `MinesweeperView.jsx`  
**View ID:** `minesweeper`

---

## Overview

Minesweeper is a self-contained classic Minesweeper game built directly into The Marauder's Ledger. Take a break between sprints without switching windows. The game is fully self-contained — no external dependencies, no network calls, no persistent data beyond your high score.

---

## Features

- **Three difficulty levels:**
  - Beginner: 9×9 grid, 10 mines
  - Intermediate: 16×16 grid, 40 mines
  - Expert: 16×30 grid, 99 mines
- **Safe first click** — The first cell you click is guaranteed to not be a mine. Mines are placed *after* your first click, with a 3×3 safe zone around it.
- **Flood reveal** — Clicking an empty cell (adjacent count = 0) flood-fills all connected empty cells automatically.
- **Right-click to flag** — Right-click any unrevealed cell to place or remove a flag. The mine counter decrements with each flag placed.
- **Mine counter** — Shows remaining unflagged mines in the top bar.
- **Timer** — Starts on your first click. Stops when you win or lose.
- **Face button** — The classic smiley face resets the board. Updates to cool-shades on win, dizzy-face on loss.
- **Win/lose detection** — Winning reveals all mines with flags; losing reveals all mines.

---

## How It Works

The game is implemented as a pure React component with no external state. All game state (`grid`, `gameState`, `timer`, `flagCount`) is managed locally with `useState` and `useRef`. The grid is a 2D array of cell objects:

```javascript
{
  mine: boolean,
  revealed: boolean,
  flagged: boolean,
  adjacent: number  // 0–8, count of adjacent mines
}
```

On first click, `placeMines()` distributes mines randomly across the grid while keeping a 3×3 safe zone around the clicked cell. `floodReveal()` uses an iterative stack (not recursion) to prevent stack overflow on large empty regions.

The timer uses `setInterval` via `useRef` to avoid stale closure issues.

---

## Dependencies

- None (fully self-contained)

---

## Technical Notes

- `MinesweeperView.jsx` is approximately 400 lines. All logic and UI is in one file.
- The component does not import `useStore` or `useTheme` — it has its own colour scheme defined inline and does not respond to house themes.
- Right-click events use `onContextMenu` with `e.preventDefault()` to suppress the browser's context menu.
- The game grid renders as a CSS grid with fixed-size cells. Cell size is hardcoded at 28px for Beginner/Intermediate and 24px for Expert.
- No high score or stats are persisted in this version.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Minesweeper** and click **Install**.
3. Enable it from the Extensions page.
4. It will appear in the sidebar as a nav item.

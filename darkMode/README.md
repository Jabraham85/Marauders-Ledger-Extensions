# Dark Mode

**Category:** Appearance  
**Version:** 1.2.0  
**Author:** WB Games Studio  
**Entry point:** `darkMode.css`

---

## Overview

Dark Mode is a CSS-only appearance extension that applies a dark colour palette to The Marauder's Ledger. It has no JavaScript, no service, no React components — it is a single stylesheet that overrides the app's default light theme when the `dark` class is present on the document root. Toggling dark mode is handled by the host frame's theme system; this extension simply provides the CSS rules.

---

## What It Does

`darkMode.css` contains:

- **`@tailwind base/components/utilities`** directives — The extension ships its own Tailwind CSS build that includes dark-mode overrides for all Tailwind utility classes used by the app.
- **Custom property overrides** — Redefines all CSS custom properties (`--hp-text`, `--hp-bg`, `--hp-card`, `--hp-border`, `--hp-accent`, etc.) for dark mode values.
- **Parchment texture** — Applies a dark parchment texture to the main background, maintaining the Hogwarts aesthetic in dark mode.
- **Scrollbar styling** — Custom WebKit scrollbar colours for dark mode.
- **Magic divider** — Recolours the `.magic-divider` decorative HR element.
- **Wizard term tooltips** — Adjusts tooltip contrast for dark mode.
- **Typography** — Maintains Cinzel (headings) and Crimson Text (body) fonts with adjusted weights for dark mode legibility.
- **Baseline text visibility fix** (v1.2.0) — Hard-coded `!important` overrides at the end of the file (outside any `@layer`) for guaranteed text visibility in every dark mode view. This was added as a definitive fix after CSS variable approaches proved unreliable in the Tauri WebView2 renderer.

---

## How It Works

The dark mode toggle in the Ledger adds/removes the `dark` class on `<html>` (or the root element). Tailwind's JIT engine generates `.dark:*` classes that are activated by this class. The `darkMode.css` stylesheet augments these generated classes with app-specific overrides.

The extension is loaded by the host frame's stylesheet injector when it detects this extension is enabled. Because it is CSS-only, it takes effect immediately on load with no runtime cost.

---

## Version History

| Version | What changed |
|---------|-------------|
| 1.0.0 | Initial dark mode CSS |
| 1.1.0 | Added parchment texture and magic divider recolour |
| 1.2.0 | Added `!important` baseline text visibility fix for Tauri WebView2 |

---

## Dependencies

- None

---

## Technical Notes

- This extension has no `provides.entries` that reference JavaScript files. The host frame's stylesheet loader handles CSS extensions differently from JSX/JS extensions.
- The `!important` overrides at the bottom of the file are intentionally placed outside `@layer` to ensure they win the specificity battle against all Tailwind-generated rules. Do not move them inside a `@layer`.
- **Do NOT use Tailwind opacity modifiers on custom colour variables** (e.g. `text-hp-text-dark/85`). The `/XX` syntax generates `rgb(var(--color) / 0.85)` which is invalid when the variable resolves to a hex value. The dark mode CSS avoids this pattern throughout.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Dark Mode** and click **Install**.
3. Enable it from the Extensions page.
4. Toggle dark mode using the theme switcher in the top-right of the app (or the House Theme selector in Settings).

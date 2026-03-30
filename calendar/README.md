# Calendar

**Category:** Views  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `CalendarView.jsx`

---

## Overview

The Calendar extension provides a full-featured calendar view directly inside The Marauder's Ledger. It shows week, day, and month views in a single unified component, pulling events from two sources simultaneously: your Outlook calendar (via the Outlook integration) and task deadlines defined within the Ledger itself. No external calendar app needs to stay open — everything you need is in one pane.

---

## Features

- **Three view modes** — Week, Day, and Month. Switch between them with the toolbar buttons at the top of the view.
- **Week view** — Shows the current week across 7 columns, with a time-axis grid from midnight to midnight. Work hours (07:00–19:00) are highlighted at full opacity; off-hours are visually dimmed.
- **Day view** — Single-day time-axis view with event chips positioned at the exact start time. Useful for dense days.
- **Month view** — Classic calendar grid. Up to four event chips per cell, with an overflow count if more events exist on a given day.
- **Outlook event chips** — Each event shows as a coloured chip with subject and start time. Cancelled events render with a strikethrough and greyed-out styling. All-day events appear in a dedicated all-day bar at the top of each column.
- **Task deadline chips** — Tasks with deadlines that fall within the visible range appear alongside calendar events. Overdue tasks render in red; upcoming tasks render in amber.
- **Event detail modal** — Clicking any event chip opens an overlay showing the full subject, start/end time, location, organiser, body, and attendee list.
- **Navigation** — Previous/Next arrows and a "Today" button. Keyboard-friendly.
- **Live refresh** — An "Refresh from Outlook" button re-fetches events from the Outlook bridge without a full page reload.

---

## How It Works

The view reads two data sources:

1. **Outlook events** — Calls `window.electronAPI.outlookGetCalendar()` (or `window.appAPI`) to retrieve events. This requires the Outlook integration to be connected first. Events are fetched for the current visible range (±60 days from today on initial load). If Outlook is not connected, the calendar still works with task deadlines only.

2. **Task deadlines** — Reads directly from `useStore()` state (`state.departments → tasks`). Any task with a `deadline` ISO string is placed on the calendar as a deadline chip. No extra sync needed.

All events are merged and sorted in-memory before rendering. No data is persisted by this extension — it is purely a read/display layer.

---

## Dependencies

- None (Outlook integration enhances it but is not required)
- Uses `useStore` from `../store/useStore` for task data
- Uses `useTheme` / `W` from `../theme/ThemeProvider` for theming

---

## Technical Notes

- `CalendarView.jsx` is a single large self-contained component (~648 lines). Sub-components (`EventChip`, `AllDayBar`, `WeekView`, `DayView`, `MonthView`) are defined inline in the same file.
- Time positioning in Week/Day view uses pixel math: `minuteOfDay(start) / (24 * 60) * totalGridHeight`. Minimum event chip height is enforced at 15 minutes of visual height.
- All-day events and events spanning midnight are handled by splitting them into per-day segments.
- The component is resilient to missing Outlook data — it renders gracefully with an empty event array if the bridge call fails.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Calendar** and click **Install**.
3. Enable it from the Extensions page.
4. For Outlook event syncing, also install and connect the **Outlook Integration** extension.

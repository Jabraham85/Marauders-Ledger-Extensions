# All Tasks Table

**Category:** Views  
**Version:** 1.0.0  
**Author:** WB Games Studio  
**Entry point:** `AllTasksView.jsx`

---

## Overview

All Tasks Table is a cross-department task aggregator. Rather than navigating to each department individually to see what is happening, this view pulls every task from every department into a single sortable, filterable table. It is the fastest way to answer questions like "what is overdue right now across the whole project?" or "show me all urgent tasks assigned to Q2".

---

## Features

- **Unified task table** — All tasks from all departments in one place, with their department name and colour shown in each row.
- **Multi-axis filtering** — Filter simultaneously by Department, Status (`Todo`, `In Progress`, `Done`), and Priority (`Urgent`, `High`, `Medium`, `Low`).
- **Sortable columns** — Click any column header to sort by that field. Click again to reverse. Columns: Title, Department, Status, Priority, Deadline. Default sort is by deadline ascending (soonest first).
- **Priority badges** — Each priority level renders with a distinct colour-coded pill (red for Urgent, orange for High, blue for Medium, grey for Low).
- **Overdue highlighting** — Any task whose deadline has passed is highlighted in red across all columns.
- **Bulk actions** — Select multiple tasks with checkboxes (including a select-all checkbox in the header). Apply bulk status changes: mark as Done, mark as In Progress, mark as Todo.
- **Navigate to department** — Clicking a task's department name calls the `onSelectDept` callback, which switches the main view to that department's board so you can see the task in context.
- **Live state** — The table is computed from `useStore()` state on every render. Any change made elsewhere in the app (another tab, department board) is immediately reflected here.

---

## How It Works

`AllTasksView` reads `state.departments` from the Ledger's central store and flattens it:

```
state.departments
  → forEach dept → forEach task → push { ...task, deptId, deptName, deptColor }
```

The resulting flat array is then filtered by the active filter dropdowns and sorted by the active sort column, all via `useMemo` so the computation only re-runs when the inputs change. Bulk status updates call `updateTask(deptId, taskId, { status })` from the same store.

---

## Dependencies

- None
- Uses `useStore` from `../store/useStore`
- Uses `useTheme` / `W` from `../theme/ThemeProvider`

---

## Technical Notes

- The entire view is a single `AllTasksView` functional component (~245 lines). No sub-files.
- The `onSelectDept` prop is provided by the host frame when the extension is mounted — it is a callback into `App.jsx`'s view router.
- Bulk selection state is local (`useState(new Set())`). It is cleared when a bulk action is applied.
- The priority sort order is hardcoded: `urgent: 0, high: 1, medium: 2, low: 3`.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **All Tasks Table** and click **Install**.
3. Enable it from the Extensions page.

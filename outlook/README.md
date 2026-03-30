# Outlook Integration

**Category:** Integrations  
**Version:** 1.1.0  
**Author:** WB Games Studio  
**Entry points:** `OutlookPopover.jsx` (sidebar button), `OutlookMeetingModal.jsx` (meeting scheduler)

---

## Overview

The Outlook Integration connects The Marauder's Ledger to Microsoft Outlook (desktop) via PowerShell COM automation, bridged through Tauri. It surfaces your Outlook account status in the sidebar and lets you schedule meetings and retrieve calendar events without leaving the Ledger. The Calendar extension uses this integration to show your Outlook events on the built-in calendar.

---

## Features

### Sidebar Popover (OutlookPopover)
An `IntegrationButton` in the sidebar opens a compact popover:
- **Connect** — Detects the locally installed Outlook instance via `outlookGetAccount()`. Shows the detected email address on success.
- **Connected state** — Shows the connected account name/email with a blue "Connected" indicator. Provides two quick actions: "New Meeting" (opens the meeting modal) and "Disconnect".
- **Error handling** — If Outlook is not installed or the user is not signed in, a descriptive error message is shown inline.

### Meeting Modal (OutlookMeetingModal)
A full-featured meeting scheduler modal:
- **Subject** — Free-text field.
- **Date and time** — Date picker + start/end time inputs.
- **Location** — Optional physical or Teams location.
- **Attendees** — Comma-separated email addresses.
- **Body** — Meeting description/agenda.
- On submit, calls `outlookScheduleMeeting({ subject, date, start, end, location, attendees, body })` which fires PowerShell COM to create the appointment in Outlook.

---

## How It Works

The bridge calls go through `window.electronAPI`:

| Method | What it does |
|--------|-------------|
| `outlookGetAccount()` | Runs PowerShell to detect the logged-in Outlook account. Returns `{ ok, account: { name, username } }` |
| `outlookGetCalendar({ start, end })` | Fetches calendar events between two ISO date strings via COM |
| `outlookScheduleMeeting(details)` | Creates a new appointment in Outlook via COM |

These methods are implemented in the host bridge's PowerShell layer. They spawn a `powershell.exe` process that uses the `Microsoft.Office.Interop.Outlook` COM API and return structured JSON to the Tauri Rust layer, which relays it to the frontend.

---

## Requirements

- **Microsoft Outlook (desktop)** must be installed and the user must be signed in.
- This integration does NOT work with Outlook web (OWA) or the new Outlook app preview — it requires the classic desktop COM interface.
- Only tested on Windows 10/11 with Microsoft 365 Outlook.

---

## Dependencies

- None
- Enhances: **Calendar** (provides Outlook events to the calendar view)

---

## Technical Notes

- `OutlookPopover.jsx` is built around the `IntegrationButton` shared component, which provides the popover container, toggle animation, and button style variants.
- The popover checks `window.electronAPI?.outlookGetAccount` existence before attempting the call. If the bridge method is absent (Tauri build without the PowerShell module), a clear error message is shown rather than a crash.
- Account data (`{ name, username }`) is passed back to the parent component via the `onOutlookAccountChange` callback prop. The parent (`App.jsx` or the Calendar extension) stores it in state and passes it back down as `outlookAccount`.

---

## Installation

1. Open the Marketplace tab in The Marauder's Ledger.
2. Find **Outlook Integration** and click **Install**.
3. Enable it from the Extensions page.
4. Click the calendar icon in the sidebar and click **Connect to Outlook**.

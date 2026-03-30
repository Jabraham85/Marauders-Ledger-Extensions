import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WORK_START = 7;
const WORK_END = 19;

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtHour(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function dateKey(isoStr) {
  return isoStr.slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function minuteOfDay(isoStr) {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

function durationMin(start, end) {
  return Math.max(15, Math.round((new Date(end) - new Date(start)) / 60000));
}

function isOverdue(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date(new Date().toISOString().split('T')[0]);
}

function EventChip({ ev, onClick, compact }) {
  const showTime = !ev.isAllDay && !compact;
  const cn = ev.cancelled
    ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 line-through border-l-2 border-gray-400'
    : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 border-l-2 border-indigo-500';
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(ev); }}
      className={`group px-1.5 py-0.5 rounded text-[10px] leading-tight truncate cursor-pointer transition-colors ${cn}`}
      title={`${ev.cancelled ? '[Cancelled] ' : ''}${ev.subject}\n${fmtTime(ev.start)} – ${fmtTime(ev.end)}${ev.location ? '\n' + ev.location : ''}`}
    >
      {showTime && <span className="font-semibold mr-1">{fmtTime(ev.start)}</span>}
      {ev.subject}
    </div>
  );
}

function AllDayBar({ events, onEventClick }) {
  if (!events || events.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5 px-1 py-0.5 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-hp-border dark:border-hp-border-dark">
      {events.map((ev, i) => (
        <div
          key={i}
          onClick={() => onEventClick(ev)}
          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer truncate max-w-full ${
            ev.cancelled
              ? 'bg-gray-200 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 line-through'
              : 'bg-indigo-200 dark:bg-indigo-800/60 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-300 dark:hover:bg-indigo-700'
          }`}
        >
          ◆ {ev.subject}
        </div>
      ))}
    </div>
  );
}

function EventDetail({ ev, onClose }) {
  if (!ev) return null;
  const dur = durationMin(ev.start, ev.end);
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-hp-card dark:bg-hp-card-dark rounded-xl shadow-2xl border border-hp-border dark:border-hp-border-dark w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-hp-border dark:border-hp-border-dark flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-3 h-full rounded-full shrink-0 mt-1 ${ev.cancelled ? 'bg-gray-400' : 'bg-indigo-500'}`} style={{ minHeight: 20 }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${ev.cancelled ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-hp-text dark:text-hp-text-dark'}`}>{ev.subject}</h3>
                {ev.cancelled && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Cancelled</span>
                )}
              </div>
              <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark mt-0.5">
                {ev.isAllDay ? 'All day' : `${fmtTime(ev.start)} – ${fmtTime(ev.end)} (${dur} min)`}
                {' · '}
                {new Date(ev.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-auto">
          {ev.organizer && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-hp-muted dark:text-hp-muted-dark shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <div>
                <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase">Organizer</p>
                <p className="text-xs text-hp-text dark:text-hp-text-dark">{ev.organizer}</p>
              </div>
            </div>
          )}
          {ev.location && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-hp-muted dark:text-hp-muted-dark shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <div>
                <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase">Location</p>
                <p className="text-xs text-hp-text dark:text-hp-text-dark">{ev.location}</p>
              </div>
            </div>
          )}
          {ev.requiredAttendees && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-hp-muted dark:text-hp-muted-dark shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              <div>
                <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase">Required</p>
                <p className="text-xs text-hp-text dark:text-hp-text-dark break-all">{ev.requiredAttendees}</p>
              </div>
            </div>
          )}
          {ev.optionalAttendees && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-hp-muted dark:text-hp-muted-dark shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              <div>
                <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase">Optional</p>
                <p className="text-xs text-hp-text dark:text-hp-text-dark break-all">{ev.optionalAttendees}</p>
              </div>
            </div>
          )}
          {ev.body && ev.body.trim() && (
            <div className="pt-2 border-t border-hp-border dark:border-hp-border-dark">
              <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase mb-1">Notes</p>
              <p className="text-xs text-hp-text dark:text-hp-text-dark whitespace-pre-line">{ev.body.trim()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compute column layout for overlapping events (Outlook-style side-by-side).
 * Returns events augmented with { col, totalCols }.
 */
function layoutOverlappingEvents(events) {
  if (!events || events.length === 0) return [];
  const sorted = [...events].sort((a, b) => minuteOfDay(a.start) - minuteOfDay(b.start) || durationMin(b.start, b.end) - durationMin(a.start, a.end));

  const columns = []; // each column = array of events in that column
  const evMeta = new Map();

  for (const ev of sorted) {
    const evStart = minuteOfDay(ev.start);
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1];
      const lastEnd = minuteOfDay(lastInCol.start) + durationMin(lastInCol.start, lastInCol.end);
      if (evStart >= lastEnd) {
        columns[c].push(ev);
        evMeta.set(ev, { col: c });
        placed = true;
        break;
      }
    }
    if (!placed) {
      evMeta.set(ev, { col: columns.length });
      columns.push([ev]);
    }
  }

  // Compute max overlapping columns for each event's time span
  for (const ev of sorted) {
    const meta = evMeta.get(ev);
    const evStart = minuteOfDay(ev.start);
    const evEnd = evStart + durationMin(ev.start, ev.end);
    let maxCols = columns.length;
    // Find the actual cluster size for this event
    let clusterCols = 0;
    for (let c = 0; c < columns.length; c++) {
      const overlaps = columns[c].some(other => {
        const oStart = minuteOfDay(other.start);
        const oEnd = oStart + durationMin(other.start, other.end);
        return oStart < evEnd && oEnd > evStart;
      });
      if (overlaps) clusterCols++;
    }
    meta.totalCols = clusterCols;
  }

  return sorted.map(ev => ({ ...ev, ...evMeta.get(ev) }));
}

// ── Day / Week time-grid view ──────────────────────────────────────────────

function TimeGrid({ dates, eventsByDate, onEventClick, onScheduleMeeting }) {
  const gridRef = useRef(null);
  const isMultiDay = dates.length > 1;
  const hourHeight = 56;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStr = now.toISOString().split('T')[0];

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = (WORK_START - 0.5) * hourHeight;
    }
  }, [dates]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-hp-border dark:border-hp-border-dark shrink-0">
        <div className="w-16 shrink-0" />
        {dates.map(d => {
          const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
          const isToday = ds === todayStr;
          return (
            <div key={ds} className={`flex-1 text-center py-2 border-l border-hp-border dark:border-hp-border-dark ${isToday ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''}`}>
              <p className="text-[10px] font-semibold text-hp-muted dark:text-hp-muted-dark uppercase">{DAYS[d.getDay()]}</p>
              <p className={`text-lg font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-hp-text dark:text-hp-text-dark'}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="flex shrink-0 border-b border-hp-border dark:border-hp-border-dark">
        <div className="w-16 shrink-0 text-[9px] text-hp-muted dark:text-hp-muted-dark text-right pr-2 py-1">all-day</div>
        {dates.map(d => {
          const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
          const allDay = (eventsByDate[ds] || []).filter(ev => ev.isAllDay);
          return (
            <div key={ds} className="flex-1 border-l border-hp-border dark:border-hp-border-dark min-h-[24px]">
              <AllDayBar events={allDay} onEventClick={onEventClick} />
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={gridRef} className="flex-1 overflow-auto relative">
        <div className="flex" style={{ height: HOURS.length * hourHeight }}>
          {/* Time labels */}
          <div className="w-16 shrink-0 relative">
            {HOURS.map(h => (
              <div key={h} className="absolute w-full text-right pr-2 text-[10px] text-hp-muted dark:text-hp-muted-dark" style={{ top: h * hourHeight - 6 }}>
                {h > 0 ? fmtHour(h) : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dates.map(d => {
            const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
            const isToday = ds === todayStr;
            const timedEvents = (eventsByDate[ds] || []).filter(ev => !ev.isAllDay);

            return (
              <div key={ds} className={`flex-1 relative border-l border-hp-border dark:border-hp-border-dark ${isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className={`absolute w-full border-t ${h >= WORK_START && h <= WORK_END ? 'border-hp-border dark:border-hp-border-dark' : 'border-gray-100 dark:border-gray-800/60'}`}
                    style={{ top: h * hourHeight }}
                    onClick={() => onScheduleMeeting?.({ date: ds, startTime: `${pad2(h)}:00`, endTime: `${pad2(h + 1)}:00` })}
                  />
                ))}

                {/* Now indicator */}
                {isToday && (
                  <div className="absolute w-full z-20 pointer-events-none" style={{ top: (nowMin / 60) * hourHeight }}>
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Event blocks — laid out side-by-side when overlapping */}
                {layoutOverlappingEvents(timedEvents).map((ev, ei) => {
                  const topMin = minuteOfDay(ev.start);
                  const dur = durationMin(ev.start, ev.end);
                  const top = (topMin / 60) * hourHeight;
                  const height = Math.max((dur / 60) * hourHeight, 20);
                  const totalCols = ev.totalCols || 1;
                  const col = ev.col || 0;
                  const widthPct = `calc(${100 / totalCols}% - 4px)`;
                  const leftPct = `calc(${(col / totalCols) * 100}% + 2px)`;
                  return (
                    <div
                      key={ei}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className={`absolute rounded-md px-1.5 py-0.5 cursor-pointer z-10 overflow-hidden transition-colors shadow-sm ${
                        ev.cancelled
                          ? 'border-l-3 border-gray-400 bg-gray-100/80 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-700/60 opacity-60'
                          : 'border-l-3 border-indigo-500 bg-indigo-100/90 dark:bg-indigo-900/60 hover:bg-indigo-200 dark:hover:bg-indigo-800/70'
                      }`}
                      style={{ top, height, minHeight: 20, left: leftPct, width: widthPct }}
                      title={`${ev.cancelled ? '[Cancelled] ' : ''}${ev.subject}\n${fmtTime(ev.start)} – ${fmtTime(ev.end)}`}
                    >
                      <p className={`text-[10px] font-semibold truncate leading-tight ${
                        ev.cancelled ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-indigo-800 dark:text-indigo-200'
                      }`}>{ev.subject}</p>
                      {height > 30 && (
                        <p className={`text-[9px] truncate ${ev.cancelled ? 'text-gray-400 dark:text-gray-500' : 'text-indigo-600 dark:text-indigo-300'}`}>{fmtTime(ev.start)} – {fmtTime(ev.end)}</p>
                      )}
                      {height > 48 && ev.location && (
                        <p className={`text-[9px] truncate ${ev.cancelled ? 'text-gray-400 dark:text-gray-500' : 'text-indigo-500 dark:text-indigo-400'}`}>{ev.location}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month grid ──────────────────────────────────────────────────────────────

function MonthGrid({ year, month, eventsByDate, tasksByDate, today, onDayClick, onEventClick }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = new Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  return (
    <div className="bg-hp-card dark:bg-hp-card-dark rounded-xl border border-hp-border dark:border-hp-border-dark overflow-hidden">
      <div className="grid grid-cols-7">
        {DAYS.map(d => (
          <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-hp-muted dark:text-hp-muted-dark border-b border-hp-border dark:border-hp-border-dark">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, i) => {
          const ds = day ? toDateStr(year, month, day) : '';
          const tasks = ds ? (tasksByDate[ds] || []) : [];
          const events = ds ? (eventsByDate[ds] || []) : [];
          const isToday = ds === today;
          const total = tasks.length + events.length;

          return (
            <button
              key={i}
              onClick={() => day && onDayClick(day)}
              disabled={!day}
              className={`min-h-[100px] p-1.5 border-b border-r border-hp-border dark:border-hp-border-dark text-left transition-colors ${
                !day ? 'bg-gray-50/50 dark:bg-gray-900/30' :
                isToday ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-300 dark:ring-blue-700' :
                'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              {day && (
                <>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs ${isToday ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold' : 'text-gray-600 dark:text-gray-400 font-medium'}`}>{day}</span>
                    {total > 3 && <span className="text-[8px] text-hp-muted dark:text-hp-muted-dark">+{total - 3}</span>}
                  </div>
                  <div className="space-y-px">
                    {events.slice(0, 2).map((ev, ei) => (
                      <EventChip key={`e${ei}`} ev={ev} onClick={onEventClick} compact />
                    ))}
                    {tasks.slice(0, Math.max(1, 3 - events.length)).map((task, ti) => (
                      <div
                        key={`t${ti}`}
                        className={`text-[9px] px-1 py-px rounded truncate ${
                          isOverdue(task.deadline) ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                          'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {task.title}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main CalendarView ───────────────────────────────────────────────────────

export default function CalendarView({ onSelectDept, onScheduleMeeting }) {
  const { t } = useTheme();
  const { state } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('work-week');
  const [outlookEvents, setOutlookEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const tasksByDate = useMemo(() => {
    const map = {};
    state.departments.forEach(dept => {
      (dept.tasks || []).forEach(task => {
        if (!task.deadline || task.status === 'done') return;
        if (!map[task.deadline]) map[task.deadline] = [];
        map[task.deadline].push({ ...task, deptId: dept.id, deptName: dept.name, deptColor: dept.color });
      });
    });
    return map;
  }, [state.departments]);

  const fetchRange = useCallback(async (start, end) => {
    if (!window.electronAPI?.outlookGetCalendarEvents) return;
    setLoadingEvents(true);
    setSyncError(null);
    try {
      const res = await window.electronAPI.outlookGetCalendarEvents({ startDate: start, endDate: end });
      if (res.ok && res.events) {
        const list = Array.isArray(res.events) ? res.events : (res.events ? [res.events] : []);
        setOutlookEvents(list);
      } else {
        setOutlookEvents([]);
        if (res.error) setSyncError(res.error);
      }
    } catch (err) {
      setOutlookEvents([]);
      setSyncError(err.message || 'Failed to fetch');
    }
    setLoadingEvents(false);
  }, []);

  const fetchForView = useCallback(() => {
    if (viewMode === 'month') {
      const start = toDateStr(year, month, 1);
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = toDateStr(year, month, lastDay);
      fetchRange(start, end);
    } else if (viewMode === 'day') {
      const d = currentDate;
      const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      fetchRange(ds, ds);
    } else {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      fetchRange(
        toDateStr(monday.getFullYear(), monday.getMonth(), monday.getDate()),
        toDateStr(friday.getFullYear(), friday.getMonth(), friday.getDate())
      );
    }
  }, [viewMode, year, month, currentDate, fetchRange]);

  useEffect(() => { fetchForView(); }, [fetchForView]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of outlookEvents) {
      const key = dateKey(ev.start);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [outlookEvents]);

  function navigate(dir) {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else if (viewMode === 'day') {
      d.setDate(d.getDate() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const today = new Date().toISOString().split('T')[0];

  const weekDates = useMemo(() => {
    if (viewMode === 'day') return [new Date(currentDate)];
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      dates.push(dd);
    }
    return dates;
  }, [currentDate, viewMode]);

  function headerLabel() {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const first = weekDates[0];
    const last = weekDates[weekDates.length - 1];
    if (first.getMonth() === last.getMonth()) {
      return `${first.toLocaleDateString('en-US', { month: 'long' })} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  const totalEvents = outlookEvents.length;

  return (
    <div className="flex flex-col p-4 relative z-1" style={{ height: '100%' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={goToday} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-hp-border dark:border-hp-border-dark text-hp-text dark:text-hp-text-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Today
          </button>
          <h2 className="text-lg font-semibold text-hp-text dark:text-hp-text-dark">{headerLabel()}</h2>
        </div>

        <div className="flex items-center gap-2">
          {loadingEvents && (
            <div className="flex items-center gap-1.5 text-[11px] text-hp-muted dark:text-hp-muted-dark">
              <div className="w-3 h-3 border-2 border-hp-accent border-t-transparent rounded-full animate-spin" />
              Syncing...
            </div>
          )}
          {syncError && (
            <div className="text-[10px] text-red-500 dark:text-red-400 max-w-[200px] truncate" title={syncError}>
              Sync error
            </div>
          )}
          {!loadingEvents && !syncError && totalEvents > 0 && (
            <span className="text-[10px] text-hp-muted dark:text-hp-muted-dark">{totalEvents} events</span>
          )}
          <button onClick={fetchForView} disabled={loadingEvents} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors disabled:opacity-50" title="Refresh">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <div className="flex rounded-lg border border-hp-border dark:border-hp-border-dark overflow-hidden">
            {[
              { key: 'day', label: 'Day' },
              { key: 'work-week', label: 'Work Week' },
              { key: 'month', label: 'Month' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  viewMode === v.key
                    ? 'bg-blue-600 text-white'
                    : 'text-hp-muted dark:text-hp-muted-dark hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {onScheduleMeeting && (
            <button
              onClick={() => onScheduleMeeting({})}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New
            </button>
          )}
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-hidden bg-hp-card dark:bg-hp-card-dark rounded-xl border border-hp-border dark:border-hp-border-dark flex flex-col">
        {viewMode === 'month' ? (
          <MonthGrid
            year={year}
            month={month}
            eventsByDate={eventsByDate}
            tasksByDate={tasksByDate}
            today={today}
            onDayClick={(day) => {
              setCurrentDate(new Date(year, month, day));
              setViewMode('day');
            }}
            onEventClick={setDetailEvent}
          />
        ) : (
          <TimeGrid
            dates={weekDates}
            eventsByDate={eventsByDate}
            onEventClick={setDetailEvent}
            onScheduleMeeting={onScheduleMeeting}
          />
        )}
      </div>

      {detailEvent && <EventDetail ev={detailEvent} onClose={() => setDetailEvent(null)} />}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme, W } from '../theme/ThemeProvider';

const STATUS_COLORS = {
  busy: { bg: 'bg-red-500', label: 'Busy', text: 'text-red-600' },
  tentative: { bg: 'bg-orange-400', label: 'Tentative', text: 'text-orange-600' },
  oof: { bg: 'bg-purple-500', label: 'OOF', text: 'text-purple-600' },
  workingElsewhere: { bg: 'bg-yellow-400', label: 'Away', text: 'text-yellow-600' },
  free: { bg: 'bg-green-400', label: 'Free', text: 'text-green-600' },
  unknown: { bg: 'bg-gray-300', label: 'Unknown', text: 'text-gray-500' },
};

const HOURS_START = 8;
const HOURS_END = 18;
const TOTAL_MINUTES = (HOURS_END - HOURS_START) * 60;

function parseAvailabilityView(view, date) {
  if (!view) return [];
  const blocks = [];
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  for (let i = 0; i < view.length; i++) {
    const char = view[i];
    const minuteOffset = i * 30;
    const start = new Date(dayStart.getTime() + minuteOffset * 60000);
    const end = new Date(start.getTime() + 30 * 60000);

    let status = 'free';
    if (char === '1') status = 'tentative';
    else if (char === '2') status = 'busy';
    else if (char === '3') status = 'oof';
    else if (char === '4') status = 'workingElsewhere';

    blocks.push({ start, end, status });
  }

  return blocks;
}

function AvailabilityTimeline({ schedules, date }) {
  if (!schedules || schedules.length === 0) return null;

  const hourLabels = [];
  for (let h = HOURS_START; h <= HOURS_END; h += 2) {
    hourLabels.push(h);
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Availability for {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </p>

      <div className="flex mb-1 ml-28 mr-2">
        {hourLabels.map(h => (
          <div key={h} className="text-[9px] text-gray-400 dark:text-gray-500" style={{ width: `${(120 / TOTAL_MINUTES) * 100}%` }}>
            {h > 12 ? h - 12 + 'pm' : h === 12 ? '12pm' : h + 'am'}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {schedules.map((sched, idx) => {
          const blocks = sched.availabilityView
            ? parseAvailabilityView(sched.availabilityView, date)
            : (sched.scheduleItems || []).map(item => ({
                start: new Date(item.start?.dateTime || item.start),
                end: new Date(item.end?.dateTime || item.end),
                status: (item.status || item.freeBusyStatus || 'busy').toLowerCase(),
              }));

          return (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-28 truncate text-[11px] text-gray-600 dark:text-gray-300 text-right pr-2">
                {sched.scheduleId || sched.email || `Attendee ${idx + 1}`}
              </div>
              <div className="flex-1 h-6 bg-green-100 dark:bg-green-900/20 rounded relative overflow-hidden">
                {blocks.map((block, bIdx) => {
                  const blockStartMin = block.start.getHours() * 60 + block.start.getMinutes();
                  const blockEndMin = block.end.getHours() * 60 + block.end.getMinutes();
                  const clampedStart = Math.max(blockStartMin, HOURS_START * 60);
                  const clampedEnd = Math.min(blockEndMin, HOURS_END * 60);
                  if (clampedStart >= clampedEnd || block.status === 'free') return null;

                  const left = ((clampedStart - HOURS_START * 60) / TOTAL_MINUTES) * 100;
                  const width = ((clampedEnd - clampedStart) / TOTAL_MINUTES) * 100;
                  const color = STATUS_COLORS[block.status] || STATUS_COLORS.unknown;

                  return (
                    <div
                      key={bIdx}
                      className={`absolute top-0 h-full ${color.bg} opacity-80`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${color.label}: ${block.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${block.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-2 ml-28">
        {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'unknown').map(([key, val]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm ${val.bg}`} />
            <span className="text-[9px] text-gray-500 dark:text-gray-400">{val.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusynessMeter({ schedules, date }) {
  if (!schedules || schedules.length === 0) return null;

  const organizer = schedules[0];
  const blocks = organizer.availabilityView
    ? parseAvailabilityView(organizer.availabilityView, date)
    : (organizer.scheduleItems || []);

  const busyCount = blocks.filter(b => {
    const s = typeof b === 'object' ? b.status : 'free';
    return s === 'busy' || s === 'tentative';
  }).length;

  const busyHours = Math.round(busyCount * 0.5 * 10) / 10;
  const level = busyHours <= 1 ? 'light' : busyHours <= 3 ? 'moderate' : 'heavy';
  const levelColors = {
    light: 'text-green-600 dark:text-green-400',
    moderate: 'text-amber-600 dark:text-amber-400',
    heavy: 'text-red-600 dark:text-red-400',
  };
  const barWidth = Math.min((busyHours / 8) * 100, 100);
  const barColor = level === 'light' ? 'bg-green-500' : level === 'moderate' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">Your day:</span>
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden max-w-[120px]">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className={`text-[11px] font-medium ${levelColors[level]}`}>
        {busyHours}h booked — {level === 'light' ? 'Light day' : level === 'moderate' ? 'Moderate' : 'Packed day'}
      </span>
    </div>
  );
}

function SuggestionCard({ suggestion, onPick }) {
  const start = new Date(suggestion.meetingTimeSlot?.start?.dateTime || suggestion.start);
  const end = new Date(suggestion.meetingTimeSlot?.end?.dateTime || suggestion.end);
  const confidence = suggestion.confidence != null
    ? Math.round(suggestion.confidence * 100)
    : null;

  const freeCount = (suggestion.attendeeAvailability || []).filter(a =>
    a.availability === 'free' || a.status === 'free'
  ).length;
  const totalCount = (suggestion.attendeeAvailability || []).length;

  const dayLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <button
      onClick={() => onPick(start, end)}
      className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{dayLabel}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{timeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {freeCount}/{totalCount} free
            </span>
          )}
          {confidence != null && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              confidence >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
              confidence >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              {confidence}%
            </span>
          )}
          <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      {suggestion.suggestionReason && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic">{suggestion.suggestionReason}</p>
      )}
    </button>
  );
}

export default function OutlookMeetingModal({ onClose, prefill }) {
  const { t } = useTheme();
  const [subject, setSubject] = useState(prefill?.subject || '');
  const [date, setDate] = useState(prefill?.date || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(prefill?.startTime || '09:00');
  const [endTime, setEndTime] = useState(prefill?.endTime || '09:30');
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState(prefill?.attendees || []);
  const [body, setBody] = useState(prefill?.body || '');
  const [duration, setDuration] = useState(30);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [availability, setAvailability] = useState(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  const [contactSuggestions, setContactSuggestions] = useState([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [cachedContacts, setCachedContacts] = useState(null);
  const searchTimerRef = useRef(null);
  const searchGenRef = useRef(0);
  const attendeeInputRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI?.outlookGetContacts) return;
    const timeoutId = setTimeout(() => setCachedContacts([]), 8000);
    window.electronAPI.outlookGetContacts({}).then(res => {
      clearTimeout(timeoutId);
      if (res.ok && res.contacts) {
        const list = Array.isArray(res.contacts) ? res.contacts : [res.contacts];
        setCachedContacts(list);
      } else {
        setCachedContacts([]);
      }
    }).catch(() => { clearTimeout(timeoutId); setCachedContacts([]); });
    return () => clearTimeout(timeoutId);
  }, []);


  function searchContacts(query) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const gen = ++searchGenRef.current;

    // Always show cached results immediately for any partial input
    if (cachedContacts && cachedContacts.length > 0) {
      const q = (query || '').toLowerCase();
      const cached = cachedContacts.filter(c =>
        !attendees.includes(c.email?.toLowerCase()) &&
        (!q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      );
      setContactSuggestions(cached.slice(0, 10));
    }

    // For longer queries, also hit Outlook COM for broader directory results
    if (!query || query.length < 2) {
      setContactsLoading(false);
      return;
    }

    setContactsLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      if (gen !== searchGenRef.current) return;
      if (!window.electronAPI?.outlookGetContacts) {
        setContactsLoading(false);
        return;
      }
      const comTimeout = setTimeout(() => {
        if (gen === searchGenRef.current) setContactsLoading(false);
      }, 6000);
      try {
        const res = await window.electronAPI.outlookGetContacts({ search: query });
        clearTimeout(comTimeout);
        if (gen !== searchGenRef.current) return;
        if (res.ok && res.contacts) {
          const list = Array.isArray(res.contacts) ? res.contacts : [res.contacts];
          // Merge COM results with cached, deduplicate by email
          const seen = new Set((contactSuggestions || []).map(c => c.email?.toLowerCase()).filter(Boolean));
          const merged = [...contactSuggestions];
          for (const c of list) {
            if (c.email && !seen.has(c.email.toLowerCase()) && !attendees.includes(c.email.toLowerCase())) {
              merged.push(c);
              seen.add(c.email.toLowerCase());
            }
          }
          setContactSuggestions(merged.slice(0, 10));
        }
      } catch {
        clearTimeout(comTimeout);
      }
      if (gen === searchGenRef.current) setContactsLoading(false);
    }, 300);
  }

  function addAttendeeFromContact(contact) {
    const email = contact.email?.toLowerCase();
    if (email && !attendees.includes(email)) {
      setAttendees([...attendees, email]);
    }
    setAttendeeInput('');
    setShowContactDropdown(false);
    attendeeInputRef.current?.focus();
  }

  function addAttendee() {
    const raw = attendeeInput.trim();
    if (!raw) return;

    // If dropdown has a match, use it (email resolved)
    if (contactSuggestions.length > 0 && contactSuggestions[0].email) {
      addAttendeeFromContact(contactSuggestions[0]);
      return;
    }

    // Add as-is (name or email) — Outlook will resolve it natively when opened
    const val = raw.includes('@') ? raw.toLowerCase() : raw;
    if (!attendees.includes(val)) {
      setAttendees(prev => [...prev, val]);
    }
    setAttendeeInput('');
    setShowContactDropdown(false);
  }

  function removeAttendee(email) {
    setAttendees(attendees.filter(a => a !== email));
    setAvailability(null);
    setSuggestions(null);
  }

  function handleAttendeeKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAttendee();
    }
    if (e.key === 'Escape') {
      setShowContactDropdown(false);
    }
  }

  function handleAttendeeInputChange(e) {
    const val = e.target.value;
    setAttendeeInput(val);
    setShowContactDropdown(true);
    searchContacts(val);
  }

  const fetchAvailability = useCallback(async () => {
    if (attendees.length === 0 || !date) return;
    if (!window.electronAPI?.outlookGetAvailability) return;

    setLoadingAvail(true);
    try {
      const dayStart = `${date}T${String(HOURS_START).padStart(2, '0')}:00:00`;
      const dayEnd = `${date}T${String(HOURS_END).padStart(2, '0')}:00:00`;
      const res = await window.electronAPI.outlookGetAvailability({
        attendees,
        startDateTime: dayStart,
        endDateTime: dayEnd,
        interval: 30,
      });
      if (res.ok && res.data?.value) {
        setAvailability(res.data.value);
      } else {
        setAvailability(null);
      }
    } catch {
      setAvailability(null);
    }
    setLoadingAvail(false);
  }, [attendees, date]);

  useEffect(() => {
    if (attendees.length > 0 && date && activeTab === 'scheduling') {
      fetchAvailability();
    }
  }, [attendees, date, activeTab, fetchAvailability]);

  async function handleSuggestTimes() {
    if (attendees.length === 0) return;
    if (!window.electronAPI?.outlookFindMeetingTimes) return;

    setLoadingSuggestions(true);
    setSuggestError(null);
    try {
      const rangeStart = `${date}T${String(HOURS_START).padStart(2, '0')}:00:00`;
      const rangeEnd = `${date}T${String(HOURS_END).padStart(2, '0')}:00:00`;
      const res = await window.electronAPI.outlookFindMeetingTimes({
        attendees,
        durationMinutes: duration,
        startDateTime: rangeStart,
        endDateTime: rangeEnd,
      });
      if (res.ok && res.data?.meetingTimeSuggestions) {
        setSuggestions(res.data.meetingTimeSuggestions);
      } else if (res.ok && !res.data?.meetingTimeSuggestions) {
        setSuggestError('No suggestions found. Try a different date or shorter meeting.');
        setSuggestions(null);
      } else {
        setSuggestError(res.error || 'Could not get suggestions. Some attendees may not be resolvable.');
        setSuggestions(null);
      }
    } catch (err) {
      setSuggestError(err.message || 'Failed to fetch suggestions');
      setSuggestions(null);
    }
    setLoadingSuggestions(false);
  }

  function pickSuggestion(start, end) {
    const d = start.toISOString().split('T')[0];
    const st = start.toTimeString().slice(0, 5);
    const et = end.toTimeString().slice(0, 5);
    setDate(d);
    setStartTime(st);
    setEndTime(et);
    setActiveTab('details');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!subject.trim()) return;

    setSending(true);
    setError(null);
    setResult(null);

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;
    if (window.electronAPI?.outlookCreateMeeting) {
      try {
        const res = await window.electronAPI.outlookCreateMeeting({
          subject: subject.trim(),
          startDateTime,
          endDateTime,
          attendees,
          body: body || undefined,
        });
        if (res.ok) {
          setResult({ success: true, opened: true });
        } else {
          setError(res.error || 'Failed to open meeting in Outlook');
        }
      } catch (err) {
        setError(err.message || 'Unexpected error');
      }
    } else {
      setError('Outlook integration requires the desktop app with Outlook installed.');
    }

    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-hp-card dark:bg-hp-card-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hp-border dark:border-hp-border-dark">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark"><W k="scheduleMeeting" /></h2>
              <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark"><W k="meetingCreatedDesc" /></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hp-border dark:border-hp-border-dark px-5">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <W k="councilDetails" />
          </button>
          <button
            onClick={() => setActiveTab('scheduling')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'scheduling'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <W k="divination" />
            {attendees.length > 0 && (
              <span className="w-4 h-4 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[9px] font-semibold rounded-full flex items-center justify-center">
                {attendees.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {result?.success ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-hp-text dark:text-hp-text-dark mb-1">Meeting opened in Outlook</p>
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-1">Your meeting has been pre-filled and opened in Outlook.</p>
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-4">Add Teams, Zoom, or other options directly in Outlook before sending.</p>
              <div className="mt-4">
                <button onClick={onClose} className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  Close
                </button>
              </div>
            </div>
          ) : activeTab === 'details' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"><W k="councilSubject" /></label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  placeholder="Council subject"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider mb-1">
                  <W k="councilMembers" /> ({attendees.length})
                </label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      ref={attendeeInputRef}
                      type="text"
                      value={attendeeInput}
                      onChange={handleAttendeeInputChange}
                      onKeyDown={handleAttendeeKeyDown}
                      onFocus={() => { setShowContactDropdown(true); searchContacts(attendeeInput); }}
                      onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                      placeholder={t('searchPeople')}
                      className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={addAttendee}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {showContactDropdown && (contactSuggestions.length > 0 || (contactsLoading && attendeeInput.length >= 2)) && (
                    <div className="absolute left-0 right-12 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 z-50 max-h-48 overflow-auto">
                      {contactsLoading && (
                        <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-hp-muted dark:text-hp-muted-dark">
                          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <W k="searchingDirectory" />
                        </div>
                      )}
                      {contactSuggestions.map((c, i) => (
                        <button
                          key={c.email + i}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addAttendeeFromContact(c)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                              {(c.name || c.email || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-hp-text dark:text-hp-text-dark truncate">{c.name || c.email}</p>
                            {c.name && c.email && (
                              <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark truncate">{c.email}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {attendees.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-[11px] text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                        {email}
                        <button type="button" onClick={() => removeAttendee(email)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider mb-1"><W k="agendaParchment" /></label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder={t('councilAgenda')}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-900/15 border border-blue-200/60 dark:border-blue-800/40">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                  This will open the meeting in Outlook where you can add Teams, Zoom, or other meeting links before sending.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !subject.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {sending ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in Outlook
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Smart Scheduling tab */
            <div className="space-y-4">
              {attendees.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-sm text-hp-muted dark:text-hp-muted-dark"><W k="addMembersFirst" /></p>
                  <p className="text-xs text-hp-muted dark:text-hp-muted-dark mt-1"><W k="divinationNeedsEmails" /></p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        Checking availability for {attendees.length} attendee{attendees.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Viewing: {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        onClick={fetchAvailability}
                        disabled={loadingAvail}
                        className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                      >
                        {loadingAvail ? 'Loading...' : 'Refresh'}
                      </button>
                    </div>
                  </div>

                  {loadingAvail ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-hp-muted dark:text-hp-muted-dark ml-2">Consulting the stars...</span>
                    </div>
                  ) : (
                    <>
                      <AvailabilityTimeline schedules={availability} date={date} />
                      <BusynessMeter schedules={availability} date={date} />
                    </>
                  )}

                  <div className="border-t border-hp-border dark:border-hp-border-dark pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs font-medium text-hp-text dark:text-hp-text-dark"><W k="divination" /></p>
                        <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark"><W k="consultStars" /></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>1 hour</option>
                          <option value={90}>1.5 hours</option>
                          <option value={120}>2 hours</option>
                        </select>
                        <button
                          onClick={handleSuggestTimes}
                          disabled={loadingSuggestions}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                        >
                          {loadingSuggestions ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Divining...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Divine
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {suggestError && (
                      <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-3">
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">{suggestError}</p>
                      </div>
                    )}

                    {suggestions && suggestions.length > 0 && (
                      <div className="space-y-1.5">
                        {suggestions.map((sug, i) => (
                          <SuggestionCard key={i} suggestion={sug} onPick={pickSuggestion} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

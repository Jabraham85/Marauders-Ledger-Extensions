import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TYPE_ICONS = {
  task_created: { color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /> },
  task_moved: { color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /> },
  task_updated: { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
  task_deleted: { color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> },
  dept_created: { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
  dept_updated: { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
  dept_deleted: { color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> },
  note_created: { color: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
  note_deleted: { color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> },
};

const DEFAULT_ICON = { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> };

export default function ActivityFeed() {
  const { t } = useTheme();
  const { state } = useStore();
  const [filterType, setFilterType] = useState('all');
  const [showCount, setShowCount] = useState(50);

  const log = state.activityLog || [];

  const filtered = filterType === 'all' ? log : log.filter(e => e.type === filterType || e.type?.startsWith(filterType));

  const grouped = {};
  filtered.slice(0, showCount).forEach(entry => {
    const date = new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  });

  return (
    <div className="p-8 max-w-4xl mx-auto relative z-1">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-hp-text dark:text-hp-text-dark"><W k="activityFeed" /></h2>
        <p className="text-hp-muted dark:text-hp-muted-dark mt-1"><W k="activitySubtitle" /></p>
      </div>
      <div className="magic-divider mb-6" />

      <div className="flex items-center gap-3 mb-4">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-1.5 text-hp-muted dark:text-hp-muted-dark bg-hp-card dark:bg-hp-card-dark">
          <option value="all">{t('allEvents')}</option>
          <option value="task">{t('tasks')}</option>
          <option value="dept">{t('departments')}</option>
          <option value="note">{t('notes')}</option>
        </select>
        <span className="text-sm text-hp-muted dark:text-hp-muted-dark">{log.length} events total</span>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-base font-medium text-hp-text dark:text-hp-text-dark mb-1"><W k="noActivity" /></h4>
          <p className="text-sm text-hp-muted dark:text-hp-muted-dark"><W k="noActivityDesc" /></p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, entries]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-hp-muted dark:text-hp-muted-dark mb-3">{date}</h3>
              <div className="space-y-2">
                {entries.map(entry => {
                  const iconInfo = TYPE_ICONS[entry.type] || DEFAULT_ICON;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 p-3 bg-hp-card dark:bg-hp-card-dark rounded-lg border border-hp-border dark:border-hp-border-dark">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconInfo.color}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {iconInfo.icon}
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-hp-text dark:text-hp-text-dark">{entry.detail}</p>
                        <p className="text-xs text-hp-muted dark:text-hp-muted-dark mt-0.5">{timeAgo(entry.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filtered.length > showCount && (
            <button
              onClick={() => setShowCount(c => c + 50)}
              className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              Load more ({filtered.length - showCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

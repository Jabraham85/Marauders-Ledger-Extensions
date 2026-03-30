import React, { useState } from 'react';
import { useTheme, W } from '../../theme/ThemeProvider';

export default function NotificationsPopover({ notifications, showNotifications, onToggleNotifications }) {
  const { t } = useTheme();
  const overdueCount = notifications?.filter(n => n.title === 'Overdue').length || 0;

  return (
    <div className="relative">
      <button
        onClick={onToggleNotifications}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors relative"
        title={t('notifications')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {overdueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-[9px] font-bold rounded-full flex items-center justify-center">
            {overdueCount > 9 ? '9+' : overdueCount}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-hp-card dark:bg-gray-900 rounded-xl shadow-2xl border border-hp-border dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200"><W k="notifications" /></p>
          </div>
          <div className="max-h-64 overflow-auto">
            {(!notifications || notifications.length === 0) ? (
              <p className="text-xs text-gray-400 px-3 py-4 text-center"><W k="noAlerts" /></p>
            ) : (
              notifications.map((n, i) => (
                <div key={i} className="px-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <p className={`text-xs font-medium ${n.title === 'Overdue' ? 'text-red-600' : n.title === 'Due Today' ? 'text-amber-600' : 'text-blue-600'}`}>
                    {n.title}
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

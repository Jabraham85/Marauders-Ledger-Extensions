import React, { useState } from 'react';
import IntegrationButton from './IntegrationButton';

export default function OnenotePopover({ onenoteStatus, onOnenoteStatusChange, show, onToggle, buttonVariant = 'icon' }) {
  const [onenoteLoading, setOnenoteLoading] = useState(false);
  const [onenoteError, setOnenoteError] = useState('');
  const [onenoteNotebooks, setOnenoteNotebooks] = useState([]);

  async function handleOnenoteDetect() {
    if (!window.electronAPI?.onenoteDetect) {
      setOnenoteError('OneNote integration is not available in this Tauri build yet');
      return;
    }
    setOnenoteLoading(true);
    setOnenoteError('');
    try {
      const res = await window.electronAPI.onenoteDetect();
      if (res.ok && res.notebooks) {
        setOnenoteNotebooks(Array.isArray(res.notebooks) ? res.notebooks : [res.notebooks]);
        if (Array.isArray(res.notebooks) ? res.notebooks.length > 0 : res.notebooks) {
          onOnenoteStatusChange?.({ connected: true, notebooks: Array.isArray(res.notebooks) ? res.notebooks : [res.notebooks] });
        }
      } else {
        setOnenoteError(res.error || 'OneNote not found. Make sure OneNote is installed.');
      }
    } catch (err) {
      setOnenoteError(err.message);
    }
    setOnenoteLoading(false);
  }

  function handleOnenoteDisconnect() {
    onOnenoteStatusChange?.(null);
    setOnenoteNotebooks([]);
    onToggle(false);
  }

  return (
    <IntegrationButton
      buttonVariant={buttonVariant}
      show={show}
      onToggle={onToggle}
      connected={onenoteStatus?.connected}
      connectedColor="purple"
      title={onenoteStatus?.connected ? 'OneNote: Connected' : 'Connect OneNote'}
      headerTitle={<span className="font-sans">OneNote Integration</span>}
      connectedLabel={onenoteStatus?.connected ? `${onenoteStatus.notebooks?.length || 0} notebook${onenoteStatus.notebooks?.length !== 1 ? 's' : ''} found` : null}
      icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />}
    >
      {onenoteStatus?.connected ? (
        <div className="space-y-2 font-sans antialiased">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 mb-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">Connected &mdash; replaces built-in notes</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 mb-2">
            <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-[11px] text-blue-700 dark:text-blue-300"><strong>Ctrl+Alt+Space</strong> &mdash; quick note from anywhere</span>
          </div>
          {onenoteNotebooks.length > 0 && (
            <div className="max-h-32 overflow-auto space-y-1">
              {onenoteNotebooks.map((nb, i) => (
                <div key={i} className="text-xs text-gray-700 dark:text-gray-200 px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/50 truncate">
                  {nb.name}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={handleOnenoteDisconnect}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3 font-sans antialiased">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
            <p className="text-[11px] text-gray-600 dark:text-gray-300 font-semibold">What this does:</p>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[11px] text-gray-700 dark:text-gray-200">Replaces built-in notes with OneNote</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[11px] text-gray-700 dark:text-gray-200">Two-way sync &mdash; edits save back to OneNote</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[11px] text-gray-700 dark:text-gray-200">Uses local OneNote &mdash; no API keys needed</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[11px] text-gray-700 dark:text-gray-200"><strong>Ctrl+Alt+Space</strong> &mdash; quick note from anywhere</span>
            </div>
          </div>
          {onenoteError && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">
              <svg className="w-3 h-3 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{onenoteError}</p>
            </div>
          )}
          <button
            onClick={handleOnenoteDetect}
            disabled={onenoteLoading}
            className="w-full text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {onenoteLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Detect OneNote
              </>
            )}
          </button>
        </div>
      )}
    </IntegrationButton>
  );
}

import React, { useState } from 'react';
import { useTheme, W } from '../../theme/ThemeProvider';
import IntegrationButton from './IntegrationButton';

export default function OutlookPopover({ outlookAccount, onOutlookAccountChange, onScheduleMeeting, show, onToggle, buttonVariant = 'icon' }) {
  const { t } = useTheme();
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [outlookError, setOutlookError] = useState('');

  async function handleOutlookDetect() {
    if (!window.electronAPI?.outlookGetAccount) {
      setOutlookError('Outlook integration is not available in this Tauri build yet');
      return;
    }
    setOutlookLoading(true);
    setOutlookError('');
    try {
      const res = await window.electronAPI.outlookGetAccount();
      if (res.ok && res.account) {
        onOutlookAccountChange?.(res.account);
        onToggle(false);
      } else {
        setOutlookError(res.error || 'Outlook not found. Make sure Outlook is installed and you are signed in.');
      }
    } catch (err) {
      setOutlookError(err.message);
    }
    setOutlookLoading(false);
  }

  function handleOutlookDisconnect() {
    onOutlookAccountChange?.(null);
  }

  return (
    <IntegrationButton
      buttonVariant={buttonVariant}
      show={show}
      onToggle={onToggle}
      connected={!!outlookAccount}
      connectedColor="blue"
      title={outlookAccount ? `Outlook: ${outlookAccount.username || outlookAccount.name}` : t('connectOutlook')}
      headerTitle={<W k="outlookIntegration" />}
      connectedLabel={outlookAccount ? (outlookAccount.username || outlookAccount.name) : null}
      icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
    >
      {outlookAccount ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[11px] text-blue-700 dark:text-blue-300 font-medium"><W k="connectedOutlook" /></span>
          </div>
          <button
            onClick={() => { onScheduleMeeting?.({}); onToggle(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <W k="newMeeting" />
          </button>
          <button
            onClick={() => { handleOutlookDisconnect(); onToggle(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">What this does:</p>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">Schedule meetings from tasks & notes</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">See attendee free/busy & suggest times</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">Uses your installed Outlook directly &mdash; no API keys needed</span>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5">
            <p className="text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed">
              <strong>Requirements:</strong> Microsoft Outlook must be installed and signed in on this PC. No additional setup needed.
            </p>
          </div>
          {outlookError && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">
              <svg className="w-3 h-3 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[10px] text-red-600 dark:text-red-400">{outlookError}</p>
            </div>
          )}
          <button
            onClick={handleOutlookDetect}
            disabled={outlookLoading}
            className="w-full text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {outlookLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <W k="detectingOutlook" />
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <W k="detectOutlook" />
              </>
            )}
          </button>
        </div>
      )}
    </IntegrationButton>
  );
}

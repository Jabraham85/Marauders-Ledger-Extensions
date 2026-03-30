import React, { useState } from 'react';
import { useTheme, W } from '../../theme/ThemeProvider';
import IntegrationButton from './IntegrationButton';

export default function SlackPopover({ slackStatus, onSlackStatusChange, show, onToggle, buttonVariant = 'icon' }) {
  const { t } = useTheme();
  const [slackToken, setSlackToken] = useState('');
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackError, setSlackError] = useState('');
  const [slackSetupStep, setSlackSetupStep] = useState(1);
  const [manifestCopied, setManifestCopied] = useState(false);

  async function handleSlackConnect() {
    if (!slackToken.trim()) return;
    if (!window.electronAPI?.slackTestConnection) {
      setSlackError('Slack integration is not available in this Tauri build yet');
      return;
    }
    setSlackConnecting(true);
    setSlackError('');
    try {
      const res = await window.electronAPI.slackTestConnection(slackToken.trim());
      if (res.ok) {
        onSlackStatusChange?.({ connected: true, team: res.team, user: res.user });
        setSlackToken('');
        setSlackSetupStep(1);
        onToggle(false);
        window.electronAPI.slackSync?.();
      } else {
        setSlackError(res.error || 'Connection failed');
      }
    } catch (err) {
      setSlackError(err.message);
    }
    setSlackConnecting(false);
  }

  async function handleSlackDisconnect() {
    if (!window.electronAPI?.slackDisconnect) return;
    await window.electronAPI.slackDisconnect();
    onSlackStatusChange?.(null);
    setSlackSetupStep(1);
    onToggle(false);
  }

  return (
    <IntegrationButton
      buttonVariant={buttonVariant}
      show={show}
      onToggle={onToggle}
      connected={slackStatus?.connected}
      connectedColor="green"
      title={slackStatus?.connected ? `Slack: ${slackStatus.team}` : t('connectSlack')}
      headerTitle={<W k="slackIntegration" />}
      connectedLabel={slackStatus?.connected ? `Connected to ${slackStatus.team} as ${slackStatus.user}` : null}
      icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
    >
      {slackStatus?.connected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[11px] text-green-700 dark:text-green-300 font-medium">Connected and syncing</span>
          </div>
          <button
            onClick={() => { window.electronAPI?.slackSync?.(); onToggle(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Now
          </button>
          <button
            onClick={handleSlackDisconnect}
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
          {/* Step indicators */}
          <div className="flex items-center gap-1 mb-1">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  slackSetupStep > s ? 'bg-green-500 text-white' :
                  slackSetupStep === s ? 'bg-blue-600 text-white' :
                  'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  {slackSetupStep > s ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s}
                </div>
                {s < 3 && <div className={`w-6 h-0.5 ${slackSetupStep > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`} />}
              </div>
            ))}
            <span className="ml-auto text-[9px] text-gray-400">Step {slackSetupStep}/3</span>
          </div>

          {slackSetupStep === 1 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">Create a Slack App</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Click the button below to open Slack's app creator. The manifest with all required permissions has been copied to your clipboard.
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 space-y-1.5">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">What this does:</p>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
                  <span className="text-[10px] text-gray-600 dark:text-gray-300">Reads public channels you're in</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
                  <span className="text-[10px] text-gray-600 dark:text-gray-300">Nobody else can see this app</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-green-600 mt-0.5">&#10003;</span>
                  <span className="text-[10px] text-gray-600 dark:text-gray-300">Read-only, cannot post messages</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (window.electronAPI?.slackOpenSetup) {
                    await window.electronAPI.slackOpenSetup();
                  } else {
                    window.open('https://api.slack.com/apps?new_app=1', '_blank');
                  }
                  setSlackSetupStep(2);
                }}
                className="w-full text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Create Slack App (opens browser)
              </button>
              <button
                onClick={async () => {
                  if (window.electronAPI?.slackCopyManifest) {
                    const res = await window.electronAPI.slackCopyManifest();
                    if (res.ok) { setManifestCopied(true); setTimeout(() => setManifestCopied(false), 2000); }
                  }
                }}
                className="w-full text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {manifestCopied ? 'Manifest copied!' : 'Copy manifest to clipboard again'}
              </button>
            </div>
          )}

          {slackSetupStep === 2 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">Install to your workspace</p>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5">
                <p className="text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  In the Slack page that opened:
                </p>
                <ol className="mt-1.5 space-y-1">
                  <li className="text-[10px] text-blue-700 dark:text-blue-300 flex gap-1.5">
                    <span className="font-bold shrink-0">1.</span>
                    Choose "From a manifest", pick JSON, paste the manifest
                  </li>
                  <li className="text-[10px] text-blue-700 dark:text-blue-300 flex gap-1.5">
                    <span className="font-bold shrink-0">2.</span>
                    Click "Create" then "Install to Workspace"
                  </li>
                  <li className="text-[10px] text-blue-700 dark:text-blue-300 flex gap-1.5">
                    <span className="font-bold shrink-0">3.</span>
                    Click "Allow" on the permissions page
                  </li>
                </ol>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSlackSetupStep(1)}
                  className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setSlackSetupStep(3)}
                  className="flex-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Done, next
                </button>
              </div>
            </div>
          )}

          {slackSetupStep === 3 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">Paste your token</p>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
                <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  In Slack's app page, go to <strong>OAuth & Permissions</strong> and copy the <strong>User OAuth Token</strong> (starts with xoxp-).
                </p>
              </div>
              <input
                type="password"
                value={slackToken}
                onChange={(e) => { setSlackToken(e.target.value); setSlackError(''); }}
                placeholder="xoxp-1234567890-..."
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 text-[11px] bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                autoFocus
              />
              {slackError && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <svg className="w-3 h-3 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[10px] text-red-600 dark:text-red-400">{slackError}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setSlackSetupStep(2)}
                  className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSlackConnect}
                  disabled={slackConnecting || !slackToken.trim()}
                  className="flex-1 text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {slackConnecting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Connect
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </IntegrationButton>
  );
}

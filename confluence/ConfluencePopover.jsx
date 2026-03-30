import React, { useState, useEffect } from 'react';

export default function ConfluencePopover({ confluenceStatus, onConfluenceStatusChange, show, onToggle, buttonVariant = 'card' }) {
  const api = window.electronAPI;

  const [status, setStatus] = useState(confluenceStatus || null);
  const [domain, setDomain] = useState('wbg-avalanche.atlassian.net');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [setupStep, setSetupStep] = useState(1);
  const [panelOpen, setPanelOpen] = useState(show ?? false);

  useEffect(() => {
    if (confluenceStatus) setStatus(confluenceStatus);
  }, [confluenceStatus]);

  useEffect(() => {
    if (!status) {
      api?.confluenceGetStatus?.().then(res => {
        if (res?.connected) {
          const newStatus = { connected: true, domain: res.domain, pageCount: res.pageCount, hasMore: !!res.hasMore };
          setStatus(newStatus);
          onConfluenceStatusChange?.(newStatus);
        }
      }).catch(() => {});
    }
  }, []);

  async function handleConnect() {
    if (!domain.trim() || !email.trim() || !token.trim()) return;
    setConnecting(true);
    setError('');
    try {
      const res = await api?.confluenceTestConnection?.({
        domain: domain.trim(),
        email: email.trim(),
        apiToken: token.trim(),
      });
      if (res?.ok) {
        const newStatus = { connected: true, domain: res.domain, spaceName: res.spaceName };
        setStatus(newStatus);
        onConfluenceStatusChange?.(newStatus);
        setDomain('');
        setEmail('');
        setToken('');
        setSetupStep(1);
        setPanelOpen(false);
        onToggle?.(false);
        api?.confluenceSync?.();
      } else {
        setError(res?.error || 'Connection failed');
      }
    } catch (err) {
      setError(err.message || 'Connection error');
    }
    setConnecting(false);
  }

  async function handleDisconnect() {
    await api?.confluenceDisconnect?.();
    setStatus(null);
    onConfluenceStatusChange?.(null);
    setSetupStep(1);
    setPanelOpen(false);
    onToggle?.(false);
  }

  const isOpen = show ?? panelOpen;
  const toggle = (val) => { setPanelOpen(val); onToggle?.(val); };
  const conn = status?.connected;

  const bookIcon = (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  );

  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 text-sm bg-white dark:bg-gray-700 text-hp-text dark:text-hp-text-dark focus:outline-none focus:ring-2 focus:ring-blue-400";

  const panel = conn ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 mb-2">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
          {status.pageCount || 0} pages synced
          {status.hasMore && ' (more available)'}
          {' '}&middot; {status.domain}
        </span>
      </div>
      <button onClick={() => { api?.confluenceSync?.(); toggle(false); }}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-hp-text dark:text-hp-text-dark hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Sync Now
      </button>
      {status.hasMore && (
        <button onClick={() => { api?.confluenceSyncMore?.(); toggle(false); }}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4" />
          </svg>
          Load More Pages
        </button>
      )}
      <button onClick={handleDisconnect}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Disconnect
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      <div className="flex items-center gap-1 mb-1">
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
              setupStep > s ? 'bg-green-500 text-white' :
              setupStep === s ? 'bg-blue-600 text-white' :
              'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
            }`}>
              {setupStep > s ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            {s < 3 && <div className={`w-6 h-0.5 ${setupStep > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`} />}
          </React.Fragment>
        ))}
        <span className="ml-auto text-[9px] text-gray-400">Step {setupStep}/3</span>
      </div>

      {setupStep === 1 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-hp-text dark:text-hp-text-dark">Enter your Confluence domain</p>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 space-y-1.5">
            <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark font-medium">What this does:</p>
            <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark flex gap-1.5"><span className="text-green-600">&#10003;</span> Reads pages you have access to</p>
            <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark flex gap-1.5"><span className="text-green-600">&#10003;</span> Uses your personal API token</p>
            <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark flex gap-1.5"><span className="text-green-600">&#10003;</span> Read-only, cannot modify pages</p>
          </div>
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)}
            placeholder="yourcompany.atlassian.net" className={inputCls} />
          <button onClick={() => { if (domain.trim()) setSetupStep(2); }} disabled={!domain.trim()}
            className="w-full text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
            Next
          </button>
        </div>
      )}

      {setupStep === 2 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-hp-text dark:text-hp-text-dark">Create an API Token</p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5">
            <ol className="space-y-1 text-[10px] text-blue-700 dark:text-blue-300">
              <li className="flex gap-1.5"><span className="font-bold">1.</span> Click below to open Atlassian's token page</li>
              <li className="flex gap-1.5"><span className="font-bold">2.</span> Click "Create API token"</li>
              <li className="flex gap-1.5"><span className="font-bold">3.</span> Name it (e.g. "Marauder's Ledger") and click Create</li>
              <li className="flex gap-1.5"><span className="font-bold">4.</span> Copy the token</li>
            </ol>
          </div>
          <button onClick={() => {
            if (api?.confluenceOpenSetup) void api.confluenceOpenSetup();
            else if (api?.openExternal) void api.openExternal('https://id.atlassian.com/manage-profile/security/api-tokens');
            else window.open('https://id.atlassian.com/manage-profile/security/api-tokens', '_blank', 'noopener,noreferrer');
          }}
            className="w-full text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Atlassian Token Page
          </button>
          <div className="flex gap-2">
            <button onClick={() => setSetupStep(1)}
              className="flex-1 text-xs text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Back
            </button>
            <button onClick={() => setSetupStep(3)}
              className="flex-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors">
              I have my token
            </button>
          </div>
        </div>
      )}

      {setupStep === 3 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-hp-text dark:text-hp-text-dark">Enter your credentials</p>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 mb-1">
            <p className="text-[10px] text-amber-800 dark:text-amber-300">Domain: <strong>{domain}</strong></p>
          </div>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="your.email@company.com" className={inputCls} />
          <input type="password" value={token} onChange={e => { setToken(e.target.value); setError(''); }}
            placeholder="API token from step 2" className={inputCls + ' font-mono'} />
          {error && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">
              <svg className="w-3 h-3 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setSetupStep(2)}
              className="flex-1 text-xs text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Back
            </button>
            <button onClick={handleConnect} disabled={connecting || !email.trim() || !token.trim()}
              className="flex-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {connecting ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
              ) : (
                <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Connect</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (buttonVariant === 'card') {
    return (
      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <button onClick={() => toggle(!isOpen)} className="w-full flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${conn ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{bookIcon}</svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-hp-text dark:text-hp-text-dark truncate">Confluence Integration</p>
              <p className={`text-xs truncate ${conn ? 'text-blue-600 dark:text-blue-400' : 'text-hp-muted dark:text-hp-muted-dark'}`}>
                {conn ? `Connected to ${status.domain}` : 'Not connected'}
              </p>
            </div>
          </div>
          <svg className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} text-hp-muted dark:text-hp-muted-dark`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden p-4">
            {panel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => toggle(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${conn ? 'text-blue-400 hover:text-blue-300 hover:bg-sidebar-hover' : 'text-gray-500 dark:text-gray-400 hover:text-white hover:bg-sidebar-hover'}`}
        title={conn ? `Confluence: ${status.domain}` : 'Connect Confluence'}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{bookIcon}</svg>
        {conn && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full" />}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-hp-text dark:text-hp-text-dark">Confluence Integration</p>
              {conn && <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Connected to {status.domain}</p>}
            </div>
            <button onClick={() => toggle(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4">{panel}</div>
        </div>
      )}
    </div>
  );
}

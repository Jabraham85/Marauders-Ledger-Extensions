import React, { useState, useEffect, useMemo, useCallback } from 'react';

function openExternalLink(url) {
  if (!url) return;
  const bridge = window.appAPI;
  if (bridge?.openExternal) { void bridge.openExternal(url); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openAtlassianApiTokensPage() {
  const bridge = window.appAPI;
  if (bridge?.confluenceOpenSetup) { void bridge.confluenceOpenSetup(); return; }
  openExternalLink('https://id.atlassian.com/manage-profile/security/api-tokens');
}

// ---------------------------------------------------------------------------
// Options tab
// ---------------------------------------------------------------------------
function SyncOptionsPanel({ storedSpaces, pages, totalAvailable, hasMore, currentOffset, syncing, loadingMore, syncError, pullMsg, onPullNext, onResetAndResync }) {
  const api = window.appAPI;
  const [config, setConfig] = useState({ selectedSpaceKeys: [], batchSize: 250 });
  const [allSpaces, setAllSpaces] = useState([]);
  const [fetchingSpaces, setFetchingSpaces] = useState(false);
  const [spaceSearch, setSpaceSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexMsg, setIndexMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [ragSharedPath, setRagSharedPath] = useState('');

  useEffect(() => {
    async function init() {
      const cfg = await api?.confluenceGetSyncConfig?.();
      if (cfg) setConfig({ selectedSpaceKeys: [], batchSize: 250, ...cfg });

      // Read RAG shared path so the Export button knows where to write
      const ragCfg = api?.ragGetConfig?.();
      if (ragCfg?.sharedPath) setRagSharedPath(ragCfg.sharedPath);

      if (storedSpaces && storedSpaces.length > 0) {
        setAllSpaces(storedSpaces);
      } else {
        setFetchingSpaces(true);
        try {
          const res = await api?.confluenceFetchSpaces?.();
          if (res?.spaces) setAllSpaces(res.spaces);
        } finally {
          setFetchingSpaces(false);
        }
      }
    }
    init();
  }, []);

  function toggleSpace(key) {
    setConfig(prev => {
      const sel = prev.selectedSpaceKeys || [];
      return sel.includes(key)
        ? { ...prev, selectedSpaceKeys: sel.filter(k => k !== key) }
        : { ...prev, selectedSpaceKeys: [...sel, key] };
    });
  }

  async function handleSaveConfig() {
    setSaving(true);
    setSaveMsg('');
    try {
      await api?.confluenceSetSyncConfig?.(config);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndResync() {
    setSaving(true);
    setSaveMsg('');
    try {
      await api?.confluenceSetSyncConfig?.(config);
      await onResetAndResync();
    } finally {
      setSaving(false);
    }
  }

  async function handleExportToShard() {
    if (!api?.confluenceWriteRagShard) {
      setExportMsg('Error: confluenceWriteRagShard not available — app may need a refresh.');
      return;
    }
    if (!ragSharedPath) {
      setExportMsg('Error: No RAG shared path configured. Set it in the RAG Engine settings first.');
      return;
    }
    setExporting(true);
    setExportMsg('');
    try {
      const result = await api.confluenceWriteRagShard(ragSharedPath);
      if (result?.ok) {
        const target = result.shardPath || ragSharedPath;
        setExportMsg(
          `Written ${result.chunksWritten} chunks across ${result.pagesWritten} pages to ${target}. ` +
          `Reload RAG (RAG Engine → Reload Shared) to apply.`
        );
      } else {
        setExportMsg('Error: ' + (result?.error || result?.reason || 'Unknown error'));
      }
    } catch (e) {
      setExportMsg('Error: ' + (e?.message || String(e)));
    } finally {
      setExporting(false);
    }
  }

  async function handleReindexRag() {
    if (!api?.confluenceIndexIntoRag) {
      setIndexMsg('RAG service unavailable. Ensure the RAG extension is enabled.');
      return;
    }
    setIndexing(true);
    setIndexMsg('');
    try {
      const result = await api.confluenceIndexIntoRag();
      if (result?.ok) {
        setIndexMsg(`Indexed ${result.indexed} page${result.indexed !== 1 ? 's' : ''} into RAG search.${result.skipped > 0 ? ` (${result.skipped} skipped — no content)` : ''}`);
      } else {
        setIndexMsg('Error: ' + (result?.error || 'Unknown error'));
      }
    } catch (e) {
      setIndexMsg('Error: ' + (e?.message || String(e)));
    } finally {
      setIndexing(false);
    }
  }

  const synced = pages.length;
  const total = totalAvailable != null ? totalAvailable : synced;
  const pct = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : (synced > 0 ? 100 : 0);
  const remaining = total > synced ? total - synced : 0;

  const filteredSpaces = spaceSearch.trim()
    ? allSpaces.filter(s =>
        s.name.toLowerCase().includes(spaceSearch.toLowerCase()) ||
        s.key.toLowerCase().includes(spaceSearch.toLowerCase())
      )
    : allSpaces;

  const inputCls = "w-full border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

      {/* ── Sync Progress ── */}
      <section>
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-3">Sync Progress</h3>
        <div className="rounded-xl border border-hp-border dark:border-hp-border-dark p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-hp-muted dark:text-hp-muted-dark whitespace-nowrap">
              {synced.toLocaleString()}{total > synced ? ` / ~${total.toLocaleString()}` : ''} pages
              {total > 0 ? ` (${pct}%)` : ''}
            </span>
          </div>

          {syncError ? (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-600 dark:text-red-400">{syncError}</p>
            </div>
          ) : null}

          {synced === 0 ? (
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark">No pages synced yet. Configure below and click Save & Sync Fresh.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-hp-muted dark:text-hp-muted-dark">
                  {hasMore
                    ? <>{remaining > 0 ? `~${remaining.toLocaleString()} more pages available. ` : ''}Next batch starts at offset {currentOffset.toLocaleString()}.</>
                    : 'Looks like all pages are synced — pull to confirm or grab any newly added pages.'}
                </p>
                <button
                  onClick={onPullNext}
                  disabled={loadingMore || syncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shrink-0"
                >
                  {loadingMore ? (
                    <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4" /></svg> Pull Next Batch</>
                  )}
                </button>
              </div>
              {pullMsg && (
                <p className={`text-xs font-medium ${pullMsg.startsWith('Added') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {pullMsg}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── RAG Search Index ── */}
      <section>
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-1">AI Search Index (RAG)</h3>
        <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-3">
          Confluence pages are automatically indexed for AI search after each sync. If pages aren't appearing in AI answers, click Re-index to push all synced pages into the search engine now.
        </p>
        <div className="rounded-xl border border-hp-border dark:border-hp-border-dark p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark">
              {synced > 0
                ? <>{synced.toLocaleString()} pages available for indexing. Indexing runs automatically after sync and on app startup.</>
                : 'Sync pages first, then index them for AI search.'}
            </p>
            {indexMsg && (
              <p className={`mt-1 text-xs font-medium ${indexMsg.startsWith('Error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {indexMsg}
              </p>
            )}
          </div>
          <button
            onClick={handleReindexRag}
            disabled={indexing || synced === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors shrink-0"
          >
            {indexing ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Indexing...</>
            ) : (
              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Re-index in RAG</>
            )}
          </button>
        </div>
      </section>

      {/* ── Export to Shared Shard ── */}
      <section>
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-1">Export to Shared RAG Shard</h3>
        <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-3">
          Write all synced pages as a structured shard file to the RAG shared folder. This uses section-aware chunking with proper metadata so every chunk is clearly identified as a Confluence source. Other team members can benefit as soon as you reload the RAG Engine.
        </p>
        <div className="rounded-xl border border-hp-border dark:border-hp-border-dark p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              {ragSharedPath ? (
                <p className="text-xs text-hp-muted dark:text-hp-muted-dark truncate">
                  Target: <span className="font-mono text-[10px]">{ragSharedPath}\shards\confluence\meta.jsonl</span>
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No RAG shared path configured. Set it in RAG Engine settings, then return here.
                </p>
              )}
              {exportMsg && (
                <p className={`mt-1 text-xs font-medium ${exportMsg.startsWith('Error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {exportMsg}
                </p>
              )}
            </div>
            <button
              onClick={handleExportToShard}
              disabled={exporting || synced === 0 || !ragSharedPath}
              title={!ragSharedPath ? 'Configure RAG shared path in RAG Engine settings first' : synced === 0 ? 'Sync pages first' : 'Export to shared RAG shard'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shrink-0"
            >
              {exporting ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exporting...</>
              ) : (
                <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> Export to Shared Shard</>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ── Batch Size ── */}
      <section>
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-1">Pages per Batch</h3>
        <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-3">
          How many pages to fetch each time you click "Sync Now" or "Pull Next Batch". Larger batches take longer but cover more pages in fewer runs.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={config.batchSize || 100}
            onChange={e => setConfig(prev => ({ ...prev, batchSize: Number(e.target.value) }))}
            className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-2 bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value={25}>25 pages</option>
            <option value={50}>50 pages</option>
            <option value={100}>100 pages (recommended)</option>
            <option value={250}>250 pages (max)</option>
          </select>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveMsg && <span className="text-xs text-green-600 dark:text-green-400">{saveMsg}</span>}
        </div>
      </section>

      {/* ── Space Filter ── */}
      <section>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Spaces to Sync</h3>
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark mt-0.5">
              {(config.selectedSpaceKeys || []).length === 0
                ? 'Syncing all spaces. Select specific spaces to narrow the scope.'
                : `${config.selectedSpaceKeys.length} space${config.selectedSpaceKeys.length !== 1 ? 's' : ''} selected.`}
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setConfig(prev => ({ ...prev, selectedSpaceKeys: allSpaces.map(s => s.key) }))}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >Select All</button>
            <button
              onClick={() => setConfig(prev => ({ ...prev, selectedSpaceKeys: [] }))}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >Clear</button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search spaces..."
          value={spaceSearch}
          onChange={e => setSpaceSearch(e.target.value)}
          className={inputCls + ' mt-3 mb-2'}
        />

        <div className="rounded-xl border border-hp-border dark:border-hp-border-dark overflow-hidden">
          {fetchingSpaces ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-hp-muted dark:text-hp-muted-dark">Loading spaces from Confluence...</span>
            </div>
          ) : filteredSpaces.length === 0 ? (
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark text-center py-6">
              {spaceSearch ? 'No spaces match your search.' : 'No spaces found.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-hp-border dark:divide-hp-border-dark">
              {filteredSpaces.map(space => (
                <label
                  key={space.key}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(config.selectedSpaceKeys || []).includes(space.key)}
                    onChange={() => toggleSpace(space.key)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer accent-blue-600"
                  />
                  <span className="flex-1 text-sm text-hp-text dark:text-hp-text-dark">{space.name}</span>
                  <span className="text-[10px] font-mono text-hp-muted dark:text-hp-muted-dark">{space.key}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSaveConfig}
            disabled={saving || syncing}
            className="flex-1 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 rounded-lg transition-colors"
          >
            Save (keep existing pages)
          </button>
          <button
            onClick={handleSaveAndResync}
            disabled={saving || syncing || loadingMore}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving || syncing ? (
              <span className="inline-flex items-center gap-1.5 justify-center">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Syncing...
              </span>
            ) : 'Save & Sync Fresh'}
          </button>
        </div>
        <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark mt-2 text-center">
          "Save & Sync Fresh" clears current pages and starts from page 1 with the new settings.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export default function ConfluenceView() {
  const api = window.appAPI;

  const [pages, setPages] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [connected, setConnected] = useState(false);
  const [domain, setDomain] = useState('');
  const [search, setSearch] = useState('');
  const [spaceFilter, setSpaceFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalAvailable, setTotalAvailable] = useState(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [activeTab, setActiveTab] = useState('pages');
  const [syncError, setSyncError] = useState('');
  const [pullMsg, setPullMsg] = useState('');

  const [setupStep, setSetupStep] = useState(1);
  const [inputDomain, setInputDomain] = useState('wbg-avalanche.atlassian.net');
  const [inputEmail, setInputEmail] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const applyConfluenceData = useCallback((data) => {
    if (!data) return;
    // data.pages is always the full authoritative list from the file (backend builds
    // [...existingPages, ...uniqueNew] before emitting). Set directly — no UI-side dedup.
    setPages(data.pages || []);
    setSpaces(data.spaces || []);
    setLastSync(data.lastSync);
    setHasMore(!!data.hasMore);
    if (data.totalAvailable != null) setTotalAvailable(data.totalAvailable);
    if (data.currentOffset != null) setCurrentOffset(data.currentOffset);
  }, []);

  const loadData = useCallback(async () => {
    const status = await api?.confluenceGetStatus?.();
    if (status?.connected) {
      setConnected(true);
      setDomain(status.domain || '');
      const data = await api?.confluenceGetData?.();
      applyConfluenceData(data);
    } else {
      setConnected(false);
    }
  }, [applyConfluenceData]);

  useEffect(() => {
    loadData();
    const cleanup = api?.onConfluenceSynced?.((data) => {
      applyConfluenceData(data);
      setConnected(true);
    });
    return cleanup;
  }, [loadData, applyConfluenceData]);

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    try {
      const res = await api?.confluenceSync?.();
      if (res && !res.ok) {
        setSyncError(res.error || 'Sync failed.');
      } else {
        const fresh = await api?.confluenceGetData?.();
        if (fresh) applyConfluenceData(fresh);
      }
    } catch (e) {
      setSyncError(e?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    setSyncError('');
    setPullMsg('');
    try {
      const res = await api?.confluenceSyncMore?.();
      if (res && !res.ok) {
        setSyncError(res.error || 'Failed to load more pages.');
      } else if (res) {
        // Re-read from the file so the UI is guaranteed to reflect what was written.
        // This is the source of truth — don't rely on the emit/listener path alone.
        const fresh = await api?.confluenceGetData?.();
        if (fresh) applyConfluenceData(fresh);

        if (res.added === 0) {
          setPullMsg('No new pages found — you may already have everything.');
        } else {
          setPullMsg(`Added ${res.added} new page${res.added !== 1 ? 's' : ''}.`);
        }
        setTimeout(() => setPullMsg(''), 4000);
      }
    } catch (e) {
      setSyncError(e?.message || 'Failed to load more pages.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleConnect() {
    if (!inputDomain.trim() || !inputEmail.trim() || !inputToken.trim()) return;
    setConnecting(true);
    setError('');
    try {
      const res = await api?.confluenceTestConnection?.({
        domain: inputDomain.trim(),
        email: inputEmail.trim(),
        apiToken: inputToken.trim(),
      });
      if (res?.ok) {
        setConnected(true);
        setDomain(res.domain);
        setInputDomain('');
        setInputEmail('');
        setInputToken('');
        setSetupStep(1);
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
    setConnected(false);
    setDomain('');
    setPages([]);
    setSpaces([]);
    setLastSync(null);
    setTotalAvailable(null);
    setHasMore(false);
    setCurrentOffset(0);
    setSetupStep(1);
    setActiveTab('pages');
  }

  const filtered = useMemo(() => {
    let result = pages;
    if (spaceFilter !== 'all') result = result.filter(p => p.spaceKey === spaceFilter || p.space === spaceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.spaceName || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [pages, search, spaceFilter]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const page of filtered) {
      const parsed = new Date(page.lastModified);
      const date = isNaN(parsed.getTime())
        ? 'Unknown Date'
        : parsed.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(page);
    }
    return groups;
  }, [filtered]);

  function highlightMatch(text, maxLen = 200) {
    const truncated = (text || '').length > maxLen ? text.slice(0, maxLen) + '...' : (text || '');
    if (!search.trim()) return truncated;
    const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return truncated.replace(re, '<mark class="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">$1</mark>');
  }

  const inputCls = "w-full border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark focus:outline-none focus:ring-2 focus:ring-blue-400";
  const btnPrimary = "w-full text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 rounded-lg transition-colors";

  // ── Setup flow ──────────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-hp-text dark:text-hp-text-dark mb-2">Connect to Confluence</h2>
          <p className="text-sm text-hp-muted dark:text-hp-muted-dark">
            Sync your Confluence pages for search and AI context.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                setupStep > s ? 'bg-green-500 text-white' :
                setupStep === s ? 'bg-blue-600 text-white' :
                'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {setupStep > s ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 ${setupStep > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />}
            </React.Fragment>
          ))}
        </div>

        {setupStep === 1 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-hp-text dark:text-hp-text-dark">Confluence Domain</label>
            <input type="text" value={inputDomain} onChange={e => setInputDomain(e.target.value)}
              placeholder="yourcompany.atlassian.net" className={inputCls} />
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium text-hp-muted dark:text-hp-muted-dark">This will:</p>
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark flex gap-2"><span className="text-green-500">&#10003;</span> Read pages you have access to (read-only)</p>
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark flex gap-2"><span className="text-green-500">&#10003;</span> Use your personal API token for auth</p>
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark flex gap-2"><span className="text-green-500">&#10003;</span> Feed page content into AI context</p>
            </div>
            <button onClick={() => { if (inputDomain.trim()) setSetupStep(2); }} disabled={!inputDomain.trim()} className={btnPrimary}>Next</button>
          </div>
        )}

        {setupStep === 2 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-hp-text dark:text-hp-text-dark">Create an API Token</label>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <ol className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                <li className="flex gap-2"><span className="font-bold">1.</span> Click the button below to open Atlassian's token page</li>
                <li className="flex gap-2"><span className="font-bold">2.</span> Click "Create API token"</li>
                <li className="flex gap-2"><span className="font-bold">3.</span> Name it (e.g. "Marauder's Ledger") and click Create</li>
                <li className="flex gap-2"><span className="font-bold">4.</span> Copy the token</li>
              </ol>
            </div>
            <button
              onClick={() => openAtlassianApiTokensPage()}
              className="w-full text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Atlassian Token Page
            </button>
            <div className="flex gap-3">
              <button onClick={() => setSetupStep(1)} className="flex-1 text-sm text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Back</button>
              <button onClick={() => setSetupStep(3)} className={btnPrimary.replace('w-full ', '') + ' flex-1'}>I have my token</button>
            </div>
          </div>
        )}

        {setupStep === 3 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-hp-text dark:text-hp-text-dark">Enter Your Credentials</label>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Domain: <strong>{inputDomain}</strong>
              </p>
            </div>
            <input type="email" value={inputEmail} onChange={e => { setInputEmail(e.target.value); setError(''); }}
              placeholder="your.email@company.com" className={inputCls} />
            <input type="password" value={inputToken} onChange={e => { setInputToken(e.target.value); setError(''); }}
              placeholder="API token from step 2" className={inputCls + ' font-mono'} />
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSetupStep(2)} className="flex-1 text-sm text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Back</button>
              <button onClick={handleConnect} disabled={connecting || !inputEmail.trim() || !inputToken.trim()}
                className="flex-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {connecting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Connect</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Connected view ──────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 pt-4 pb-0 border-b border-hp-border dark:border-hp-border-dark">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-hp-text dark:text-hp-text-dark">Confluence</h2>
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark mt-0.5">
              {pages.length.toLocaleString()} page{pages.length !== 1 ? 's' : ''} loaded
              {totalAvailable != null && totalAvailable > pages.length && (
                <> of ~{totalAvailable.toLocaleString()}</>
              )}
              {domain && <> &middot; {domain}</>}
              {lastSync && <> &middot; Last synced {new Date(lastSync).toLocaleTimeString()}</>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSync} disabled={syncing || loadingMore}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
              Disconnect
            </button>
          </div>
        </div>

        {/* Sync error banner */}
        {syncError && (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-red-600 dark:text-red-400 flex-1">{syncError}</p>
            <button onClick={() => setSyncError('')} className="text-red-400 hover:text-red-600 text-xs">&#10005;</button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 -mb-px">
          {[['pages', 'Pages'], ['options', 'Sync Options']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark'
              }`}
            >
              {label}
              {id === 'options' && hasMore && (
                <span className="ml-1.5 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-amber-400" title="More pages available" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pages tab */}
      {activeTab === 'pages' && (
        <>
          {/* Search / space filter bar */}
          <div className="shrink-0 px-6 py-3 border-b border-hp-border dark:border-hp-border-dark flex gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search pages..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-hp-border dark:border-hp-border-dark rounded-lg bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <select value={spaceFilter} onChange={e => setSpaceFilter(e.target.value)}
              className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-2 bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="all">All Spaces</option>
              {spaces.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {pages.length === 0 && !search && (
              <div className="text-center py-12">
                <p className="text-sm text-hp-muted dark:text-hp-muted-dark mb-3">No pages synced yet.</p>
                <button onClick={handleSync} disabled={syncing}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  {syncing ? 'Syncing...' : 'Sync now to pull your pages'}
                </button>
              </div>
            )}

            {Object.entries(grouped).map(([date, datePages]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider mb-3">{date}</h3>
                <div className="space-y-2">
                  {datePages.map(page => (
                    <div key={page.id}
                      className="group rounded-xl p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                      onClick={() => openExternalLink(page.url)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              {page.spaceKey || page.space}
                            </span>
                            <h4 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark truncate">{page.title}</h4>
                          </div>
                          <p className="text-xs text-hp-muted dark:text-hp-muted-dark leading-relaxed line-clamp-2"
                            dangerouslySetInnerHTML={{ __html: highlightMatch(page.excerpt) }} />
                          <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark mt-1.5">
                            {page.spaceName}
                            {page.lastModified && !isNaN(new Date(page.lastModified).getTime()) && (
                              <> &middot; Updated {new Date(page.lastModified).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 shrink-0 mt-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {filtered.length === 0 && search && (
              <div className="text-center py-12">
                <p className="text-sm text-hp-muted dark:text-hp-muted-dark">No pages matching "{search}"</p>
              </div>
            )}

            {/* Load more banner */}
            {hasMore && (
              <div className="pt-2 pb-4">
                <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 p-4 text-center">
                  <p className="text-xs text-hp-muted dark:text-hp-muted-dark mb-2">
                    {pages.length.toLocaleString()} page{pages.length !== 1 ? 's' : ''} loaded
                    {totalAvailable != null && totalAvailable > pages.length
                      ? <> &mdash; {(totalAvailable - pages.length).toLocaleString()} more available</>
                      : <> &mdash; more pages available on Confluence</>}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore || syncing}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {loadingMore ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading more...</>
                      ) : (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4" /></svg> Load More Pages</>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('options')}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Configure sync options
                    </button>
                  </div>
                  {pullMsg && (
                    <p className={`text-xs font-medium mt-1 ${pullMsg.startsWith('Added') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {pullMsg}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Options tab */}
      {activeTab === 'options' && (
        <SyncOptionsPanel
          storedSpaces={spaces}
          pages={pages}
          totalAvailable={totalAvailable}
          hasMore={hasMore}
          currentOffset={currentOffset}
          syncing={syncing}
          loadingMore={loadingMore}
          syncError={syncError}
          pullMsg={pullMsg}
          onPullNext={handleLoadMore}
          onResetAndResync={handleSync}
        />
      )}
    </div>
  );
}

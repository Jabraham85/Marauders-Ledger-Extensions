import React, { useState, useEffect, useCallback, useMemo } from 'react';

const AGENT_ICONS = {
  fig: '\u{1F9D9}',
  sharp: '\u{1F50D}',
  ronen: '\u2699\uFE0F',
  weasley: '\u{1F4CB}',
  hecat: '\u{1F4DA}',
};

const DATA_MODES = [
  { value: 'shared', label: 'Shared' },
  { value: 'both', label: 'Both' },
  { value: 'personal', label: 'Personal' },
];

const SOURCE_KIND_LABELS = {
  wiki: 'Wiki', reference: 'Reference', chat: 'Chat', files: 'Files',
  tasks: 'Tasks', kb: 'Knowledge Base', custom: 'Custom',
};

function ProgressBar({ loaded, total, label, indeterminate, className }) {
  const pct = (!indeterminate && total > 0) ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return React.createElement('div', { className: 'w-full ' + (className || '') },
    (label || (!indeterminate && total > 0)) && React.createElement('div', {
      className: 'flex justify-between text-[10px] text-hp-muted dark:text-hp-muted-dark mb-1',
    },
      React.createElement('span', null, label || ''),
      !indeterminate && total > 0 && React.createElement('span', { className: 'tabular-nums' }, loaded + ' / ' + total),
    ),
    React.createElement('div', { className: 'h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden' },
      React.createElement('div', {
        className: indeterminate
          ? 'h-full rounded-full bg-hp-accent origin-left animate-[indeterminate_1.4s_ease-in-out_infinite]'
          : 'h-full bg-hp-accent rounded-full transition-all duration-300 ease-out',
        style: indeterminate ? {} : { width: pct + '%' },
      }),
    ),
  );
}

// Inject indeterminate keyframes once
if (typeof document !== 'undefined' && !document.getElementById('rag-progress-style')) {
  var _s = document.createElement('style');
  _s.id = 'rag-progress-style';
  _s.textContent = '@keyframes indeterminate { 0%{transform:translateX(-100%) scaleX(0.5)} 50%{transform:translateX(0%) scaleX(0.4)} 100%{transform:translateX(100%) scaleX(0.5)} }';
  document.head.appendChild(_s);
}

export default function RagView() {
  const [config, setConfig] = useState(null);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [engineInfo, setEngineInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState(null);
  const [compareResults, setCompareResults] = useState(null);
  const [testing, setTesting] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [testTimings, setTestTimings] = useState(null);
  const [sharedPathInput, setSharedPathInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [potterdbStatus, setPotterdbStatus] = useState(null);
  const [potterdbSyncing, setPotterdbSyncing] = useState(false);
  const [potterdbMsg, setPotterdbMsg] = useState('');
  const [potterdbPhase, setPotterdbPhase] = useState(null);
  const [loadProgress, setLoadProgress] = useState(null); // { phase, loaded, total, chunks }
  const [connecting, setConnecting] = useState(false);

  const api = window.appAPI || window.electronAPI;

  const reload = useCallback(async () => {
    try {
      const [cfg, src, agt, info] = await Promise.all([
        api?.ragGetConfig?.(),
        api?.ragCustomSources?.(),
        api?.ragGetAgents?.(),
        api?.ragGetEngineInfo?.(),
      ]);
      setConfig(cfg || {});
      setSources(src || []);
      setAgents(agt || []);
      setEngineInfo(info || null);
      setSharedPathInput(cfg?.sharedPath || '');
      const pdbStatus = api?.potterdbGetStatus?.();
      if (pdbStatus) setPotterdbStatus(pdbStatus);
    } catch (e) {
      console.error('[RagView] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Subscribe to shard-load progress events from the service (fired during both the
  // 6-second deferred startup load and explicit Connect calls).
  useEffect(() => {
    if (!api?.onRagProgress) return;
    api.onRagProgress(function(p) {
      if (p.phase === 'done') {
        // Show 100% briefly, then clear
        setLoadProgress({ phase: 'done', loaded: p.total || p.loaded, total: p.total || p.loaded, chunks: p.chunks });
        setTimeout(() => { setLoadProgress(null); setConnecting(false); }, 900);
      } else {
        setLoadProgress(p);
      }
    });
    return () => { try { api.onRagProgress(null); } catch(e) {} };
  }, [api]);

  // The shared registry loads on a 6-second deferred timer inside ragService.
  // Subscribe to the interop event it fires on completion so the source list
  // refreshes automatically without requiring the user to click Connect again.
  useEffect(() => {
    if (!api?.interopSubscribe) return;
    const unsub = api.interopSubscribe('rag/registry-loaded', () => {
      api?.ragCustomSources?.().then ? api.ragCustomSources().then(s => setSources(s || [])) : setSources(api.ragCustomSources() || []);
    });
    // Fallback: also poll once at 7s in case the event was missed (e.g. loaded before this component mounted)
    const timer = setTimeout(() => {
      const srcs = api?.ragCustomSources?.();
      if (srcs && srcs.length > 0) setSources(srcs);
    }, 7000);
    return () => { if (typeof unsub === 'function') unsub(); clearTimeout(timer); };
  }, [api]);

  async function updateConfig(partial) {
    await api?.ragSetConfig?.(partial);
    const fresh = await api?.ragGetConfig?.();
    setConfig(fresh || {});
    const info = await api?.ragGetEngineInfo?.();
    setEngineInfo(info || null);
  }

  async function toggleSource(sourceId, active) {
    await api?.ragToggleSource?.({ id: sourceId, active });
    const fresh = await api?.ragCustomSources?.();
    setSources(fresh || []);
  }

  async function handleTest() {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResults(null);
    setCompareResults(null);
    setTestTimings(null);
    try {
      if (compareMode) {
        const t0 = Date.now();
        const res = await api?.ragCompareSearch?.({
          query: testQuery,
          topK: config?.topK || 5,
          agentId: config?.defaultAgent,
        });
        const elapsed = Date.now() - t0;
        setCompareResults(res);
        setTestTimings({ total: elapsed });
      } else {
        const t0 = Date.now();
        const res = await api?.ragSearch?.({
          query: testQuery,
          topK: config?.topK || 5,
          agentId: config?.defaultAgent,
        });
        const elapsed = Date.now() - t0;
        setTestResults(res);
        setTestTimings({ total: elapsed });
      }
    } catch (e) {
      setTestResults({ ok: false, error: e?.message || 'Search failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveSharedPath() {
    setConnecting(true);
    setLoadProgress({ phase: 'connecting', loaded: 0, total: 0 });
    await updateConfig({ sharedPath: sharedPathInput.trim() });
    const res = await api?.ragLoadShared?.();
    // onRagProgress will clear loadProgress/connecting when phase==='done'.
    // But if it never fires (cached hit, error, etc.) we clean up here.
    if (!res?.ok || res?.cached) {
      setConnecting(false);
      setLoadProgress(null);
    }
    if (res?.ok) {
      setSaveMsg((res.cached ? 'Loaded from cache: ' : 'Connected: ') + res.size + ' chunks');
      reload();
    } else {
      setSaveMsg(res?.error || 'Failed to load shared registry');
    }
    setTimeout(() => setSaveMsg(''), 4000);
  }

  async function handleSyncToShare() {
    setSaving(true);
    const res = await api?.ragSaveShared?.();
    if (res?.skipped) {
      setSaveMsg('Nothing to sync — add personal sources via Knowledge Sources first.');
    } else {
      setSaveMsg(res?.ok ? 'Personal sources exported to share.' : (res?.error || 'Save failed'));
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 5000);
  }

  async function handlePotterSync() {
    if (!api?.potterdbSync) return;
    setPotterdbSyncing(true);
    setPotterdbMsg('');
    setPotterdbPhase('spells');
    try {
      const res = await api.potterdbSync({
        onProgress: function (p) { setPotterdbPhase(p.phase + ' (' + p.count + ')'); },
      });
      if (res?.ok) {
        setPotterdbMsg('Synced ' + res.chunkCount.toLocaleString() + ' entries' + (res.errors?.length ? ' (some categories failed)' : ''));
        const status = api?.potterdbGetStatus?.();
        if (status) setPotterdbStatus(status);
        reload();
      } else {
        setPotterdbMsg(res?.error || 'Sync failed');
      }
    } catch (e) {
      setPotterdbMsg('Sync error: ' + (e?.message || 'Unknown error'));
    } finally {
      setPotterdbSyncing(false);
      setPotterdbPhase(null);
      setTimeout(() => setPotterdbMsg(''), 6000);
    }
  }

  async function handlePotterClear() {
    if (!api?.potterdbClear) return;
    api.potterdbClear();
    setPotterdbStatus({ synced: false, chunkCount: 0, lastSync: null });
    setPotterdbMsg('Potter DB data cleared from index');
    reload();
    setTimeout(() => setPotterdbMsg(''), 3000);
  }

  const sharedSources = useMemo(() => sources.filter(s => s.registry === 'shared'), [sources]);
  const personalSources = useMemo(() => sources.filter(s => s.registry === 'personal'), [sources]);
  const totalChunks = useMemo(() => sources.reduce((sum, s) => sum + (s.chunkCount || 0), 0), [sources]);
  const aiAvailable = !!(engineInfo?.aiAvailable);

  if (loading) {
    return React.createElement('div', { className: 'flex items-center justify-center p-12' },
      React.createElement('div', { className: 'w-6 h-6 border-2 border-hp-accent border-t-transparent rounded-full animate-spin' })
    );
  }

  if (!config || !api?.ragSearch) {
    return React.createElement('div', { className: 'p-8 text-center' },
      React.createElement('p', { className: 'text-hp-muted dark:text-hp-muted-dark text-sm' },
        'RAG Engine is not available. Make sure the extension service is loaded.'
      )
    );
  }

  return React.createElement('div', { className: 'p-6 max-w-4xl mx-auto space-y-6' },

    // Header
    React.createElement('div', null,
      React.createElement('h2', { className: 'text-2xl font-bold text-hp-text dark:text-hp-text-dark font-display' }, 'Procedural RAG Engine'),
      React.createElement('p', { className: 'text-sm text-hp-muted dark:text-hp-muted-dark mt-1' },
        totalChunks.toLocaleString() + ' chunks across ' + sources.length + ' sources'
      ),
    ),

    // Active Agent
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-3' }, 'Active Agent'),
      React.createElement('div', { className: 'grid grid-cols-1 sm:grid-cols-5 gap-2' },
        agents.map(a =>
          React.createElement('button', {
            key: a.id,
            onClick: () => updateConfig({ defaultAgent: a.id }),
            className: 'p-3 rounded-lg border text-left transition-all ' +
              (config.defaultAgent === a.id
                ? 'border-hp-accent bg-hp-accent/10 ring-1 ring-hp-accent/30'
                : 'border-hp-border dark:border-hp-border-dark hover:border-hp-accent/50'),
          },
            React.createElement('div', { className: 'text-lg mb-1' }, AGENT_ICONS[a.id] || '\u2728'),
            React.createElement('div', { className: 'text-xs font-semibold text-hp-text dark:text-hp-text-dark truncate' }, a.name),
            React.createElement('div', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark' }, a.title),
          )
        )
      ),
      config.defaultAgent && agents.find(a => a.id === config.defaultAgent) &&
        React.createElement('p', { className: 'mt-2 text-xs text-hp-muted dark:text-hp-muted-dark' },
          agents.find(a => a.id === config.defaultAgent).description
        ),
    ),

    // Search Pipeline (new in v1.4.0)
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-3' },
        React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark' }, 'Search Pipeline'),
        React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full bg-hp-accent/10 text-hp-accent font-medium' }, 'v1.6.1'),
      ),

      // Engine toggle
      React.createElement('div', { className: 'mb-3' },
        React.createElement('p', { className: 'text-[10px] font-semibold uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark mb-1.5' }, 'Retrieval Engine'),
        React.createElement('div', { className: 'flex gap-1' },
          ['classic', 'bm25'].map(val =>
            React.createElement('button', {
              key: val,
              onClick: () => updateConfig({ searchEngine: val }),
              className: 'flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ' +
                ((config.searchEngine || 'bm25') === val
                  ? 'border-hp-accent bg-hp-accent/10 text-hp-accent'
                  : 'border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-hp-accent/50'),
            },
              React.createElement('div', { className: 'font-semibold' }, val === 'bm25' ? 'BM25' : 'Classic'),
              React.createElement('div', { className: 'text-[9px] mt-0.5 opacity-75' },
                val === 'bm25' ? 'Inverted index + Okapi scoring' : 'Concentric ring linear scan'
              ),
            )
          )
        ),
      ),

      // LLM-powered toggles
      React.createElement('div', { className: 'grid grid-cols-2 gap-2 mb-2' },
        React.createElement(PipelineToggle, {
          label: 'Query Expansion',
          description: 'LLM generates additional search terms before retrieval',
          enabled: !!config.queryExpansion,
          aiRequired: true,
          aiAvailable: aiAvailable,
          onChange: val => updateConfig({ queryExpansion: val }),
        }),
        React.createElement(PipelineToggle, {
          label: 'Result Reranking',
          description: 'LLM scores and reorders the top candidates after retrieval',
          enabled: !!config.reranking,
          aiRequired: true,
          aiAvailable: aiAvailable,
          onChange: val => updateConfig({ reranking: val }),
        }),
      ),

      React.createElement('p', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mt-1' },
        'Recursive retrieval and Deep Dive are toggled per-query in the AI Chat input bar.'
      ),
    ),

    // Search Scope
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-3' }, 'Search Scope'),
      React.createElement('div', { className: 'flex gap-1 mb-3' },
        DATA_MODES.map(m =>
          React.createElement('button', {
            key: m.value,
            onClick: () => updateConfig({ dataMode: m.value }),
            className: 'flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' +
              (config.dataMode === m.value
                ? 'bg-hp-accent text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700'),
          }, m.label)
        )
      ),
      React.createElement('div', { className: 'flex gap-2 items-end' },
        React.createElement('div', { className: 'flex-1' },
          React.createElement('label', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark block mb-1' }, 'Shared Data Path'),
          React.createElement('input', {
            type: 'text', value: sharedPathInput,
            onChange: e => setSharedPathInput(e.target.value),
            className: 'w-full px-2 py-1.5 text-xs bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded text-hp-text dark:text-hp-text-dark',
            placeholder: 'S:\\Team\\RAG',
            disabled: connecting,
          }),
        ),
        React.createElement('button', {
          onClick: handleSaveSharedPath,
          disabled: connecting,
          className: 'px-3 py-1.5 text-xs font-medium bg-hp-accent text-white rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity',
        }, connecting ? 'Loading...' : 'Connect'),
      ),

      // Shard loading progress bar — visible during Connect and deferred startup load
      (connecting || loadProgress) && React.createElement('div', { className: 'mt-2' },
        React.createElement(ProgressBar, {
          loaded: loadProgress?.loaded || 0,
          total: loadProgress?.total || 0,
          indeterminate: !loadProgress || loadProgress.phase === 'connecting' || loadProgress.total === 0,
          label: loadProgress?.phase === 'done'
            ? '\u2713 Loaded ' + (loadProgress.chunks || loadProgress.loaded || '') + ' chunks'
            : loadProgress?.total > 0
              ? 'Loading shards\u2026'
              : 'Connecting\u2026',
        }),
        loadProgress?.total > 0 && loadProgress.phase !== 'done' && React.createElement('p', {
          className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mt-0.5',
        }, loadProgress.loaded + ' of ' + loadProgress.total + ' shards'),
      ),

      saveMsg && React.createElement('p', {
        className: 'mt-2 text-xs ' + (saveMsg.includes('fail') || saveMsg.includes('error') ? 'text-red-500' : 'text-green-600 dark:text-green-400'),
      }, saveMsg),
    ),

    // Knowledge Sources
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-3' }, 'Knowledge Sources'),

      sharedSources.length > 0 && React.createElement('div', { className: 'mb-3' },
        React.createElement('p', { className: 'text-[10px] font-semibold uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark mb-1.5' }, 'Shared Sources'),
        sharedSources.map(s => React.createElement(SourceRow, { key: s.sourceId, source: s, onToggle: toggleSource })),
      ),

      personalSources.length > 0 && React.createElement('div', { className: 'mb-3' },
        React.createElement('p', { className: 'text-[10px] font-semibold uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark mb-1.5' }, 'Personal Sources'),
        personalSources.map(s => React.createElement(SourceRow, { key: s.sourceId, source: s, onToggle: toggleSource })),
      ),

      sources.length === 0 && !loadProgress && !connecting && React.createElement('p', {
        className: 'text-xs text-hp-muted dark:text-hp-muted-dark py-4 text-center',
      }, 'No sources loaded. Connect a shared path or add personal sources.'),

      // Show shard progress inside Knowledge Sources when loading on startup
      sources.length === 0 && (loadProgress || connecting) && React.createElement('div', { className: 'py-3' },
        React.createElement(ProgressBar, {
          loaded: loadProgress?.loaded || 0,
          total: loadProgress?.total || 0,
          indeterminate: !loadProgress || loadProgress.phase === 'connecting' || loadProgress.total === 0,
          label: loadProgress?.total > 0
            ? 'Loading shards \u2014 ' + loadProgress.loaded + ' / ' + loadProgress.total
            : 'Loading knowledge sources\u2026',
        }),
      ),

      React.createElement('div', { className: 'flex gap-2 mt-2 pt-2 border-t border-hp-border dark:border-hp-border-dark' },
        React.createElement('button', {
          onClick: handleSyncToShare, disabled: saving,
          title: 'Export your personal knowledge sources to the shared drive so teammates can load them.',
          className: 'px-2.5 py-1 text-[11px] font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-1.5',
        },
          saving && React.createElement('div', { className: 'w-3 h-3 border border-current border-t-transparent rounded-full animate-spin' }),
          saving ? 'Exporting...' : 'Export Personal Sources',
        ),
      ),
    ),

    // Potter DB Lore Sync
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-1' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { style: { fontSize: '18px' } }, '\u{1F9D9}'),
          React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark' }, 'Harry Potter Lore (Potter DB)'),
        ),
        api?.potterdbSync
          ? React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium' }, 'Active')
          : React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium' }, 'Not installed'),
      ),
      React.createElement('p', { className: 'text-[11px] text-hp-muted dark:text-hp-muted-dark mb-3' },
        'Index 5,000+ characters, 300+ spells, and 160+ potions from the Wizarding World into the RAG knowledge base. Data is cached locally — one sync survives app restarts.'
      ),

      !api?.potterdbSync
        ? React.createElement('p', { className: 'text-xs text-hp-muted dark:text-hp-muted-dark py-2 italic' },
            'Install and enable the Harry Potter Lore extension from the Marketplace to use this feature.'
          )
        : React.createElement('div', null,
            // Status row
            potterdbStatus && potterdbStatus.synced && React.createElement('div', {
              className: 'flex items-center gap-3 text-xs text-hp-muted dark:text-hp-muted-dark mb-3 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2',
            },
              React.createElement('span', { className: 'text-green-600 dark:text-green-400 font-medium' }, '\u2713 ' + (potterdbStatus.chunkCount || 0).toLocaleString() + ' entries indexed'),
              potterdbStatus.lastSync && React.createElement('span', { className: 'opacity-60' },
                'Last sync: ' + new Date(potterdbStatus.lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              ),
            ),

            // Progress bar while syncing
            potterdbSyncing && React.createElement('div', { className: 'mb-3' },
              React.createElement(ProgressBar, { indeterminate: true }),
              potterdbPhase && React.createElement('p', {
                className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mt-1',
              }, 'Fetching ' + potterdbPhase + '\u2026'),
            ),

            // Buttons
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('button', {
                onClick: handlePotterSync,
                disabled: potterdbSyncing,
                className: 'px-3 py-1.5 text-xs font-medium bg-hp-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity',
              }, potterdbSyncing ? 'Syncing...' : (potterdbStatus?.synced ? 'Re-sync' : 'Sync Now')),
              potterdbStatus?.synced && React.createElement('button', {
                onClick: handlePotterClear,
                disabled: potterdbSyncing,
                className: 'px-3 py-1.5 text-xs font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50',
              }, 'Clear'),
            ),

            // Status message
            potterdbMsg && React.createElement('p', {
              className: 'mt-2 text-xs ' + (potterdbMsg.toLowerCase().includes('fail') || potterdbMsg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-600 dark:text-green-400'),
            }, potterdbMsg),
          ),
    ),

    // Search Settings
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark mb-3' }, 'Search Settings'),
      React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark block mb-1' }, 'Top K Results'),
          React.createElement('select', {
            value: config.topK || 5,
            onChange: e => updateConfig({ topK: parseInt(e.target.value) }),
            className: 'w-full px-2 py-1.5 text-xs bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded text-hp-text dark:text-hp-text-dark',
          },
            [3, 5, 8, 10, 15, 20].map(n => React.createElement('option', { key: n, value: n }, String(n)))
          ),
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark block mb-1' }, 'Min Relevance'),
          React.createElement('select', {
            value: config.minRelevance || 0.10,
            onChange: e => updateConfig({ minRelevance: parseFloat(e.target.value) }),
            className: 'w-full px-2 py-1.5 text-xs bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded text-hp-text dark:text-hp-text-dark',
          },
            [0.05, 0.08, 0.10, 0.15, 0.20, 0.30].map(n => React.createElement('option', { key: n, value: n }, String(n)))
          ),
        ),
      ),
    ),

    // Test Search
    React.createElement('div', { className: 'rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-3' },
        React.createElement('h3', { className: 'text-sm font-semibold text-hp-text dark:text-hp-text-dark' }, 'Test Search'),
        React.createElement('button', {
          onClick: () => { setCompareMode(!compareMode); setTestResults(null); setCompareResults(null); setTestTimings(null); },
          className: 'px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all ' +
            (compareMode
              ? 'border-hp-accent bg-hp-accent/10 text-hp-accent'
              : 'border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-hp-accent/50'),
        }, compareMode ? 'Compare ON' : 'Compare Mode'),
      ),

      compareMode && React.createElement('p', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mb-2' },
        'Runs Classic and BM25 engines side-by-side. Query expansion and reranking are disabled for a fair comparison.'
      ),

      React.createElement('div', { className: 'flex gap-2' },
        React.createElement('input', {
          type: 'text', value: testQuery,
          onChange: e => setTestQuery(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter') handleTest(); },
          placeholder: 'Try a search query...',
          className: 'flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded-lg text-hp-text dark:text-hp-text-dark placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-hp-accent',
          disabled: testing,
        }),
        React.createElement('button', {
          onClick: handleTest, disabled: testing || !testQuery.trim(),
          className: 'px-4 py-2 text-sm font-medium bg-hp-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50',
        }, testing ? 'Searching...' : (compareMode ? 'Compare' : 'Search')),
      ),
      testing && React.createElement('div', { className: 'mt-2' },
        React.createElement(ProgressBar, { indeterminate: true, label: 'Running search pipeline\u2026' }),
      ),

      // Single engine results
      !compareMode && testResults && React.createElement('div', { className: 'mt-3 space-y-2' },
        testTimings && React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
          testResults.engine && React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full bg-hp-accent/10 text-hp-accent font-mono font-semibold uppercase' }, testResults.engine),
          testResults.agentName && React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark' }, testResults.agentName),
          React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark' }, testTimings.total + 'ms'),
          testResults.debug?.categories && React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark' }, 'Categories: ' + testResults.debug.categories.join(', ')),
          testResults.debug?.ringReached != null && React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark' }, 'Ring: ' + testResults.debug.ringReached),
          testResults.queryExpansionUsed && React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' }, 'Expanded'),
          testResults.rerankingUsed && React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' }, 'Reranked'),
          testResults.recursiveUsed && React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' }, 'Recursive'),
        ),
        (testResults.results || []).length === 0 && React.createElement('p', { className: 'text-xs text-hp-muted dark:text-hp-muted-dark py-2' }, 'No results found.'),
        (testResults.results || []).map((r, i) => React.createElement(ResultCard, { key: i, result: r, index: i + 1 })),
      ),

      // Compare mode results
      compareMode && compareResults && compareResults.ok && React.createElement('div', { className: 'mt-3' },
        testTimings && React.createElement('p', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mb-2' }, 'Total: ' + testTimings.total + 'ms'),
        React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
          React.createElement(CompareColumn, { label: 'Classic', data: compareResults.classic }),
          React.createElement(CompareColumn, { label: 'BM25', data: compareResults.bm25 }),
        ),
      ),

      compareMode && compareResults && !compareResults.ok &&
        React.createElement('p', { className: 'mt-2 text-xs text-red-500' }, compareResults.error || 'Compare failed'),
    ),
  );
}

// === Sub-components ============================================================

function PipelineToggle({ label, description, enabled, aiRequired, aiAvailable, onChange, costWarning }) {
  var locked = aiRequired && !aiAvailable;
  return React.createElement('div', {
    className: 'p-3 rounded-lg border ' + (enabled && !locked ? 'border-hp-accent/50 bg-hp-accent/5' : 'border-hp-border dark:border-hp-border-dark'),
  },
    React.createElement('div', { className: 'flex items-center justify-between mb-1' },
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'text-xs font-semibold text-hp-text dark:text-hp-text-dark' }, label),
        costWarning && React.createElement('span', {
          className: 'text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-semibold',
        }, 'Steep cost'),
      ),
      React.createElement('button', {
        onClick: () => { if (!locked) onChange(!enabled); },
        disabled: locked,
        className: 'w-8 h-4 rounded-full transition-colors shrink-0 relative ' +
          (locked ? 'bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed' :
            enabled ? 'bg-hp-accent' : 'bg-gray-300 dark:bg-gray-600'),
      },
        React.createElement('div', {
          className: 'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ' +
            (enabled && !locked ? 'translate-x-4' : 'translate-x-0.5'),
        })
      ),
    ),
    React.createElement('p', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark leading-tight' },
      locked ? description + ' \u2014 requires AI extension' : description
    ),
  );
}

function SourceRow({ source, onToggle }) {
  var s = source;
  return React.createElement('div', { className: 'flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50' },
    React.createElement('button', {
      onClick: () => onToggle(s.sourceId, !s.active),
      className: 'w-7 h-4 rounded-full transition-colors shrink-0 relative ' + (s.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'),
    },
      React.createElement('div', {
        className: 'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ' + (s.active ? 'translate-x-3.5' : 'translate-x-0.5'),
      })
    ),
    React.createElement('span', { className: 'text-xs font-medium text-hp-text dark:text-hp-text-dark flex-1 truncate' }, s.sourceLabel || s.sourceId),
    React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark' },
      SOURCE_KIND_LABELS[s.sourceKind] || s.sourceKind
    ),
    React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark tabular-nums' }, (s.chunkCount || 0) + ' chunks'),
  );
}

function ResultCard({ result, index }) {
  var r = result;
  return React.createElement('div', { className: 'p-2 rounded border border-hp-border/50 dark:border-hp-border-dark/50 bg-gray-50 dark:bg-gray-900' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-xs font-semibold text-hp-text dark:text-hp-text-dark truncate mr-2' }, '[' + index + '] ' + (r.title || 'Untitled')),
      React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-hp-accent/10 text-hp-accent font-mono shrink-0' }, (r.relevance || 0).toFixed(3)),
    ),
    React.createElement('div', { className: 'flex gap-2 mt-1' },
      React.createElement('span', { className: 'text-[10px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-hp-muted dark:text-hp-muted-dark' }, r.sourceKind || ''),
      React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark truncate' }, r.sourceLabel || ''),
    ),
    React.createElement('p', { className: 'text-[11px] text-hp-text dark:text-hp-text-dark mt-1 line-clamp-2' }, (r.text || '').slice(0, 200)),
  );
}

function CompareColumn({ label, data }) {
  var results = (data && data.results) || [];
  var debug = (data && data.debug) || {};
  var engine = (data && data.engine) || label.toLowerCase();
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
      React.createElement('span', { className: 'text-xs font-bold text-hp-text dark:text-hp-text-dark' }, label),
      React.createElement('span', { className: 'text-[10px] px-1.5 py-0.5 rounded-full bg-hp-accent/10 text-hp-accent font-mono' }, engine),
      debug.categories && React.createElement('span', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark truncate' }, debug.categories.join(', ')),
    ),
    results.length === 0
      ? React.createElement('p', { className: 'text-xs text-hp-muted dark:text-hp-muted-dark py-2' }, 'No results.')
      : results.map(function (r, i) {
          return React.createElement('div', { key: i, className: 'mb-1.5 p-2 rounded border border-hp-border/40 dark:border-hp-border-dark/40 bg-gray-50/80 dark:bg-gray-900/80' },
            React.createElement('div', { className: 'flex items-center justify-between' },
              React.createElement('span', { className: 'text-[11px] font-semibold text-hp-text dark:text-hp-text-dark truncate mr-2' }, '[' + (i + 1) + '] ' + (r.title || 'Untitled')),
              React.createElement('span', { className: 'text-[10px] font-mono text-hp-accent shrink-0' }, (r.relevance || 0).toFixed(3)),
            ),
            React.createElement('p', { className: 'text-[10px] text-hp-muted dark:text-hp-muted-dark mt-0.5 line-clamp-1' }, (r.text || '').slice(0, 120)),
          );
        })
  );
}

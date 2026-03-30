import React, { useState, useEffect, useMemo } from 'react';
import { useTheme, W } from '../theme/ThemeProvider';

export default function GlossaryView() {
  const { t } = useTheme();
  const [glossary, setGlossary] = useState({ terms: [], lastUpdated: null, autoCount: 0 });
  const [search, setSearch] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [rebuilding, setRebuilding] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    window.electronAPI?.glossaryGet?.().then(g => {
      if (g) setGlossary(g);
    });
    if (window.electronAPI?.onGlossaryUpdated) {
      const cleanup = window.electronAPI.onGlossaryUpdated((g) => {
        if (g) setGlossary(g);
      });
      return cleanup;
    }
  }, []);

  const manualSet = useMemo(() => new Set(glossary.manualAdded || []), [glossary.manualAdded]);

  const filtered = useMemo(() => {
    let result = glossary.terms || [];
    if (filter === 'manual') {
      result = result.filter(t => manualSet.has(t));
    } else if (filter === 'auto') {
      result = result.filter(t => !manualSet.has(t));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => t.toLowerCase().includes(q));
    }
    return result;
  }, [glossary.terms, search, filter, manualSet]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const term of filtered) {
      const letter = /^[a-zA-Z]/.test(term) ? term[0].toUpperCase() : '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(term);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function handleRebuild() {
    setRebuilding(true);
    try {
      const result = await window.electronAPI?.glossaryRebuild?.();
      if (result) setGlossary(result);
    } finally {
      setRebuilding(false);
    }
  }

  async function handleAddTerm(e) {
    e.preventDefault();
    if (!newTerm.trim()) return;
    const result = await window.electronAPI?.glossaryAddTerm?.(newTerm.trim());
    if (result?.ok && result.glossary) {
      setGlossary(result.glossary);
      setNewTerm('');
    }
  }

  async function handleRemoveTerm(term) {
    const result = await window.electronAPI?.glossaryRemoveTerm?.(term);
    if (result?.ok && result.glossary) {
      setGlossary(result.glossary);
    }
  }

  if ((glossary.terms || []).length === 0 && !rebuilding) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-hp-text dark:text-gray-100 mb-2"><W k="glossaryEmpty" /></h3>
          <p className="text-sm text-hp-muted dark:text-gray-400 mb-4">
            Sync your Confluence pages first, then rebuild the glossary to extract unique terms from your wiki.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={handleRebuild}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
              style={{ background: 'var(--hp-accent)' }}
            >
              <W k="glossaryRebuild" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-hp-card dark:bg-gray-900 relative z-1">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-hp-border dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-hp-text dark:text-gray-100 font-display"><W k="glossary" /></h2>
            <p className="text-xs text-hp-muted dark:text-gray-400 mt-0.5">
              {filtered.length} of {(glossary.terms || []).length} term{(glossary.terms || []).length !== 1 ? 's' : ''}
              {glossary.autoCount ? ` \u00B7 ${glossary.autoCount} auto-detected` : ''}
              {glossary.lastUpdated && ` \u00B7 Updated ${new Date(glossary.lastUpdated).toLocaleString()}`}
            </p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {rebuilding ? t('syncing') : t('glossaryRebuild')}
          </button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('glossarySearchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-hp-border dark:border-gray-700 rounded-lg bg-hp-card dark:bg-gray-900 text-hp-text dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-sm border border-hp-border dark:border-gray-700 rounded-lg px-3 py-2 bg-hp-card dark:bg-gray-900 text-hp-text dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">All Terms</option>
            <option value="auto">Auto-detected</option>
            <option value="manual">Manually Added</option>
          </select>

          <form onSubmit={handleAddTerm} className="flex gap-1.5">
            <input
              type="text"
              placeholder="Add custom term..."
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              className="w-40 px-3 py-2 text-sm border border-hp-border dark:border-gray-700 rounded-lg bg-hp-card dark:bg-gray-900 text-hp-text dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={!newTerm.trim()}
              className="px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40"
              style={{ background: 'var(--hp-accent)' }}
            >
              +
            </button>
          </form>
        </div>

        <p className="text-[10px] text-hp-muted dark:text-gray-400 mt-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          These terms are added to the spellcheck dictionary and won't be flagged as misspellings.
        </p>
      </div>
      <div className="magic-divider mb-4" />

      {/* Term list */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
        {grouped.map(([letter, terms]) => (
          <div key={letter}>
            <div className="sticky top-0 z-10 bg-hp-card dark:bg-gray-900">
              <h3
                className="text-xs font-bold uppercase tracking-wider py-1 px-2 rounded"
                style={{ color: 'var(--hp-accent)', borderBottom: '1px solid var(--hp-accent)', opacity: 0.7 }}
              >
                {letter}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {terms.map(term => (
                <span
                  key={term}
                  className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm border transition-colors"
                  style={{
                    borderColor: manualSet.has(term) ? 'var(--hp-accent)' : 'var(--hp-border, #e5e7eb)',
                    background: manualSet.has(term) ? 'color-mix(in srgb, var(--hp-accent) 10%, transparent)' : undefined,
                  }}
                >
                  <span className="text-hp-text dark:text-gray-100">{term}</span>
                  {manualSet.has(term) && (
                    <span className="text-[9px] uppercase tracking-wider opacity-50 font-semibold" style={{ color: 'var(--hp-accent)' }}>custom</span>
                  )}
                  <button
                    onClick={() => handleRemoveTerm(term)}
                    className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-70 hover:!opacity-100 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                    title="Remove from glossary"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && search && (
          <div className="text-center py-12">
            <p className="text-sm text-hp-muted dark:text-gray-400">No terms matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

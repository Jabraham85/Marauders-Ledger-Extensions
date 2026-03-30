import React from 'react';

export function openInBrowser(url) {
  if (!url) return;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

export function sourceTypeInfo(source) {
  const st = source.sourceType || source.type || source.extra?.type || 'unknown';
  const extra = source.extra || {};
  if (st === 'confluence' || extra.type === 'confluence') return { key: 'confluence', label: 'Confluence', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60' };
  if (st === 'kb' || extra.type === 'knowledge-base') return { key: 'kb', label: 'Knowledge Base', color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/60' };
  if (st === 'potterdb' || extra.type === 'potterdb') return { key: 'potterdb', label: 'Potter DB', color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60' };
  if (st === 'slack' || extra.type === 'slack') return { key: 'slack', label: 'Slack', color: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/60' };
  // Custom sources: use display name when enriched (e.g. "Confluence (50 pages)" instead of "custom_crawl_xxx")
  if (source.sourceDisplayName) return { key: 'custom', label: source.sourceDisplayName, color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' };
  return { key: 'unknown', label: st, color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' };
}

export function CitationBadge({ num, source }) {
  if (!source) return <sup className="text-[10px] text-gray-400">[{num}]</sup>;

  const info = sourceTypeInfo(source);
  const hasLink = source.url && (info.key === 'confluence' || info.key === 'potterdb' || info.key === 'custom');
  const relevance = source.similarity ? `${Math.round(source.similarity * 100)}% relevant` : '';
  const updated = source.lastModified
    ? new Date(source.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const label = `${source.title} — ${info.label}${updated ? ` · Updated ${updated}` : ''}${relevance ? ` · ${relevance}` : ''}${hasLink ? ' · Click to open' : ''}`;

  return (
    <span
      onClick={hasLink ? () => openInBrowser(source.url) : undefined}
      className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold align-super leading-none transition-colors ${info.color} ${hasLink ? 'cursor-pointer hover:ring-1 hover:ring-blue-400' : 'cursor-help'}`}
      title={label}
    >
      {num}
    </span>
  );
}

export function CitedText({ text, sources }) {
  if (!text) return null;
  if (!sources || sources.length === 0) return <>{text}</>;

  const parts = text.split(/(\[\d+\])/g);
  const modelCited = new Set();

  const rendered = parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const src = sources[num - 1];
      if (src) modelCited.add(num);
      return <CitationBadge key={i} num={num} source={src} />;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });

  // Always show all sources (auto-citation), highlighting ones the model cited
  return (
    <>
      {rendered}
      {sources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-hp-border dark:border-gray-700 not-prose">
          <p className="text-[10px] font-semibold text-hp-muted dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Sources used ({sources.length})
          </p>
          <div className="space-y-0.5">
            {sources.map((src, idx) => {
              const num = idx + 1;
              const info = sourceTypeInfo(src);
              const hasLink = src.url && (info.key === 'confluence' || info.key === 'potterdb' || info.key === 'custom');
              const updated = src.lastModified
                ? new Date(src.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : null;
              const wasCited = modelCited.has(num);
              const relevancePct = src.similarity ? Math.round(src.similarity * 100) : null;
              const spaceName = src.extra?.spaceName || src.spaceName || src.extra?.spaceKey || '';

              return (
                <div
                  key={num}
                  className={`flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 -mx-1 transition-colors ${wasCited ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''} ${hasLink ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20' : ''}`}
                  onClick={hasLink ? () => openInBrowser(src.url) : undefined}
                >
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold shrink-0 ${info.color}`}>{num}</span>
                  <span className="text-hp-muted dark:text-gray-400 flex items-center gap-1 min-w-0">
                    <span className={`truncate ${hasLink ? 'text-blue-600 dark:text-blue-400' : ''}`}>{src.title}</span>
                    <span className="opacity-60 shrink-0"> — {info.label}{spaceName ? ` · ${spaceName}` : ''}{updated ? ` · ${updated}` : ''}</span>
                    {relevancePct !== null && (
                      <span className={`shrink-0 text-[9px] px-1 rounded ${relevancePct >= 70 ? 'text-green-600 dark:text-green-400' : relevancePct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                        {relevancePct}%
                      </span>
                    )}
                    {hasLink && (
                      <svg className="w-3 h-3 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

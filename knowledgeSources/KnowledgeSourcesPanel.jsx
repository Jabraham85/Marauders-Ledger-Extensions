import React, { useState, useEffect, useCallback, useId } from 'react';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.jsonl', '.ndjson', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.css', '.scss', '.html', '.htm', '.xml', '.svg', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log',
  '.sql', '.sh', '.ps1', '.bat', '.cmd', '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.lua',
  '.usf', '.hlsl', '.glsl', '.vert', '.frag', '.uproject', '.uplugin',
]);

/** sr-only as inline styles — Tailwind is not scanned over extension files, so the class would be missing from compiled CSS. */
const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0,
  margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap', borderWidth: 0,
};

/**
 * Best-effort text extraction for PDFs.
 * Works for text-based PDFs (not scanned image PDFs or heavily compressed streams).
 * Returns the extracted text, or null if nothing useful was found.
 */
async function extractPdfText(file) {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Verify %PDF magic bytes
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return null;
    // TextDecoder is orders of magnitude faster than char-by-char string building
    const cap = Math.min(bytes.length, 8 * 1024 * 1024);
    const raw = new TextDecoder('iso-8859-1').decode(bytes.subarray(0, cap));

    let text = '';

    // Strategy 1: extract text from BT...ET blocks (standard PDF text operators)
    const btEtRe = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = btEtRe.exec(raw)) !== null && text.length < 500000) {
      const block = m[1];
      const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
      let t;
      while ((t = tjRe.exec(block)) !== null) {
        const s = (t[1] || t[2] || '')
          .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
          .replace(/\\(.)/g, '$1');
        text += s + ' ';
      }
    }

    // Strategy 2: fallback — scan for readable ASCII runs (catches simpler uncompressed PDFs)
    if (text.trim().length < 100) {
      const runs = raw.match(/[ -~]{8,}/g) || [];
      text = runs.filter(s => /[a-zA-Z ]{4,}/.test(s) && !/^[0-9 .]+$/.test(s)).join(' ');
    }

    return text.trim().length > 30 ? text.trim() : null;
  } catch (_) {
    return null;
  }
}

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function slugify(s) {
  return String(s || 'source')
    .replace(/[^a-z0-9_\-.]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

function splitIntoChunks(text, maxLen) {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= maxLen) return [t];
  const chunks = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + maxLen, t.length);
    if (end < t.length) {
      let br = t.lastIndexOf('\n\n', end);
      if (br <= start) br = t.lastIndexOf('\n', end);
      if (br <= start) br = t.lastIndexOf(' ', end);
      if (br > start) end = br;
    }
    const piece = t.slice(start, end).trim();
    if (piece.length) chunks.push(piece);
    start = end;
  }
  return chunks;
}

const FILE_ICONS = {
  pdf: '📄', docx: '📝', xlsx: '📊', xls: '📊', csv: '📊', json: '{ }', txt: '📃', md: '📃',
  html: '🌐', url: '🔗', crawl: '🕸️', folder: '📁',
  wiki: '📚', reference: '📖', chat: '💬', files: '📁', tasks: '✓', kb: '📚', custom: '📄',
  cpp: '⚙️', h: '⚙️', hpp: '⚙️', c: '⚙️', cs: '⚙️', py: '🐍', js: '📜', ts: '📜',
};

/** Align with ragService listSources() / RagView — sources use sourceId, sourceLabel, sourceKind. */
function normalizeSource(s) {
  const id = s.sourceId || s.id;
  const name = s.sourceLabel || s.name || id || 'source';
  const chunkCount = s.chunkCount || 0;
  const indexed = chunkCount > 0;
  const kind = String(s.sourceKind || s.type || 'custom').toLowerCase();
  const type = s.type || (kind === 'wiki' ? 'crawl' : kind === 'files' ? 'folder' : 'file');
  const fileType = s.fileType || kind;
  const isBundled = type === 'folder' || type === 'crawl' || kind === 'wiki';
  return {
    ...s,
    id,
    name,
    chunkCount,
    indexed,
    type,
    fileType,
    isBundled,
    active: s.active !== false,
  };
}

export default function KnowledgeSourcesPanel() {
  const [sources, setSources] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [crawlSite, setCrawlSite] = useState(true);
  const [maxPages, setMaxPages] = useState(2000);
  const [indexing, setIndexing] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [contextModal, setContextModal] = useState(null);
  const [contextCopied, setContextCopied] = useState(false);
  const [progress, setProgress] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);
  const [thoroughSearch, setThoroughSearch] = useState(false);
  const [importing, setImporting] = useState(false);
  const uid = useId();
  const filesInputId = `ks-files-${uid.replace(/:/g, '')}`;
  const folderInputId = `ks-folder-${uid.replace(/:/g, '')}`;

  const api = typeof window !== 'undefined' ? (window.electronAPI || window.appAPI) : null;

  const loadAiExtended = useCallback(async () => {
    try {
      const cfg = await api?.aiGetConfig?.();
      setThoroughSearch(cfg?.extendedMode === true);
    } catch (e) {
      setThoroughSearch(false);
    }
  }, [api]);

  useEffect(() => { loadSources(); }, []);
  useEffect(() => { loadAiExtended(); }, [loadAiExtended]);

  useEffect(() => {
    const cleanup = api?.onRagProgress?.((data) => {
      if (data.stage === 'done' || data.stage === 'error') {
        setProgress(null);
      } else {
        setProgress(data);
      }
    });
    return () => cleanup?.();
  }, [api]);

  async function loadSources() {
    setBridgeError(null);
    try {
      const list = await api?.ragCustomSources?.();
      const raw = Array.isArray(list) ? list : [];
      setSources(raw.map(normalizeSource));
    } catch (e) {
      setSources([]);
      setBridgeError(e?.message || 'Failed to list RAG sources');
    }
  }

  async function setExtendedMode(next) {
    setThoroughSearch(next);
    try {
      const cfg = await api?.aiGetConfig?.();
      await api?.aiSetConfig?.({ ...cfg, extendedMode: next });
    } catch (e) {
      setBridgeError(e?.message || 'Could not save AI extended mode');
    }
  }

  async function ingestFileList(fileList) {
    const add = api?.ragAddSource;
    if (typeof add !== 'function') {
      setBridgeError('RAG service is not loaded — enable the RAG extension or reload the app.');
      return;
    }
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    setImporting(true);
    setBridgeError(null);
    const skipped = [];
    let sourcesAdded = 0;

    try {
      for (const file of files) {
        const ext = fileExt(file.name);
        const isPdf = ext === '.pdf';
        const looksText = TEXT_EXTENSIONS.has(ext) || (file.type && file.type.startsWith('text/'));

        if (!isPdf && !looksText && ext !== '') {
          skipped.push(`${file.name} (unsupported format — use .txt, .md, .csv, .json, or similar text files)`);
          continue;
        }

        let text;
        if (isPdf) {
          text = await extractPdfText(file);
          if (!text) {
            skipped.push(`${file.name} (PDF extraction failed — scanned/image PDFs are not supported; try saving as .txt)`);
            continue;
          }
        } else {
          try {
            text = await file.text();
          } catch (e) {
            skipped.push(`${file.name} (read failed)`);
            continue;
          }
        }

        if (!text || text.trim().length < 3) {
          skipped.push(`${file.name} (empty or binary)`);
          continue;
        }

        const label = file.webkitRelativePath || file.name;
        const base = `custom_${slugify(label)}_${Date.now().toString(36)}`;
        const sourceId = base.slice(0, 120);
        const parts = splitIntoChunks(text, 6000);
        const chunks = parts.map((part, i) => ({
          id: `${sourceId}:${i}`,
          sourceId,
          sourceKind: 'custom',
          sourceLabel: label,
          title: parts.length > 1 ? `${file.name} (${i + 1}/${parts.length})` : file.name,
          text: part,
        }));

        const res = await add({ registry: 'personal', sourceId, chunks });
        if (res?.ok) sourcesAdded += 1;
        else skipped.push(`${file.name} (add failed)`);
      }

      if (skipped.length) {
        const msg = skipped.length <= 4
          ? skipped.join(' · ')
          : `${skipped.slice(0, 3).join(' · ')} · +${skipped.length - 3} more`;
        setBridgeError(`Some files were skipped: ${msg}`);
      }
      if (sourcesAdded > 0 && skipped.length === 0) setBridgeError(null);
    } finally {
      setImporting(false);
      await loadSources();
    }
  }

  function onFilesPicked(e) {
    const list = e.target.files;
    e.target.value = '';
    if (list?.length) ingestFileList(list);
  }

  function onFolderPicked(e) {
    const list = e.target.files;
    e.target.value = '';
    if (list?.length) ingestFileList(list);
  }

  async function addUrl() {
    if (!urlInput.trim()) return;
    setCrawling(true);
    const res = await api?.ragAddUrl?.({ url: urlInput.trim(), crawl: crawlSite, maxPages, maxDepth: 2 });
    setCrawling(false);
    if (res?.ok) {
      setUrlInput('');
      setShowUrl(false);
      loadSources();
    } else if (res?.error) {
      alert(res.error);
    }
  }

  async function toggleSource(id, active) {
    await api?.ragToggleSource?.({ id, active });
    loadSources();
  }

  async function addToSource(sourceId, type) {
    const res = await api?.ragAddToSource?.({ sourceId, type });
    if (res?.ok) loadSources();
    else if (res?.error) alert(res.error);
  }

  async function buildIndex() {
    setIndexing(true);
    setBridgeError(null);
    try {
      const res = await api?.ragIndexCustom?.();
      if (res && res.ok === false && res.error) setBridgeError(res.error);
    } catch (e) {
      setBridgeError(e?.message || 'Index failed');
    } finally {
      setIndexing(false);
      loadSources();
    }
  }

  async function generateContext() {
    const res = await api?.ragGenerateContext?.();
    if (res?.ok) {
      setContextModal(res.context);
      setContextCopied(false);
    } else if (res?.error) {
      alert(res.error);
    }
  }

  function copyContext() {
    if (contextModal) {
      navigator.clipboard.writeText(contextModal);
      setContextCopied(true);
      setTimeout(() => setContextCopied(false), 2000);
    }
  }

  function saveContextFile() {
    if (!contextModal) return;
    const blob = new Blob([contextModal], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rag-integration-context.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeSources = sources.filter((s) => s.active !== false);
  const totalChunks = activeSources.reduce((sum, c) => sum + (c.chunkCount || 0), 0);
  const indexedCount = activeSources.filter((s) => s.indexed).length;

  return (
    <div className="mt-3 rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4 space-y-3">
      {bridgeError && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          {bridgeError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Manage Sources</h4>
          <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark mt-0.5">
            {activeSources.length}/{sources.length} active · {indexedCount} indexed · {totalChunks.toLocaleString()} chunks
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <label className="flex items-center gap-2 cursor-pointer" title="Slower, deeper RAG in AI Chat (extended mode)">
            <button
              type="button"
              onClick={() => setExtendedMode(!thoroughSearch)}
              className={`w-8 h-4 rounded-full transition-colors relative ${thoroughSearch ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${thoroughSearch ? 'left-[17px]' : 'left-0.5'}`} />
            </button>
            <span className="text-[10px] text-hp-muted dark:text-hp-muted-dark whitespace-nowrap">Thorough search</span>
          </label>
          <button
            onClick={generateContext}
            className="px-3 py-1.5 text-xs font-medium border border-amber-400 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors flex items-center gap-1.5"
            title="Generate integration instructions for external apps"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.04a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" /></svg>
            Auto Context
          </button>
          {sources.length > 0 && (
            <button
              onClick={buildIndex}
              disabled={indexing}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center gap-1.5"
            >
              {indexing ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Indexing...
                </>
              ) : (
                'Build Knowledge'
              )}
            </button>
          )}
        </div>
      </div>

      {(indexing || progress) && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
              {progress ? (
                <>
                  {progress.stage === 'parsing' && (progress.name || 'Parsing files...')}
                  {progress.stage === 'scanning' && (progress.name || 'Scanning files...')}
                  {progress.stage === 'scan-done' && (progress.name || 'Scan complete')}
                  {progress.stage === 'chunking' && `Chunking ${progress.sourceType || 'source'}... (${(progress.chunked || 0).toLocaleString()} chunks)`}
                  {progress.stage === 'chunking-done' && `Chunked: ${(progress.newChunks || 0).toLocaleString()} new, ${(progress.reused || 0).toLocaleString()} cached`}
                  {progress.stage === 'embedding' && (progress.name || `Embedding ${progress.sourceType || 'source'}...`)}
                  {progress.stage === 'starting' && 'Starting indexer...'}
                  {progress.phase === 'crawling' && `Crawling: ${progress.url || ''}...`}
                  {!['parsing', 'scanning', 'scan-done', 'chunking', 'chunking-done', 'embedding', 'starting'].includes(progress.stage) && !progress.phase && (progress.stage || 'Working...')}
                </>
              ) : (
                'Indexing...'
              )}
            </span>
          </div>
          {progress?.shardName && (
            <div className="flex items-center gap-1.5 ml-5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono truncate">
                shard: {progress.shardName}
              </span>
            </div>
          )}
          {progress?.stage === 'embedding' && progress.total > 0 && (
            <div className="space-y-1">
              <div className="w-full h-1.5 bg-blue-200 dark:bg-blue-900/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(((progress.embedded || 0) + (progress.reused || 0)) / progress.total * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-blue-500 dark:text-blue-400 text-right">
                {((progress.embedded || 0) + (progress.reused || 0)).toLocaleString()} / {progress.total.toLocaleString()} chunks
                {progress.reused > 0 && ` (${progress.reused.toLocaleString()} cached)`}
              </p>
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sources.map((s) => {
            const isActive = s.active !== false;
            const isBundled = s.isBundled;
            return (
              <div key={s.id} className={`rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 group transition-colors ${!isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="text-xs w-5 text-center shrink-0">{FILE_ICONS[s.fileType] || FILE_ICONS[s.type] || '📄'}</span>
                  <span className="text-xs text-hp-text dark:text-hp-text-dark truncate flex-1 min-w-0 font-medium" title={s.name}>{s.name}</span>
                  {s.registry && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                      {s.registry}
                    </span>
                  )}
                  {isBundled && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 shrink-0">
                      {s.type === 'folder' ? `${s.fileCount || '?'} files` : `${s.pageCount || '?'} pages`}
                      {s.shardCount > 1 && ` · ${s.shardCount} shards`}
                    </span>
                  )}
                  {s.indexed ? (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                      {(s.chunkCount || 0).toLocaleString()} chunks
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 shrink-0">not indexed</span>
                  )}
                  {isBundled && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          const menu = e.currentTarget.nextElementSibling;
                          menu.classList.toggle('hidden');
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded text-hp-muted dark:text-hp-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                        title="Add to this source"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      </button>
                      <div className="hidden absolute right-0 top-6 z-10 bg-white dark:bg-gray-800 border border-hp-border dark:border-hp-border-dark rounded-lg shadow-lg py-1 min-w-[120px]">
                        <button type="button" onClick={(e) => { e.currentTarget.parentElement.classList.add('hidden'); addToSource(s.id, 'folder'); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Add subfolder</button>
                        <button type="button" onClick={(e) => { e.currentTarget.parentElement.classList.add('hidden'); addToSource(s.id, 'files'); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Add files</button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSource(s.id, !isActive)}
                    className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    title={isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isActive ? 'left-[13px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 relative z-20">
        <input
          id={filesInputId}
          type="file"
          multiple
          disabled={importing}
          style={SR_ONLY}
          accept=".pdf,.txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.mjs,.cjs,.html,.htm,.xml,.css,.yaml,.yml,.ini,.log,.sql,.py,.rs,.go,.c,.h,.cpp,.hpp,.cs,.lua,.uproject,.uplugin,.usf,.hlsl"
          onChange={onFilesPicked}
        />
        <label
          htmlFor={filesInputId}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors select-none ${importing ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {importing ? (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          )}
          {importing ? 'Importing…' : 'Files'}
        </label>
        <input
          id={folderInputId}
          type="file"
          multiple
          disabled={importing}
          style={SR_ONLY}
          {...{ webkitdirectory: '' }}
          onChange={onFolderPicked}
        />
        <label
          htmlFor={folderInputId}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors select-none ${importing ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
          Folder
        </label>
        <button type="button" onClick={() => setShowUrl(!showUrl)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.04a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" /></svg>
          URL / Wiki
        </button>
      </div>

      {showUrl && (
        <div className="space-y-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-hp-border dark:border-hp-border-dark">
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !crawling && addUrl()}
              placeholder="https://hogwarts-legacy.fandom.com/wiki/..."
              className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded-lg text-hp-text dark:text-hp-text-dark placeholder-gray-400 focus:outline-none focus:border-blue-500"
              disabled={crawling}
            />
            <button type="button" onClick={addUrl} disabled={crawling || !urlInput.trim()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors">
              {crawling ? 'Crawling...' : 'Add'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => setCrawlSite(!crawlSite)} className={`w-8 h-4 rounded-full transition-colors relative ${crawlSite ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${crawlSite ? 'left-[17px]' : 'left-0.5'}`} />
              </button>
              <span className="text-[11px] text-hp-muted dark:text-hp-muted-dark">Crawl entire site</span>
            </label>
            {crawlSite && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-hp-muted dark:text-hp-muted-dark">Max pages:</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 2000)))}
                  className="w-16 px-2 py-0.5 text-[10px] bg-white dark:bg-gray-950 border border-hp-border dark:border-hp-border-dark rounded text-hp-text dark:text-hp-text-dark text-center focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
          <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark">
            {crawlSite ? 'Fandom/MediaWiki sites are auto-detected and scraped via API when the desktop indexer supports it.' : 'Only this single page will be scraped.'}
          </p>
        </div>
      )}

      {sources.length === 0 && !showUrl && (
        <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark text-center py-2">
          Add files, URLs, or wiki sites to expand the AI&apos;s knowledge. Connect a shared RAG path under the RAG Engine view, or use the buttons above when the native indexer is available.
        </p>
      )}

      {contextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setContextModal(null)} role="presentation">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-hp-border dark:border-hp-border-dark w-[700px] max-h-[80vh] flex flex-col mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between px-5 py-4 border-b border-hp-border dark:border-hp-border-dark">
              <div>
                <h3 className="text-sm font-bold text-hp-text dark:text-hp-text-dark">RAG Integration Context</h3>
                <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark mt-0.5">Give this to any external app so it knows how to query your knowledge base</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={copyContext} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${contextCopied ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                  {contextCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                      Copy
                    </>
                  )}
                </button>
                <button type="button" onClick={saveContextFile} className="px-3 py-1.5 text-xs font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Save .md
                </button>
                <button type="button" onClick={() => setContextModal(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-hp-muted dark:text-hp-muted-dark hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-[11px] leading-relaxed text-hp-text dark:text-hp-text-dark whitespace-pre-wrap font-mono">{contextModal}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

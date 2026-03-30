import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTheme, W } from '../theme/ThemeProvider';

var STORAGE_KEY = 'quickLinks_v1';
var FOLDERS_KEY = 'quickLinks_folders_v1';
var APP_CACHE_KEY = 'quickLinks_appCache_v1';
var CATEGORIES = ['Website', 'App', 'Confluence', 'Jira'];

var ICON_GLOBE = String.fromCodePoint(0x1F310);
var ICON_LAPTOP = String.fromCodePoint(0x1F4BB);
var ICON_BOOK = String.fromCodePoint(0x1F4D8);
var ICON_TARGET = String.fromCodePoint(0x1F3AF);
var ICON_LINK = String.fromCodePoint(0x1F517);
var ICON_SEARCH = String.fromCodePoint(0x1F50D);
var ICON_PIN = String.fromCodePoint(0x1F4CC);
var ICON_DASH = '\u2014';
var ICON_DOT = '\u00B7';
var ICON_ROCKET = String.fromCodePoint(0x1F680);
var ICON_CLIPBOARD = String.fromCodePoint(0x1F4CB);
var ICON_CHECK = String.fromCodePoint(0x2705);
var ICON_EXTERNAL = String.fromCodePoint(0x1F517);
var ICON_PLAY = String.fromCodePoint(0x25B6);
var ICON_FOLDER = String.fromCodePoint(0x1F4C1);
var ICON_FOLDER_OPEN = String.fromCodePoint(0x1F4C2);
var ICON_CHEVRON_RIGHT = '\u25B8';
var ICON_CHEVRON_DOWN = '\u25BE';
var ICON_DRAG = '\u2630';

var CATEGORY_ICONS = { Website: ICON_GLOBE, App: ICON_LAPTOP, Confluence: ICON_BOOK, Jira: ICON_TARGET };

// ---------------------------------------------------------------------------
// URL parsing helpers
// ---------------------------------------------------------------------------

function parseConfluenceUrl(url) {
  if (!url) return null;
  try {
    var m1 = url.match(/\/display\/([^/]+)\/(.+?)(?:\?|#|$)/);
    if (m1) return { space: decodeURIComponent(m1[1]), title: decodeURIComponent(m1[2]).replace(/\+/g, ' ') };
    var m2 = url.match(/\/wiki\/spaces\/([^/]+)\/pages\/\d+\/(.+?)(?:\?|#|$)/);
    if (m2) return { space: decodeURIComponent(m2[1]), title: decodeURIComponent(m2[2]).replace(/\+/g, ' ') };
    var m3 = url.match(/\/wiki\/spaces\/([^/]+)/);
    if (m3) return { space: decodeURIComponent(m3[1]), title: '' };
  } catch (e) { /* ignore */ }
  return null;
}

function parseJiraUrl(url) {
  if (!url) return null;
  try {
    var m = url.match(/\/(browse|issue)\/([A-Z][A-Z0-9]+-\d+)/);
    if (m) return { ticketId: m[2] };
    var m2 = url.match(/selectedIssue=([A-Z][A-Z0-9]+-\d+)/);
    if (m2) return { ticketId: m2[1] };
  } catch (e) { /* ignore */ }
  return null;
}

function getAppDisplayName(url) {
  if (!url) return '';
  var parts = url.replace(/\\/g, '/').split('/');
  var file = parts[parts.length - 1] || '';
  return file.replace(/\.exe$/i, '').replace(/\.lnk$/i, '');
}

// ---------------------------------------------------------------------------
// Data loaders for Confluence & Jira pickers
// ---------------------------------------------------------------------------

function loadConfluencePages() {
  var api = window.appAPI;
  if (!api) return Promise.resolve({ pages: [], domain: null });
  return Promise.all([
    typeof api.confluenceGetData === 'function' ? api.confluenceGetData() : Promise.resolve(null),
    typeof api.confluenceGetStatus === 'function' ? api.confluenceGetStatus() : Promise.resolve(null),
  ]).then(function (results) {
    var data = results[0];
    var status = results[1];
    var pages = (data && data.pages) || [];
    var domain = (status && status.domain) || null;
    return { pages: pages, domain: domain };
  }).catch(function () { return { pages: [], domain: null }; });
}

function buildConfluenceUrl(domain, page) {
  if (!domain || !page) return '';
  var base = domain.startsWith('http') ? domain : ('https://' + domain);
  base = base.replace(/\/+$/, '');
  var slug = (page.title || '').replace(/\s+/g, '+');
  return base + '/wiki/spaces/' + (page.space || '') + '/pages/' + page.id + '/' + slug;
}

function loadJiraIssues() {
  try {
    var raw = localStorage.getItem('avalanche-jira/v1/blob');
    if (!raw) return { issues: [], baseUrl: null };
    var blob = JSON.parse(raw);
    var issues = (blob && blob.meta && blob.meta.fetched_issues) || [];
    var cfgRaw = localStorage.getItem('avalanche-jira-config-overlay');
    var cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
    return { issues: issues, baseUrl: cfg.jiraBaseUrl || null };
  } catch (e) { return { issues: [], baseUrl: null }; }
}

function buildJiraUrl(baseUrl, issueKey) {
  if (!baseUrl || !issueKey) return '';
  var base = String(baseUrl).replace(/\/+$/, '');
  return base + '/browse/' + issueKey;
}

// ---------------------------------------------------------------------------
// Per-category visit actions
// ---------------------------------------------------------------------------

function visitLink(link) {
  var api = window.appAPI;
  if (!api) return;

  switch (link.category) {
    case 'Website':
      api.openExternal(link.url);
      break;
    case 'App':
      var path = link.url;
      api.tauriInvoke('marketplace_path_exists', { path: path }).then(function (exists) {
        if (exists) {
          var escaped = path.replace(/'/g, "''");
          api.tauriInvoke('run_powershell', { script: "Start-Process '" + escaped + "'" });
        } else {
          var parent = path.replace(/\\/g, '/').split('/').slice(0, -1).join('\\');
          if (parent) api.tauriInvoke('open_in_explorer', { path: parent });
        }
      });
      break;
    case 'Confluence':
      if (api.navigateToView) api.navigateToView('confluence');
      if (link.url && /^https?:\/\//i.test(link.url)) api.openExternal(link.url);
      break;
    case 'Jira':
      if (api.navigateToView) api.navigateToView('avalanche-jira-view');
      if (link.url && /^https?:\/\//i.test(link.url)) api.openExternal(link.url);
      break;
    default:
      api.openExternal(link.url);
  }
}

// ---------------------------------------------------------------------------
// PowerShell app scanner
// ---------------------------------------------------------------------------

var PS_SCAN_SCRIPT = [
  '$shell = New-Object -ComObject WScript.Shell;',
  '$dirs = @(',
  '  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",',
  '  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs"',
  ');',
  '$results = @();',
  'foreach ($d in $dirs) {',
  '  if (!(Test-Path $d)) { continue }',
  '  Get-ChildItem -Path $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {',
  '    try {',
  '      $lnk = $shell.CreateShortcut($_.FullName);',
  '      $t = $lnk.TargetPath;',
  '      if ($t -and $t -match "\\.exe$") {',
  '        $results += [PSCustomObject]@{ name = $_.BaseName; path = $t }',
  '      }',
  '    } catch {}',
  '  }',
  '}',
  '$results | Sort-Object name -Unique | ConvertTo-Json -Compress'
].join(' ');

function scanInstalledApps() {
  var api = window.appAPI;
  if (!api || !api.tauriInvoke) return Promise.resolve([]);
  return api.tauriInvoke('run_powershell', { script: PS_SCAN_SCRIPT }).then(function (res) {
    if (!res || res.exit_code !== 0) return [];
    try {
      var out = (res.stdout || '').trim();
      if (!out) return [];
      var parsed = JSON.parse(out);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }).catch(function () { return []; });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadLinks() {
  try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
function saveLinks(links) { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)); }

function loadFolders() {
  try { var raw = localStorage.getItem(FOLDERS_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
function saveFolders(folders) { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); }

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function normalizeUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-zA-Z]:\\/.test(url) || /^\\\\/.test(url)) return url;
  return 'https://' + url;
}

// ---------------------------------------------------------------------------
// AppPicker -- searchable list of installed apps
// ---------------------------------------------------------------------------

function AppPicker({ onSelect, t }) {
  const [apps, setApps] = useState(null);
  const [filter, setFilter] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(function () {
    try {
      var cached = localStorage.getItem(APP_CACHE_KEY);
      if (cached) { setApps(JSON.parse(cached)); return; }
    } catch (e) { /* ignore */ }
    setScanning(true);
    scanInstalledApps().then(function (list) {
      setApps(list);
      setScanning(false);
      try { localStorage.setItem(APP_CACHE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    });
  }, []);

  var filtered = useMemo(function () {
    if (!apps) return [];
    if (!filter.trim()) return apps;
    var q = filter.toLowerCase();
    return apps.filter(function (a) { return a.name.toLowerCase().indexOf(q) >= 0 || a.path.toLowerCase().indexOf(q) >= 0; });
  }, [apps, filter]);

  if (scanning || apps === null) {
    return (
      <div className="text-center py-6 text-hp-muted dark:text-hp-muted-dark text-sm">
        {ICON_ROCKET + ' ' + t('Scanning installed apps...')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={filter}
        onChange={function (e) { setFilter(e.target.value); }}
        placeholder={t('Search installed apps') + '...'}
        className={'w-full px-3 py-2 rounded-lg border border-hp-border dark:border-hp-border-dark text-sm ' +
          'bg-white dark:bg-hp-card-dark text-hp-text dark:text-hp-text-dark ' +
          'placeholder-hp-muted dark:placeholder-hp-muted-dark focus:outline-none focus:ring-2 focus:ring-hp-accent dark:focus:ring-hp-accent-dark'}
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-hp-border dark:border-hp-border-dark">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-hp-muted dark:text-hp-muted-dark">
            {apps.length === 0 ? t('No apps found') : t('No apps match your search')}
          </div>
        ) : filtered.map(function (app, i) {
          return (
            <button key={app.path + i} onClick={function () { onSelect(app); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-hp-accent/10 dark:hover:bg-hp-accent-dark/10 transition-colors border-b border-hp-border dark:border-hp-border-dark last:border-b-0">
              <span className="text-sm">{ICON_LAPTOP}</span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-hp-text dark:text-hp-text-dark truncate">{app.name}</span>
                <span className="block text-[10px] text-hp-muted dark:text-hp-muted-dark truncate">{app.path}</span>
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={function () {
        setScanning(true);
        localStorage.removeItem(APP_CACHE_KEY);
        scanInstalledApps().then(function (list) {
          setApps(list);
          setScanning(false);
          try { localStorage.setItem(APP_CACHE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
        });
      }} className="text-xs text-hp-muted dark:text-hp-muted-dark hover:text-hp-accent dark:hover:text-hp-accent-dark transition-colors">
        {t('Rescan apps')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfluencePicker -- searchable list of synced Confluence pages
// ---------------------------------------------------------------------------

function ConfluencePicker({ onSelect, t }) {
  const [pages, setPages] = useState(null);
  const [domain, setDomain] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    loadConfluencePages().then(function (result) {
      setPages(result.pages);
      setDomain(result.domain);
      setLoading(false);
    });
  }, []);

  var filtered = useMemo(function () {
    if (!pages) return [];
    if (!filter.trim()) return pages.slice(0, 100);
    var q = filter.toLowerCase();
    return pages.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(q) >= 0 || (p.space || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 100);
  }, [pages, filter]);

  if (loading) {
    return (
      <div className="text-center py-6 text-hp-muted dark:text-hp-muted-dark text-sm">
        {ICON_BOOK + ' ' + t('Loading Confluence pages...')}
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="text-center py-6 text-hp-muted dark:text-hp-muted-dark text-sm">
        <p>{ICON_BOOK + ' ' + t('No Confluence pages found.')}</p>
        <p className="text-xs mt-1">{t('Connect and sync Confluence from the Confluence extension first.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={filter}
        onChange={function (e) { setFilter(e.target.value); }}
        placeholder={t('Search pages by title or space') + '...'}
        className={'w-full px-3 py-2 rounded-lg border border-hp-border dark:border-hp-border-dark text-sm ' +
          'bg-white dark:bg-hp-card-dark text-hp-text dark:text-hp-text-dark ' +
          'placeholder-hp-muted dark:placeholder-hp-muted-dark focus:outline-none focus:ring-2 focus:ring-hp-accent dark:focus:ring-hp-accent-dark'}
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-hp-border dark:border-hp-border-dark">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-hp-muted dark:text-hp-muted-dark">
            {t('No pages match your search')}
          </div>
        ) : filtered.map(function (page, i) {
          return (
            <button key={(page.id || '') + i} onClick={function () { onSelect({ title: page.title, space: page.space, url: buildConfluenceUrl(domain, page) }); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-hp-accent/10 dark:hover:bg-hp-accent-dark/10 transition-colors border-b border-hp-border dark:border-hp-border-dark last:border-b-0">
              <span className="text-sm flex-shrink-0">{ICON_BOOK}</span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-hp-text dark:text-hp-text-dark truncate">{page.title}</span>
                <span className="block text-[10px] text-hp-muted dark:text-hp-muted-dark truncate">{page.space || 'Unknown space'}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark">{pages.length + ' page' + (pages.length !== 1 ? 's' : '') + ' synced'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JiraPicker -- searchable list of synced Jira tickets
// ---------------------------------------------------------------------------

function JiraPicker({ onSelect, t }) {
  const [issues, setIssues] = useState(null);
  const [baseUrl, setBaseUrl] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(function () {
    var result = loadJiraIssues();
    setIssues(result.issues);
    setBaseUrl(result.baseUrl);
  }, []);

  var filtered = useMemo(function () {
    if (!issues) return [];
    if (!filter.trim()) return issues.slice(0, 100);
    var q = filter.toLowerCase();
    return issues.filter(function (iss) {
      var key = (iss['Issue key'] || iss['Issue id'] || '').toLowerCase();
      var summary = (iss.Summary || '').toLowerCase();
      var status = (iss.Status || '').toLowerCase();
      return key.indexOf(q) >= 0 || summary.indexOf(q) >= 0 || status.indexOf(q) >= 0;
    }).slice(0, 100);
  }, [issues, filter]);

  if (!issues || issues.length === 0) {
    return (
      <div className="text-center py-6 text-hp-muted dark:text-hp-muted-dark text-sm">
        <p>{ICON_TARGET + ' ' + t('No Jira tickets found.')}</p>
        <p className="text-xs mt-1">{t('Import tickets from the Avalanche Jira extension first.')}</p>
      </div>
    );
  }

  var statusColor = function (status) {
    var s = (status || '').toLowerCase();
    if (s === 'done' || s === 'closed' || s === 'resolved') return 'text-green-500 dark:text-green-400';
    if (s === 'in progress' || s === 'in review') return 'text-blue-500 dark:text-blue-400';
    return 'text-hp-muted dark:text-hp-muted-dark';
  };

  return (
    <div className="space-y-2">
      <input
        value={filter}
        onChange={function (e) { setFilter(e.target.value); }}
        placeholder={t('Search by ticket key, summary, or status') + '...'}
        className={'w-full px-3 py-2 rounded-lg border border-hp-border dark:border-hp-border-dark text-sm ' +
          'bg-white dark:bg-hp-card-dark text-hp-text dark:text-hp-text-dark ' +
          'placeholder-hp-muted dark:placeholder-hp-muted-dark focus:outline-none focus:ring-2 focus:ring-hp-accent dark:focus:ring-hp-accent-dark'}
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-hp-border dark:border-hp-border-dark">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-hp-muted dark:text-hp-muted-dark">
            {t('No tickets match your search')}
          </div>
        ) : filtered.map(function (iss, i) {
          var key = iss['Issue key'] || iss['Issue id'] || '';
          var summary = iss.Summary || '';
          var status = iss.Status || '';
          return (
            <button key={key + i} onClick={function () { onSelect({ key: key, summary: summary, url: buildJiraUrl(baseUrl, key) }); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-hp-accent/10 dark:hover:bg-hp-accent-dark/10 transition-colors border-b border-hp-border dark:border-hp-border-dark last:border-b-0">
              <span className="text-sm flex-shrink-0">{ICON_TARGET}</span>
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-hp-accent/15 dark:bg-hp-accent-dark/15 text-hp-accent dark:text-hp-accent-dark">{key}</span>
                  <span className="text-sm font-medium text-hp-text dark:text-hp-text-dark truncate">{summary}</span>
                </span>
                <span className={'block text-[10px] truncate mt-0.5 ' + statusColor(status)}>{status}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark">{issues.length + ' ticket' + (issues.length !== 1 ? 's' : '') + ' available'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkForm
// ---------------------------------------------------------------------------

function LinkForm({ initial, onSave, onCancel, folders, t }) {
  var _initName = initial ? initial.name : '';
  var _initUrl = initial ? initial.url : '';
  var _initCat = initial ? initial.category : 'Website';
  var _initFolder = initial ? (initial.folderId || '') : '';
  const [name, setName] = useState(_initName);
  const [url, setUrl] = useState(_initUrl);
  const [category, setCategory] = useState(_initCat);
  const [folderId, setFolderId] = useState(_initFolder);
  const nameRef = useRef(null);

  useEffect(function () { if (nameRef.current) nameRef.current.focus(); }, []);

  var handleSubmit = function (e) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onSave({ name: name.trim(), url: normalizeUrl(url.trim()), category: category, folderId: folderId || null });
  };

  var handleAppSelect = function (app) {
    setName(app.name);
    setUrl(app.path);
  };

  var handleConfluenceSelect = function (page) {
    setName(page.title || '');
    setUrl(page.url || '');
  };

  var handleJiraSelect = function (ticket) {
    setName(ticket.summary || ticket.key || '');
    setUrl(ticket.url || '');
  };

  var inputCls = 'w-full px-3 py-2.5 rounded-lg border border-hp-border dark:border-hp-border-dark text-sm ' +
    'bg-white dark:bg-hp-card-dark text-hp-text dark:text-hp-text-dark ' +
    'placeholder-hp-muted dark:placeholder-hp-muted-dark focus:outline-none focus:ring-2 focus:ring-hp-accent dark:focus:ring-hp-accent-dark';

  var showPicker = !initial && (category === 'App' || category === 'Confluence' || category === 'Jira');
  var urlLabel = category === 'App' ? t('Application Path') : t('URL');
  var urlPlaceholder = category === 'App' ? 'C:\\Program Files\\...' : 'https://...';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-hp-muted dark:text-hp-muted-dark mb-1.5 uppercase tracking-wide">
          {t('Category')}
        </label>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(function (cat) {
            var isActive = category === cat;
            var cls = 'px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer border ' +
              (isActive
                ? 'bg-hp-accent dark:bg-hp-accent-dark text-white border-transparent shadow-sm'
                : 'bg-transparent text-hp-muted dark:text-hp-muted-dark border-hp-border dark:border-hp-border-dark hover:border-hp-accent dark:hover:border-hp-accent-dark');
            return (
              <button key={cat} type="button" onClick={function () { setCategory(cat); }} className={cls}>
                {CATEGORY_ICONS[cat] + ' ' + cat}
              </button>
            );
          })}
        </div>
      </div>

      {folders && folders.length > 0 ? (
        <div>
          <label className="block text-xs font-semibold text-hp-muted dark:text-hp-muted-dark mb-1.5 uppercase tracking-wide">
            {t('Folder')}
          </label>
          <select value={folderId} onChange={function (e) { setFolderId(e.target.value); }}
            className={inputCls + ' cursor-pointer'}>
            <option value="">{t('None (root level)')}</option>
            {folders.map(function (f) {
              return <option key={f.id} value={f.id}>{ICON_FOLDER + ' ' + f.name}</option>;
            })}
          </select>
        </div>
      ) : null}

      {showPicker ? (
        <div>
          <label className="block text-xs font-semibold text-hp-muted dark:text-hp-muted-dark mb-1.5 uppercase tracking-wide">
            {category === 'App' ? t('Pick an installed app')
              : category === 'Confluence' ? t('Pick a Confluence page')
              : t('Pick a Jira ticket')}
          </label>
          {category === 'App' ? <AppPicker onSelect={handleAppSelect} t={t} /> : null}
          {category === 'Confluence' ? <ConfluencePicker onSelect={handleConfluenceSelect} t={t} /> : null}
          {category === 'Jira' ? <JiraPicker onSelect={handleJiraSelect} t={t} /> : null}
          {(name || url) ? (
            <div className="mt-2 px-3 py-2 rounded-lg bg-hp-accent/5 dark:bg-hp-accent-dark/5 border border-hp-accent/20 dark:border-hp-accent-dark/20 text-xs text-hp-text dark:text-hp-text-dark">
              {ICON_PIN + ' Selected: '}<strong>{name}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-hp-muted dark:text-hp-muted-dark mb-1.5 uppercase tracking-wide">
            {t('Name')}
          </label>
          <input ref={nameRef} value={name} onChange={function (e) { setName(e.target.value); }}
            placeholder={category === 'Confluence' ? t('Select a page above or type a name')
              : category === 'Jira' ? t('Select a ticket above or type a name')
              : 'e.g. Sprint Board'}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-hp-muted dark:text-hp-muted-dark mb-1.5 uppercase tracking-wide">
            {urlLabel}
          </label>
          <input value={url} onChange={function (e) { setUrl(e.target.value); }}
            placeholder={category === 'Confluence' ? t('Auto-filled from selection, or paste URL')
              : category === 'Jira' ? t('Auto-filled from selection, or paste URL')
              : urlPlaceholder}
            className={inputCls} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-hp-muted dark:text-hp-muted-dark hover:bg-hp-bg dark:hover:bg-hp-card-dark transition-colors">
          {t('Cancel')}
        </button>
        <button type="submit" disabled={!name.trim() || !url.trim()}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-hp-accent dark:bg-hp-accent-dark text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
          {initial ? t('Save') : t('Add')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// FolderSection -- collapsible folder header with inline rename/delete
// ---------------------------------------------------------------------------

function FolderSection({ folder, linkCount, collapsed, onToggle, onRename, onDelete, isDropTarget, children, t }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const inputRef = useRef(null);

  useEffect(function () {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  var handleRenameSubmit = function () {
    var trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) onRename(folder.id, trimmed);
    setEditing(false);
  };

  var headerBorder = isDropTarget
    ? 'border-hp-accent dark:border-hp-accent-dark bg-hp-accent/10 dark:bg-hp-accent-dark/10'
    : 'border-hp-border dark:border-hp-border-dark bg-hp-bg dark:bg-hp-bg-dark';

  return (
    <div className="space-y-1.5">
      <div data-drop-target={folder.id} onClick={function () { onToggle(folder.id); }}
        className={'flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors cursor-pointer ' + headerBorder}>
        <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className="text-xs text-hp-muted dark:text-hp-muted-dark select-none">
            {collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN}
          </span>
          <span className="text-sm select-none">
            {collapsed ? ICON_FOLDER : ICON_FOLDER_OPEN}
          </span>
          {editing ? (
            <input ref={inputRef} value={editName}
              onChange={function (e) { setEditName(e.target.value); }}
              onBlur={handleRenameSubmit}
              onKeyDown={function (e) {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') { setEditName(folder.name); setEditing(false); }
              }}
              onClick={function (e) { e.stopPropagation(); }}
              className="text-sm font-semibold text-hp-text dark:text-hp-text-dark bg-transparent border-b border-hp-accent dark:border-hp-accent-dark outline-none px-0.5 min-w-0 flex-1"
            />
          ) : (
            <span className="text-sm font-semibold text-hp-text dark:text-hp-text-dark truncate">
              {folder.name}
            </span>
          )}
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-hp-muted dark:text-hp-muted-dark bg-hp-border/30 dark:bg-hp-border-dark/30">
            {linkCount}
          </span>
        </div>

        {isDropTarget ? (
          <span className="text-[10px] font-medium text-hp-accent dark:text-hp-accent-dark flex-shrink-0 px-1">
            {t('Drop here')}
          </span>
        ) : null}

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={function (e) { e.stopPropagation(); setEditName(folder.name); setEditing(true); }} title={t('Rename')}
            className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-hp-muted dark:text-hp-muted-dark hover:text-hp-accent dark:hover:text-hp-accent-dark hover:bg-hp-accent/10 dark:hover:bg-hp-accent-dark/10 transition-colors">
            {"E"}
          </button>
          <button onClick={function (e) { e.stopPropagation(); onDelete(folder.id); }} title={t('Delete folder (links move to root)')}
            className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-hp-muted dark:text-hp-muted-dark hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            {"X"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="pl-4 space-y-1.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-action helpers (split out so LinkCard can call them individually)
// ---------------------------------------------------------------------------

function actionOpenInLedger(link) {
  var api = window.appAPI;
  if (!api || !api.navigateToView) return;
  if (link.category === 'Confluence') api.navigateToView('confluence');
  else if (link.category === 'Jira') api.navigateToView('avalanche-jira-view');
}

function actionOpenExternal(link) {
  var api = window.appAPI;
  if (!api) return;
  if (link.category === 'App') {
    var path = link.url;
    api.tauriInvoke('marketplace_path_exists', { path: path }).then(function (exists) {
      if (exists) {
        var escaped = path.replace(/'/g, "''");
        api.tauriInvoke('run_powershell', { script: "Start-Process '" + escaped + "'" });
      } else {
        var parent = path.replace(/\\/g, '/').split('/').slice(0, -1).join('\\');
        if (parent) api.tauriInvoke('open_in_explorer', { path: parent });
      }
    });
  } else {
    if (link.url && /^https?:\/\//i.test(link.url)) api.openExternal(link.url);
  }
}

function actionCopyLink(link) {
  var text = link.url || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {});
  }
}

// ---------------------------------------------------------------------------
// ActionPill -- small labeled button used inside LinkCard
// ---------------------------------------------------------------------------

var ACTION_PILL_BASE = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all border ';
var ACTION_PILL_DEFAULT = ACTION_PILL_BASE +
  'text-hp-muted dark:text-hp-muted-dark border-hp-border dark:border-hp-border-dark ' +
  'hover:text-hp-accent dark:hover:text-hp-accent-dark hover:border-hp-accent dark:hover:border-hp-accent-dark hover:bg-hp-accent/5 dark:hover:bg-hp-accent-dark/5';
var ACTION_PILL_PRIMARY = ACTION_PILL_BASE +
  'text-hp-accent dark:text-hp-accent-dark border-hp-accent/30 dark:border-hp-accent-dark/30 ' +
  'bg-hp-accent/5 dark:bg-hp-accent-dark/5 hover:bg-hp-accent/15 dark:hover:bg-hp-accent-dark/15';

// ---------------------------------------------------------------------------
// LinkCard -- category-aware display with explicit action buttons
// ---------------------------------------------------------------------------

function LinkCard({ link, onVisit, onPin, onEdit, onDelete, onDragStart, isDragging, t }) {
  var catIcon = CATEGORY_ICONS[link.category] || ICON_LINK;
  var visitCount = link.visits || 0;
  const [copied, setCopied] = useState(false);

  var subtitle = link.url;
  var badge = null;

  if (link.category === 'Jira') {
    var jp = parseJiraUrl(link.url);
    if (jp) badge = jp.ticketId;
  } else if (link.category === 'Confluence') {
    var cp = parseConfluenceUrl(link.url);
    if (cp && cp.space) badge = cp.space;
    if (cp && cp.title) subtitle = cp.title;
  } else if (link.category === 'App') {
    subtitle = getAppDisplayName(link.url) || link.url;
  }

  var handleCopy = function () {
    actionCopyLink(link);
    setCopied(true);
    setTimeout(function () { setCopied(false); }, 1500);
  };

  var hasLedgerView = link.category === 'Confluence' || link.category === 'Jira';
  var isApp = link.category === 'App';

  var cardOpacity = isDragging ? 'opacity-40 scale-95' : '';

  return (
    <div className={'group flex items-start gap-2 px-4 py-3 rounded-xl bg-white dark:bg-hp-card-dark border border-hp-border dark:border-hp-border-dark hover:border-hp-accent dark:hover:border-hp-accent-dark hover:shadow-md transition-all ' + cardOpacity}>
      <span
        onPointerDown={function (e) { if (onDragStart) onDragStart(link.id, e); }}
        className="flex-shrink-0 select-none text-hp-muted dark:text-hp-muted-dark cursor-grab active:cursor-grabbing mt-1 text-xs touch-none"
        title={t('Drag to move')}>
        {ICON_DRAG}
      </span>
      <span className="text-lg flex-shrink-0 select-none w-7 text-center mt-0.5" title={link.category}>
        {catIcon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-hp-text dark:text-hp-text-dark truncate">
            {link.pinned ? ICON_PIN + ' ' : ''}{link.name}
          </span>
          {badge ? (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-hp-accent/15 dark:bg-hp-accent-dark/15 text-hp-accent dark:text-hp-accent-dark">
              {badge}
            </span>
          ) : null}
        </div>
        <span className="block text-xs text-hp-muted dark:text-hp-muted-dark truncate mt-0.5 mb-2">
          {subtitle}
        </span>

        {/* Action buttons — always visible, labeled */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasLedgerView ? (
            <button onClick={function () { onVisit(link.id, 'ledger'); }} className={ACTION_PILL_PRIMARY}>
              {ICON_BOOK + ' ' + t('Open in Ledger')}
            </button>
          ) : null}

          {isApp ? (
            <button onClick={function () { onVisit(link.id, 'launch'); }} className={ACTION_PILL_PRIMARY}>
              {ICON_PLAY + ' ' + t('Launch App')}
            </button>
          ) : (
            <button onClick={function () { onVisit(link.id, 'browser'); }}
              className={hasLedgerView ? ACTION_PILL_DEFAULT : ACTION_PILL_PRIMARY}>
              {ICON_GLOBE + ' ' + t('Open in Browser')}
            </button>
          )}

          <button onClick={handleCopy} className={ACTION_PILL_DEFAULT}>
            {copied ? (ICON_CHECK + ' ' + t('Copied!')) : (ICON_CLIPBOARD + ' ' + t('Copy Link'))}
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 text-center min-w-[3rem] mt-0.5">
        <span className="block text-sm font-bold tabular-nums text-hp-text dark:text-hp-text-dark">
          {visitCount > 0 ? visitCount : ICON_DASH}
        </span>
        {visitCount > 0 ? (
          <span className="block text-[10px] text-hp-muted dark:text-hp-muted-dark leading-tight">
            {visitCount === 1 ? 'visit' : 'visits'}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <button onClick={function () { onPin(link.id); }} title={link.pinned ? t('Unpin') : t('Pin to top')}
          className={'w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors ' +
            (link.pinned
              ? 'text-hp-accent dark:text-hp-accent-dark bg-hp-accent/10 dark:bg-hp-accent-dark/10'
              : 'text-hp-muted dark:text-hp-muted-dark hover:text-hp-accent dark:hover:text-hp-accent-dark hover:bg-hp-bg dark:hover:bg-hp-bg-dark')}>
          {ICON_PIN}
        </button>
        <button onClick={function () { onEdit(link); }} title={t('Edit')}
          className="w-7 h-7 flex items-center justify-center rounded-md text-xs text-hp-muted dark:text-hp-muted-dark hover:text-hp-accent dark:hover:text-hp-accent-dark hover:bg-hp-bg dark:hover:bg-hp-bg-dark transition-colors">
          {"E"}
        </button>
        <button onClick={function () { onDelete(link.id); }} title={t('Delete')}
          className="w-7 h-7 flex items-center justify-center rounded-md text-xs text-hp-muted dark:text-hp-muted-dark hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          {"X"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickLinksView -- main view
// ---------------------------------------------------------------------------

function QuickLinksView() {
  var _theme = useTheme();
  var t = _theme.t;
  const [links, setLinks] = useState(loadLinks);
  const [folders, setFolders] = useState(loadFolders);
  const [collapsedFolders, setCollapsedFolders] = useState(function () {
    var map = {};
    var saved = loadFolders();
    for (var i = 0; i < saved.length; i++) { if (saved[i].collapsed) map[saved[i].id] = true; }
    return map;
  });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [draggingLinkId, setDraggingLinkId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const draggingRef = useRef(null);
  const ghostRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(function () { saveLinks(links); }, [links]);
  useEffect(function () { saveFolders(folders); }, [folders]);
  useEffect(function () {
    if (showFolderInput && folderInputRef.current) folderInputRef.current.focus();
  }, [showFolderInput]);

  var handleMoveToFolder = useCallback(function (linkId, folderId) {
    setLinks(function (prev) {
      return prev.map(function (l) {
        return l.id === linkId ? Object.assign({}, l, { folderId: folderId || null }) : l;
      });
    });
  }, []);

  // --- Pointer-event drag system ---
  function findDropTarget(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var dt = els[i].getAttribute('data-drop-target');
      if (dt) return dt;
    }
    return null;
  }

  function removeGhost() {
    var g = ghostRef.current;
    if (g) {
      try { if (typeof g.remove === 'function') g.remove(); else g.parentNode.removeChild(g); } catch (e) { /* */ }
      ghostRef.current = null;
    }
  }

  function endDrag() {
    draggingRef.current = null;
    setDraggingLinkId(null);
    setDropTarget(null);
    removeGhost();
  }

  var handleCardDragStart = useCallback(function (linkId, e) {
    e.preventDefault();
    draggingRef.current = linkId;
    setDraggingLinkId(linkId);

    var link = links.find(function (l) { return l.id === linkId; });
    var label = link ? link.name : '';
    var doc = document;
    var el = doc.createElement('div');
    el.textContent = ICON_DRAG + ' ' + label;
    var st = el.style;
    st.position = 'fixed';
    st.zIndex = '99999';
    st.pointerEvents = 'none';
    st.padding = '6px 12px';
    st.borderRadius = '8px';
    st.fontSize = '12px';
    st.fontWeight = '600';
    st.background = 'rgba(0,0,0,0.8)';
    st.color = '#fff';
    st.whiteSpace = 'nowrap';
    st.maxWidth = '220px';
    st.overflow = 'hidden';
    st.textOverflow = 'ellipsis';
    st.left = e.clientX + 12 + 'px';
    st.top = e.clientY - 10 + 'px';
    doc.body.appendChild(el);
    ghostRef.current = el;
  }, [links]);

  useEffect(function () {
    if (!draggingLinkId) return;

    var onMove = function (e) {
      if (!draggingRef.current) return;
      var g = ghostRef.current;
      if (g) {
        g.style.left = e.clientX + 12 + 'px';
        g.style.top = e.clientY - 10 + 'px';
      }
      var target = findDropTarget(e.clientX, e.clientY);
      setDropTarget(target);
    };

    var onUp = function (e) {
      if (!draggingRef.current) return;
      var linkId = draggingRef.current;
      var target = findDropTarget(e.clientX, e.clientY);
      if (target && linkId) {
        var folderId = target === '__root__' ? null : target;
        handleMoveToFolder(linkId, folderId);
      }
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', endDrag);

    return function () {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [draggingLinkId, handleMoveToFolder]);

  var handleAddFolder = function () {
    var trimmed = newFolderName.trim();
    if (!trimmed) return;
    setFolders(function (prev) {
      return prev.concat([{ id: makeId(), name: trimmed, collapsed: false, createdAt: Date.now() }]);
    });
    setNewFolderName('');
    setShowFolderInput(false);
  };

  var handleRenameFolder = useCallback(function (folderId, newName) {
    setFolders(function (prev) {
      return prev.map(function (f) { return f.id === folderId ? Object.assign({}, f, { name: newName }) : f; });
    });
  }, []);

  var handleDeleteFolder = useCallback(function (folderId) {
    setFolders(function (prev) { return prev.filter(function (f) { return f.id !== folderId; }); });
    setLinks(function (prev) {
      return prev.map(function (l) { return l.folderId === folderId ? Object.assign({}, l, { folderId: null }) : l; });
    });
  }, []);

  var handleToggleFolder = useCallback(function (folderId) {
    setCollapsedFolders(function (prev) {
      var next = Object.assign({}, prev);
      if (next[folderId]) delete next[folderId];
      else next[folderId] = true;
      return next;
    });
  }, []);

  var handleAdd = useCallback(function (data) {
    setLinks(function (prev) {
      return prev.concat([{ id: makeId(), name: data.name, url: data.url, category: data.category, folderId: data.folderId || null, visits: 0, pinned: false, createdAt: Date.now() }]);
    });
    setShowForm(false);
  }, []);

  var handleUpdate = useCallback(function (data) {
    setLinks(function (prev) {
      return prev.map(function (l) { return l.id === editing.id ? Object.assign({}, l, data) : l; });
    });
    setEditing(null);
  }, [editing]);

  var handleVisit = useCallback(function (id, action) {
    var link = null;
    setLinks(function (prev) {
      return prev.map(function (l) {
        if (l.id === id) { link = l; return Object.assign({}, l, { visits: l.visits + 1, lastVisited: Date.now() }); }
        return l;
      });
    });
    setTimeout(function () {
      if (!link) return;
      if (action === 'ledger') actionOpenInLedger(link);
      else if (action === 'launch') actionOpenExternal(link);
      else if (action === 'browser') actionOpenExternal(link);
      else visitLink(link);
    }, 0);
  }, []);

  var handlePin = useCallback(function (id) {
    setLinks(function (prev) {
      return prev.map(function (l) { return l.id === id ? Object.assign({}, l, { pinned: !l.pinned }) : l; });
    });
  }, []);

  var handleDelete = useCallback(function (id) {
    setLinks(function (prev) { return prev.filter(function (l) { return l.id !== id; }); });
  }, []);

  var filtered = useMemo(function () {
    var result = links;
    if (activeCategory !== 'All') {
      result = result.filter(function (l) { return l.category === activeCategory; });
    }
    if (search.trim()) {
      var q = search.toLowerCase();
      result = result.filter(function (l) {
        return l.name.toLowerCase().indexOf(q) >= 0 || l.url.toLowerCase().indexOf(q) >= 0;
      });
    }
    return result.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.visits - a.visits;
    });
  }, [links, activeCategory, search]);

  var grouped = useMemo(function () {
    var rootLinks = [];
    var byFolder = {};
    for (var i = 0; i < filtered.length; i++) {
      var l = filtered[i];
      if (l.folderId) {
        if (!byFolder[l.folderId]) byFolder[l.folderId] = [];
        byFolder[l.folderId].push(l);
      } else {
        rootLinks.push(l);
      }
    }
    var folderIds = folders.filter(function (f) {
      return byFolder[f.id] && byFolder[f.id].length > 0;
    }).map(function (f) { return f.id; });
    return { rootLinks: rootLinks, byFolder: byFolder, visibleFolderIds: folderIds };
  }, [filtered, folders]);

  var stats = useMemo(function () {
    var totalVisits = 0;
    for (var i = 0; i < links.length; i++) totalVisits += links[i].visits;
    var topLink = null;
    if (links.length) {
      topLink = links.slice().sort(function (a, b) { return b.visits - a.visits; })[0];
    }
    return { total: links.length, totalVisits: totalVisits, topLink: topLink };
  }, [links]);

  var allCats = ['All'].concat(CATEGORIES);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-hp-text dark:text-hp-text-dark">
          <W k="Quick Links" />
        </h1>
        <p className="text-sm text-hp-muted dark:text-hp-muted-dark mt-1">
          {stats.total + ' link' + (stats.total !== 1 ? 's' : '') + ' ' + ICON_DOT + ' ' + stats.totalVisits + ' total visit' + (stats.totalVisits !== 1 ? 's' : '')}
          {stats.topLink && stats.topLink.visits > 0
            ? ' ' + ICON_DOT + ' Top: ' + stats.topLink.name + ' (' + stats.topLink.visits + ')'
            : ''}
        </p>
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <input
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder={t('Search links') + '...'}
            className={'w-full pl-9 pr-4 py-2.5 rounded-xl border border-hp-border dark:border-hp-border-dark text-sm ' +
              'bg-white dark:bg-hp-card-dark text-hp-text dark:text-hp-text-dark ' +
              'placeholder-hp-muted dark:placeholder-hp-muted-dark focus:outline-none focus:ring-2 focus:ring-hp-accent dark:focus:ring-hp-accent-dark'}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-hp-muted dark:text-hp-muted-dark text-sm pointer-events-none">
            {ICON_SEARCH}
          </span>
        </div>
        <button onClick={function () { setShowFolderInput(true); }}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-hp-border dark:border-hp-border-dark text-hp-text dark:text-hp-text-dark hover:border-hp-accent dark:hover:border-hp-accent-dark transition-colors flex-shrink-0">
          {ICON_FOLDER + ' ' + t('New Folder')}
        </button>
        <button onClick={function () { setShowForm(true); setEditing(null); }}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-hp-accent dark:bg-hp-accent-dark text-white hover:opacity-90 transition-opacity shadow-sm flex-shrink-0">
          {'+ ' + t('Add Link')}
        </button>
      </div>

      {/* Inline folder creation */}
      {showFolderInput ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-hp-accent dark:border-hp-accent-dark bg-hp-bg dark:bg-hp-bg-dark">
          <span className="text-sm select-none">{ICON_FOLDER}</span>
          <input ref={folderInputRef} value={newFolderName}
            onChange={function (e) { setNewFolderName(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === 'Enter') handleAddFolder();
              if (e.key === 'Escape') { setNewFolderName(''); setShowFolderInput(false); }
            }}
            placeholder={t('Folder name') + '...'}
            className="flex-1 text-sm bg-transparent border-none outline-none text-hp-text dark:text-hp-text-dark placeholder-hp-muted dark:placeholder-hp-muted-dark"
          />
          <button onClick={handleAddFolder} disabled={!newFolderName.trim()}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-hp-accent dark:bg-hp-accent-dark text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
            {t('Create')}
          </button>
          <button onClick={function () { setNewFolderName(''); setShowFolderInput(false); }}
            className="px-2 py-1 rounded-lg text-xs text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark transition-colors">
            {t('Cancel')}
          </button>
        </div>
      ) : null}

      {/* Category filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {allCats.map(function (cat) {
          var isActive = activeCategory === cat;
          var count = cat === 'All' ? links.length : links.filter(function (l) { return l.category === cat; }).length;
          var cls = 'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ' +
            (isActive
              ? 'bg-hp-accent dark:bg-hp-accent-dark text-white border-transparent'
              : 'bg-transparent text-hp-muted dark:text-hp-muted-dark border-hp-border dark:border-hp-border-dark hover:border-hp-accent dark:hover:border-hp-accent-dark');
          var label = cat === 'All' ? cat : CATEGORY_ICONS[cat] + ' ' + cat;
          return (
            <button key={cat} onClick={function () { setActiveCategory(cat); }} className={cls}>
              {label + ' (' + count + ')'}
            </button>
          );
        })}
      </div>

      {/* Add / Edit Form */}
      {(showForm || editing) ? (
        <div className="rounded-xl border-2 border-hp-accent dark:border-hp-accent-dark bg-hp-bg dark:bg-hp-bg-dark p-5">
          <h2 className="text-sm font-bold text-hp-text dark:text-hp-text-dark mb-4">
            {editing ? t('Edit Link') : t('New Link')}
          </h2>
          <LinkForm
            initial={editing}
            onSave={editing ? handleUpdate : handleAdd}
            onCancel={function () { setShowForm(false); setEditing(null); }}
            folders={folders}
            t={t}
          />
        </div>
      ) : null}

      {/* Empty states */}
      {links.length === 0 && folders.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-hp-border dark:border-hp-border-dark">
          <p className="text-4xl mb-3 select-none">{ICON_LINK}</p>
          <p className="text-hp-text dark:text-hp-text-dark font-semibold text-sm mb-1">
            {t('No links yet')}
          </p>
          <p className="text-hp-muted dark:text-hp-muted-dark text-xs mb-4">
            {t('Add your frequently visited websites, apps, Confluence pages, or Jira tickets.')}
          </p>
          <button onClick={function () { setShowForm(true); setEditing(null); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-hp-accent dark:bg-hp-accent-dark text-white hover:opacity-90 transition-opacity">
            {'+ ' + t('Add your first link')}
          </button>
        </div>
      ) : null}

      {(links.length > 0 || folders.length > 0) && filtered.length === 0 && (search.trim() || activeCategory !== 'All') ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-hp-border dark:border-hp-border-dark">
          <p className="text-4xl mb-3 select-none">{ICON_SEARCH}</p>
          <p className="text-hp-muted dark:text-hp-muted-dark text-sm">
            {t('No links match your search.')}
          </p>
        </div>
      ) : null}

      {/* Link list + folder sections */}
      {filtered.length > 0 || (folders.length > 0 && !search.trim() && activeCategory === 'All') ? (
        <div className="space-y-3">
          {/* Root-level drop zone + links */}
          {folders.length > 0 ? (
            <div data-drop-target="__root__"
              className={'rounded-lg p-1 transition-colors ' + (draggingLinkId && dropTarget === '__root__'
                ? 'bg-hp-accent/10 dark:bg-hp-accent-dark/10 ring-2 ring-hp-accent/30 dark:ring-hp-accent-dark/30'
                : '')}>
              {draggingLinkId && dropTarget === '__root__' ? (
                <div className="text-center py-2 text-[11px] font-medium text-hp-accent dark:text-hp-accent-dark">
                  {t('Drop here to move to root')}
                </div>
              ) : null}
              {grouped.rootLinks.length > 0 ? (
                <div className="space-y-1.5">
                  {grouped.rootLinks.map(function (link) {
                    return (
                      <LinkCard key={link.id} link={link}
                        onVisit={handleVisit} onPin={handlePin}
                        onEdit={setEditing} onDelete={handleDelete}
                        onDragStart={handleCardDragStart}
                        isDragging={draggingLinkId === link.id} t={t} />
                    );
                  })}
                </div>
              ) : (!draggingLinkId ? (
                <div className="text-center py-2 text-[10px] text-hp-muted dark:text-hp-muted-dark">
                  {t('Drag links here to remove from folder')}
                </div>
              ) : null)}
            </div>
          ) : (
            grouped.rootLinks.length > 0 ? (
              <div className="space-y-1.5">
                {grouped.rootLinks.map(function (link) {
                  return (
                    <LinkCard key={link.id} link={link}
                      onVisit={handleVisit} onPin={handlePin}
                      onEdit={setEditing} onDelete={handleDelete}
                      onDragStart={handleCardDragStart}
                      isDragging={draggingLinkId === link.id} t={t} />
                  );
                })}
              </div>
            ) : null
          )}

          {/* Folder sections */}
          {folders.map(function (folder) {
            var folderLinks = grouped.byFolder[folder.id];
            if (!folderLinks || folderLinks.length === 0) {
              if (!search.trim() && activeCategory === 'All') {
                return (
                  <FolderSection key={folder.id} folder={folder} linkCount={0}
                    collapsed={!!collapsedFolders[folder.id]} onToggle={!draggingLinkId ? handleToggleFolder : function () {}}
                    onRename={handleRenameFolder} onDelete={handleDeleteFolder}
                    isDropTarget={draggingLinkId && dropTarget === folder.id} t={t}>
                    <div className="text-xs text-hp-muted dark:text-hp-muted-dark py-3 text-center">
                      {t('Empty folder')}
                    </div>
                  </FolderSection>
                );
              }
              return null;
            }
            return (
              <FolderSection key={folder.id} folder={folder} linkCount={folderLinks.length}
                collapsed={!!collapsedFolders[folder.id]} onToggle={!draggingLinkId ? handleToggleFolder : function () {}}
                onRename={handleRenameFolder} onDelete={handleDeleteFolder}
                isDropTarget={draggingLinkId && dropTarget === folder.id} t={t}>
                {folderLinks.map(function (link) {
                  return (
                    <LinkCard key={link.id} link={link}
                      onVisit={handleVisit} onPin={handlePin}
                      onEdit={setEditing} onDelete={handleDelete}
                      onDragStart={handleCardDragStart}
                      isDragging={draggingLinkId === link.id} t={t} />
                  );
                })}
              </FolderSection>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default QuickLinksView;

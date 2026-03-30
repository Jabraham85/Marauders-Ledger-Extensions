import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   CUE TRACKER v3.0  —  GrudgeDB two-view music production database
   View 1  Groups Table  Bird's-eye flat table, one row per group.
   View 2  Cues Table    Flat all-cues table with filter + cross-nav.
   Full-screen overlays: D = Group Details, R = References, V = Review
   ═══════════════════════════════════════════════════════════════════ */

// ─── CSS zoom helper (mirrors Sidebar getZoomFactor) ────────────────
// The app applies `document.documentElement.style.zoom` (default 1.25).
// getBoundingClientRect() returns post-zoom viewport coords, but
// position:fixed values are pre-zoom CSS pixels that get zoomed again.
// Dividing by the zoom factor converts viewport coords → CSS coords.
function getViewportZoom() {
  try {
    const z = parseFloat(getComputedStyle(document.documentElement).zoom);
    return (z && z > 0) ? z : 1;
  } catch { return 1; }
}

// ─── Constants ──────────────────────────────────────────────────────
const STORE_KEY        = 'cueTrackerData';
const DEFAULT_DB_PATH  = 'S:\\JoseAbraham\\extensions\\cue-tracker\\cue-tracker-db.json';
const DB_FILENAME      = 'cue-tracker-db.json';
const HISTORY_DIR      = 'history';
const MAX_HISTORY      = 50;
const SYNC_INTERVAL    = 30000;

const COMPOSING_STATUSES = ['Not Started','In Progress','Written','Ready for Review','Approved','Fixed Notes','Omit'];
const IMPL_STATUSES      = ['Not Started','In Progress','Complete','Tested and Mixed','Fixed Notes'];
const REVIEWER_STATUSES  = ['','Approved','Fixed Notes','Needs Revision'];
const CHAPTERS = ['Intro Day One','Autumn','Winter','Spring','Climax','Epilogue','Systemic','Brand Fantasy','Companion Quests','Side Quests','Other'];
const PRODUCTION_TYPES   = ['Virtual','Mix Mode','Full Record',"Chuck's Studio",'TBD'];
const CUE_TYPES          = ['IN GAME','CINEMATIC','MENU','AMBIENT','SYSTEMIC'];

const COMPOSING_COLORS = {
  'Not Started':      { bg:'rgba(120,120,120,0.15)',text:'#999',      border:'rgba(120,120,120,0.35)' },
  'In Progress':      { bg:'rgba(37,99,211,0.15)',  text:'#6BA4FF',   border:'rgba(37,99,211,0.4)' },
  'Written':          { bg:'rgba(130,60,200,0.15)', text:'#B47FE8',   border:'rgba(130,60,200,0.4)' },
  'Ready for Review': { bg:'rgba(211,166,37,0.15)', text:'#D3A625',   border:'rgba(211,166,37,0.4)' },
  'Approved':         { bg:'rgba(40,160,80,0.15)',  text:'#4AE08A',   border:'rgba(40,160,80,0.4)' },
  'Fixed Notes':      { bg:'rgba(37,99,211,0.15)',  text:'#6BA4FF',   border:'rgba(37,99,211,0.4)' },
  'Omit':             { bg:'rgba(120,120,120,0.1)', text:'#666',      border:'rgba(120,120,120,0.25)' },
};
const IMPL_COLORS = {
  'Not Started':      { bg:'rgba(120,120,120,0.15)',text:'#999',      border:'rgba(120,120,120,0.35)' },
  'In Progress':      { bg:'rgba(37,99,211,0.15)',  text:'#6BA4FF',   border:'rgba(37,99,211,0.4)' },
  'Complete':         { bg:'rgba(40,160,80,0.15)',  text:'#4AE08A',   border:'rgba(40,160,80,0.4)' },
  'Tested and Mixed': { bg:'rgba(40,160,80,0.3)',   text:'#2EDC7A',   border:'rgba(40,160,80,0.6)' },
  'Fixed Notes':      { bg:'rgba(37,99,211,0.15)',  text:'#6BA4FF',   border:'rgba(37,99,211,0.4)' },
};
const REVIEWER_COLORS = {
  '':               { bg:'rgba(120,120,120,0.1)', text:'#888',    border:'rgba(120,120,120,0.2)' },
  'Approved':       { bg:'rgba(40,160,80,0.15)',  text:'#4AE08A', border:'rgba(40,160,80,0.4)' },
  'Fixed Notes':    { bg:'rgba(180,60,60,0.15)',  text:'#E07070', border:'rgba(180,60,60,0.4)' },
  'Needs Revision': { bg:'rgba(211,166,37,0.15)', text:'#D3A625', border:'rgba(211,166,37,0.4)' },
};

// ─── Utilities ──────────────────────────────────────────────────────
function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function fmtDur(sec) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function parseCueDur(str) {
  if (!str) return 0;
  const cleaned = String(str).trim().replace(/[^0-9:]/g, '');
  if (!cleaned) return 0;
  const parts = cleaned.split(':').map(Number);
  if (parts.length === 2) return (isNaN(parts[0]) ? 0 : parts[0]) * 60 + (isNaN(parts[1]) ? 0 : parts[1]);
  return isNaN(parts[0]) ? 0 : parts[0];
}

function fileNameFromPath(p) {
  return String(p || '').split(/[\\/]/).pop() || '';
}

function pathJoin(base, leaf) {
  const l = String(base || '').replace(/[\\/]+$/, '');
  const r = String(leaf || '').replace(/^[\\/]+/, '');
  return l && r ? l + '\\' + r : (l || r);
}

function fmtTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    if (diff < 7 * 86400000) return days[d.getDay()] + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  // standard watch, short link, embed, shorts
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1' : null;
}

function getVimeoEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1' : null;
}

const DIRECT_VIDEO_EXTS = /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i;
const DIRECT_AUDIO_EXTS = /\.(mp3|wav|ogg|flac|aac|m4a)(\?|$)/i;

function getOfficeAppLabel(path) {
  const ext = (path||'').split('.').pop().toLowerCase();
  if (['docx','doc','rtf'].includes(ext)) return 'Open in Word';
  if (['xlsx','xls','csv'].includes(ext)) return 'Open in Excel';
  if (['pptx','ppt'].includes(ext)) return 'Open in PowerPoint';
  if (ext === 'pdf') return 'Open PDF';
  return 'Open File';
}

function isPreviewableMedia(path) {
  const ext = (path||'').split('.').pop().toLowerCase();
  return ['mp4','mp3','wav'].includes(ext);
}

// ─── Tauri Bridge ───────────────────────────────────────────────────
async function invoke(cmd, args) {
  const fn = window.electronAPI?.tauriInvoke;
  if (!fn) return null;
  try { return await fn(cmd, args || {}); }
  catch (err) { console.error('[CueTracker] invoke failed:', cmd, err); return null; }
}
async function readTextFile(path)          { return invoke('marketplace_read_text_file', { path }); }
async function writeTextFile(path,contents){ return invoke('marketplace_write_text_file', { path, contents }); }
async function pathExists(path)            { return !!(await invoke('marketplace_path_exists', { path })); }
async function runPS(script) {
  const r = await invoke('run_powershell', { script });
  return r || { exit_code: -1, stdout: '', stderr: '' };
}

async function browseAnyFile(startDir) {
  const init = startDir ? `$d.InitialDirectory = '${startDir.replace(/'/g,"''")}'` : '';
  const r = await runPS(`
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Filter = 'All files (*.*)|*.*'
    $d.Multiselect = $false
    ${init}
    if ($d.ShowDialog() -eq 'OK') { $d.FileName }
  `);
  return r.stdout?.trim() || null;
}

async function browseMediaFile(startDir) {
  const init = startDir ? `$d.InitialDirectory = '${startDir.replace(/'/g,"''")}'` : '';
  const r = await runPS(`
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Filter = 'Audio/Video (*.wav;*.mp3;*.mp4)|*.wav;*.mp3;*.mp4|All files (*.*)|*.*'
    $d.Multiselect = $false
    ${init}
    if ($d.ShowDialog() -eq 'OK') { $d.FileName }
  `);
  return r.stdout?.trim() || null;
}

async function browseFolder() {
  const r = await runPS(`
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = 'Select folder'
    if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }
  `);
  return r.stdout?.trim() || null;
}

async function readFileAsBase64(filePath) {
  const safe = filePath.replace(/'/g, "''");
  const r = await runPS(`[Convert]::ToBase64String([System.IO.File]::ReadAllBytes('${safe}'))`);
  return r.stdout?.trim() || null;
}

async function getWavDuration(filePath) {
  const safe = filePath.replace(/'/g, "''");
  const r = await runPS(`
    try {
      $bytes = [System.IO.File]::ReadAllBytes('${safe}')
      if ($bytes.Length -lt 44) { Write-Output '0'; return }
      $channels      = [BitConverter]::ToUInt16($bytes, 22)
      $sampleRate    = [BitConverter]::ToUInt32($bytes, 24)
      $bitsPerSample = [BitConverter]::ToUInt16($bytes, 34)
      if ($sampleRate -eq 0 -or $channels -eq 0 -or $bitsPerSample -eq 0) { Write-Output '0'; return }
      $dataStart = 12
      while ($dataStart + 8 -lt $bytes.Length) {
        $chunk = [System.Text.Encoding]::ASCII.GetString($bytes, $dataStart, 4)
        $size  = [BitConverter]::ToUInt32($bytes, $dataStart + 4)
        if ($chunk -eq 'data') {
          $dur = $size / ($channels * ($bitsPerSample / 8)) / $sampleRate
          Write-Output ([math]::Round($dur, 4))
          return
        }
        $dataStart += 8 + $size
        if ($size % 2 -ne 0) { $dataStart++ }
      }
      Write-Output '0'
    } catch { Write-Output '0' }
  `);
  const dur = parseFloat(r.stdout?.trim());
  return isNaN(dur) ? 0 : dur;
}

async function openPath(filePath) {
  if (!filePath) return;
  const safe = filePath.replace(/'/g,"''");
  await runPS(`Start-Process '${safe}'`);
}

async function openUrl(url) {
  if (!url) return;
  const safe = url.replace(/'/g,"''");
  await runPS(`Start-Process '${safe}'`);
}

async function openInP4(location) {
  if (!location) return;
  const safe = location.replace(/'/g,"''").replace(/"/g,'`"');
  await runPS(`Start-Process "p4v" -ArgumentList "-s","${safe}" -ErrorAction SilentlyContinue`);
}

// ─── Jira API ───────────────────────────────────────────────────────
const JIRA_DEFAULTS = { defaultProjectKeys: 'SUNDANCE', domain: 'wbg-avalanche.atlassian.net' };

function loadJiraCreds() {
  try {
    const raw = localStorage.getItem('cueTrackerJira');
    return { ...JIRA_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...JIRA_DEFAULTS }; }
}

function jiraProjectKeysFromCreds(creds) {
  const raw = (creds?.defaultProjectKeys || creds?.defaultProjectKey) || JIRA_DEFAULTS.defaultProjectKeys;
  const keys = String(raw).split(/[,;\s]+/).map(k => k.replace(/[^A-Za-z0-9_-]/g,'').toUpperCase()).filter(Boolean);
  return keys.length ? keys : ['SUNDANCE'];
}

async function jiraFetch(endpoint) {
  const creds = loadJiraCreds();
  if (!creds?.domain || !creds?.email || !creds?.token) return null;
  const base = creds.domain.startsWith('http') ? creds.domain : 'https://' + creds.domain;
  const url  = base + '/rest/api/3/' + endpoint;
  const auth = 'Basic ' + btoa(creds.email + ':' + creds.token);
  const headers = { Authorization: auth, Accept: 'application/json' };
  const httpJson = window.electronAPI?.httpRequestJson;
  if (typeof httpJson === 'function') {
    try {
      const { status, data } = await httpJson({ url, method: 'GET', headers, body: null });
      if (status === 200 && data) return data;
    } catch {}
  }
  try { const resp = await fetch(url, { method: 'GET', headers }); if (resp.ok) return resp.json(); } catch {}
  return null;
}

async function jiraApiPostFull(path, jsonBody) {
  const creds = loadJiraCreds();
  if (!creds?.domain || !creds?.email || !creds?.token) return { status: 0, data: null, raw: '', err: 'Jira not configured' };
  const base    = (creds.domain.startsWith('http') ? creds.domain : 'https://' + creds.domain).replace(/\/+$/,'');
  const url     = base + '/rest/api/3/' + String(path||'').replace(/^\//,'');
  const auth    = 'Basic ' + btoa(creds.email + ':' + creds.token);
  const bodyStr = typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody);
  const headers = { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' };
  const httpJson = window.electronAPI?.httpRequestJson;
  if (typeof httpJson === 'function') {
    try {
      const { status, data, raw } = await httpJson({ url, method: 'POST', headers, body: bodyStr });
      if (status > 0) return { status, data: data ?? null, raw: raw || '' };
    } catch {}
  }
  try {
    const resp = await fetch(url, { method: 'POST', headers, body: bodyStr });
    const raw  = await resp.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
    return { status: resp.status, data, raw };
  } catch (e) { return { status: 0, data: null, raw: '', err: e?.message || String(e) }; }
}

async function jiraGetIssue(issueKey) {
  if (!issueKey) return null;
  const data = await jiraFetch('issue/' + encodeURIComponent(issueKey) + '?fields=summary,status,assignee,priority');
  if (!data?.fields) return null;
  return { key: data.key, summary: data.fields.summary||'', status: data.fields.status?.name||'', statusColor: data.fields.status?.statusCategory?.colorName||'', assignee: data.fields.assignee?.displayName||'' };
}

function mapJiraSearchIssues(issues) {
  return (issues||[]).map(i => ({ key: i.key, summary: i.fields?.summary||'', status: i.fields?.status?.name||'', statusColor: i.fields?.status?.statusCategory?.colorName||'', assignee: i.fields?.assignee?.displayName||'' }));
}

async function jiraSearchIssues(query, maxResults) {
  if (!query || query.length < 2) return { issues: [], error: null };
  const max   = maxResults || 10;
  const creds = loadJiraCreds();
  const keys  = jiraProjectKeysFromCreds(creds);
  const prefix = keys.length ? `project in (${keys.join(', ')}) AND ` : '';
  const terms  = query.replace(/[\\"]/g,' ').trim().split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return { issues: [], error: null };
  const textClause = '(' + terms.map(t => `(summary ~ "${t.replace(/"/g,'\\"')}" OR text ~ "${t.replace(/"/g,'\\"')}")`).join(' OR ') + ')';
  const exactKey   = /^[A-Z][A-Z0-9]+-\d+$/i.test(query.trim());
  const jql = exactKey ? `(key = "${query.trim().toUpperCase()}" OR (${prefix}${textClause})) ORDER BY updated DESC` : `(${prefix}${textClause}) ORDER BY updated DESC`;
  const body = { jql, maxResults: max, fields: ['summary','status','assignee','priority'] };
  let r = await jiraApiPostFull('search/jql', body);
  if (r.status === 200 && Array.isArray(r.data?.issues)) return { issues: mapJiraSearchIssues(r.data.issues), error: null };
  r = await jiraApiPostFull('search', body);
  if (r.status === 200 && Array.isArray(r.data?.issues)) return { issues: mapJiraSearchIssues(r.data.issues), error: null };
  return { issues: [], error: r.data?.errorMessages?.join('; ') || r.err || 'Jira search failed' };
}

// ─── DB Sync ────────────────────────────────────────────────────────
async function readSharedDB(dbPath) {
  if (!dbPath) return null;
  try {
    const raw = await readTextFile(dbPath);
    if (!raw) return null;
    const bom = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    return JSON.parse(bom);
  } catch { return null; }
}

async function getHistoryDir(dbPath) {
  return dbPath ? dbPath.replace(/[^\\/]+$/, '') + HISTORY_DIR : null;
}

async function saveHistorySnapshot(dbPath, jsonStr, writerName) {
  if (!dbPath) return;
  try {
    const histDir = await getHistoryDir(dbPath);
    const safe    = histDir.replace(/'/g,"''");
    await runPS(`if (-not (Test-Path '${safe}')) { New-Item -ItemType Directory -Path '${safe}' -Force | Out-Null }`);
    const ts       = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const safeName = (writerName||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_');
    await writeTextFile(histDir + '\\' + ts + '_' + safeName + '.json', jsonStr);
    await pruneHistory(histDir);
  } catch {}
}

async function pruneHistory(histDir) {
  try {
    const safe = histDir.replace(/'/g,"''");
    await runPS(`Get-ChildItem -Path '${safe}' -Filter '*.json' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip ${MAX_HISTORY} | ForEach-Object { Remove-Item $_.FullName -Force }`);
  } catch {}
}

async function listHistory(dbPath) {
  if (!dbPath) return [];
  try {
    const histDir = await getHistoryDir(dbPath);
    const safe    = histDir.replace(/'/g,"''");
    const r = await runPS(`
      Get-ChildItem -Path '${safe}' -Filter '*.json' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object {
        $size = [math]::Round($_.Length / 1024, 1)
        "$($_.Name)|$($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))|${size}KB"
      }
    `);
    if (!r.stdout) return [];
    return r.stdout.trim().split('\n').map(line => {
      const parts = line.trim().split('|');
      if (parts.length < 3) return null;
      const name  = parts[0];
      const match = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)\.json$/);
      return { fileName: name, filePath: histDir + '\\' + name, date: parts[1], size: parts[2], writer: match ? match[2].replace(/_/g,' ') : 'unknown' };
    }).filter(Boolean);
  } catch { return []; }
}

async function restoreFromHistory(dbPath, historyFilePath) {
  if (!dbPath || !historyFilePath) return false;
  try {
    const raw = await readTextFile(historyFilePath);
    if (!raw) return false;
    JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    await writeTextFile(dbPath, raw);
    return true;
  } catch { return false; }
}

async function writeSharedDB(dbPath, store, writerName) {
  if (!dbPath) return null;
  const writeId = uid();
  const shared  = {
    _meta:    { lastWriter: writerName||'Unknown', lastWriteAt: new Date().toISOString(), writeId },
    projects: store.projects || [],
    settings: { workspaceRoot: store.settings?.workspaceRoot||'', jiraBaseUrl: store.settings?.jiraBaseUrl||'' },
  };
  try {
    const jsonStr = JSON.stringify(shared, null, 2);
    await writeTextFile(dbPath, jsonStr);
    saveHistorySnapshot(dbPath, jsonStr, writerName);
    return writeId;
  } catch (err) { console.error('[CueTracker] Shared DB write failed:', err); return null; }
}

function cueModifiedMs(c) {
  const t = new Date(c?.lastModifiedAt||'').getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeCues(localCues, remoteCues) {
  const map = new Map();
  (remoteCues||[]).forEach(c => map.set(c.id, c));
  (localCues||[]).forEach(c => {
    const existing = map.get(c.id);
    if (!existing) map.set(c.id, c);
    else map.set(c.id, cueModifiedMs(c) >= cueModifiedMs(existing) ? c : existing);
  });
  return Array.from(map.values());
}

function mergeGroups(localGroups, remoteGroups) {
  const map = new Map();
  (remoteGroups||[]).forEach(g => map.set(g.id, g));
  (localGroups||[]).forEach(g => map.set(g.id, g));
  const seen = new Set();
  const ordered = [];
  (localGroups||[]).forEach(g => { const m = map.get(g.id); if (m) { ordered.push(m); seen.add(g.id); } });
  (remoteGroups||[]).forEach(g => { if (!seen.has(g.id)) { const m = map.get(g.id); if (m) ordered.push(m); } });
  return ordered;
}

function mergeProjects(localProjects, remoteProjects, dismissedProjectIds) {
  const localList  = localProjects  || [];
  const remoteList = remoteProjects || [];
  const dismissed  = new Set((dismissedProjectIds||[]).filter(Boolean));
  const map = new Map();
  remoteList.forEach(p => map.set(p.id, p));
  localList.forEach(lp => {
    const rp = map.get(lp.id);
    if (!rp) map.set(lp.id, lp);
    else map.set(lp.id, { ...rp, ...lp, groups: mergeGroups(lp.groups||[], rp.groups||[]), cues: mergeCues(lp.cues||[], rp.cues||[]), jiraLinks: { ...(rp.jiraLinks||{}), ...(lp.jiraLinks||{}) } });
  });
  const ordered = []; const seen = new Set();
  localList.forEach(lp  => { const m = map.get(lp.id);  if (m) { ordered.push(m); seen.add(lp.id); } });
  remoteList.forEach(rp => { if (!dismissed.has(rp.id) && !seen.has(rp.id)) { const m = map.get(rp.id); if (m) ordered.push(m); seen.add(rp.id); } });
  return ordered;
}

async function syncReadMergeWrite(dbPath, localStore, writerName) {
  if (!dbPath) return { store: localStore, writeId: null };
  const remote = await readSharedDB(dbPath);
  if (!remote) {
    const writeId = await writeSharedDB(dbPath, localStore, writerName);
    return { store: localStore, writeId };
  }
  const dismissed   = localStore.settings?.dismissedProjectIds;
  const fullProjects = mergeProjects(localStore.projects, remote.projects);
  const viewProjects = mergeProjects(localStore.projects, remote.projects, dismissed);
  const writeId = await writeSharedDB(dbPath, { ...localStore, projects: fullProjects }, writerName);
  return { store: { ...localStore, projects: viewProjects }, writeId };
}

// ─── Store Persistence ──────────────────────────────────────────────
function loadFromLS() {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function saveToLS(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}

// ─── Data Model ─────────────────────────────────────────────────────
function defaultGroup(overrides) {
  return {
    id: uid(), name: 'New Group', chapter: '', budgetDuration: 0,
    striketeam: '', producer: '', representative: '', implementer: '',
    principalComposer: '', references: [], jiraKey: '', notes: '',
    ...overrides,
  };
}

function defaultCue(overrides) {
  return {
    id: uid(), name: '', groupId: '', cueType: '', parentCueId: '',
    estimatedDuration: 0, composer: '',
    composingStatus: 'Not Started', implementationStatus: 'Not Started',
    ostIncluded: false, ostTitle: '', production: 'Virtual',
    perforceLocation: '', wwiseLocation: '',
    versions: [], currentVersionId: '',
    references: [], notes: '',
    lastModifiedBy: '', lastModifiedAt: '',
    ...overrides,
  };
}

function defaultVersion(overrides) {
  return {
    id: uid(), label: 'v1', composerNotes: '', media: [],
    perforceLocation: '', actualDuration: 0,
    reviews: [], variants: [],
    createdAt: new Date().toISOString(), createdBy: '',
    ...overrides,
  };
}
function defaultReview(overrides) {
  return { id: uid(), reviewerName: '', status: '', comments: '', ...overrides };
}

function defaultReference(overrides) {
  return { id: uid(), type: 'file', title: '', address: '', notes: '', createdAt: new Date().toISOString(), ...overrides };
}

function defaultProject(name) {
  return { id: uid(), name: name||'New Project', groups: [], cues: [], settings: { workspaceRoot: '' }, jiraLinks: {}, lastSavedBy: '', lastSavedAt: '' };
}

// ─── Board Bridge ────────────────────────────────────────────────────
function resolveAudioPath(rawPath, workspaceRoot) {
  if (!rawPath) return '';
  // Already absolute (C:\... or \\server\...)
  if (/^[A-Za-z]:\\/.test(rawPath) || rawPath.startsWith('\\\\')) return rawPath;
  // Relative — join against workspaceRoot
  return workspaceRoot ? pathJoin(workspaceRoot, rawPath) : rawPath;
}

function buildBoardPatchFromGroup(group, groupCues, workspaceRoot) {
  const descParts = [
    group.chapter ? 'Chapter: ' + group.chapter : null,
    group.budgetDuration > 0 ? 'Budget: ' + fmtDur(group.budgetDuration) : null,
    group.principalComposer ? 'Composer: ' + group.principalComposer : null,
    group.producer ? 'Producer: ' + group.producer : null,
  ].filter(Boolean);
  const rootNode = {
    type: 'missionCard',
    title: group.name || 'Unnamed Group',
    description: descParts.join(' | ') || 'Music Group',
  };
  const activeCues = groupCues.filter(c => !isChildCue(c) && c.composingStatus !== 'Omit');
  const nodes = [rootNode];
  const edges = [];

  activeCues.forEach(c => {
    const dur = cueDuration(c);
    // Mechanic node: type + duration + composing status + impl status
    const mechDesc = [
      c.cueType || null,
      dur > 0 ? fmtDur(dur) : null,
      c.composingStatus && c.composingStatus !== 'Not Started' ? c.composingStatus : null,
      c.implementationStatus && c.implementationStatus !== 'Not Started' ? c.implementationStatus : null,
    ].filter(Boolean).join(' · ') || 'Music Cue';
    const cueNodeIdx = nodes.length;
    nodes.push({ type: 'mechanic', title: c.name || 'Unnamed Cue', description: mechDesc });
    edges.push({ sourceIndex: 0, targetIndex: cueNodeIdx, relationType: 'supports' });

    // ── Audio node ─────────────────────────────────────────────────────
    // 1. Current version media (WAV/MP3/MP4 files attached via review workflow)
    const ver = cueCurrentVersion(c);
    const audioMedia = ver && Array.isArray(ver.media)
      ? ver.media.find(m => /\.(wav|mp3|mp4)$/i.test(m.path || m.name || ''))
      : null;
    // 2. cue.references — { id, type:'file'|'url'|'text', address, title, notes }
    const audioRef = !audioMedia && Array.isArray(c.references)
      ? c.references.find(r => r.type === 'file' && /\.(wav|mp3|mp4)$/i.test(r.address || ''))
      : null;

    const rawPath = audioMedia ? (audioMedia.path || '') : (audioRef ? (audioRef.address || '') : '');
    const resolvedPath = resolveAudioPath(rawPath, workspaceRoot || '');
    const audioFileName = audioMedia
      ? (audioMedia.name || rawPath.split(/[\\/]/).pop())
      : (audioRef ? (audioRef.title || rawPath.split(/[\\/]/).pop()) : '');
    const audioPerforce = (ver && ver.perforceLocation) ? ver.perforceLocation : (c.perforceLocation || '');

    if (resolvedPath || audioPerforce) {
      const audioNodeIdx = nodes.length;
      const verLabel = ver ? (ver.label || '') : '';
      const actualDur = ver ? (ver.actualDuration || 0) : 0;

      // Audio node outer description: version label + duration — distinct from mechanic
      const audioDesc = [
        verLabel || null,
        actualDur > 0 ? fmtDur(actualDur) : null,
      ].filter(Boolean).join(' · ');

      nodes.push({
        type: 'audioPlayer',
        title: (c.name || 'Unnamed Cue') + (verLabel ? ' (' + verLabel + ')' : ''),
        description: audioDesc,
        meta: {
          audio: {
            filePath: resolvedPath,
            fileName: audioFileName,
            versionLabel: verLabel,
            duration: actualDur,
            composer: c.composer || '',
            cueType: c.cueType || '',
            composingStatus: c.composingStatus || '',
            implementationStatus: c.implementationStatus || '',
            perforceLocation: audioPerforce,
            audioSource: audioMedia ? 'version' : audioRef ? 'reference' : 'perforce',
          },
        },
      });
      edges.push({ sourceIndex: cueNodeIdx, targetIndex: audioNodeIdx, relationType: 'supports' });
    }
  });

  return { nodes, edges };
}

function defaultStore() {
  return { projects: [], activeProjectId: null, knownNames: [], settings: { workspaceRoot: '', jiraBaseUrl: '', sharedDbPath: DEFAULT_DB_PATH, recentPaths: [], dismissedProjectIds: [] } };
}

// ─── Aggregation ────────────────────────────────────────────────────
function cueCurrentVersion(cue) {
  if (!cue?.versions?.length) return null;
  return cue.versions.find(v => v.id === cue.currentVersionId) || cue.versions[cue.versions.length - 1];
}
function cueActualDuration(cue) { return cueCurrentVersion(cue)?.actualDuration || 0; }
function cueDuration(cue)       { const a = cueActualDuration(cue); return a > 0 ? a : (cue.estimatedDuration || 0); }
function cueUsesEstimated(cue)  { return cueActualDuration(cue) === 0 && (cue.estimatedDuration || 0) > 0; }
function isChildCue(cue)        { return !!cue?.parentCueId; }

function calcGroupDuration(groupId, allCues) {
  const eligible    = allCues.filter(c => c.groupId === groupId && !isChildCue(c) && c.composingStatus !== 'Omit');
  const total       = eligible.reduce((s, c) => s + cueDuration(c), 0);
  const usesEstimated = eligible.some(cueUsesEstimated);
  return { total, usesEstimated };
}

function aggregateComposing(groupId, allCues) {
  const active = allCues.filter(c => c.groupId === groupId && !isChildCue(c) && c.composingStatus !== 'Omit');
  if (!active.length) return 'Not Started';
  const s = active.map(c => c.composingStatus || 'Not Started');
  if (s.every(v => v === 'Approved')) return 'Approved';
  if (s.every(v => v === 'Not Started')) return 'Not Started';
  if (s.some(v => v === 'Ready for Review' || v === 'Fixed Notes')) return 'Ready for Review';
  if (s.some(v => v === 'Written')) return 'In Progress';
  return 'In Progress';
}

function aggregateImpl(groupId, allCues) {
  const active = allCues.filter(c => c.groupId === groupId && !isChildCue(c) && c.composingStatus !== 'Omit');
  if (!active.length) return 'Not Started';
  const s = active.map(c => c.implementationStatus || 'Not Started');
  if (s.every(v => v === 'Tested and Mixed')) return 'Tested and Mixed';
  if (s.every(v => v === 'Complete' || v === 'Tested and Mixed')) return 'Complete';
  if (s.every(v => v === 'Not Started')) return 'Not Started';
  if (s.some(v => v === 'Fixed Notes')) return 'Fixed Notes';
  return 'In Progress';
}

// ─── Migration (v1 → v2 data model) ─────────────────────────────────
function migrateProjectIfNeeded(project) {
  if (!project) return project;
  if (Array.isArray(project.groups)) return project;
  const missionNames = [...new Set((project.cues||[]).filter(c => c.mission).map(c => c.mission))];
  const groups       = missionNames.map(m => defaultGroup({ id: uid(), name: m }));
  const byMission    = {};
  groups.forEach(g => { byMission[g.name] = g.id; });
  const statusMap = { Draft: 'Not Started', WIP: 'In Progress', 'In Progress': 'In Progress', 'Needs Review': 'Ready for Review', Approved: 'Approved' };
  const cues = (project.cues||[]).filter(c => (c.depth ?? 2) === 2).map(c => defaultCue({
    id: c.id||uid(), name: c.name||'', groupId: byMission[c.mission]||'',
    cueType: c.cueType||'', composer: c.key||'',
    composingStatus: statusMap[c.status]||'Not Started',
    notes: c.notes||'', lastModifiedBy: c.lastModifiedBy||'', lastModifiedAt: c.lastModifiedAt||'',
  }));
  return { ...project, groups, cues };
}

async function getAppUsername() {
  try { return (await window.electronAPI?.marketplaceGetSettings?.())?.username || ''; }
  catch { return ''; }
}

// ─── Shared style constants ──────────────────────────────────────────
const INP = { padding: '4px 6px', fontSize: 11, border: '1px solid var(--hp-border, #D4A574)', borderRadius: 4, background: 'var(--hp-card, #FFFBF0)', color: 'var(--hp-text, #3B1010)', outline: 'none', fontFamily: 'inherit' };

// ─── ActionButton ────────────────────────────────────────────────────
function ActionButton({ label, onClick, accent, small, danger, disabled, title }) {
  const bg  = danger ? 'rgba(180,60,60,0.15)' : accent ? 'rgba(211,166,37,0.15)' : 'rgba(120,120,120,0.1)';
  const col = danger ? '#E07070' : accent ? 'var(--hp-accent, #D3A625)' : 'var(--hp-muted, #8B6B5B)';
  const bdr = danger ? 'rgba(180,60,60,0.4)' : accent ? 'rgba(211,166,37,0.4)' : 'rgba(120,120,120,0.25)';
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      style={{ padding: small ? '3px 8px' : '6px 14px', fontSize: small ? 10 : 12, fontWeight: 600, background: bg, color: col, border: '1px solid ' + bdr, borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'Crimson Text, serif' }}>
      {label}
    </button>
  );
}

// ─── StatusPill ──────────────────────────────────────────────────────
function StatusPill({ value, options, colors, onChange, disabled, small }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropDiv    = useRef(null);
  const openRef    = useRef(false);
  const c = colors[value] || { bg: 'rgba(120,120,120,0.1)', text: '#888', border: 'rgba(120,120,120,0.2)' };

  const closePillDrop = useCallback(() => {
    if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} dropDiv.current = null; }
    openRef.current = false;
    setOpen(false);
  }, []);

  const buildPillDrop = useCallback((opts, onChg, colorsMap) => {
    if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} }
    if (!triggerRef.current) return;
    const r   = triggerRef.current.getBoundingClientRect();
    const z   = getViewportZoom();
    const div = document.createElement('div');
    div.setAttribute('data-grudge-drop', '1');
    div.style.cssText = [
      'position:fixed',
      `top:${(r.bottom + 2) / z}px`,
      `left:${r.left / z}px`,
      `min-width:${Math.max(r.width / z, 160)}px`,
      'z-index:2147483647',
      'background:#1a2a1a',
      'border:1px solid #4a7a4a',
      'border-radius:4px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.55)',
      'overflow:hidden',
      'font-family:Crimson Text,Georgia,serif',
      'font-size:' + (small ? '10px' : '11px'),
    ].join(';');
    opts.forEach(opt => {
      const oc   = colorsMap[opt] || { text: '#e8dcc0' };
      const item = document.createElement('div');
      item.textContent = opt || '—';
      item.style.cssText = 'padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap;color:' + (oc.text || '#e8dcc0') + ';font-weight:600;';
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(211,166,37,0.15)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onChg(opt); closePillDrop(); });
      div.appendChild(item);
    });
    document.body.appendChild(div);
    dropDiv.current = div;
  }, [small, closePillDrop]);

  useEffect(() => () => { if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} } }, []);

  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (triggerRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-grudge-drop]')) return;
      closePillDrop();
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [open, closePillDrop]);

  const toggle = e => {
    e.stopPropagation();
    if (disabled || !onChange) return;
    if (openRef.current) { closePillDrop(); return; }
    openRef.current = true;
    setOpen(true);
    buildPillDrop(options, onChange, colors);
  };

  useEffect(() => {
    if (open) buildPillDrop(options, onChange, colors);
  }, [open, options, onChange, colors, buildPillDrop]);

  const pStyle = { background: c.bg, color: c.text, border: '1px solid ' + c.border, padding: small ? '1px 5px' : '2px 8px', borderRadius: 4, fontSize: small ? 9 : 11, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none', display: 'inline-block' };
  if (!onChange || disabled) return <span style={pStyle}>{value||'—'}</span>;
  return (
    <span ref={triggerRef} onClick={toggle} style={{ ...pStyle, cursor: 'pointer' }}>
      {value||'—'} <span style={{ fontSize: 7, opacity: 0.7 }}>▾</span>
    </span>
  );
}

// ─── FixedSelect ─────────────────────────────────────────────────────
// Dropdown is appended directly to document.body (manual portal) so it
// escapes every ancestor — overflow, transform, contain, stacking context.
function FixedSelect({ value, options, onChange, placeholder, disabled, small }) {
  const [open, setOpen] = useState(false);
  const trigRef  = useRef(null);
  const dropDiv  = useRef(null);  // the actual body-appended DOM node
  const openRef  = useRef(false);

  // Build / rebuild the dropdown DOM node directly on body
  const buildDrop = useCallback((opts, onChg) => {
    if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} }
    if (!trigRef.current) return;
    const r   = trigRef.current.getBoundingClientRect();
    const z   = getViewportZoom();
    const div = document.createElement('div');
    div.setAttribute('data-grudge-drop', '1');
    div.style.cssText = [
      'position:fixed',
      `top:${(r.bottom + 2) / z}px`,
      `left:${r.left / z}px`,
      `min-width:${Math.max(r.width / z, 120)}px`,
      'z-index:2147483647',
      'background:#1a2a1a',
      'border:1px solid #4a7a4a',
      'border-radius:4px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.55)',
      'max-height:260px',
      'overflow-y:auto',
      'font-family:Crimson Text,Georgia,serif',
      'font-size:' + (small ? '10px' : '11px'),
    ].join(';');

    opts.forEach(o => {
      const item = document.createElement('div');
      item.textContent = o || '—';
      item.style.cssText = [
        'padding:6px 11px',
        'cursor:pointer',
        'border-bottom:1px solid rgba(255,255,255,0.06)',
        'white-space:nowrap',
        o ? 'color:#e8dcc0' : 'color:rgba(180,160,120,0.45);font-style:italic',
      ].join(';');
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(211,166,37,0.15)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        onChg(o);
        closeDrop();
      });
      div.appendChild(item);
    });

    document.body.appendChild(div);
    dropDiv.current = div;
  }, [small]);

  const closeDrop = useCallback(() => {
    if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} dropDiv.current = null; }
    openRef.current = false;
    setOpen(false);
  }, []);

  // Remove dropdown from body when this component unmounts
  useEffect(() => () => { if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} } }, []);

  // Global mousedown → close if clicked outside
  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (trigRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-grudge-drop]')) return;
      closeDrop();
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [open, closeDrop]);

  const toggle = e => {
    e.stopPropagation();
    if (disabled) return;
    if (openRef.current) { closeDrop(); return; }
    openRef.current = true;
    setOpen(true);
    buildDrop(options, onChange);
  };

  // Rebuild when options or onChange change while open (e.g. row re-render)
  useEffect(() => {
    if (open) buildDrop(options, onChange);
  }, [open, options, onChange, buildDrop]);

  const trigStyle = {
    ...INP, width: '100%', padding: small ? '1px 3px' : '1px 4px',
    fontSize: small ? 10 : 11, cursor: disabled ? 'default' : 'pointer',
    userSelect: 'none', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', opacity: disabled ? 0.4 : 1,
  };
  return (
    <div ref={trigRef} onClick={toggle} style={trigStyle}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {value || <span style={{ color: 'rgba(120,120,120,0.4)', fontStyle: 'italic' }}>{placeholder||'—'}</span>}
      </span>
      {!disabled && <span style={{ fontSize: 7, opacity: 0.5, marginLeft: 3, flexShrink: 0 }}>▾</span>}
    </div>
  );
}

// ─── EditableCell ────────────────────────────────────────────────────
// For type="select": renders FixedSelect directly (single-click opens dropdown).
// For type="text":   double-click activates an inline input.
function EditableCell({ value, onCommit, type = 'text', options, placeholder, disabled, mono, datalistId }) {
  // Select cells never need an "editing" state — FixedSelect handles its own open/close
  if (type === 'select') {
    return (
      <FixedSelect
        value={value ? String(value) : ''}
        options={options||[]}
        onChange={v => onCommit(v)}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  // Text cells use double-click to enter edit mode
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const inputRef = useRef(null);
  const start  = e => { e.stopPropagation(); if (disabled) return; setDraft(String(value||'')); setEditing(true); };
  const commit = useCallback(v => { onCommit(v !== undefined ? v : draft); setEditing(false); }, [draft, onCommit]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  const base = { ...INP, width: '100%', padding: '2px 4px', fontSize: 11, fontFamily: mono ? 'monospace' : 'inherit' };
  if (editing) {
    return <input ref={inputRef} type="text" value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => commit()} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
      list={datalistId} style={base} placeholder={placeholder} onClick={e => e.stopPropagation()} />;
  }
  return (
    <div onDoubleClick={start} title={disabled ? '' : 'Double-click to edit'}
      style={{ cursor: disabled ? 'default' : 'text', flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', ...(disabled ? { opacity: 0.35 } : {}) }}>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {value ? String(value) : <span style={{ color: 'rgba(120,120,120,0.4)', fontStyle: 'italic' }}>{placeholder||'—'}</span>}
      </span>
    </div>
  );
}

// ─── MiniPlayer (triangle + seek bar, no volume) ─────────────────────
function MiniPlayer({ filePath, workspaceRoot }) {
  const [state,    setState]    = useState('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const urlRef   = useRef(null);
  const fullPath = useMemo(() => {
    if (!filePath) return '';
    if (/^[A-Za-z]:\\/.test(filePath) || filePath.startsWith('\\\\')) return filePath;
    return workspaceRoot ? pathJoin(workspaceRoot, filePath) : filePath;
  }, [filePath, workspaceRoot]);
  useEffect(() => () => { audioRef.current?.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  if (!filePath) return null;

  const toggle = async e => {
    e.stopPropagation();
    if (state === 'playing')  { audioRef.current?.pause(); setState('paused'); return; }
    if (state === 'paused' && audioRef.current) { audioRef.current.play(); setState('playing'); return; }
    setState('loading');
    try {
      const b64 = await readFileAsBase64(fullPath);
      if (!b64) { setState('error'); return; }
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ext  = fullPath.split('.').pop().toLowerCase();
      const mime = ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      const blob = new Blob([bytes], { type: mime });
      const url  = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate     = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      audio.onended          = () => { setState('paused'); setProgress(0); };
      audio.onerror          = () => setState('error');
      await audio.play();
      setState('playing');
    } catch { setState('error'); }
  };

  const seek = e => {
    e.stopPropagation();
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  const isErr = state === 'error';
  const icon  = state === 'loading' ? '…' : state === 'playing' ? '⏸' : '▶';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 70 }} onClick={e => e.stopPropagation()}>
      <button onClick={toggle}
        style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, borderRadius: 3, border: '1px solid ' + (isErr ? 'rgba(180,60,60,0.4)' : 'rgba(107,164,255,0.35)'), background: isErr ? 'rgba(180,60,60,0.1)' : 'rgba(107,164,255,0.1)', color: isErr ? '#E07070' : '#6BA4FF', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
        {isErr ? '!' : icon}
      </button>
      <div onClick={seek} style={{ flex: 1, height: 3, background: 'rgba(120,120,120,0.2)', borderRadius: 2, cursor: 'pointer', position: 'relative', minWidth: 40 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: (progress * 100) + '%', background: '#6BA4FF', borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ─── History Modal ───────────────────────────────────────────────────
function HistoryModal({ open, onClose, dbPath, onRestore }) {
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [restoring, setRestoring] = useState(null);
  useEffect(() => {
    if (!open || !dbPath) return;
    setLoading(true);
    listHistory(dbPath).then(list => { setEntries(list); setLoading(false); });
  }, [open, dbPath]);
  if (!open) return null;
  const handleRestore = async entry => {
    if (!confirm('Restore from ' + entry.date + ' by ' + entry.writer + '?\nThis will overwrite the current shared database.')) return;
    setRestoring(entry.fileName);
    const ok = await onRestore(entry.filePath);
    setRestoring(null);
    if (ok) onClose();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--hp-card, #FFFBF0)', border: '1px solid var(--hp-border, #D4A574)', borderRadius: 8, width: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hp-border, #D4A574)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 600, fontSize: 13, color: 'var(--hp-accent, #D3A625)' }}>Revision History</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--hp-muted, #8B6B5B)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12 }}>Loading...</div>}
          {!loading && !entries.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12 }}>No history snapshots yet.</div>}
          {entries.map((e, i) => (
            <div key={e.fileName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid rgba(212,165,116,0.12)', fontSize: 11 }}>
              <span style={{ fontFamily: 'monospace', flex: 1, color: 'var(--hp-text, #3B1010)' }}>{e.date}{i === 0 && <span style={{ marginLeft: 6, fontSize: 9, color: '#4AE08A', fontWeight: 700 }}>LATEST</span>}</span>
              <span style={{ color: 'var(--hp-accent, #D3A625)', fontWeight: 500, minWidth: 80 }}>{e.writer}</span>
              <span style={{ color: 'var(--hp-muted, #8B6B5B)', fontFamily: 'monospace', fontSize: 10, minWidth: 50 }}>{e.size}</span>
              <button onClick={() => handleRestore(e)} disabled={!!restoring} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600, borderRadius: 3, cursor: 'pointer', background: 'rgba(107,164,255,0.12)', color: '#6BA4FF', border: '1px solid rgba(107,164,255,0.3)', opacity: restoring ? 0.5 : 1 }}>
                {restoring === e.fileName ? '...' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 14px', borderTop: '1px solid var(--hp-border, #D4A574)', fontSize: 10, color: 'var(--hp-muted, #8B6B5B)' }}>Up to {MAX_HISTORY} snapshots kept. Oldest pruned automatically.</div>
      </div>
    </div>
  );
}

// ─── Jira Badge ──────────────────────────────────────────────────────
function JiraTicketBadge({ issueKey }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!issueKey) return;
    let cancelled = false;
    jiraGetIssue(issueKey).then(data => { if (!cancelled && data) setInfo(data); });
    return () => { cancelled = true; };
  }, [issueKey]);
  const creds = loadJiraCreds();
  const base  = creds?.domain ? (creds.domain.startsWith('http') ? creds.domain : 'https://' + creds.domain) : '';
  const SC    = { 'blue-gray': '#6BA4FF', blue: '#6BA4FF', yellow: '#D3A625', green: '#4AE08A' };
  return (
    <span onClick={e => { e.stopPropagation(); if (base) openUrl(base.replace(/\/$/,'') + '/browse/' + issueKey); }}
      style={{ fontSize: 10, color: '#6BA4FF', fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {issueKey}
      {info && <span style={{ marginLeft: 4, fontSize: 9, color: SC[info.statusColor]||'#999' }}>{info.status}</span>}
    </span>
  );
}

// ─── Jira Search Modal ───────────────────────────────────────────────
function JiraSearchModal({ open, onClose, onSelect }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState('');
  const timer = useRef(null);
  useEffect(() => { if (!open) { setQuery(''); setResults([]); setError(''); } }, [open]);
  const doSearch = async q => {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true); setError('');
    const { issues, error: err } = await jiraSearchIssues(q, 12);
    setResults(issues); setError(err||''); setSearching(false);
  };
  const SC = { 'blue-gray': { bg: 'rgba(107,164,255,0.15)', text: '#6BA4FF' }, blue: { bg: 'rgba(107,164,255,0.15)', text: '#6BA4FF' }, yellow: { bg: 'rgba(211,166,37,0.15)', text: '#D3A625' }, green: { bg: 'rgba(40,160,80,0.15)', text: '#4AE08A' } };
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--hp-card, #FFFBF0)', border: '1px solid var(--hp-border, #D4A574)', borderRadius: 8, width: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hp-border, #D4A574)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 600, fontSize: 13, color: 'var(--hp-accent, #D3A625)' }}>Link Jira Ticket</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--hp-muted, #8B6B5B)' }}>✕</button>
          </div>
          <input type="text" value={query} autoFocus onChange={e => { setQuery(e.target.value); clearTimeout(timer.current); timer.current = setTimeout(() => doSearch(e.target.value), 600); }} placeholder="Search by keyword or ticket key..." style={{ ...INP, width: '100%' }} />
          <div style={{ fontSize: 10, marginTop: 4, color: error ? '#E07070' : 'var(--hp-muted, #8B6B5B)' }}>
            {searching ? 'Searching...' : error || (results.length > 0 ? results.length + ' results' : query.length >= 2 ? 'No results' : 'Type at least 2 characters')}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 300 }}>
          {results.map(issue => {
            const sc = SC[issue.statusColor] || { bg: 'rgba(120,120,120,0.15)', text: '#999' };
            return (
              <div key={issue.key} onClick={() => { onSelect(issue.key); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(212,165,116,0.1)', fontSize: 11 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(211,166,37,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6BA4FF', minWidth: 80, flexShrink: 0 }}>{issue.key}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--hp-text, #3B1010)' }}>{issue.summary}</span>
                <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: sc.bg, color: sc.text, fontWeight: 600, flexShrink: 0 }}>{issue.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Cue Group Picker ─────────────────────────────────────────────
function AddCueGroupPicker({ open, onClose, groups, onAdd }) {
  const [groupId, setGroupId] = useState('');
  useEffect(() => {
    if (open && groups.length > 0) setGroupId(groups[0].id);
  }, [open, groups]);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--hp-card, #FFFBF0)', border: '1px solid var(--hp-border, #D4A574)', borderRadius: 8, padding: '18px 22px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13, color: 'var(--hp-accent, #D3A625)', marginBottom: 12 }}>Add Cue to Group</div>
        <select value={groupId} onChange={e => setGroupId(e.target.value)} style={{ ...INP, width: '100%', marginBottom: 14 }}>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name||'Unnamed'}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '5px 14px', fontSize: 11, borderRadius: 4, border: '1px solid rgba(120,120,120,0.3)', background: 'rgba(120,120,120,0.1)', color: 'var(--hp-muted, #8B6B5B)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (groupId) { onAdd(groupId); onClose(); } }} style={{ padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.15)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>Add Cue</button>
        </div>
      </div>
    </div>
  );
}

// ─── Groups Table ─────────────────────────────────────────────────────
const GRP_COLS = '1fr 108px 148px 125px 100px 100px 100px 100px 128px 125px 52px 160px';
const GRP_HDRS = ['Name','Chapter','Budget / Calc','Prin. Composer','Strike Team','Producer','Representative','Implementer','Composing','Impl.','Cues',''];

function GroupsTable({
  project, allCues, allGroups,
  onUpdateGroup, onAddGroup, onDeleteGroup,
  onAddCue,
  onOpenGroupDetails, onSendGroupToBoard, boardSentGroupIds,
  selectedGroupId, onSelectGroup,
  onViewCues,
  addKnownName,
}) {
  const [groupFilter, setGroupFilter] = useState('');
  const [jiraOpen,    setJiraOpen]    = useState(false);
  const [jiraGroupId, setJiraGroupId] = useState(null);

  const fl = groupFilter.toLowerCase();
  const visibleGroups = groupFilter
    ? allGroups.filter(g => (g.name||'').toLowerCase().includes(fl) || (g.chapter||'').toLowerCase().includes(fl))
    : allGroups;

  const HDR_CELL = { padding: '4px 8px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.055em', color: 'var(--hp-muted, #8B6B5B)', borderRight: '1px solid rgba(212,165,116,0.15)', whiteSpace: 'nowrap' };
  const CELL     = { padding: '4px 8px', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid rgba(212,165,116,0.08)', display: 'flex', alignItems: 'center', minHeight: 34 };

  const totalActiveCues = allCues.filter(c => !isChildCue(c) && c.composingStatus !== 'Omit').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid var(--hp-border, #D4A574)', flexShrink: 0, background: 'var(--hp-surface, #FDF6E3)' }}>
        <div style={{ position: 'relative' }}>
          <input type="text" value={groupFilter} onChange={e => setGroupFilter(e.target.value)} placeholder="Filter groups…"
            style={{ ...INP, width: 220, paddingRight: groupFilter ? 24 : 8 }} />
          {groupFilter && <button onClick={() => setGroupFilter('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12, padding: 0 }}>✕</button>}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--hp-muted, #8B6B5B)', fontFamily: 'monospace' }}>
          {visibleGroups.length} group{visibleGroups.length !== 1 ? 's' : ''} · {totalActiveCues} active cue{totalActiveCues !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 9, color: 'var(--hp-muted, #8B6B5B)', marginLeft: 4 }}>Click "View Cues →" to filter by group · D = Details</span>
        <ActionButton label="+ Add Group" onClick={onAddGroup} small accent />
      </div>

      {/* Table scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ minWidth: 1260 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: GRP_COLS, minWidth: 1260, position: 'sticky', top: 0, zIndex: 5, background: 'var(--hp-surface, #FDF6E3)', borderBottom: '2px solid rgba(212,165,116,0.3)' }}>
            {GRP_HDRS.map(h => <div key={h} style={HDR_CELL}>{h}</div>)}
          </div>

          {/* Group rows */}
          {visibleGroups.map(group => {
            const isSelected = selectedGroupId === group.id;
            const { total: calcDur, usesEstimated } = calcGroupDuration(group.id, allCues);
            const compStatus  = aggregateComposing(group.id, allCues);
            const implStatus  = aggregateImpl(group.id, allCues);
            const boardSent   = boardSentGroupIds?.has(group.id);
            const jiraLink    = (project.jiraLinks||{})[group.id] || group.jiraKey;
            const activeCount = allCues.filter(c => c.groupId === group.id && !isChildCue(c) && c.composingStatus !== 'Omit').length;
            const upd = (field, value) => onUpdateGroup(group.id, { [field]: value });

            return (
              <div key={group.id}
                onClick={() => onSelectGroup(group.id)}
                style={{
                  display: 'grid', gridTemplateColumns: GRP_COLS, minWidth: 1260,
                  background: isSelected ? 'rgba(211,166,37,0.1)' : 'var(--hp-card, #FFFBF0)',
                  borderBottom: '1px solid rgba(212,165,116,0.18)',
                  borderLeft: isSelected ? '3px solid var(--hp-accent, #D3A625)' : '3px solid transparent',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(211,166,37,0.05)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hp-card, #FFFBF0)'; }}>

                {/* Name + optional Jira badge */}
                <div style={{ ...CELL, gap: 5 }} onClick={e => e.stopPropagation()}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontFamily: 'Cinzel, serif', fontSize: 12 }}>
                    <EditableCell value={group.name} onCommit={v => upd('name', v)} placeholder="Group name" />
                  </div>
                  {jiraLink ? (
                    <span style={{ flexShrink: 0 }}><JiraTicketBadge issueKey={jiraLink} /></span>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setJiraGroupId(group.id); setJiraOpen(true); }}
                      style={{ flexShrink: 0, fontSize: 9, padding: '1px 4px', borderRadius: 3, border: '1px solid rgba(107,164,255,0.25)', background: 'rgba(107,164,255,0.08)', color: '#6BA4FF', cursor: 'pointer' }}>+ Jira</button>
                  )}
                </div>

                {/* Chapter */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.chapter} onCommit={v => upd('chapter', v)} type="select" options={['', ...CHAPTERS]} placeholder="—" />
                </div>

                {/* Budget / Calc */}
                <div style={{ ...CELL, fontFamily: 'monospace', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.budgetDuration > 0 ? fmtDur(group.budgetDuration) : ''} onCommit={v => upd('budgetDuration', parseCueDur(v))} placeholder="Budget" mono />
                  <span style={{ color: 'rgba(120,120,120,0.4)', fontSize: 10 }}>/</span>
                  <span style={{ color: usesEstimated ? 'rgba(211,166,37,0.85)' : 'var(--hp-text, #3B1010)', fontStyle: usesEstimated ? 'italic' : 'normal', fontSize: 11 }} title={usesEstimated ? 'Uses estimated durations' : ''}>
                    {calcDur > 0 ? fmtDur(calcDur) : <span style={{ color: 'rgba(120,120,120,0.3)' }}>—</span>}
                  </span>
                </div>

                {/* Principal Composer */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.principalComposer} onCommit={v => { upd('principalComposer', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" datalistId="ct-known-names" />
                </div>

                {/* Strike Team */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.striketeam} onCommit={v => { upd('striketeam', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" datalistId="ct-known-names" />
                </div>

                {/* Producer */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.producer} onCommit={v => { upd('producer', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" datalistId="ct-known-names" />
                </div>

                {/* Representative */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.representative} onCommit={v => { upd('representative', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" datalistId="ct-known-names" />
                </div>

                {/* Implementer */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={group.implementer} onCommit={v => { upd('implementer', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" datalistId="ct-known-names" />
                </div>

                {/* Composing aggregate */}
                <div style={{ ...CELL, overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  <StatusPill value={compStatus} options={COMPOSING_STATUSES} colors={COMPOSING_COLORS} small />
                </div>

                {/* Impl aggregate */}
                <div style={{ ...CELL, overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  <StatusPill value={implStatus} options={IMPL_STATUSES} colors={IMPL_COLORS} small />
                </div>

                {/* Cue count */}
                <div style={{ ...CELL, justifyContent: 'center', fontFamily: 'monospace', fontSize: 10 }}>
                  <span style={{ color: 'var(--hp-muted, #8B6B5B)' }}>{activeCount}</span>
                </div>

                {/* Actions */}
                <div style={{ ...CELL, gap: 4, justifyContent: 'flex-end', paddingRight: 8 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => onAddCue(group.id)} title="Add cue to this group"
                    style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.35)', background: 'rgba(211,166,37,0.1)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>+ Cue</button>
                  <button onClick={() => onViewCues && onViewCues(group.id)} title="View cues for this group"
                    style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.35)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: 'pointer' }}>View Cues →</button>
                  {onSendGroupToBoard && (boardSent ? (
                    <button onClick={() => { const api = window.appAPI || window.electronAPI; if (api?.navigateToView) api.navigateToView('gameDesign'); }}
                      title="Open Game Design Board" style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(40,160,80,0.4)', background: 'rgba(40,160,80,0.15)', color: '#4AE08A', cursor: 'pointer' }}>✓ Board</button>
                  ) : (
                    <button onClick={() => onSendGroupToBoard(group.id)} title="Send group to Game Design Board"
                      style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: '#A78BFA', cursor: 'pointer' }}>→ Board</button>
                  ))}
                  <button onClick={() => onOpenGroupDetails(group.id)} title="Group details / references (D)"
                    style={{ padding: '2px 5px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.25)', background: 'rgba(211,166,37,0.08)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>D</button>
                  <button onClick={() => { if (confirm('Delete group "' + group.name + '"?')) onDeleteGroup(group.id); }} title="Delete group"
                    style={{ padding: '2px 5px', fontSize: 9, borderRadius: 3, border: '1px solid rgba(180,60,60,0.25)', background: 'rgba(180,60,60,0.08)', color: '#E07070', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            );
          })}

          {allGroups.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 13 }}>
              No groups yet.<br /><span style={{ fontSize: 11 }}>Click <strong>+ Add Group</strong> to create a music group or mission.</span>
            </div>
          )}
          {allGroups.length > 0 && visibleGroups.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12 }}>
              No groups match "<strong>{groupFilter}</strong>".
            </div>
          )}
        </div>
      </div>

      <JiraSearchModal open={jiraOpen} onClose={() => setJiraOpen(false)} onSelect={key => { if (jiraGroupId) onUpdateGroup(jiraGroupId, { jiraKey: key }); }} />
    </div>
  );
}

// ─── Cues Table (View 2) ──────────────────────────────────────────────
const CUE_COLS = '1fr 105px 78px 130px 130px 52px 52px 210px 88px 118px 118px 26px 108px 96px 112px 112px 90px 50px';
const CUE_HDRS = ['Cue Name','Group','Type','Parent Cue','Child Cue','Est.','Act.','Current Version','Composer','Composing','Impl.','OST','OST Title','Production','Perforce','Wwise','Modified',''];

function CuesTable({
  project, allCues, allGroups,
  onUpdateCue, onAddCue, onDeleteCue, onSetChildCue,
  onOpenReferences, onOpenReview,
  workspaceRoot,
  selectedCueId, onSelectCue,
  filter, onFilterChange,
  addKnownName,
}) {
  const [addGroupOpen,       setAddGroupOpen]       = useState(false);
  const [collapsedParentIds, setCollapsedParentIds] = useState(() => new Set());

  const toggleCollapse = (id, e) => {
    e.stopPropagation();
    setCollapsedParentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const groupById = useMemo(() => {
    const map = {};
    allGroups.forEach(g => { map[g.id] = g; });
    return map;
  }, [allGroups]);

  // Map parentId → child cues
  const childrenByParentId = useMemo(() => {
    const map = {};
    allCues.forEach(c => {
      if (c.parentCueId) {
        if (!map[c.parentCueId]) map[c.parentCueId] = [];
        map[c.parentCueId].push(c);
      }
    });
    return map;
  }, [allCues]);

  const fl = (filter||'').toLowerCase();

  const filteredAndSorted = useMemo(() => {
    let cues = allCues;
    if (fl) {
      cues = cues.filter(c => {
        const grpName = (groupById[c.groupId]?.name||'').toLowerCase();
        return (c.name||'').toLowerCase().includes(fl) ||
               grpName.includes(fl) ||
               (c.cueType||'').toLowerCase().includes(fl) ||
               (c.composer||'').toLowerCase().includes(fl);
      });
    }
    const parents  = cues.filter(c => !c.parentCueId);
    const children = cues.filter(c => !!c.parentCueId);
    const sorted   = [];
    parents.forEach(p => {
      sorted.push(p);
      children.filter(c => c.parentCueId === p.id).forEach(ch => sorted.push(ch));
    });
    children.filter(c => !parents.some(p => p.id === c.parentCueId)).forEach(c => sorted.push(c));
    return sorted;
  }, [allCues, fl, groupById]);

  // Hide children of collapsed parents
  const visibleCues = filteredAndSorted.filter(cue =>
    !isChildCue(cue) || !collapsedParentIds.has(cue.parentCueId)
  );

  // For parent dropdown: only non-child cues (a child can never be a parent)
  const parentCandidates = useMemo(() => allCues.filter(c => !c.parentCueId), [allCues]);

  const handleAddCue = () => {
    if (allGroups.length === 0) { alert('Create a group first (Groups tab).'); return; }
    // If filter matches exactly one group, add directly to it
    if (fl) {
      const matched = allGroups.filter(g => (g.name||'').toLowerCase().includes(fl));
      if (matched.length === 1) { onAddCue(matched[0].id); return; }
    }
    if (allGroups.length === 1) { onAddCue(allGroups[0].id); return; }
    setAddGroupOpen(true);
  };

  const totalCues  = allCues.filter(c => !isChildCue(c) && c.composingStatus !== 'Omit').length;
  const shownCues  = filteredAndSorted.filter(c => !isChildCue(c) && c.composingStatus !== 'Omit').length;

  const HDR_CELL = { padding: '4px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.055em', color: 'var(--hp-muted, #8B6B5B)', borderRight: '1px solid rgba(212,165,116,0.15)', whiteSpace: 'nowrap' };
  const CELL     = { padding: '3px 6px', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid rgba(212,165,116,0.08)', display: 'flex', alignItems: 'center', minHeight: 30 };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid var(--hp-border, #D4A574)', flexShrink: 0, background: 'var(--hp-surface, #FDF6E3)' }}>
        <div style={{ position: 'relative' }}>
          <input type="text" value={filter||''} onChange={e => onFilterChange(e.target.value)} placeholder="Filter cues by name, group, composer…"
            style={{ ...INP, width: 300, paddingRight: filter ? 24 : 8 }} />
          {filter && <button onClick={() => onFilterChange('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12, padding: 0 }} title="Clear filter (show all cues)">✕</button>}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--hp-muted, #8B6B5B)', fontFamily: 'monospace' }}>
          {filter ? shownCues + ' of ' + totalCues : totalCues} active cue{totalCues !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 9, color: 'var(--hp-muted, #8B6B5B)', marginLeft: 4 }}>R = References · V = Versions · Del = Delete</span>
        <ActionButton label="+ Add Cue" onClick={handleAddCue} small accent />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ minWidth: 1730 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: CUE_COLS, minWidth: 1730, position: 'sticky', top: 0, zIndex: 5, background: 'var(--hp-surface, #FDF6E3)', borderBottom: '2px solid rgba(212,165,116,0.3)' }}>
            {CUE_HDRS.map(h => <div key={h} style={HDR_CELL}>{h}</div>)}
          </div>

          {/* Cue rows */}
          {visibleCues.map(cue => {
            const isSel      = selectedCueId === cue.id;
            const isChild    = isChildCue(cue);
            const hasChildren = !isChild && (childrenByParentId[cue.id]?.length > 0);
            const isCollapsed = hasChildren && collapsedParentIds.has(cue.id);
            const childCount  = childrenByParentId[cue.id]?.length || 0;
            const parent      = isChild ? allCues.find(c => c.id === cue.parentCueId) : null;
            const group       = groupById[cue.groupId];
            const effAct      = isChild ? cueActualDuration(parent) : cueActualDuration(cue);
            const currentVer  = isChild ? (parent ? cueCurrentVersion(parent) : null) : cueCurrentVersion(cue);
            const previewPath = currentVer?.media?.[0]?.path || '';
            const ostWarn     = cue.ostIncluded && !cue.ostTitle && !isChild;
            const ts          = fmtTimestamp(cue.lastModifiedAt);
            const updC        = (field, value) => onUpdateCue(cue.id, { [field]: value });
            const setParent   = pid => {
              if (pid) {
                const pc = allCues.find(c => c.id === pid);
                if (pc?.parentCueId) { alert('Cannot nest more than one level.'); return; }
              }
              updC('parentCueId', pid);
            };

            return (
              <div key={cue.id}
                onClick={() => onSelectCue(isSel ? null : cue.id)}
                style={{
                  display: 'grid', gridTemplateColumns: CUE_COLS, minWidth: 1730,
                  background: isSel ? 'rgba(211,166,37,0.1)' : isChild ? 'rgba(107,164,255,0.025)' : 'transparent',
                  borderBottom: '1px solid rgba(212,165,116,0.1)',
                  borderLeft: isSel ? '3px solid var(--hp-accent, #D3A625)' : isChild ? '3px solid rgba(107,164,255,0.3)' : '3px solid transparent',
                  cursor: 'pointer',
                  opacity: cue.composingStatus === 'Omit' ? 0.42 : 1,
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = isChild ? 'rgba(107,164,255,0.055)' : 'rgba(211,166,37,0.05)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isChild ? 'rgba(107,164,255,0.025)' : 'transparent'; }}>

                {/* Cue Name */}
                <div style={{ ...CELL, gap: 3 }} onClick={e => e.stopPropagation()}>
                  {/* Expand/collapse toggle for parent cues that have children */}
                  {hasChildren && (
                    <button onClick={e => toggleCollapse(cue.id, e)} title={isCollapsed ? `Expand ${childCount} child cue${childCount !== 1 ? 's' : ''}` : 'Collapse child cues'}
                      style={{ width: 14, height: 14, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#6BA4FF', flexShrink: 0, padding: 0, opacity: 0.8 }}>
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                  )}
                  {/* Child cue indent */}
                  {isChild && <span style={{ fontSize: 9, color: '#6BA4FF', opacity: 0.7, flexShrink: 0, marginLeft: 4 }}>↳</span>}
                  {/* Collapsed count badge */}
                  {isCollapsed && (
                    <span style={{ fontSize: 9, color: '#6BA4FF', background: 'rgba(107,164,255,0.15)', border: '1px solid rgba(107,164,255,0.3)', borderRadius: 3, padding: '0 4px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      +{childCount}
                    </span>
                  )}
                  <EditableCell value={cue.name} onCommit={v => updC('name', v)} placeholder="Cue name" />
                </div>

                {/* Group */}
                <div style={CELL}>
                  <span style={{ fontSize: 10, color: 'var(--hp-accent, #D3A625)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={group?.name||''}>
                    {group?.name || <span style={{ color: 'rgba(120,120,120,0.35)', fontStyle: 'italic' }}>—</span>}
                  </span>
                </div>

                {/* Type */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={cue.cueType} onCommit={v => updC('cueType', v)} type="select" options={['', ...CUE_TYPES]} placeholder="—" />
                </div>

                {/* Parent Cue */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  {isChild ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', flex: 1 }}>
                      <span style={{ fontSize: 10, color: '#6BA4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={parent?.name||''}>{parent?.name||'—'}</span>
                      <button onClick={e => { e.stopPropagation(); updC('parentCueId',''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#E07070', padding: '0 2px', flexShrink: 0 }} title="Detach from parent (makes this an original cue)">✕</button>
                    </div>
                  ) : (
                    <FixedSelect
                      value={parentCandidates.find(c => c.id === cue.parentCueId)?.name || (cue.parentCueId ? cue.parentCueId : '')}
                      options={['', ...parentCandidates.filter(c => c.id !== cue.id).map(c => c.name || c.id)]}
                      onChange={v => { const c = parentCandidates.find(x => (x.name||x.id) === v); setParent(c ? c.id : ''); }}
                      placeholder="— Original (no parent) —"
                    />
                  )}
                </div>

                {/* Child Cue — bidirectional: setting a child here sets its parentCueId to this cue */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  {isChild ? (
                    <span style={{ fontSize: 9, color: 'rgba(120,120,120,0.3)', fontStyle: 'italic' }}>—</span>
                  ) : (() => {
                    const myChildren = childrenByParentId[cue.id] || [];
                    const childVal   = myChildren.length === 1 ? myChildren[0].id : '';
                    // Cues eligible to become a child: no parent yet, or already my child
                    const childOpts  = allCues.filter(c => c.id !== cue.id && (!c.parentCueId || c.parentCueId === cue.id));
                    if (myChildren.length > 1) {
                      return (
                        <span style={{ fontSize: 9, color: '#6BA4FF', background: 'rgba(107,164,255,0.12)', border: '1px solid rgba(107,164,255,0.3)', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}
                          title={myChildren.map(c => c.name||c.id).join(', ')}>
                          {myChildren.length} children
                        </span>
                      );
                    }
                    return (
                      <FixedSelect
                        value={childOpts.find(c => c.id === childVal)?.name || (childVal ? childVal : '')}
                        options={['', ...childOpts.map(c => c.name || c.id)]}
                        onChange={v => { const c = childOpts.find(x => (x.name||x.id) === v); onSetChildCue && onSetChildCue(cue.id, c ? c.id : ''); }}
                        placeholder="— None —"
                      />
                    );
                  })()}
                </div>

                {/* Est. */}
                <div style={{ ...CELL, fontFamily: 'monospace' }} onClick={e => e.stopPropagation()}>
                  <EditableCell value={cue.estimatedDuration > 0 ? fmtDur(cue.estimatedDuration) : ''} onCommit={v => updC('estimatedDuration', parseCueDur(v))} placeholder="M:SS" mono disabled={isChild} />
                </div>

                {/* Act. */}
                <div style={{ ...CELL, fontFamily: 'monospace', color: effAct > 0 ? 'var(--hp-text, #3B1010)' : 'rgba(120,120,120,0.3)' }}>
                  {effAct > 0 ? fmtDur(effAct) : '—'}
                </div>

                {/* Current Version — filename + play + attach */}
                <div style={{ ...CELL, gap: 4, overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  {previewPath ? (
                    <>
                      <span
                        onClick={e => { e.stopPropagation(); openPath(previewPath); }}
                        title={previewPath}
                        style={{ fontSize: 9, fontFamily: 'monospace', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6BA4FF', cursor: 'pointer', textDecoration: 'underline dotted' }}>
                        {fileNameFromPath(previewPath)}
                      </span>
                      <MiniPlayer filePath={previewPath} workspaceRoot={workspaceRoot} />
                    </>
                  ) : (
                    <span style={{ fontSize: 9, color: 'rgba(120,120,120,0.35)', fontStyle: 'italic', flex: 1 }}>No audio</span>
                  )}
                  {!isChild && (
                    <button
                      title="Attach / replace audio file — reads WAV duration automatically"
                      onClick={async e => {
                        e.stopPropagation();
                        const fp = await browseMediaFile();
                        if (!fp) return;
                        const isWav = fp.toLowerCase().endsWith('.wav');
                        const dur   = isWav ? await getWavDuration(fp) : 0;
                        const ext   = fp.split('.').pop().toLowerCase();
                        const m     = { id: uid(), type: ['mp4','mp3','wav'].includes(ext) ? ext : 'other', path: fp, name: fileNameFromPath(fp) };
                        const versions = cue.versions || [];
                        if (versions.length === 0) {
                          // No version yet — create v1 with this file
                          const v = defaultVersion({ label: 'v1', createdBy: '', media: [m], actualDuration: dur > 0 ? dur : 0 });
                          onUpdateCue(cue.id, { versions: [v], currentVersionId: v.id });
                        } else {
                          // Add to current version, replacing primary file and updating duration
                          const curVer = cueCurrentVersion(cue);
                          const updatedV = {
                            ...curVer,
                            media: [m, ...(curVer.media||[]).filter(x => x.id !== (curVer.media?.[0]?.id))],
                            actualDuration: dur > 0 ? dur : curVer.actualDuration,
                          };
                          onUpdateCue(cue.id, { versions: versions.map(v => v.id === curVer.id ? updatedV : v) });
                        }
                      }}
                      style={{ width: 18, height: 18, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 3, border: '1px solid rgba(211,166,37,0.3)', background: 'rgba(211,166,37,0.08)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer', padding: 0 }}>
                      +
                    </button>
                  )}
                </div>

                {/* Composer */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={isChild ? (parent?.composer||'') : cue.composer} onCommit={v => { updC('composer', v); if (v && addKnownName) addKnownName(v); }} placeholder="—" disabled={isChild} datalistId="ct-known-names" />
                </div>

                {/* Composing */}
                <div style={{ ...CELL, overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  <StatusPill value={isChild ? (parent?.composingStatus||'Not Started') : (cue.composingStatus||'Not Started')} options={COMPOSING_STATUSES} colors={COMPOSING_COLORS} onChange={isChild ? null : v => updC('composingStatus', v)} disabled={isChild} small />
                </div>

                {/* Impl. */}
                <div style={{ ...CELL, overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  <StatusPill value={cue.implementationStatus||'Not Started'} options={IMPL_STATUSES} colors={IMPL_COLORS} onChange={v => updC('implementationStatus', v)} small />
                </div>

                {/* OST checkbox */}
                <div style={{ ...CELL, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={!!cue.ostIncluded} onChange={e => { e.stopPropagation(); updC('ostIncluded', e.target.checked); }} onClick={e => e.stopPropagation()} disabled={isChild} style={{ cursor: isChild ? 'default' : 'pointer', opacity: isChild ? 0.3 : 1 }} />
                </div>

                {/* OST Title */}
                <div style={{ ...CELL, background: ostWarn ? 'rgba(211,166,37,0.1)' : 'transparent' }} onClick={e => e.stopPropagation()}>
                  {ostWarn && <span style={{ fontSize: 9, color: '#D3A625', fontWeight: 900, marginRight: 3, flexShrink: 0 }} title="OST title required">⚠</span>}
                  <EditableCell value={cue.ostTitle} onCommit={v => updC('ostTitle', v)} placeholder={cue.ostIncluded ? 'Required!' : '—'} disabled={isChild || !cue.ostIncluded} />
                </div>

                {/* Production */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  <EditableCell value={cue.production} onCommit={v => updC('production', v)} type="select" options={PRODUCTION_TYPES} placeholder="—" disabled={isChild} />
                </div>

                {/* Perforce */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  {cue.perforceLocation ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', flex: 1 }}>
                      <button onClick={e => { e.stopPropagation(); openInP4(cue.perforceLocation); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6BA4FF', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', padding: 0, flex: 1, textAlign: 'left' }} title={cue.perforceLocation}>
                        {fileNameFromPath(cue.perforceLocation)||cue.perforceLocation}
                      </button>
                      <button onClick={e => { e.stopPropagation(); updC('perforceLocation',''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#E07070', padding: 0, flexShrink: 0 }}>✕</button>
                    </div>
                  ) : (
                    <EditableCell value={cue.perforceLocation} onCommit={v => updC('perforceLocation', v)} placeholder="Set path…" mono />
                  )}
                </div>

                {/* Wwise */}
                <div style={CELL} onClick={e => e.stopPropagation()}>
                  {cue.wwiseLocation ? (
                    <button onClick={e => { e.stopPropagation(); openPath(cue.wwiseLocation); }} title={cue.wwiseLocation}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6BA4FF', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', padding: 0, width: '100%', textAlign: 'left' }}>
                      {cue.wwiseLocation}
                    </button>
                  ) : (
                    <EditableCell value={cue.wwiseLocation} onCommit={v => updC('wwiseLocation', v)} placeholder="Set path…" mono />
                  )}
                </div>

                {/* Modified */}
                <div style={{ ...CELL, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 }}>
                  {ts ? (
                    <>
                      <span style={{ fontSize: 9, color: 'var(--hp-muted, #8B6B5B)', whiteSpace: 'nowrap' }} title={cue.lastModifiedAt}>{ts}</span>
                      {cue.lastModifiedBy && <span style={{ fontSize: 9, color: 'rgba(120,120,120,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{cue.lastModifiedBy}</span>}
                    </>
                  ) : <span style={{ color: 'rgba(120,120,120,0.3)', fontSize: 9 }}>—</span>}
                </div>

                {/* Actions */}
                <div style={{ ...CELL, gap: 3, justifyContent: 'center', overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                  <button onClick={e => { e.stopPropagation(); onOpenReferences(cue.id); }} title="References (R)"
                    style={{ width: 20, height: 20, fontSize: 9, fontWeight: 700, borderRadius: 3, border: '1px solid rgba(211,166,37,0.3)', background: 'rgba(211,166,37,0.1)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer', padding: 0 }}>R</button>
                  <button onClick={e => { e.stopPropagation(); onOpenReview(cue.id); }} title="Review / Versions (V)"
                    style={{ width: 20, height: 20, fontSize: 9, fontWeight: 700, borderRadius: 3, border: '1px solid rgba(107,164,255,0.3)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: 'pointer', padding: 0 }}>V</button>
                  <button onClick={e => { e.stopPropagation(); onDeleteCue(cue.id); }} title="Delete"
                    style={{ width: 20, height: 20, fontSize: 9, borderRadius: 3, border: '1px solid rgba(180,60,60,0.2)', background: 'rgba(180,60,60,0.08)', color: '#E07070', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>
              </div>
            );
          })}

          {allCues.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 13 }}>
              No cues yet. Switch to the <strong>Groups</strong> tab and click <strong>+ Cue</strong> on a group, or click <strong>+ Add Cue</strong> above.
            </div>
          )}
          {allCues.length > 0 && filteredAndSorted.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--hp-muted, #8B6B5B)', fontSize: 12 }}>
              No cues match "<strong>{filter}</strong>". <button onClick={() => onFilterChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6BA4FF', fontSize: 12, textDecoration: 'underline' }}>Clear filter</button> to see all cues.
            </div>
          )}
        </div>
      </div>

      <AddCueGroupPicker open={addGroupOpen} onClose={() => setAddGroupOpen(false)} groups={allGroups} onAdd={onAddCue} />
    </div>
  );
}

// ─── Variant filename parser ─────────────────────────────────────────
// Expected convention: CueName-vNN-Segment-Stem.wav
// e.g. Com-OV-01-v04-A-NoMel.wav → { cueName:'Com-OV-01', version:'v04', segment:'A', stem:'NoMel' }
function parseVariantFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.*?)-(v\d+)(?:-([\s\S]+))?$/i);
  if (!m) {
    const parts = base.split('-');
    if (parts.length >= 2) return { cueName: '', version: '', segment: parts.slice(0, -1).join('-'), stem: parts[parts.length - 1] };
    return { cueName: '', version: '', segment: base, stem: '' };
  }
  const [, cueName = '', version = '', rest = ''] = m;
  if (!rest) return { cueName, version, segment: '', stem: '' };
  const parts = rest.split('-');
  if (parts.length === 1) return { cueName, version, segment: parts[0], stem: '' };
  return { cueName, version, segment: parts.slice(0, -1).join('-'), stem: parts[parts.length - 1] };
}

// Segment sort order: Intro-like first, alpha middle, Outro/Stinger/Turnaround last
const SEG_FIRST = ['intro', 'opening', 'prelude', 'overture', 'start'];
const SEG_LAST  = ['outro', 'end', 'exit', 'stinger', 'turnaround', 'closing', 'coda', 'tag', 'sting'];
function sortSegmentKeys(segs) {
  return segs.slice().sort((a, b) => {
    const al = a.toLowerCase(); const bl = b.toLowerCase();
    const af = SEG_FIRST.some(k => al === k || al.startsWith(k));
    const bf = SEG_FIRST.some(k => bl === k || bl.startsWith(k));
    const az = SEG_LAST.some(k => al === k || al.includes(k));
    const bz = SEG_LAST.some(k => bl === k || bl.includes(k));
    if (af && !bf) return -1; if (!af && bf) return 1;
    if (az && !bz) return 1;  if (!az && bz) return -1;
    return a.localeCompare(b);
  });
}

// Extract duration from a WAV File object (reads only the 44-byte header)
async function extractWavDurationFromFileObj(file) {
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = e => {
      try {
        const dv = new DataView(e.target.result);
        const byteRate = dv.getUint32(28, true);
        if (!byteRate) { resolve(0); return; }
        const dataSize = dv.getUint32(40, true);
        resolve(dataSize / byteRate);
      } catch { resolve(0); }
    };
    fr.onerror = () => resolve(0);
    fr.readAsArrayBuffer(file.slice(0, 44));
  });
}

// ─── Shared media-load helper ────────────────────────────────────────
async function loadLocalMediaBlob(path, urlRef, setMediaData, setMediaLoading) {
  if (!path || !isPreviewableMedia(path)) return;
  if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  setMediaData(null); setMediaLoading(true);
  try {
    const ext = path.split('.').pop().toLowerCase();
    const b64 = await readFileAsBase64(path);
    if (b64) {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      urlRef.current = blobUrl;
      setMediaData({ type: ext === 'mp4' ? 'video' : 'audio', url: blobUrl, name: fileNameFromPath(path) });
    }
  } catch {}
  setMediaLoading(false);
}

function resolveRefMedia(ref) {
  if (!ref || ref.type === 'text') return null;
  if (ref.type === 'url') {
    const yt = getYouTubeEmbedUrl(ref.address);   if (yt) return { type: 'embed', embedUrl: yt, label: 'YouTube' };
    const vi = getVimeoEmbedUrl(ref.address);      if (vi) return { type: 'embed', embedUrl: vi, label: 'Vimeo' };
    if (DIRECT_VIDEO_EXTS.test(ref.address)) return { type: 'video', url: ref.address };
    if (DIRECT_AUDIO_EXTS.test(ref.address)) return { type: 'audio', url: ref.address };
    return { type: 'url', url: ref.address };
  }
  return ref.address ? 'local' : null;
}

// ─── References Overlay (full-screen, D for groups) ──────────────────
function ReferencesOverlay({ title, subtitle, references, notes, onClose, onUpdateRefs, onUpdateNotes, workspaceRoot }) {
  const [selectedId,   setSelectedId]   = useState(null);
  const [mediaData,    setMediaData]    = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [showAddRef,   setShowAddRef]   = useState(false);
  const [addType,      setAddType]      = useState('file');
  const [addTitle,     setAddTitle]     = useState('');
  const [addAddress,   setAddAddress]   = useState('');
  const [addNotes,     setAddNotes]     = useState('');
  const [notesDraft,   setNotesDraft]   = useState(notes || '');
  const urlRef = useRef(null);

  useEffect(() => { const h = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const selectedRef = (references||[]).find(r => r.id === selectedId);

  const selectRef = id => {
    const ref = (references||[]).find(r => r.id === id);
    setSelectedId(id);
    const resolved = resolveRefMedia(ref);
    if (!resolved) { setMediaData(null); return; }
    if (resolved === 'local') { loadLocalMediaBlob(ref.address, urlRef, setMediaData, setMediaLoading); return; }
    if (!isPreviewableMedia(ref?.address||'') && ref?.type === 'file') { setMediaData({ type: 'other', path: ref.address }); return; }
    setMediaData(resolved);
  };

  const addRef = async () => {
    let address = addAddress;
    if (addType === 'file' && !address) { const p = await browseAnyFile(); if (!p) return; address = p; }
    if (!address && addType !== 'text') return;
    const nr = defaultReference({ type: addType, title: addTitle || fileNameFromPath(address) || 'Note', address, notes: addNotes });
    onUpdateRefs([...(references||[]), nr]); setAddTitle(''); setAddAddress(''); setAddNotes('');
    setSelectedId(nr.id); setShowAddRef(false);
    selectRef(nr.id);
  };

  const delRef = id => { onUpdateRefs((references||[]).filter(r => r.id !== id)); if (selectedId === id) { setSelectedId(null); setMediaData(null); } };
  const updRefNotes = (id, n) => onUpdateRefs((references||[]).map(r => r.id === id ? { ...r, notes: n } : r));
  const TYPE_ICON = { file: '📄', url: '🔗', text: '📝' };
  const MUTED = 'var(--hp-muted, #8B6B5B)'; const BORDER = '1px solid var(--hp-border, #D4A574)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, display: 'flex', flexDirection: 'column', background: 'var(--hp-surface, #FDF6E3)', color: 'var(--hp-text, #3B1010)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderBottom: BORDER, flexShrink: 0, background: 'var(--hp-card, #FFFBF0)' }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 14, color: 'var(--hp-accent, #D3A625)' }}>References</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: MUTED }}>· {subtitle}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: MUTED }}>Esc to close</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: MUTED, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {/* Large media viewer — top ~58% */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', minHeight: 0 }}>
          {mediaLoading && <span style={{ color: '#666', fontSize: 13 }}>Loading…</span>}
          {!mediaLoading && mediaData?.type === 'video' && <video key={mediaData.url} src={mediaData.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />}
          {!mediaLoading && mediaData?.type === 'audio' && <div style={{ textAlign: 'center', color: '#ccc' }}><div style={{ fontSize: 12, marginBottom: 14, color: '#888' }}>{mediaData.name||selectedRef?.title||''}</div><audio key={mediaData.url} src={mediaData.url} controls autoPlay style={{ width: 440 }} /></div>}
          {!mediaLoading && mediaData?.type === 'embed' && <iframe key={mediaData.embedUrl} src={mediaData.embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={mediaData.label||'Video'} />}
          {!mediaLoading && mediaData?.type === 'url' && <div style={{ textAlign: 'center', color: '#888', padding: 32 }}><div style={{ marginBottom: 18, wordBreak: 'break-all', color: '#aaa', fontSize: 12 }}>{mediaData.url}</div><button onClick={() => openUrl(mediaData.url)} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(107,164,255,0.4)', background: 'rgba(107,164,255,0.15)', color: '#6BA4FF', cursor: 'pointer' }}>Open in Browser</button></div>}
          {!mediaLoading && mediaData?.type === 'other' && <div style={{ textAlign: 'center', color: '#888', padding: 32 }}><div style={{ marginBottom: 18, fontFamily: 'monospace', wordBreak: 'break-all', color: '#aaa', fontSize: 11 }}>{selectedRef?.address}</div><button onClick={() => openPath(selectedRef?.address)} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.12)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>{getOfficeAppLabel(selectedRef?.address||'')}</button></div>}
          {!mediaLoading && mediaData?.type !== 'text' && selectedRef?.type === 'text' && <div style={{ padding: 32, color: '#ccc', fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 700, lineHeight: 1.7, overflowY: 'auto', maxHeight: '100%' }}>{selectedRef.address || <em style={{ color: '#555' }}>No text.</em>}</div>}
          {!mediaLoading && !mediaData && !selectedRef && <span style={{ color: '#333', fontSize: 12 }}>Select a reference to preview</span>}
          {!mediaLoading && !mediaData && selectedRef && selectedRef.type !== 'text' && !selectedRef.address && <span style={{ color: '#444', fontSize: 12 }}>No media attached to this reference.</span>}
        </div>

        {/* Bottom: list + details — fixed ~42% */}
        <div style={{ height: '42%', flexShrink: 0, display: 'flex', borderTop: BORDER, minHeight: 160 }}>
          {/* Left: Reference Materials list */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: BORDER, background: 'var(--hp-card, #FFFBF0)' }}>
            <div style={{ padding: '5px 12px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, borderBottom: '1px solid rgba(212,165,116,0.2)' }}>Reference Materials</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!(references||[]).length && <div style={{ padding: '14px 12px', fontSize: 11, fontStyle: 'italic', color: MUTED }}>No references yet.</div>}
              {(references||[]).map(ref => (
                <div key={ref.id} onClick={() => selectRef(ref.id)}
                  style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(212,165,116,0.08)', background: selectedId === ref.id ? 'rgba(211,166,37,0.1)' : 'transparent' }}
                  onMouseEnter={e => { if (selectedId !== ref.id) e.currentTarget.style.background = 'rgba(211,166,37,0.04)'; }}
                  onMouseLeave={e => { if (selectedId !== ref.id) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{TYPE_ICON[ref.type]||'📄'}</span>
                  <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.title || fileNameFromPath(ref.address) || 'Untitled'}</span>
                  <button onClick={e => { e.stopPropagation(); delRef(ref.id); }} style={{ background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', color: '#E07070', opacity: 0.55, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ padding: '7px 12px', borderTop: '1px solid rgba(212,165,116,0.18)', flexShrink: 0 }}>
              <button onClick={() => setShowAddRef(v => !v)} style={{ width: '100%', padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.35)', background: showAddRef ? 'rgba(211,166,37,0.18)' : 'rgba(211,166,37,0.08)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>+ Add Reference</button>
            </div>
          </div>

          {/* Right: Reference Details */}
          <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
            {selectedRef ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Cinzel, serif' }}>Reference Details</div>
                <div style={{ padding: '4px 8px', background: 'rgba(120,120,120,0.06)', borderRadius: 3, border: '1px solid rgba(120,120,120,0.1)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRef.title || fileNameFromPath(selectedRef.address) || 'Untitled'}</span>
                  <span style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>file name / title</span>
                </div>
                {selectedRef.address && selectedRef.type !== 'text' && (
                  <div style={{ padding: '4px 8px', background: 'rgba(120,120,120,0.06)', borderRadius: 3, border: '1px solid rgba(120,120,120,0.1)', fontSize: 10, fontFamily: 'monospace', color: MUTED, wordBreak: 'break-all', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ flex: 1 }}>{selectedRef.address}</span>
                    <span style={{ fontSize: 9, fontFamily: 'inherit', flexShrink: 0 }}>URL / path</span>
                  </div>
                )}
                {selectedRef.address && selectedRef.type !== 'text' && (
                  <button onClick={() => selectedRef.type === 'url' ? openUrl(selectedRef.address) : openPath(selectedRef.address)} style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.35)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: 'pointer' }}>
                    {selectedRef.type === 'url' ? 'Open in Browser' : getOfficeAppLabel(selectedRef.address)}
                  </button>
                )}
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>Notes (editable)</div>
                <textarea value={selectedRef.notes||''} onChange={e => updRefNotes(selectedRef.id, e.target.value)} placeholder="Notes on this reference…" style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} />
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ fontSize: 11, fontStyle: 'italic', color: MUTED }}>Select a reference to view details.</div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>General Notes</div>
                <textarea value={notesDraft} onChange={e => { setNotesDraft(e.target.value); onUpdateNotes(e.target.value); }} placeholder="General notes…" style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} />
              </div>
            )}
          </div>
        </div>

        {/* Add Reference popup card */}
        {showAddRef && (
          <div style={{ position: 'absolute', bottom: 'calc(42% + 8px)', left: 16, zIndex: 20, background: 'var(--hp-card, #FFFBF0)', border: BORDER, borderRadius: 6, boxShadow: '0 4px 24px rgba(0,0,0,0.14)', padding: 14, width: 286 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Cinzel, serif', marginBottom: 9 }}>New Reference</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
              {[['file','File'],['url','Web URL'],['text','Text Field']].map(([t,l]) => (
                <button key={t} onClick={() => setAddType(t)} style={{ flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 600, borderRadius: 3, cursor: 'pointer', background: addType === t ? 'rgba(211,166,37,0.15)' : 'rgba(120,120,120,0.07)', color: addType === t ? 'var(--hp-accent, #D3A625)' : MUTED, border: '1px solid ' + (addType === t ? 'rgba(211,166,37,0.4)' : 'rgba(120,120,120,0.15)') }}>{l}</button>
              ))}
            </div>
            {addType !== 'text' ? (
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <input value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder={addType === 'url' ? 'URL / YouTube / Vimeo…' : 'File path'} style={{ ...INP, flex: 1, fontSize: 10 }} />
                {addType === 'file' && <button onClick={async () => { const f = await browseAnyFile(); if (f) setAddAddress(f); }} style={{ padding: '3px 6px', fontSize: 9, borderRadius: 3, border: BORDER, background: 'var(--hp-card)', cursor: 'pointer', color: MUTED }}>…</button>}
              </div>
            ) : <textarea value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder="Text / notes…" style={{ ...INP, width: '100%', marginBottom: 6, fontSize: 10, resize: 'vertical', minHeight: 48 }} />}
            <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Title (optional)" style={{ ...INP, width: '100%', marginBottom: 6, fontSize: 10 }} />
            <textarea value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...INP, width: '100%', marginBottom: 7, fontSize: 10, resize: 'vertical', minHeight: 32 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={addRef} style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.12)', color: 'var(--hp-accent, #D3A625)', cursor: 'pointer' }}>Add</button>
              <button onClick={() => setShowAddRef(false)} style={{ padding: '5px 10px', fontSize: 10, borderRadius: 3, border: '1px solid rgba(120,120,120,0.2)', background: 'transparent', color: MUTED, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cue Details Overlay (tabbed: References | Review) ──────────────
function CueDetailsOverlay({ cue, groupName, onClose, onUpdateCue, references, notes, onUpdateRefs, onUpdateNotes, workspaceRoot, userName, addKnownName, initialTab }) {
  const [tab,           setTab]          = useState(initialTab || 'references');
  const [mediaData,     setMediaData]    = useState(null);
  const [mediaLoading,  setMediaLoading] = useState(false);
  const urlRef = useRef(null);
  // References tab
  const [selectedRefId, setSelectedRefId] = useState(null);
  const [showAddRef,    setShowAddRef]   = useState(false);
  const [addType,       setAddType]      = useState('file');
  const [addTitle,      setAddTitle]     = useState('');
  const [addAddress,    setAddAddress]   = useState('');
  const [addRefNotes,   setAddRefNotes]  = useState('');
  const [notesDraft,    setNotesDraft]   = useState(notes || '');
  // Review tab
  const [selectedVid,   setSelectedVid]  = useState(cue.currentVersionId || (cue.versions||[])[0]?.id || null);
  const [selectedRevId, setSelectedRevId] = useState(null);
  // Variants tab
  const [variantsDragging,  setVariantsDragging]  = useState(false);
  const [collapsedSegs,     setCollapsedSegs]     = useState(new Set());
  const variantFileInputRef = useRef(null);

  useEffect(() => { const h = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => { setMediaData(null); if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } }, [tab]);

  const clearMedia = () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } setMediaData(null); };

  const selectRef = id => {
    const ref = (references||[]).find(r => r.id === id);
    setSelectedRefId(id); clearMedia();
    const resolved = resolveRefMedia(ref);
    if (!resolved) return;
    if (resolved === 'local') { loadLocalMediaBlob(ref.address, urlRef, setMediaData, setMediaLoading); return; }
    if (!isPreviewableMedia(ref?.address||'') && ref?.type === 'file') { setMediaData({ type: 'other', path: ref.address }); return; }
    setMediaData(resolved);
  };

  const selectedRef     = (references||[]).find(r => r.id === selectedRefId);
  const selectedVersion = (cue.versions||[]).find(v => v.id === selectedVid);
  const versionReviews  = (() => {
    if (!selectedVersion) return [];
    if ((selectedVersion.reviews||[]).length > 0) return selectedVersion.reviews;
    if (selectedVersion.reviewerName || selectedVersion.reviewerComments || selectedVersion.reviewerStatus)
      return [{ id: 'legacy', reviewerName: selectedVersion.reviewerName||'', status: selectedVersion.reviewerStatus||'', comments: selectedVersion.reviewerComments||'' }];
    return [];
  })();
  const selectedReview = versionReviews.find(r => r.id === selectedRevId);

  const updVer = (vid, changes) => onUpdateCue(cue.id, { versions: (cue.versions||[]).map(v => v.id === vid ? { ...v, ...changes } : v) });

  const addVersion = () => {
    const n = (cue.versions?.length || 0) + 1;
    const v = defaultVersion({ label: 'v' + n, createdBy: userName || '' });
    onUpdateCue(cue.id, { versions: [...(cue.versions||[]), v], currentVersionId: v.id });
    setSelectedVid(v.id);
  };

  const addVersionMedia = async vid => {
    const fp = await browseMediaFile(); if (!fp) return;
    const dur = fp.toLowerCase().endsWith('.wav') ? await getWavDuration(fp) : 0;
    const ext = fp.split('.').pop().toLowerCase();
    const m = { id: uid(), type: ['mp4','mp3','wav'].includes(ext) ? ext : 'other', path: fp, name: fileNameFromPath(fp) };
    const v = (cue.versions||[]).find(v => v.id === vid); if (!v) return;
    const upd = { ...v, media: [...(v.media||[]), m] };
    if (dur > 0 && !v.actualDuration) upd.actualDuration = dur;
    onUpdateCue(cue.id, { versions: (cue.versions||[]).map(ver => ver.id === vid ? upd : ver) });
  };

  const removeVersionMedia = (vid, mid) => onUpdateCue(cue.id, { versions: (cue.versions||[]).map(v => v.id === vid ? { ...v, media: (v.media||[]).filter(m => m.id !== mid) } : v) });

  const addReview = () => {
    if (!selectedVersion) return;
    const r = defaultReview();
    updVer(selectedVid, { reviews: [...(selectedVersion.reviews||[]), r] });
    setSelectedRevId(r.id);
  };
  const updReview = (rid, ch) => {
    if (!selectedVersion) return;
    updVer(selectedVid, { reviews: (selectedVersion.reviews||[]).map(r => r.id === rid ? { ...r, ...ch } : r) });
  };
  const delReview = rid => {
    if (!selectedVersion) return;
    updVer(selectedVid, { reviews: (selectedVersion.reviews||[]).filter(r => r.id !== rid) });
    if (selectedRevId === rid) setSelectedRevId(null);
  };

  const addRef = async () => {
    let address = addAddress;
    if (addType === 'file' && !address) { const p = await browseAnyFile(); if (!p) return; address = p; }
    if (!address && addType !== 'text') return;
    const nr = defaultReference({ type: addType, title: addTitle || fileNameFromPath(address) || 'Note', address, notes: addRefNotes });
    onUpdateRefs([...(references||[]), nr]); setAddTitle(''); setAddAddress(''); setAddRefNotes('');
    setSelectedRefId(nr.id); setShowAddRef(false); selectRef(nr.id);
  };
  const delRef = id => { onUpdateRefs((references||[]).filter(r => r.id !== id)); if (selectedRefId === id) { setSelectedRefId(null); clearMedia(); } };
  const updRefNotes = (id, n) => onUpdateRefs((references||[]).map(r => r.id === id ? { ...r, notes: n } : r));

  const processVariantFiles = async (files) => {
    if (!selectedVid) return;
    const newVars = [];
    for (const file of files) {
      const path = file.path || '';
      const parsed = parseVariantFilename(file.name);
      let dur = 0;
      if (file.name.toLowerCase().endsWith('.wav')) dur = await extractWavDurationFromFileObj(file);
      newVars.push({ id: uid(), fileName: file.name, path, segment: parsed.segment || '(unset)', stem: parsed.stem || 'Fullmix', parsedVersion: parsed.version, duration: dur, addedAt: new Date().toISOString() });
    }
    const v = (cue.versions||[]).find(v => v.id === selectedVid); if (!v) return;
    updVer(selectedVid, { variants: [...(v.variants||[]), ...newVars] });
  };

  const updVariant = (vid, varId, ch) => {
    const v = (cue.versions||[]).find(v => v.id === vid); if (!v) return;
    updVer(vid, { variants: (v.variants||[]).map(x => x.id === varId ? { ...x, ...ch } : x) });
  };

  const TYPE_ICON = { file: '📄', url: '🔗', text: '📝' };
  const MUTED = 'var(--hp-muted, #8B6B5B)'; const BORDER = '1px solid var(--hp-border, #D4A574)';
  const ACCENT = 'var(--hp-accent, #D3A625)';

  // ── Shared media viewer ─────────────────────────────────────────────
  const renderMedia = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', minHeight: 0, overflow: 'hidden' }}>
      {mediaLoading && <span style={{ color: '#666', fontSize: 13 }}>Loading…</span>}
      {!mediaLoading && mediaData?.type === 'video' && <video key={mediaData.url} src={mediaData.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />}
      {!mediaLoading && mediaData?.type === 'audio' && <div style={{ textAlign: 'center', color: '#ccc' }}><div style={{ fontSize: 12, marginBottom: 14, color: '#888' }}>{mediaData.name||''}</div><audio key={mediaData.url} src={mediaData.url} controls autoPlay style={{ width: 440 }} /></div>}
      {!mediaLoading && mediaData?.type === 'embed' && <iframe key={mediaData.embedUrl} src={mediaData.embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={mediaData.label||'Video'} />}
      {!mediaLoading && mediaData?.type === 'url' && <div style={{ textAlign: 'center', color: '#888', padding: 32 }}><div style={{ marginBottom: 18, wordBreak: 'break-all', color: '#aaa', fontSize: 12 }}>{mediaData.url}</div><button onClick={() => openUrl(mediaData.url)} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(107,164,255,0.4)', background: 'rgba(107,164,255,0.15)', color: '#6BA4FF', cursor: 'pointer' }}>Open in Browser</button></div>}
      {!mediaLoading && mediaData?.type === 'other' && <div style={{ textAlign: 'center', color: '#888', padding: 32 }}><div style={{ marginBottom: 16, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: '#aaa' }}>{selectedRef?.address||''}</div><button onClick={() => openPath(selectedRef?.address)} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.12)', color: ACCENT, cursor: 'pointer' }}>{getOfficeAppLabel(selectedRef?.address||'')}</button></div>}
      {!mediaLoading && selectedRef?.type === 'text' && !mediaData && <div style={{ padding: 32, color: '#ccc', fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 700, lineHeight: 1.7, overflowY: 'auto', maxHeight: '100%' }}>{selectedRef.address || <em style={{ color: '#555' }}>No text.</em>}</div>}
      {!mediaLoading && !mediaData && !selectedRef?.type && <span style={{ color: '#333', fontSize: 12 }}>{tab === 'references' ? 'Select a reference to preview' : 'Click a media file to preview'}</span>}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, display: 'flex', flexDirection: 'column', background: 'var(--hp-surface, #FDF6E3)', color: 'var(--hp-text, #3B1010)' }}>
      {/* Header with tab switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: BORDER, flexShrink: 0, background: 'var(--hp-card, #FFFBF0)' }}>
        <div style={{ display: 'flex', borderRadius: 4, border: BORDER, overflow: 'hidden' }}>
          {[['references','References'],['review','Review'],['variants','Variants']].map(([t,l],i) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 13px', fontSize: 10, fontWeight: 700, background: tab === t ? 'rgba(211,166,37,0.15)' : 'transparent', color: tab === t ? ACCENT : MUTED, border: 'none', borderLeft: i > 0 ? BORDER : 'none', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Cinzel, serif' }}>{cue.name || 'Cue'}</span>
        {groupName && <span style={{ fontSize: 11, color: MUTED }}>— {groupName}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: MUTED }}>Esc to close</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: MUTED, lineHeight: 1 }}>✕</button>
      </div>

      {/* ── REFERENCES TAB ─────────────────────────────────────────── */}
      {tab === 'references' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {renderMedia()}
          {/* Bottom: list + details */}
          <div style={{ height: '42%', flexShrink: 0, display: 'flex', borderTop: BORDER, minHeight: 160 }}>
            {/* Left: Reference Materials */}
            <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: BORDER, background: 'var(--hp-card, #FFFBF0)' }}>
              <div style={{ padding: '5px 12px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, borderBottom: '1px solid rgba(212,165,116,0.2)' }}>Reference Materials</div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!(references||[]).length && <div style={{ padding: '14px 12px', fontSize: 11, fontStyle: 'italic', color: MUTED }}>No references yet.</div>}
                {(references||[]).map(ref => (
                  <div key={ref.id} onClick={() => selectRef(ref.id)}
                    style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(212,165,116,0.08)', background: selectedRefId === ref.id ? 'rgba(211,166,37,0.1)' : 'transparent' }}
                    onMouseEnter={e => { if (selectedRefId !== ref.id) e.currentTarget.style.background = 'rgba(211,166,37,0.04)'; }}
                    onMouseLeave={e => { if (selectedRefId !== ref.id) e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{TYPE_ICON[ref.type]||'📄'}</span>
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.title || fileNameFromPath(ref.address) || 'Untitled'}</span>
                    <button onClick={e => { e.stopPropagation(); delRef(ref.id); }} style={{ background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', color: '#E07070', opacity: 0.55, padding: 0, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ padding: '7px 12px', borderTop: '1px solid rgba(212,165,116,0.18)', flexShrink: 0 }}>
                <button onClick={() => setShowAddRef(v => !v)} style={{ width: '100%', padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.35)', background: showAddRef ? 'rgba(211,166,37,0.18)' : 'rgba(211,166,37,0.08)', color: ACCENT, cursor: 'pointer' }}>+ Add Reference</button>
              </div>
            </div>
            {/* Right: Reference Details */}
            <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
              {selectedRef ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Cinzel, serif' }}>Reference Details</div>
                  <div style={{ padding: '4px 8px', background: 'rgba(120,120,120,0.06)', borderRadius: 3, border: '1px solid rgba(120,120,120,0.1)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRef.title || fileNameFromPath(selectedRef.address) || 'Untitled'}</span>
                    <span style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>file name / title</span>
                  </div>
                  {selectedRef.address && selectedRef.type !== 'text' && (
                    <div style={{ padding: '4px 8px', background: 'rgba(120,120,120,0.06)', borderRadius: 3, border: '1px solid rgba(120,120,120,0.1)', fontSize: 10, fontFamily: 'monospace', color: MUTED, wordBreak: 'break-all' }}>
                      {selectedRef.address} <span style={{ fontSize: 9, fontFamily: 'inherit', float: 'right', color: MUTED }}>URL / path</span>
                    </div>
                  )}
                  {selectedRef.address && selectedRef.type !== 'text' && (
                    <button onClick={() => selectedRef.type === 'url' ? openUrl(selectedRef.address) : openPath(selectedRef.address)} style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.35)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: 'pointer' }}>
                      {selectedRef.type === 'url' ? 'Open in Browser' : getOfficeAppLabel(selectedRef.address)}
                    </button>
                  )}
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>Notes (editable)</div>
                  <textarea value={selectedRef.notes||''} onChange={e => updRefNotes(selectedRef.id, e.target.value)} placeholder="Notes on this reference…" style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} />
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: MUTED }}>Select a reference to view details.</div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>General Notes</div>
                  <textarea value={notesDraft} onChange={e => { setNotesDraft(e.target.value); onUpdateNotes(e.target.value); }} placeholder="General notes for this cue…" style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} />
                </div>
              )}
            </div>
          </div>
          {/* Add Reference popup */}
          {showAddRef && (
            <div style={{ position: 'absolute', bottom: 'calc(42% + 8px)', left: 16, zIndex: 20, background: 'var(--hp-card, #FFFBF0)', border: BORDER, borderRadius: 6, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', padding: 14, width: 290 }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Cinzel, serif', marginBottom: 9 }}>New Reference</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                {[['file','File'],['url','Web URL'],['text','Text Field']].map(([t,l]) => (
                  <button key={t} onClick={() => setAddType(t)} style={{ flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 600, borderRadius: 3, cursor: 'pointer', background: addType === t ? 'rgba(211,166,37,0.15)' : 'rgba(120,120,120,0.07)', color: addType === t ? ACCENT : MUTED, border: '1px solid ' + (addType === t ? 'rgba(211,166,37,0.4)' : 'rgba(120,120,120,0.15)') }}>{l}</button>
                ))}
              </div>
              {addType !== 'text' ? (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <input value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder={addType === 'url' ? 'URL / YouTube / Vimeo…' : 'File path'} style={{ ...INP, flex: 1, fontSize: 10 }} />
                  {addType === 'file' && <button onClick={async () => { const f = await browseAnyFile(); if (f) setAddAddress(f); }} style={{ padding: '3px 6px', fontSize: 9, borderRadius: 3, border: BORDER, background: 'var(--hp-card)', cursor: 'pointer', color: MUTED }}>…</button>}
                </div>
              ) : <textarea value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder="Text content…" style={{ ...INP, width: '100%', marginBottom: 6, fontSize: 10, resize: 'vertical', minHeight: 48 }} />}
              <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Title (optional)" style={{ ...INP, width: '100%', marginBottom: 6, fontSize: 10 }} />
              <textarea value={addRefNotes} onChange={e => setAddRefNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...INP, width: '100%', marginBottom: 7, fontSize: 10, resize: 'vertical', minHeight: 32 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={addRef} style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.12)', color: ACCENT, cursor: 'pointer' }}>Add</button>
                <button onClick={() => setShowAddRef(false)} style={{ padding: '5px 10px', fontSize: 10, borderRadius: 3, border: '1px solid rgba(120,120,120,0.2)', background: 'transparent', color: MUTED, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW TAB ────────────────────────────────────────────── */}
      {tab === 'review' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {renderMedia()}

          {/* Three columns: Versions | Notes | Media */}
          <div style={{ height: '30%', flexShrink: 0, display: 'flex', borderTop: BORDER, minHeight: 130 }}>
            {/* Versions */}
            <div style={{ width: 185, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: BORDER, background: 'var(--hp-card, #FFFBF0)' }}>
              <div style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(212,165,116,0.2)', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Versions</span>
                <button onClick={addVersion} style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 2, border: '1px solid rgba(211,166,37,0.4)', background: 'rgba(211,166,37,0.08)', color: ACCENT, cursor: 'pointer' }}>+ Add</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!(cue.versions||[]).length && <div style={{ padding: 12, fontSize: 10, fontStyle: 'italic', color: MUTED }}>No versions yet.</div>}
                {[...(cue.versions||[])].reverse().map(v => {
                  const isCurrent = cue.currentVersionId === v.id; const isSel = selectedVid === v.id;
                  return (
                    <div key={v.id} onClick={() => setSelectedVid(v.id)}
                      style={{ padding: '5px 10px', cursor: 'pointer', borderBottom: '1px solid rgba(212,165,116,0.07)', background: isSel ? 'rgba(211,166,37,0.1)' : 'transparent', display: 'flex', alignItems: 'center', gap: 5 }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(211,166,37,0.04)'; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                      <input type="radio" checked={isCurrent} onChange={e => { e.stopPropagation(); onUpdateCue(cue.id, { currentVersionId: v.id }); }} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} title="Set as current version" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          {v.label}
                          {isCurrent && <span style={{ fontSize: 7, padding: '0 3px', borderRadius: 2, background: 'rgba(40,160,80,0.15)', color: '#4AE08A', fontWeight: 700 }}>CURRENT</span>}
                        </div>
                        <div style={{ fontSize: 9, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.createdBy||''}{v.createdBy && v.actualDuration > 0 ? ' · ' : ''}{v.actualDuration > 0 ? fmtDur(v.actualDuration) : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes (composer notes for selected version) */}
            <div style={{ flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 5, borderRight: BORDER, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Notes</span>
                {selectedVersion && (
                  <>
                    <input value={selectedVersion.createdBy||''} onChange={e => updVer(selectedVersion.id, { createdBy: e.target.value })} onBlur={e => { if (e.target.value.trim() && addKnownName) addKnownName(e.target.value.trim()); }} list="ct-known-names" placeholder="Composer" style={{ ...INP, fontSize: 10, width: 110, padding: '2px 5px' }} />
                    <input value={selectedVersion.label||''} onChange={e => updVer(selectedVersion.id, { label: e.target.value })} style={{ ...INP, fontSize: 10, width: 40, padding: '2px 4px' }} placeholder="Label" />
                  </>
                )}
              </div>
              <textarea value={selectedVersion?.composerNotes||''} onChange={e => selectedVersion && updVer(selectedVersion.id, { composerNotes: e.target.value })} placeholder={selectedVersion ? 'Composer notes…' : 'Select a version first'} disabled={!selectedVersion} style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} />
              {selectedVersion && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: MUTED, whiteSpace: 'nowrap' }}>Perforce:</span>
                  <input value={selectedVersion.perforceLocation||''} onChange={e => updVer(selectedVersion.id, { perforceLocation: e.target.value })} placeholder="Depot path" style={{ ...INP, flex: 1, fontSize: 10, fontFamily: 'monospace' }} />
                  {selectedVersion.perforceLocation && <button onClick={() => openInP4(selectedVersion.perforceLocation)} style={{ padding: '2px 7px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.3)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: 'pointer', flexShrink: 0 }}>P4</button>}
                </div>
              )}
            </div>

            {/* Media files */}
            <div style={{ width: 225, flexShrink: 0, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, flexShrink: 0 }}>Media</span>
              {!selectedVersion && <span style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>Select a version</span>}
              {selectedVersion && <>
                {(selectedVersion.media||[]).map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <button onClick={() => loadLocalMediaBlob(m.path, urlRef, setMediaData, setMediaLoading)} style={{ flex: 1, textAlign: 'left', background: 'rgba(107,164,255,0.08)', border: '1px solid rgba(107,164,255,0.18)', borderRadius: 3, padding: '3px 6px', cursor: 'pointer', color: '#6BA4FF', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.path}>▶ {m.name || fileNameFromPath(m.path)}</button>
                    <button onClick={() => openPath(m.path)} style={{ padding: '3px 5px', fontSize: 9, borderRadius: 3, border: '1px solid rgba(211,166,37,0.3)', background: 'rgba(211,166,37,0.08)', cursor: 'pointer', color: ACCENT, flexShrink: 0 }} title="Open file">→</button>
                    <button onClick={() => removeVersionMedia(selectedVersion.id, m.id)} style={{ padding: '3px 4px', fontSize: 8, borderRadius: 3, border: '1px solid rgba(180,60,60,0.2)', background: 'rgba(180,60,60,0.06)', cursor: 'pointer', color: '#E07070', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => addVersionMedia(selectedVersion.id)} style={{ padding: '3px 8px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.3)', background: 'rgba(107,164,255,0.08)', color: '#6BA4FF', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 2 }}>+ Add Media</button>
              </>}
            </div>
          </div>

          {/* Review section — full width, multi-reviewer list */}
          <div style={{ flex: 1, display: 'flex', borderTop: '2px solid var(--hp-border, #D4A574)', minHeight: 0 }}>
            {/* Reviewer list */}
            <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: BORDER, background: 'var(--hp-card, #FFFBF0)' }}>
              <div style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(212,165,116,0.2)', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Review</span>
                <button onClick={addReview} disabled={!selectedVersion} style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 2, border: '1px solid rgba(107,164,255,0.35)', background: 'rgba(107,164,255,0.08)', color: '#6BA4FF', cursor: selectedVersion ? 'pointer' : 'default', opacity: selectedVersion ? 1 : 0.4 }}>+ Add Review</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!selectedVersion && <div style={{ padding: 12, fontSize: 10, color: MUTED, fontStyle: 'italic' }}>Select a version first.</div>}
                {selectedVersion && !versionReviews.length && <div style={{ padding: 12, fontSize: 10, color: MUTED, fontStyle: 'italic' }}>No reviews yet — click "+ Add Review".</div>}
                {versionReviews.map(rev => {
                  const rc = REVIEWER_COLORS[rev.status||''] || REVIEWER_COLORS[''];
                  const isSel = selectedRevId === rev.id;
                  return (
                    <div key={rev.id} onClick={() => setSelectedRevId(isSel ? null : rev.id)}
                      style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(212,165,116,0.07)', background: isSel ? 'rgba(107,164,255,0.1)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(107,164,255,0.04)'; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rev.reviewerName || <span style={{ color: MUTED, fontStyle: 'italic' }}>Unnamed</span>}</div>
                        {rev.status && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: rc.bg, color: rc.text, border: '1px solid ' + rc.border, fontWeight: 700 }}>{rev.status}</span>}
                      </div>
                      {rev.id !== 'legacy' && <button onClick={e => { e.stopPropagation(); delReview(rev.id); }} style={{ background: 'none', border: 'none', fontSize: 9, cursor: 'pointer', color: '#E07070', opacity: 0.55, padding: 0, flexShrink: 0 }}>✕</button>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Review detail panel */}
            <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {selectedReview ? (
                <>
                  <input value={selectedReview.reviewerName||''} onChange={e => updReview(selectedReview.id, { reviewerName: e.target.value })} onBlur={e => { if (e.target.value.trim() && addKnownName) addKnownName(e.target.value.trim()); }} list="ct-known-names" placeholder="Reviewer name" style={{ ...INP, fontSize: 12, fontWeight: 600, padding: '5px 8px' }} disabled={selectedReview.id === 'legacy'} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>Status:</span>
                    <StatusPill value={selectedReview.status||''} options={REVIEWER_STATUSES} colors={REVIEWER_COLORS} onChange={v => updReview(selectedReview.id, { status: v })} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em' }}>Comments</div>
                  <textarea value={selectedReview.comments||''} onChange={e => updReview(selectedReview.id, { comments: e.target.value })} placeholder="Review comments…" style={{ ...INP, flex: 1, resize: 'none', fontSize: 11 }} disabled={selectedReview.id === 'legacy'} />
                  {selectedReview.id === 'legacy' && <div style={{ fontSize: 9, color: MUTED, fontStyle: 'italic' }}>Migrated from previous version — read only. Re-add via "+ Add Review" to edit.</div>}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12, textAlign: 'center' }}>
                  {selectedVersion ? 'Select a reviewer or click "+ Add Review"' : 'Select a version first'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VARIANTS TAB ──────────────────────────────────────── */}
      {tab === 'variants' && (() => {
        const allVariants = selectedVersion?.variants || [];
        const segMap = {};
        allVariants.forEach(v => { const s = v.segment || '(unset)'; if (!segMap[s]) segMap[s] = []; segMap[s].push(v); });
        const sortedSegs = sortSegmentKeys(Object.keys(segMap));
        const totalFiles = allVariants.length;
        const totalSegs  = sortedSegs.length;
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {renderMedia()}
            {/* Controls bar */}
            <div style={{ flexShrink: 0, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: BORDER, background: 'var(--hp-card, #FFFBF0)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.06em' }}>Version:</span>
              <select value={selectedVid||''} onChange={e => setSelectedVid(e.target.value || null)} style={{ ...INP, fontSize: 10, padding: '2px 6px', width: 130 }}>
                {!(cue.versions||[]).length && <option value="">— no versions —</option>}
                {[...(cue.versions||[])].reverse().map(v => (
                  <option key={v.id} value={v.id}>{v.label}{cue.currentVersionId === v.id ? ' (current)' : ''}</option>
                ))}
              </select>
              <input ref={variantFileInputRef} type="file" multiple accept=".wav,.mp3,.mp4" style={{ display: 'none' }} onChange={async e => { if (e.target.files.length) await processVariantFiles(Array.from(e.target.files)); e.target.value = ''; }} />
              <button onClick={() => variantFileInputRef.current?.click()} disabled={!selectedVersion}
                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 3, border: '1px solid rgba(107,164,255,0.35)', background: 'rgba(107,164,255,0.1)', color: '#6BA4FF', cursor: selectedVersion ? 'pointer' : 'default', opacity: selectedVersion ? 1 : 0.45 }}>
                + Browse WAVs
              </button>
              {totalFiles > 0 && <span style={{ fontSize: 10, color: MUTED }}>{totalSegs} segment{totalSegs !== 1 ? 's' : ''} · {totalFiles} file{totalFiles !== 1 ? 's' : ''}</span>}
              <div style={{ flex: 1 }} />
              {totalFiles > 0 && <button onClick={() => { if (confirm('Clear all variants for this version?')) updVer(selectedVid, { variants: [] }); }} style={{ padding: '3px 8px', fontSize: 9, borderRadius: 3, border: '1px solid rgba(180,60,60,0.25)', background: 'rgba(180,60,60,0.06)', color: '#E07070', cursor: 'pointer' }}>Clear All</button>}
            </div>
            {/* Drop zone + segments list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', position: 'relative' }}
              onDragOver={e => { e.preventDefault(); if (selectedVersion) setVariantsDragging(true); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setVariantsDragging(false); }}
              onDrop={async e => { e.preventDefault(); setVariantsDragging(false); if (selectedVersion) await processVariantFiles(Array.from(e.dataTransfer.files)); }}>
              {variantsDragging && selectedVersion && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(107,164,255,0.07)', border: '2px dashed rgba(107,164,255,0.5)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#6BA4FF' }}>Drop WAV files here</span>
                </div>
              )}
              {!selectedVersion && <div style={{ textAlign: 'center', padding: '48px 20px', color: MUTED, fontSize: 12 }}>Select a version above to manage its variant files.</div>}
              {selectedVersion && totalFiles === 0 && (
                <div style={{ border: '2px dashed rgba(107,164,255,0.22)', borderRadius: 6, padding: '36px 20px', textAlign: 'center', color: MUTED }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>📂</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hp-text, #3B1010)', marginBottom: 4 }}>Drag & drop WAV files here</div>
                  <div style={{ fontSize: 10, marginBottom: 14, lineHeight: 1.6 }}>
                    Files are auto-organised by name convention:<br />
                    <code style={{ background: 'rgba(120,120,120,0.1)', padding: '1px 5px', borderRadius: 3, fontSize: 9 }}>CueName-vNN-Segment-Stem.wav</code>
                  </div>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 16, lineHeight: 1.8 }}>
                    <em>Com-OV-01-v04-A-NoMel.wav</em> → Segment <strong>A</strong>, Stem <strong>NoMel</strong><br />
                    <em>Com-OV-01-v04-EndStinger-Fullmix.wav</em> → Segment <strong>EndStinger</strong>, Stem <strong>Fullmix</strong>
                  </div>
                  <button onClick={() => variantFileInputRef.current?.click()} style={{ padding: '6px 16px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(107,164,255,0.4)', background: 'rgba(107,164,255,0.12)', color: '#6BA4FF', cursor: 'pointer' }}>Browse Files</button>
                </div>
              )}
              {selectedVersion && totalFiles > 0 && sortedSegs.map(seg => {
                const segVars = segMap[seg];
                const isCollapsed = collapsedSegs.has(seg);
                return (
                  <div key={seg} style={{ marginBottom: 5 }}>
                    {/* Segment header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(211,166,37,0.08)', borderRadius: 4, marginBottom: isCollapsed ? 0 : 1 }}>
                      <span onClick={() => setCollapsedSegs(s => { const n = new Set(s); n.has(seg) ? n.delete(seg) : n.add(seg); return n; })}
                        style={{ fontSize: 10, color: ACCENT, cursor: 'pointer', userSelect: 'none', flexShrink: 0, width: 12 }}>{isCollapsed ? '▶' : '▼'}</span>
                      <input
                        value={seg === '(unset)' ? '' : seg}
                        onChange={e => {
                          const newSeg = e.target.value || '(unset)';
                          updVer(selectedVid, { variants: (selectedVersion.variants||[]).map(x => x.segment === seg ? { ...x, segment: newSeg } : x) });
                          setCollapsedSegs(s => { const n = new Set(s); if (s.has(seg)) { n.delete(seg); n.add(newSeg); } return n; });
                        }}
                        placeholder="Segment name"
                        style={{ ...INP, fontSize: 11, fontWeight: 700, padding: '1px 5px', width: 130, background: 'transparent', border: '1px solid transparent', outline: 'none' }}
                        onFocus={e => { e.target.style.border = BORDER; e.target.style.background = 'var(--hp-card)'; }}
                        onBlur={e => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ fontSize: 9, color: MUTED }}>({segVars.length} stem{segVars.length !== 1 ? 's' : ''})</span>
                    </div>
                    {!isCollapsed && segVars.map(variant => (
                      <div key={variant.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 26px', borderBottom: '1px solid rgba(212,165,116,0.06)' }}>
                        <input value={variant.stem||''} onChange={e => updVariant(selectedVid, variant.id, { stem: e.target.value })} placeholder="Stem" style={{ ...INP, width: 88, fontSize: 10, padding: '1px 4px', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 9, fontFamily: 'monospace', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={variant.path || variant.fileName}>{variant.fileName}</span>
                        {variant.duration > 0 && <span style={{ fontSize: 9, fontFamily: 'monospace', color: MUTED, flexShrink: 0, minWidth: 36 }}>{fmtDur(variant.duration)}</span>}
                        {variant.path && <button onClick={() => loadLocalMediaBlob(variant.path, urlRef, setMediaData, setMediaLoading)} style={{ padding: '2px 5px', fontSize: 9, borderRadius: 3, border: '1px solid rgba(107,164,255,0.25)', background: 'rgba(107,164,255,0.08)', color: '#6BA4FF', cursor: 'pointer', flexShrink: 0 }} title="Preview">▶</button>}
                        {variant.path && <button onClick={() => openPath(variant.path)} style={{ padding: '2px 4px', fontSize: 9, borderRadius: 3, border: '1px solid rgba(211,166,37,0.25)', background: 'rgba(211,166,37,0.06)', color: ACCENT, cursor: 'pointer', flexShrink: 0 }} title="Open">→</button>}
                        <button onClick={() => updVer(selectedVid, { variants: (selectedVersion.variants||[]).filter(x => x.id !== variant.id) })} style={{ padding: '2px 4px', fontSize: 8, borderRadius: 3, border: '1px solid rgba(180,60,60,0.2)', background: 'rgba(180,60,60,0.06)', color: '#E07070', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── ProjectSwitcher ─────────────────────────────────────────────────
function ProjectSwitcher({ projects, activeId, onSwitch, onRename, onCreate, onDelete }) {
  const [open,        setOpen]        = useState(false);
  const [renamingId,  setRenamingId]  = useState(null);
  const [renameVal,   setRenameVal]   = useState('');
  const trigRef   = useRef(null);
  const dropDiv   = useRef(null);
  const openRef   = useRef(false);
  const inputsRef = useRef({});  // keyed by project id

  const closeDrop = useCallback(() => {
    if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} dropDiv.current = null; }
    openRef.current = false;
    setOpen(false);
    setRenamingId(null);
  }, []);

  // Rebuild the dropdown whenever it's open and state changes
  const buildDrop = useCallback(() => {
    if (!trigRef.current) return;
    const r   = trigRef.current.getBoundingClientRect();
    const div = dropDiv.current || document.createElement('div');
    div.setAttribute('data-grudge-drop', '1');
    div.innerHTML = '';
    div.style.cssText = [
      'position:fixed',
      `top:${r.bottom + 3}px`,
      `left:${r.left}px`,
      'min-width:220px',
      'z-index:2147483647',
      'background:#1a2a1a',
      'border:1px solid #4a7a4a',
      'border-radius:6px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.55)',
      'overflow:hidden',
      'font-family:Crimson Text,Georgia,serif',
      'font-size:12px',
    ].join(';');

    // Header
    const hdr = document.createElement('div');
    hdr.textContent = 'Switch Project';
    hdr.style.cssText = 'padding:7px 11px 5px;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(180,160,120,0.6);border-bottom:1px solid rgba(255,255,255,0.08);';
    div.appendChild(hdr);

    // Project rows
    projects.forEach(p => {
      const isActive = p.id === activeId;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 8px 0 10px;border-bottom:1px solid rgba(255,255,255,0.05);' + (isActive ? 'background:rgba(211,166,37,0.12);' : '');

      // Active dot
      const dot = document.createElement('span');
      dot.textContent = isActive ? '●' : '○';
      dot.style.cssText = 'font-size:7px;flex-shrink:0;color:' + (isActive ? '#D3A625' : 'rgba(180,160,120,0.3)') + ';';
      row.appendChild(dot);

      // Name / rename input
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'flex:1;min-width:0;cursor:pointer;padding:8px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + (isActive ? '#D3A625' : '#e8dcc0') + ';font-weight:' + (isActive ? '700' : '400') + ';';
      nameEl.textContent = p.name || 'Unnamed';
      if (!isActive) {
        nameEl.addEventListener('mouseenter', () => { nameEl.style.color = '#D3A625'; });
        nameEl.addEventListener('mouseleave', () => { nameEl.style.color = '#e8dcc0'; });
        nameEl.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onSwitch(p.id); closeDrop(); });
      }
      row.appendChild(nameEl);

      // Rename button
      const ren = document.createElement('button');
      ren.textContent = '✎';
      ren.title = 'Rename';
      ren.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;color:rgba(180,160,120,0.45);padding:4px 3px;flex-shrink:0;';
      ren.addEventListener('mouseenter', () => { ren.style.color = '#D3A625'; });
      ren.addEventListener('mouseleave', () => { ren.style.color = 'rgba(180,160,120,0.45)'; });
      ren.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        // Close portal, open inline rename via React state
        closeDrop();
        setTimeout(() => { setRenamingId(p.id); setRenameVal(p.name || ''); setOpen(true); }, 30);
      });
      row.appendChild(ren);

      // Delete button (only when >1 project)
      if (projects.length > 1) {
        const del = document.createElement('button');
        del.textContent = '✕';
        del.title = 'Delete project';
        del.style.cssText = 'background:none;border:none;cursor:pointer;font-size:10px;color:rgba(180,60,60,0.4);padding:4px 3px;flex-shrink:0;';
        del.addEventListener('mouseenter', () => { del.style.color = '#E07070'; });
        del.addEventListener('mouseleave', () => { del.style.color = 'rgba(180,60,60,0.4)'; });
        del.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          if (confirm('Delete project "' + (p.name||'Unnamed') + '"? This cannot be undone.')) { onDelete(p.id); }
          closeDrop();
        });
        row.appendChild(del);
      }

      div.appendChild(row);
    });

    // New project button
    const newBtn = document.createElement('div');
    newBtn.textContent = '+ New Project';
    newBtn.style.cssText = 'padding:8px 11px;cursor:pointer;color:rgba(107,164,255,0.85);font-size:11px;font-weight:600;border-top:1px solid rgba(255,255,255,0.08);';
    newBtn.addEventListener('mouseenter', () => { newBtn.style.background = 'rgba(107,164,255,0.08)'; });
    newBtn.addEventListener('mouseleave', () => { newBtn.style.background = ''; });
    newBtn.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      closeDrop();
      const name = prompt('New project name:');
      if (name?.trim()) onCreate(name.trim());
    });
    div.appendChild(newBtn);

    if (!dropDiv.current) {
      document.body.appendChild(div);
      dropDiv.current = div;
    }
  }, [projects, activeId, onSwitch, onCreate, onDelete, closeDrop]);

  useEffect(() => () => { if (dropDiv.current) { try { document.body.removeChild(dropDiv.current); } catch {} } }, []);

  useEffect(() => {
    if (!open || renamingId) return;
    buildDrop();
    const h = e => {
      if (trigRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-grudge-drop]')) return;
      closeDrop();
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [open, renamingId, buildDrop, closeDrop]);

  const toggle = e => {
    e.stopPropagation();
    if (openRef.current) { closeDrop(); return; }
    openRef.current = true;
    setOpen(true);
  };

  const activeProject = projects.find(p => p.id === activeId);
  const trigStyle = { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, border: '1px solid transparent', userSelect: 'none' };

  return (
    <div ref={trigRef} onClick={toggle} style={trigStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(211,166,37,0.3)'; e.currentTarget.style.background = 'rgba(211,166,37,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}>
      {renamingId ? (
        <input
          autoFocus
          value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(renamingId, renameVal); setRenamingId(null); setOpen(false); }
            if (e.key === 'Escape') { setRenamingId(null); setOpen(false); }
          }}
          onBlur={() => { onRename(renamingId, renameVal); setRenamingId(null); setOpen(false); }}
          onClick={e => e.stopPropagation()}
          style={{ ...INP, fontSize: 11, padding: '1px 5px', width: 150 }}
        />
      ) : (
        <>
          <span style={{ fontSize: 10, color: 'var(--hp-muted, #8B6B5B)' }}>/</span>
          <span style={{ fontSize: 11, color: 'var(--hp-text, #3B1010)', fontWeight: 500 }}>{activeProject?.name || '—'}</span>
          <span style={{ fontSize: 7, color: 'var(--hp-muted, #8B6B5B)', opacity: 0.7 }}>▾</span>
        </>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function CueTrackerView() {
  const [store, setStore] = useState(() => {
    const ls   = loadFromLS();
    const base = ls ? ls : defaultStore();
    if (base.projects) base.projects = base.projects.map(migrateProjectIfNeeded);
    return base;
  });
  const [activeTab,       setActiveTab]       = useState('groups');
  const [cueFilter,       setCueFilter]       = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedCueId,   setSelectedCueId]   = useState(null);
  const [overlay,         setOverlay]         = useState(null);
  const [syncStatus,      setSyncStatus]      = useState('idle');
  const [lastSyncAt,      setLastSyncAt]      = useState(null);
  const [lastSyncWriter,  setLastSyncWriter]  = useState('');
  const [userName,        setUserName]        = useState('');
  const [showHistory,       setShowHistory]       = useState(false);
  const [boardSentGroupIds, setBoardSentGroupIds] = useState(() => new Set());
  const [boardAvailable,    setBoardAvailable]    = useState(false);
  const syncTimerRef       = useRef(null);
  const initialSyncDoneRef = useRef(false);
  const storeRef           = useRef(store);

  const settings      = store.settings || {};
  const dbPath        = settings.sharedDbPath || DEFAULT_DB_PATH;
  const workspaceRoot = settings.workspaceRoot || '';

  const project = useMemo(() => {
    const p = (store.projects||[]).find(p => p.id === store.activeProjectId);
    return p || store.projects?.[0] || null;
  }, [store.projects, store.activeProjectId]);

  useEffect(() => { getAppUsername().then(n => setUserName(n||'')); }, []);
  useEffect(() => { saveToLS(store); storeRef.current = store; }, [store]);

  // Detect optional integrations on mount (graceful — never blocks the app)
  useEffect(() => {
    const api = window.appAPI || window.electronAPI;
    if (!api?.listDiscoveredExtensions) return;
    Promise.resolve(api.listDiscoveredExtensions()).then(discovered => {
      const exts = Array.isArray(discovered) ? discovered : Object.values(discovered || {});
      setBoardAvailable(exts.some(e => (e.id === 'gameDesign' || e.id === 'game-design') && e.installed !== false));
    }).catch(() => {});
  }, []);

  // Auto-create default project
  useEffect(() => {
    if (!store.projects?.length) {
      const p = defaultProject('Main Project');
      setStore(s => ({ ...s, projects: [p], activeProjectId: p.id }));
    } else if (!store.activeProjectId) {
      setStore(s => ({ ...s, activeProjectId: s.projects[0].id }));
    }
  }, [store.projects?.length, store.activeProjectId]);

  const doSync = useCallback(async () => {
    if (!dbPath) return;
    const currentStore = storeRef.current;
    setSyncStatus('syncing');

    if (!initialSyncDoneRef.current) {
      // First load: read remote, merge, apply to local state once
      const { store: merged, writeId } = await syncReadMergeWrite(dbPath, currentStore, userName||'Unknown');
      if (writeId === null) { setSyncStatus('error'); return; }
      const remote = await readSharedDB(dbPath);
      if (remote?._meta?.lastWriter && remote._meta.lastWriter !== (userName||'Unknown')) setLastSyncWriter(remote._meta.lastWriter);
      setStore(s => ({ ...merged, settings: s.settings }));
      setSyncStatus(writeId ? 'synced' : 'offline');
      setLastSyncAt(new Date());
      initialSyncDoneRef.current = true;
    } else {
      // Subsequent ticks: autosave only — write current state without replacing it
      const writeId = await writeSharedDB(dbPath, currentStore, userName||'Unknown');
      if (writeId === null) { setSyncStatus('error'); return; }
      setSyncStatus('synced');
      setLastSyncAt(new Date());
    }
  }, [dbPath, userName]);

  useEffect(() => {
    initialSyncDoneRef.current = false;
    doSync();
    syncTimerRef.current = setInterval(doSync, SYNC_INTERVAL);
    return () => clearInterval(syncTimerRef.current);
  }, [dbPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = e => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if ((e.key === 'd' || e.key === 'D') && selectedGroupId) { e.preventDefault(); setOverlay({ type: 'group-details', id: selectedGroupId }); }
      if ((e.key === 'r' || e.key === 'R') && selectedCueId)   { e.preventDefault(); setOverlay({ type: 'cue-references', id: selectedCueId }); }
      if ((e.key === 'v' || e.key === 'V') && selectedCueId)   { e.preventDefault(); setOverlay({ type: 'cue-review', id: selectedCueId }); }
      if (e.key === 'Delete' && selectedCueId)                  { e.preventDefault(); deleteCue(selectedCueId); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedGroupId, selectedCueId]);

  // Safe-access so the useCallback hooks below always run on every render
  // (conditional early returns must come AFTER all hooks — Rules of Hooks)
  const allGroups = project?.groups || [];
  const allCues   = project?.cues   || [];

  const setProjectField = (changes) => {
    if (!project) return;
    setStore(s => ({
      ...s,
      projects: s.projects.map(p => p.id === project.id ? { ...p, ...changes, lastSavedBy: userName, lastSavedAt: new Date().toISOString() } : p),
    }));
  };

  const knownNames = store.knownNames || [];
  const addKnownName = useCallback((name) => {
    if (!name?.trim()) return;
    const trimmed = name.trim();
    setStore(s => {
      const existing = s.knownNames || [];
      if (existing.includes(trimmed)) return s;
      return { ...s, knownNames: [...existing, trimmed].sort((a, b) => a.localeCompare(b)) };
    });
  }, []);

  const handleSendGroupToBoard = useCallback((groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    const groupCues = allCues.filter(c => c.groupId === groupId);
    const patch = buildBoardPatchFromGroup(group, groupCues, workspaceRoot);
    const api = window.appAPI || window.electronAPI;
    if (typeof api?.interopPublish !== 'function') return;
    api.interopPublish({ channel: 'gameDesign/ai/board-patch', payload: patch, source: 'cue-tracker' });
    setBoardSentGroupIds(prev => { const next = new Set(prev); next.add(groupId); return next; });
  }, [allGroups, allCues]);

  // Project management
  const switchProject = (id) => setStore(s => ({ ...s, activeProjectId: id }));
  const renameProject = (id, name) => {
    if (!name?.trim()) return;
    setStore(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, name: name.trim() } : p) }));
  };
  const createProject = (name) => {
    const p = defaultProject(name);
    setStore(s => ({ ...s, projects: [...(s.projects||[]), p], activeProjectId: p.id }));
  };
  const deleteProject = (id) => {
    setStore(s => {
      const remaining = (s.projects||[]).filter(p => p.id !== id);
      const nextActive = s.activeProjectId === id ? (remaining[0]?.id || null) : s.activeProjectId;
      return { ...s, projects: remaining, activeProjectId: nextActive };
    });
  };

  // Guard: project is null on the first tick while the auto-create effect fires
  if (!project) return <div style={{ padding: 32, color: 'var(--hp-muted, #8B6B5B)', fontSize: 13 }}>Initializing…</div>;

  const updateGroup  = (gid, ch) => setProjectField({ groups: allGroups.map(g => g.id === gid ? { ...g, ...ch } : g) });
  const addGroup     = ()        => { const g = defaultGroup(); setProjectField({ groups: [...allGroups, g] }); setSelectedGroupId(g.id); };
  const deleteGroup  = gid       => { setProjectField({ groups: allGroups.filter(g => g.id !== gid) }); if (selectedGroupId === gid) setSelectedGroupId(null); };

  const updateCue = (cid, ch) => setProjectField({ cues: allCues.map(c => c.id === cid ? { ...c, ...ch, lastModifiedBy: userName, lastModifiedAt: new Date().toISOString() } : c) });

  // Bidirectional child-cue link: setting child on parentId clears old children and sets the new one
  const setChildCue = (parentId, newChildId) => {
    const now = new Date().toISOString();
    setProjectField({
      cues: allCues.map(c => {
        if (c.parentCueId === parentId && c.id !== newChildId) return { ...c, parentCueId: '', lastModifiedBy: userName, lastModifiedAt: now };
        if (newChildId && c.id === newChildId) {
          if (c.parentCueId && c.parentCueId !== parentId) {
            alert(`"${c.name||c.id}" already has a parent. Detach it first.`);
            return c;
          }
          return { ...c, parentCueId: parentId, lastModifiedBy: userName, lastModifiedAt: now };
        }
        return c;
      }),
    });
  };
  const addCue    = (groupId) => {
    const c = defaultCue({ groupId: groupId || allGroups[0]?.id || '' });
    setProjectField({ cues: [...allCues, c] });
    setSelectedCueId(c.id);
  };
  const deleteCue = cid => {
    if (!confirm('Delete this cue?')) return;
    setProjectField({ cues: allCues.filter(c => c.id !== cid).map(c => c.parentCueId === cid ? { ...c, parentCueId: '' } : c) });
    if (selectedCueId === cid) setSelectedCueId(null);
  };

  const handleSelectGroup = (id) => {
    setSelectedGroupId(id === selectedGroupId ? null : id);
    setSelectedCueId(null);
  };

  const handleViewCues = (groupId) => {
    const g = allGroups.find(g => g.id === groupId);
    setSelectedGroupId(groupId);
    if (g) setCueFilter(g.name);
    setActiveTab('cues');
  };

  const handleRestoreFromHistory = async fp => {
    const ok = await restoreFromHistory(dbPath, fp);
    if (ok) {
      const remote = await readSharedDB(dbPath);
      if (remote?.projects) setStore(s => ({ ...s, projects: remote.projects.map(migrateProjectIfNeeded) }));
    }
    return ok;
  };

  const overlayGroup   = overlay?.type === 'group-details' ? allGroups.find(g => g.id === overlay.id) : null;
  const overlayCue     = (overlay?.type === 'cue-references' || overlay?.type === 'cue-review') ? allCues.find(c => c.id === overlay.id) : null;
  const overlayGrpName = overlayCue ? (allGroups.find(g => g.id === overlayCue.groupId)?.name || '') : '';

  const syncDot = { syncing: '#6BA4FF', synced: '#4AE08A', error: '#E07070', offline: '#999', idle: '#888' }[syncStatus] || '#888';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'Crimson Text, Georgia, serif', background: 'var(--hp-surface, #FDF6E3)', color: 'var(--hp-text, #3B1010)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px solid var(--hp-border, #D4A574)', flexShrink: 0, background: 'var(--hp-card, #FFFBF0)', height: 36 }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 14, color: 'var(--hp-accent, #D3A625)', letterSpacing: '0.03em' }}>GrudgeDB</span>
        <ProjectSwitcher
          projects={store.projects || []}
          activeId={store.activeProjectId}
          onSwitch={switchProject}
          onRename={renameProject}
          onCreate={createProject}
          onDelete={deleteProject}
        />
        {boardAvailable && (
          <span title="Game Design Board integration active — Groups can be sent to the board" style={{ fontSize: 8, padding: '2px 6px', borderRadius: 10, background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)', fontWeight: 700, letterSpacing: '0.04em', cursor: 'default' }}>BOARD ✓</span>
        )}
        <div style={{ flex: 1 }} />
        <ActionButton label="History" onClick={() => setShowHistory(true)} small disabled={!dbPath} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: syncDot, display: 'inline-block' }} />
          <span style={{ color: 'var(--hp-muted, #8B6B5B)' }}>{syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync error' : syncStatus === 'offline' ? 'Local only' : lastSyncAt ? lastSyncAt.toLocaleTimeString() : 'Connecting…'}</span>
          {userName && <span style={{ color: 'var(--hp-accent, #D3A625)', fontWeight: 600, marginLeft: 4 }}>{userName}</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--hp-border, #D4A574)', flexShrink: 0, background: 'var(--hp-card, #FFFBF0)', paddingLeft: 12 }}>
        {[['groups','Groups'],['cues','Cues']].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '7px 18px', fontSize: 12, fontWeight: activeTab === tab ? 700 : 400, fontFamily: 'Cinzel, serif', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--hp-accent, #D3A625)' : '2px solid transparent', marginBottom: -2, cursor: 'pointer', color: activeTab === tab ? 'var(--hp-accent, #D3A625)' : 'var(--hp-muted, #8B6B5B)', transition: 'color 0.15s' }}>
            {label}
          </button>
        ))}
        {activeTab === 'cues' && cueFilter && (
          <span style={{ fontSize: 10, color: '#6BA4FF', marginLeft: 8 }}>
            Filtered: <strong>{cueFilter}</strong>
            <button onClick={() => { setCueFilter(''); setSelectedGroupId(null); }} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#E07070', fontSize: 11, padding: 0 }}>✕</button>
          </span>
        )}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Global datalist for name autocomplete — used by all person fields */}
        <datalist id="ct-known-names">
          {knownNames.map(n => <option key={n} value={n} />)}
        </datalist>

        {activeTab === 'groups' && (
          <GroupsTable
            project={project} allCues={allCues} allGroups={allGroups}
            onUpdateGroup={updateGroup} onAddGroup={addGroup} onDeleteGroup={deleteGroup}
            onAddCue={addCue}
            onOpenGroupDetails={id => setOverlay({ type: 'group-details', id })}
            onSendGroupToBoard={boardAvailable ? handleSendGroupToBoard : null} boardSentGroupIds={boardSentGroupIds}
            selectedGroupId={selectedGroupId}
            onSelectGroup={handleSelectGroup}
            onViewCues={handleViewCues}
            addKnownName={addKnownName}
          />
        )}
        {activeTab === 'cues' && (
          <CuesTable
            project={project} allCues={allCues} allGroups={allGroups}
            onUpdateCue={updateCue} onAddCue={addCue} onDeleteCue={deleteCue} onSetChildCue={setChildCue}
            onOpenReferences={id => setOverlay({ type: 'cue-references', id })}
            onOpenReview={id => setOverlay({ type: 'cue-review', id })}
            workspaceRoot={workspaceRoot}
            selectedCueId={selectedCueId}
            onSelectCue={id => setSelectedCueId(id)}
            filter={cueFilter} onFilterChange={v => { setCueFilter(v); if (!v) setSelectedGroupId(null); }}
            addKnownName={addKnownName}
          />
        )}
      </div>

      {/* Overlays */}
      {overlay?.type === 'group-details' && overlayGroup && (
        <ReferencesOverlay
          title={overlayGroup.name} subtitle={overlayGroup.chapter}
          references={overlayGroup.references||[]} notes={overlayGroup.notes||''}
          onClose={() => setOverlay(null)}
          onUpdateRefs={refs => updateGroup(overlayGroup.id, { references: refs })}
          onUpdateNotes={n => updateGroup(overlayGroup.id, { notes: n })}
          workspaceRoot={workspaceRoot}
        />
      )}
      {(overlay?.type === 'cue-references' || overlay?.type === 'cue-review') && overlayCue && (
        <CueDetailsOverlay
          cue={overlayCue} groupName={overlayGrpName}
          references={overlayCue.references||[]} notes={overlayCue.notes||''}
          onClose={() => setOverlay(null)}
          onUpdateCue={updateCue}
          onUpdateRefs={refs => updateCue(overlayCue.id, { references: refs })}
          onUpdateNotes={n => updateCue(overlayCue.id, { notes: n })}
          workspaceRoot={workspaceRoot}
          userName={userName}
          addKnownName={addKnownName}
          initialTab={overlay.type === 'cue-review' ? 'review' : 'references'}
        />
      )}

      <HistoryModal open={showHistory} onClose={() => setShowHistory(false)} dbPath={dbPath} onRestore={handleRestoreFromHistory} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Cue Tracker — Extension service
 * Exposes a public API that other extensions can call to read cue data
 * and query Jira ticket info for linked missions.
 *
 * Data source priority: shared DB file on network drive > localStorage cache.
 *
 * Usage from other extensions:
 *   window.cueTrackerAPI.getProjects()
 *   window.cueTrackerAPI.getActiveProject()
 *   window.cueTrackerAPI.getCues()
 *   window.cueTrackerAPI.getJiraIssue('AUDIO-101')
 *   window.cueTrackerAPI.getSyncStatus()
 *   window.cueTrackerAPI.getHistory()
 *   window.cueTrackerAPI.restoreFromHistory('2026-03-19T14-30-00_Jose.json')
 */

const STORE_KEY = 'cueTrackerData';
const JIRA_KEY = 'cueTrackerJira';
const JIRA_DEFAULTS = { defaultProjectKeys: 'SUNDANCE', domain: 'wbg-avalanche.atlassian.net' };

function readLocalStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readJiraCreds() {
  try {
    const raw = localStorage.getItem(JIRA_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...JIRA_DEFAULTS, ...parsed };
  } catch {
    return { ...JIRA_DEFAULTS };
  }
}

async function readSharedDB(invoke) {
  const local = readLocalStore();
  const dbPath = local?.settings?.sharedDbPath;
  if (!dbPath || !invoke) return null;
  try {
    const raw = await invoke('marketplace_read_text_file', { path: dbPath });
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function jiraRequest(endpoint, appAPI) {
  const creds = readJiraCreds();
  if (!creds?.domain || !creds?.email || !creds?.token) return null;
  const base = creds.domain.startsWith('http') ? creds.domain : 'https://' + creds.domain;
  const url = base + '/rest/api/3/' + endpoint;
  const auth = 'Basic ' + btoa(creds.email + ':' + creds.token);
  const headers = { Authorization: auth, Accept: 'application/json' };
  const bridge = appAPI || window.electronAPI || {};

  const httpJson = bridge.httpRequestJson;
  if (typeof httpJson === 'function') {
    try {
      const { status, data } = await httpJson({ url, method: 'GET', headers, body: null });
      if (status === 200 && data) return data;
    } catch {
      /* fall through */
    }
  }

  const invoke = bridge.tauriInvoke || window.electronAPI?.tauriInvoke;
  if (!invoke) return null;
  try {
    const resp = await invoke('http_request', { url, method: 'GET', headers, body: null });
    if (!resp || resp.status !== 200 || typeof resp.body !== 'string') return null;
    return JSON.parse(resp.body);
  } catch {
    return null;
  }
}

function init(appAPI) {
  let _invoke = appAPI?.tauriInvoke || window.electronAPI?.tauriInvoke || null;

  function getData() {
    return readLocalStore();
  }

  const publicAPI = {
    getProjects() {
      const data = getData();
      return data?.projects || [];
    },

    getActiveProject() {
      const data = getData();
      if (!data) return null;
      return data.projects?.find(p => p.id === data.activeProjectId) || null;
    },

    getCues() {
      const project = publicAPI.getActiveProject();
      return project?.cues || [];
    },

    getMissions() {
      const cues = publicAPI.getCues();
      const missions = new Map();
      cues.forEach(c => {
        if ((c.depth ?? 2) === 0 && c.mission) {
          missions.set(c.mission, { id: c.mission, name: c.name, status: c.status });
        }
      });
      return Array.from(missions.values());
    },

    getSettings() {
      const data = getData();
      return data?.settings || {};
    },

    getJiraLinks() {
      const project = publicAPI.getActiveProject();
      return project?.jiraLinks || {};
    },

    async getJiraIssue(issueKey) {
      if (!issueKey) return null;
      const data = await jiraRequest(
        'issue/' + encodeURIComponent(issueKey) + '?fields=summary,status,assignee,priority',
        { tauriInvoke: _invoke }
      );
      if (!data?.fields) return null;
      return {
        key: data.key,
        summary: data.fields.summary || '',
        status: data.fields.status?.name || '',
        statusColor: data.fields.status?.statusCategory?.colorName || '',
        assignee: data.fields.assignee?.displayName || '',
        priority: data.fields.priority?.name || '',
      };
    },

    isJiraConfigured() {
      const creds = readJiraCreds();
      return !!(creds?.domain && creds?.email && creds?.token);
    },

    getSyncStatus() {
      const data = getData();
      const dbPath = data?.settings?.sharedDbPath;
      return {
        sharedDbPath: dbPath || null,
        isSharedEnabled: !!dbPath,
      };
    },

    async getSharedProjects() {
      if (!_invoke) return null;
      const shared = await readSharedDB(_invoke);
      return shared?.projects || null;
    },

    async getSharedMeta() {
      if (!_invoke) return null;
      const shared = await readSharedDB(_invoke);
      return shared?._meta || null;
    },

    async getHistory() {
      if (!_invoke) return [];
      const local = readLocalStore();
      const dbPath = local?.settings?.sharedDbPath;
      if (!dbPath) return [];
      const histDir = dbPath.replace(/[^\\/]+$/, '') + 'history';
      const safe = histDir.replace(/'/g, "''");
      try {
        const r = await _invoke('run_powershell', {
          script: `
            Get-ChildItem -Path '${safe}' -Filter '*.json' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object {
              $sz = [math]::Round($_.Length / 1024, 1)
              "$($_.Name)|$($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))|${sz}KB"
            }
          `,
        });
        if (!r?.stdout) return [];
        return r.stdout.trim().split('\n').map(function(line) {
          var parts = line.trim().split('|');
          if (parts.length < 3) return null;
          return { fileName: parts[0], date: parts[1], size: parts[2] };
        }).filter(Boolean);
      } catch { return []; }
    },

    async restoreFromHistory(fileName) {
      if (!_invoke || !fileName) return false;
      const local = readLocalStore();
      const dbPath = local?.settings?.sharedDbPath;
      if (!dbPath) return false;
      const histDir = dbPath.replace(/[^\\/]+$/, '') + 'history';
      const filePath = histDir + '\\' + fileName;
      try {
        const raw = await _invoke('marketplace_read_text_file', { path: filePath });
        if (!raw) return false;
        JSON.parse(raw);
        await _invoke('marketplace_write_text_file', { path: dbPath, contents: raw });
        return true;
      } catch { return false; }
    },
  };

  window.cueTrackerAPI = publicAPI;

  console.log('[CueTracker] Service initialized — window.cueTrackerAPI ready');
}

module.exports = { init };

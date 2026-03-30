import React, { useState, useEffect, useCallback } from 'react';

const STORE_KEY = 'cueTrackerData';
const JIRA_KEY = 'cueTrackerJira';
const JIRA_DEFAULTS = { defaultProjectKeys: 'SUNDANCE', domain: 'wbg-avalanche.atlassian.net' };

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data.settings || {};
  } catch { return {}; }
}

function saveSettings(updates) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : { projects: [], activeProjectId: null, settings: {} };
    data.settings = { ...data.settings, ...updates };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return data.settings;
  } catch { return {}; }
}

function loadJiraCreds() {
  try {
    const raw = localStorage.getItem(JIRA_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...JIRA_DEFAULTS, ...parsed };
  } catch {
    return { ...JIRA_DEFAULTS };
  }
}

function normalizeInvokeError(err) {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err.message != null && String(err.message)) return String(err.message);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function jiraTestHint(strategy, status, raw, errMsg) {
  const r = String(raw || '');
  const e = String(errMsg || '').trim();
  const b = `${r} ${e}`.toLowerCase();
  const parts = [`Step: ${strategy}`];
  if (status === 401 || status === 403) {
    parts.push('Atlassian rejected auth — regenerate API token at id.atlassian.com; email must match the Jira account.');
  } else if (status === 404) {
    parts.push('404 — domain should be like wbg-avalanche.atlassian.net (no /jira path).');
  } else if (/not allowed|command .*not allowed|missing permission|forbidden by acl|permission denied|denied by the access control/i.test(b)) {
    parts.push(
      'Tauri IPC blocked http_request — add allow permission for this command in capabilities (desktop.json). See error text below.',
    );
    if (e && e !== '[object Object]') parts.push(e.length > 360 ? `${e.slice(0, 360)}…` : e);
  } else if (!status || status === 0) {
    if (e && e !== '[object Object]') {
      parts.push(e.length > 360 ? `Backend: ${e.slice(0, 360)}…` : `Backend: ${e}`);
    }
    if (/http error:|connection|tls|timeout|dns|refused|proxy|network|unreachable|could not connect/i.test(b)) {
      parts.push(
        'Often VPN/proxy/firewall/DNS or corporate TLS inspection — also check Jira bridge log (bridge:httpRequest:invokeError).',
      );
    } else if (!e || e === '[object Object]') {
      parts.push('No HTTP status — open Jira bridge log and read bridge:httpRequest:invokeError.');
    }
  } else if (status && status >= 400) {
    parts.push(`HTTP ${status} — see response preview in log or below.`);
  }
  return parts.join(' ');
}

function saveJiraCreds(creds) {
  try { localStorage.setItem(JIRA_KEY, JSON.stringify(creds)); }
  catch { /* quota */ }
}

/** Same paths Avalanche uses for bundled vs dev (see avalanche/storage.py templates.json). */
const AVALANCHE_TEMPLATES_CANDIDATES = [
  'C:\\Users\\Jose.Abraham\\Downloads\\avalanche\\dist\\templates.json',
  'C:\\Users\\Jose.Abraham\\Downloads\\avalanche\\templates.json',
];

function hostnameFromAvalancheBase(base) {
  const s = String(base || '').trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) return new URL(s).hostname || '';
  } catch { /* ignore */ }
  return s.replace(/^https?:\/\//i, '').split('/')[0].replace(/\/+$/, '');
}

async function importJiraFromAvalancheTemplates() {
  const invoke = window.electronAPI?.tauriInvoke;
  if (!invoke) return { ok: false, error: 'Tauri bridge not available' };
  for (const p of AVALANCHE_TEMPLATES_CANDIDATES) {
    try {
      const ok = await invoke('marketplace_path_exists', { path: p });
      if (!ok) continue;
      const raw = await invoke('marketplace_read_text_file', { path: p });
      if (!raw || typeof raw !== 'string') continue;
      const data = JSON.parse(raw);
      const j = data?.meta?.jira;
      if (!j?.email || !j?.token) continue;
      const domain = hostnameFromAvalancheBase(j.base) || JIRA_DEFAULTS.domain;
      return {
        ok: true,
        creds: {
          domain,
          email: String(j.email).trim(),
          token: String(j.token).trim(),
        },
        path: p,
      };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    error: 'No saved Jira login in Avalanche. Open Avalanche → Set Jira API → Save, then try again.',
  };
}

async function browseFolder() {
  const invoke = window.electronAPI?.tauriInvoke;
  if (!invoke) return null;
  try {
    const r = await invoke('run_powershell', {
      script: `
        Add-Type -AssemblyName System.Windows.Forms
        $d = New-Object System.Windows.Forms.FolderBrowserDialog
        $d.Description = 'Select Wwise / audio workspace folder'
        if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }
      `,
    });
    return r?.stdout?.trim() || null;
  } catch { return null; }
}

async function testJiraConnection(creds) {
  if (!creds?.domain || !creds?.email || !creds?.token) return { ok: false, error: 'Fill in all fields first' };
  window.jiraBridgeLog?.('ext:settings:testJiraConnection:start', {
    domain: String(creds.domain || '').slice(0, 96),
    hasEmail: !!creds.email,
    hasToken: !!creds.token,
  });
  const base = creds.domain.startsWith('http') ? creds.domain : 'https://' + creds.domain;
  const url = base.replace(/\/+$/, '') + '/rest/api/3/myself';
  const auth = 'Basic ' + btoa(creds.email + ':' + creds.token);

  function parseMe(data) {
    return { ok: true, name: data.displayName || data.display_name || '(connected)', email: data.emailAddress || '' };
  }

  function fail(strategy, status, raw, err, shortMsg) {
    const hint = jiraTestHint(strategy, status, raw, err);
    const detail = shortMsg ? `${shortMsg} | ${hint}` : hint;
    window.jiraBridgeLog?.('ext:settings:testJiraConnection:stepFailed', { strategy, status, preview: String(raw || '').slice(0, 220), hint });
    return { ok: false, error: detail };
  }

  const log = (tag, detail) => console.info('[CueTracker][Jira][Settings]', tag, detail ?? '');
  const warn = (tag, detail) => console.warn('[CueTracker][Jira][Settings]', tag, detail ?? '');
  log('testJiraConnection: start', { url: url.split('?')[0], hasTauriInvoke: typeof window.electronAPI?.tauriInvoke === 'function', hasHttpRequestJson: typeof window.electronAPI?.httpRequestJson === 'function' });

  let transportErr = '';

  if (typeof window.electronAPI?.httpRequestJson === 'function') {
    try {
      const { status, data, raw } = await window.electronAPI.httpRequestJson({
        url,
        method: 'GET',
        headers: { Authorization: auth, Accept: 'application/json' },
        body: null,
      });
      log('httpRequestJson /myself', { status, hasData: !!data, rawPreview: raw ? String(raw).slice(0, 400) : '' });
      if (status === 200 && data) return parseMe(data);
      let jiraMsg = '';
      try {
        const j = raw ? JSON.parse(raw) : null;
        if (j?.errorMessages?.length) jiraMsg = j.errorMessages.join('; ');
        if (j?.message) jiraMsg = jiraMsg ? `${jiraMsg} — ${j.message}` : j.message;
      } catch { /* ignore */ }
      if (status === 401 || status === 403) {
        return fail('httpRequestJson', status, raw, null, jiraMsg || `HTTP ${status} (unauthorized)`);
      }
      if (status && status !== 200) {
        return fail('httpRequestJson', status, raw, null, jiraMsg || `HTTP ${status}`);
      }
      if (status === 0 && raw) {
        transportErr = String(raw);
        warn('httpRequestJson transport error (trying fetch next)', { preview: transportErr.slice(0, 180) });
      }
    } catch (e) {
      warn('httpRequestJson threw (trying fetch/invoke next)', e?.message || String(e));
    }
  }

  let fetchThrew = false;
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    log('fetch /myself', { status: resp.status, ok: resp.ok, contentType: resp.headers?.get?.('content-type') || '' });
    if (resp.ok) {
      const me = await resp.json();
      return parseMe(me);
    }
    let preview = '';
    try {
      preview = (await resp.clone().text()).slice(0, 400);
    } catch { /* ignore */ }
    warn('fetch non-OK', { status: resp.status, bodyPreview: preview });
    if (resp.status === 401 || resp.status === 403) {
      return fail('fetch', resp.status, preview, null, `HTTP ${resp.status}`);
    }
    return fail('fetch', resp.status, preview, null, `HTTP ${resp.status}`);
  } catch (fetchErr) {
    fetchThrew = true;
    warn('fetch threw', { message: fetchErr?.message, name: fetchErr?.name });
  }

  if (transportErr && fetchThrew) {
    window.jiraBridgeLog?.('ext:settings:testJiraConnection:transportFromBridge', {
      preview: transportErr.slice(0, 400),
      note: 'Skipping second http_request invoke; same Rust path as httpRequestJson.',
    });
    return fail('httpRequestJson', 0, transportErr, transportErr, null);
  }

  const invoke = window.electronAPI?.tauriInvoke;
  if (!invoke) {
    warn('no tauriInvoke', {});
    return fail('invoke', 0, '', 'no tauriInvoke', 'Bridge not available (no tauriInvoke)');
  }

  try {
    const resp = await invoke('http_request', { url, method: 'GET', headers: { Authorization: auth, Accept: 'application/json' }, body: null });
    log('invoke /myself raw', { status: resp?.status, bodyPreview: typeof resp?.body === 'string' ? resp.body.slice(0, 400) : JSON.stringify(resp)?.slice(0, 300) });
    if (resp) {
      if (typeof resp === 'object' && resp.displayName) return parseMe(resp);
      const body = typeof resp === 'string' ? resp : resp.body || resp.data;
      if (body) {
        try {
          const me = typeof body === 'string' ? JSON.parse(body) : body;
          if (me?.errorMessages?.length) {
            return fail('invoke', resp.status, body, null, me.errorMessages.join('; '));
          }
          if (me?.displayName || me?.emailAddress) return parseMe(me);
        } catch (pe) {
          return fail('invoke', resp.status, String(body), pe?.message, 'Could not parse JSON body');
        }
      }
      if (resp.status && resp.status !== 200) {
        return fail('invoke', resp.status, typeof resp.body === 'string' ? resp.body : '', null, `HTTP ${resp.status}`);
      }
    }
  } catch (e) {
    const em = normalizeInvokeError(e);
    warn('invoke threw', em);
    window.jiraBridgeLog?.('ext:settings:testJiraConnection:invokeRejected', { error: em });
    return fail('invoke', 0, '', em, null);
  }

  window.jiraBridgeLog?.('ext:settings:testJiraConnection:failed', { note: 'all strategies exhausted' });
  console.error('[CueTracker][Jira][Settings] testJiraConnection: all strategies failed — see Jira bridge log');
  return {
    ok: false,
    error:
      'All connection strategies failed. | Step: exhausted | Open Jira bridge log below and look for bridge:httpRequest:invokeError (Rust) or HTTP status lines.',
  };
}

export default function CueTrackerSettings() {
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [jira, setJira] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [appUser, setAppUser] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [jiraBridgeText, setJiraBridgeText] = useState('');

  const refreshJiraBridgeLog = useCallback(() => {
    const entries = window.getJiraBridgeLogEntries?.() || [];
    const fmt = window.formatJiraBridgeLogText || ((list) => list.map((e) => `${e.t} ${e.event} ${e.detail != null ? JSON.stringify(e.detail) : ''}`).join('\n'));
    setJiraBridgeText(fmt(entries));
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    setJira(loadJiraCreds());
    window.electronAPI?.marketplaceGetSettings?.().then(s => {
      if (s?.username) setAppUser(s.username);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshJiraBridgeLog();
    const onLog = () => refreshJiraBridgeLog();
    window.addEventListener('jira-bridge-log', onLog);
    return () => window.removeEventListener('jira-bridge-log', onLog);
  }, [refreshJiraBridgeLog]);

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings({ [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const updateJira = (key, value) => {
    const next = { ...jira, [key]: value };
    setJira(next);
    saveJiraCreds(next);
    setTestResult(null);
  };

  const handleBrowse = async () => {
    const path = await browseFolder();
    if (path) update('workspaceRoot', path);
  };

  const handleTestJira = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testJiraConnection(jira);
    setTestResult(result);
    setTesting(false);
    refreshJiraBridgeLog();
  };

  const handleImportAvalanche = async () => {
    setImportMsg(null);
    setTestResult(null);
    const r = await importJiraFromAvalancheTemplates();
    if (!r.ok) {
      setImportMsg({ error: r.error });
      return;
    }
    const next = { ...jira, ...r.creds };
    setJira(next);
    saveJiraCreds(next);
    setImportMsg({ ok: true, path: r.path });
  };

  const fieldStyle = {
    width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 4,
    border: '1px solid var(--hp-border, #D4A574)',
    background: 'var(--hp-card, #FFFBF0)',
    color: 'var(--hp-text, #3B1010)',
    fontFamily: 'Crimson Text, serif',
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: 'var(--hp-muted, #8B6B5B)',
    marginBottom: 4, display: 'block',
  };

  const descStyle = {
    fontSize: 11, color: 'var(--hp-muted, #8B6B5B)', marginTop: 2, lineHeight: 1.4,
  };

  const sectionStyle = {
    marginBottom: 20, padding: '14px 16px', borderRadius: 6,
    border: '1px solid rgba(211,166,37,0.15)', background: 'rgba(211,166,37,0.02)',
  };

  const sectionTitle = {
    fontFamily: 'Cinzel, serif', fontSize: 13, fontWeight: 600,
    color: 'var(--hp-accent, #D3A625)', marginBottom: 12,
  };

  return (
    <div style={{ maxWidth: 560, padding: 16 }}>
      <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: 16, fontWeight: 600, color: 'var(--hp-accent, #D3A625)', marginBottom: 16 }}>
        GrudgeDB Settings
      </h3>

      {saved && (
        <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 4, background: 'rgba(40,160,80,0.1)', border: '1px solid rgba(40,160,80,0.3)', color: '#4AE08A', fontSize: 11, fontWeight: 600 }}>
          Settings saved
        </div>
      )}

      {/* ── Identity ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Identity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 4, background: 'rgba(40,160,80,0.06)', border: '1px solid rgba(40,160,80,0.15)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: appUser ? '#4AE08A' : '#999', display: 'inline-block' }} />
          {appUser ? (
            <span style={{ fontSize: 12, color: 'var(--hp-text, #3B1010)' }}>
              Signed in as <strong style={{ color: 'var(--hp-accent, #D3A625)' }}>{appUser}</strong>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--hp-muted, #8B6B5B)' }}>
              Username not set — update it in Marauder's Ledger marketplace settings
            </span>
          )}
        </div>
        <div style={{ ...descStyle, marginTop: 6 }}>
          Your display name is pulled from The Marauder's Ledger marketplace settings. It's used when editing cues and posting version comments.
        </div>
      </div>

      {/* ── Wwise Workspace ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Wwise Workspace</div>
        <label style={labelStyle}>Default Wwise Workspace Root</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={settings.workspaceRoot || ''}
            onChange={e => update('workspaceRoot', e.target.value)}
            placeholder="e.g. C:\Project\Audio\Wwise"
            style={{ ...fieldStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
          />
          <button
            onClick={handleBrowse}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
              border: '1px solid var(--hp-border, #D4A574)',
              background: 'var(--hp-card, #FFFBF0)',
              color: 'var(--hp-text, #3B1010)',
              cursor: 'pointer',
            }}
          >
            Browse
          </button>
        </div>
        <div style={descStyle}>
          Root folder containing your Wwise project audio files. Individual projects can override this.
        </div>
      </div>

      {/* ── Jira Integration ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={sectionTitle}>Jira Integration</div>
          <button
            onClick={() => setShowGuide(!showGuide)}
            style={{ fontSize: 10, color: 'var(--hp-accent, #D3A625)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 12 }}
          >
            {showGuide ? 'Hide setup guide' : 'How to set this up?'}
          </button>
        </div>

        {showGuide && (
          <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 6, background: 'rgba(107,164,255,0.06)', border: '1px solid rgba(107,164,255,0.2)', fontSize: 12, lineHeight: 1.6, color: 'var(--hp-text, #3B1010)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#6BA4FF' }}>Jira API Token — Step-by-step</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Go to <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#6BA4FF' }}>Atlassian API Tokens</a> (log in with your work Atlassian account).</li>
              <li>Click <strong>Create API token</strong>, give it a label like "GrudgeDB", and click <strong>Create</strong>.</li>
              <li>Copy the token — you won't be able to see it again.</li>
              <li>Paste it below in the <strong>API Token</strong> field.</li>
            </ol>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--hp-muted, #8B6B5B)' }}>
              <strong>Domain</strong> is your Atlassian site (WB Games Avalanche uses <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 2, fontSize: 10 }}>wbg-avalanche.atlassian.net</code>).<br />
              <strong>Email</strong> is the address tied to your Atlassian account.<br />
              The token is stored locally and never leaves this machine.
            </div>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Atlassian Domain</label>
          <input
            type="text"
            value={jira.domain || ''}
            onChange={e => updateJira('domain', e.target.value)}
            placeholder="wbg-avalanche.atlassian.net"
            style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Jira project keys (Sundance scope)</label>
          <input
            type="text"
            value={jira.defaultProjectKeys || JIRA_DEFAULTS.defaultProjectKeys}
            onChange={e => updateJira('defaultProjectKeys', e.target.value)}
            placeholder="SUNDANCE"
            style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={descStyle}>
            Comma-separated Jira <strong>project keys</strong> (not names). Default <strong>SUNDANCE</strong> only.
            Add <code style={{ fontSize: 10 }}>AUDIO</code> only if you also file tickets under that project: <code style={{ fontSize: 10 }}>SUNDANCE,AUDIO</code>.
          </div>
          <div style={{ ...descStyle, fontSize: 10, fontFamily: 'monospace', marginTop: 6 }}>
            Active filter:{' '}
            {(jira.defaultProjectKeys || JIRA_DEFAULTS.defaultProjectKeys || '')
              .split(/[,;\s]+/)
              .map((k) => k.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())
              .filter(Boolean)
              .join(', ') || 'SUNDANCE'}
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Email Address</label>
          <input
            type="email"
            value={jira.email || ''}
            onChange={e => updateJira('email', e.target.value)}
            placeholder="you@company.com"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>API Token</label>
          <input
            type="password"
            value={jira.token || ''}
            onChange={e => updateJira('token', e.target.value)}
            placeholder="Paste your Jira API token"
            style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={descStyle}>
            Stored locally. Used for Basic authentication to Jira REST API.
          </div>
        </div>

        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(107,164,255,0.06)', border: '1px solid rgba(107,164,255,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6BA4FF', marginBottom: 6 }}>Avalanche Jira Tool</div>
          <div style={{ ...descStyle, marginBottom: 8 }}>
            If you use the company <strong>Avalanche</strong> desktop app, your API login is saved in <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 2 }}>templates.json</code>.
            Import copies domain (wbg-avalanche), email, and token into GrudgeDB — same REST setup as Avalanche.
          </div>
          <button
            type="button"
            onClick={handleImportAvalanche}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
              background: 'var(--hp-card, #FFFBF0)', color: 'var(--hp-text, #3B1010)',
              border: '1px solid rgba(107,164,255,0.5)',
            }}
          >
            Import from Avalanche (Downloads\avalanche)
          </button>
          {importMsg?.ok && (
            <div style={{ fontSize: 11, color: '#4AE08A', marginTop: 8 }}>
              Imported from {importMsg.path}. Click <strong>Test Connection</strong>.
            </div>
          )}
          {importMsg?.error && (
            <div style={{ fontSize: 11, color: '#E07070', marginTop: 8 }}>{importMsg.error}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleTestJira}
            disabled={testing || !jira.domain || !jira.email || !jira.token}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: testing ? 'wait' : 'pointer',
              background: 'rgba(107,164,255,0.15)', color: '#6BA4FF',
              border: '1px solid rgba(107,164,255,0.4)',
              opacity: (!jira.domain || !jira.email || !jira.token) ? 0.5 : 1,
            }}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            testResult.ok ? (
              <span style={{ fontSize: 11, color: '#4AE08A', fontWeight: 600 }}>
                Connected as {testResult.name}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: '#E07070', fontWeight: 600 }}>
                {testResult.error}
              </span>
            )
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Jira Base URL (optional override)</label>
          <input
            type="text"
            value={settings.jiraBaseUrl || ''}
            onChange={e => update('jiraBaseUrl', e.target.value)}
            placeholder="Auto-detected from domain above"
            style={fieldStyle}
          />
          <div style={descStyle}>
            Leave blank to use the Atlassian domain above for ticket links. Override only if your Jira uses a custom browse URL.
          </div>
        </div>
      </div>

      {/* ── Shared Database ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Shared Database</div>
        <div style={descStyle}>
          Point this to a JSON file on a shared network drive so your whole team stays in sync. While the app is open, GrudgeDB polls the file every 10 seconds and merges changes automatically. When you edit a cue, your changes are written back within ~2 seconds.
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Shared DB File Path</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={settings.sharedDbPath || ''}
              onChange={e => update('sharedDbPath', e.target.value)}
              placeholder="S:\JoseAbraham\extensions\cue-tracker\cue-tracker-db.json"
              style={{ ...fieldStyle, flex: 1, fontFamily: 'monospace', fontSize: 11 }}
            />
            <button
              onClick={async () => {
                const invoke = window.electronAPI?.tauriInvoke;
                if (!invoke) return;
                try {
                  const r = await invoke('run_powershell', {
                    script: `
                      Add-Type -AssemblyName System.Windows.Forms
                      $d = New-Object System.Windows.Forms.SaveFileDialog
                      $d.Filter = 'JSON files (*.json)|*.json'
                      $d.FileName = 'cue-tracker-db.json'
                      $d.Title = 'Choose shared database location'
                      if ($d.ShowDialog() -eq 'OK') { $d.FileName }
                    `,
                  });
                  const path = r?.stdout?.trim();
                  if (path) update('sharedDbPath', path);
                } catch { /* cancelled */ }
              }}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                border: '1px solid var(--hp-border, #D4A574)',
                background: 'var(--hp-card, #FFFBF0)',
                color: 'var(--hp-text, #3B1010)',
                cursor: 'pointer',
              }}
            >
              Browse
            </button>
          </div>
          <div style={{ ...descStyle, marginTop: 4 }}>
            Full path to the shared JSON file. All users should point to the same file. Default: <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 2 }}>S:\JoseAbraham\extensions\cue-tracker\cue-tracker-db.json</code>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 4, background: 'rgba(107,164,255,0.06)', border: '1px solid rgba(107,164,255,0.15)', fontSize: 11, lineHeight: 1.5, color: 'var(--hp-text, #3B1010)' }}>
          <strong style={{ color: '#6BA4FF' }}>How sync works:</strong>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
            <li>On open, the app loads the shared file and merges with your local cache.</li>
            <li>Every 10 seconds, it checks for changes from other users and pulls them in.</li>
            <li>Your edits are pushed to the shared file within ~2 seconds.</li>
            <li>If two people edit the same cue, the most recent edit (by timestamp) wins.</li>
            <li>Comments are additive — nobody's comments get lost.</li>
            <li>If the shared file can't be reached, you keep working locally.</li>
          </ul>
        </div>
      </div>

      {/* ── Revision History ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Revision History</div>
        <div style={descStyle}>
          Every time the shared database is saved, a timestamped snapshot is stored in a <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 2 }}>history/</code> subfolder alongside the database file. If the file gets corrupted or someone makes an unintended change, you can restore from any previous snapshot — similar to Perforce changelists.
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 4, background: 'rgba(40,160,80,0.06)', border: '1px solid rgba(40,160,80,0.15)', fontSize: 11, lineHeight: 1.5, color: 'var(--hp-text, #3B1010)' }}>
          <strong style={{ color: '#4AE08A' }}>How it works:</strong>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
            <li>Snapshots are created automatically on every save to the shared DB.</li>
            <li>Up to <strong>50</strong> snapshots are retained. Oldest are pruned first.</li>
            <li>Each snapshot file includes the author name and timestamp.</li>
            <li>Click <strong>History</strong> in the main toolbar to browse and restore.</li>
            <li>Restoring overwrites the live database — other users will pick up the restored version on their next poll cycle.</li>
          </ul>
        </div>
        {settings.sharedDbPath && (
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: 'var(--hp-muted, #8B6B5B)' }}>
            History folder: {settings.sharedDbPath.replace(/[^\\/]+$/, '')}history\
          </div>
        )}
      </div>

      {/* ── Data Storage info ── */}
      <div style={{ padding: '12px 16px', borderRadius: 6, background: 'rgba(211,166,37,0.05)', border: '1px solid rgba(211,166,37,0.15)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: 12, fontWeight: 600, color: 'var(--hp-accent, #D3A625)', marginBottom: 6 }}>
          Local Cache
        </div>
        <div style={descStyle}>
          A local copy of your data is kept in browser storage for fast startup and offline fallback. The shared database file on the network drive is the source of truth. Jira credentials are stored locally in <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 2 }}>cueTrackerJira</code> and never leave your machine.
        </div>
      </div>

      {/* ── Jira bridge log (automatic; no DevTools required) ── */}
      <div style={{ ...sectionStyle, marginTop: 16 }}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>Jira bridge log</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--hp-muted, #8B6B5B)' }}>
            Every Atlassian HTTP attempt via the app shell is recorded here (tokens redacted).
          </span>
        </div>
        <div style={descStyle}>
          Use <strong>Test Connection</strong> or run a Jira search in GrudgeDB, then read the latest lines below. Press <strong>F12</strong> to open DevTools if you also want the console.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { refreshJiraBridgeLog(); }}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--hp-border, #D4A574)', background: 'var(--hp-card, #FFFBF0)', color: 'var(--hp-text, #3B1010)',
            }}
          >
            Refresh log
          </button>
          <button
            type="button"
            onClick={() => {
              const t = jiraBridgeText || '';
              if (!t) return;
              navigator.clipboard?.writeText?.(t);
            }}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
              border: '1px solid rgba(107,164,255,0.5)', background: 'rgba(107,164,255,0.08)', color: '#6BA4FF',
            }}
          >
            Copy all
          </button>
          <button
            type="button"
            onClick={() => {
              window.clearJiraBridgeLog?.();
              refreshJiraBridgeLog();
            }}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
              border: '1px solid rgba(180,60,60,0.4)', background: 'rgba(180,60,60,0.06)', color: '#E07070',
            }}
          >
            Clear log
          </button>
        </div>
        <pre
          style={{
            marginTop: 10,
            maxHeight: 280,
            overflow: 'auto',
            padding: 10,
            fontSize: 10,
            lineHeight: 1.45,
            fontFamily: 'Consolas, ui-monospace, monospace',
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(211,166,37,0.2)',
            borderRadius: 6,
            color: 'var(--hp-text, #3B1010)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {jiraBridgeText || '(no Jira bridge events yet — run Test Connection or a ticket search)'}
        </pre>
      </div>
    </div>
  );
}

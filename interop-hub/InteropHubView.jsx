import React, { useEffect, useMemo, useState } from 'react';

var VALID_CATEGORIES = new Set(['views', 'integrations', 'ai', 'tools', 'appearance', 'community']);
var VALID_CONFIG_TYPES = new Set(['string', 'password', 'number', 'boolean', 'select']);
var LEGACY_APP_MODULE_IDS = new Set([
  'darkMode', 'glossary', 'notifications', 'dataBackup', 'potterdb', 'knowledgeSources',
  'slack', 'outlook', 'miro', 'onenote', 'calendar', 'activity', 'allTasks', 'confluence',
  'minesweeper',
]);

function getApi() {
  return window.appAPI || window.electronAPI || null;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function analyzeExtension(ext, manifest, strictManifestMode) {
  var warnings = [];
  var errors = [];
  var m = manifest || {};
  if (LEGACY_APP_MODULE_IDS.has(String(ext.id || ''))) {
    return {
      id: ext.id,
      name: ext.name || ext.id,
      version: m.version || ext.version || 'n/a',
      hasView: !!(m.provides && m.provides.entries && m.provides.entries.view),
      hasSettings: !!(m.provides && m.provides.entries && m.provides.entries.settings),
      hasService: !!(m.provides && m.provides.entries && m.provides.entries.service),
      errors: [],
      warnings: [],
      score: 0,
    };
  }
  if (!strictManifestMode) {
    // Core/static extensions may be app-provided and not ship manifest entry files.
    return {
      id: ext.id,
      name: ext.name || ext.id,
      version: m.version || ext.version || 'n/a',
      hasView: !!(m.provides && m.provides.entries && m.provides.entries.view),
      hasSettings: !!(m.provides && m.provides.entries && m.provides.entries.settings),
      hasService: !!(m.provides && m.provides.entries && m.provides.entries.service),
      errors: [],
      warnings: [],
      score: 0,
    };
  }

  if (!m.id) errors.push('manifest.id is missing');
  if (m.id && ext.id && String(m.id) !== String(ext.id)) errors.push('manifest.id does not match registry id');
  if (!m.name) errors.push('manifest.name is missing');
  if (!m.version) warnings.push('manifest.version is missing');
  if (!VALID_CATEGORIES.has(String(m.category || ''))) warnings.push('category should be one of views/integrations/ai/tools/appearance/community');

  var provides = m.provides || {};
  var entries = provides.entries || {};
  if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
    warnings.push('provides.entries is missing or empty');
  }
  if (entries.view) {
    if (!provides.view || !provides.view.id || !provides.view.label) {
      errors.push('entries.view exists but provides.view.id/label is missing');
    }
  }

  var cfg = m.config || {};
  Object.keys(cfg).forEach(function (key) {
    var type = cfg[key] && cfg[key].type;
    if (type && !VALID_CONFIG_TYPES.has(type)) {
      errors.push('config.' + key + ' has unsupported type "' + type + '"');
    }
  });

  return {
    id: ext.id,
    name: ext.name || ext.id,
    version: m.version || ext.version || 'n/a',
    hasView: !!entries.view,
    hasSettings: !!entries.settings,
    hasService: !!entries.service,
    errors: errors,
    warnings: warnings,
    score: errors.length * 3 + warnings.length,
  };
}

export default function InteropHubView() {
  var [loading, setLoading] = useState(true);
  var [sharedContext, setSharedContext] = useState(null);
  var [report, setReport] = useState([]);
  var [events, setEvents] = useState([]);
  var [channel, setChannel] = useState('');
  var [status, setStatus] = useState('');
  var [analyticsStatus, setAnalyticsStatus] = useState({ enabled: true, count: 0, maxEvents: 0 });
  var [analyticsEvents, setAnalyticsEvents] = useState([]);
  var [analyticsFilter, setAnalyticsFilter] = useState('');

  var filteredEvents = useMemo(function () {
    var c = String(channel || '').trim().toLowerCase();
    if (!c) return events;
    return events.filter(function (e) { return String(e.channel || '').toLowerCase().indexOf(c) >= 0; });
  }, [events, channel]);
  var filteredAnalyticsEvents = useMemo(function () {
    var p = String(analyticsFilter || '').trim().toLowerCase();
    if (!p) return analyticsEvents;
    return analyticsEvents.filter(function (e) { return String(e.event || '').toLowerCase().indexOf(p) >= 0; });
  }, [analyticsEvents, analyticsFilter]);

  async function refreshAnalytics() {
    var api = getApi();
    if (!api || typeof api.analyticsGetStatus !== 'function') return;
    try {
      var st = await api.analyticsGetStatus();
      setAnalyticsStatus(st || { enabled: true, count: 0, maxEvents: 0 });
      var evRes = await api.analyticsGetEvents({ limit: 120 });
      setAnalyticsEvents(evRes && evRes.events ? evRes.events : []);
    } catch (e) {
      setStatus('Analytics read failed: ' + (e && e.message ? e.message : 'unknown'));
    }
  }

  async function refreshScan() {
    var api = getApi();
    if (!api) return;
    setLoading(true);
    setStatus('');
    try {
      var discovered = await api.listDiscoveredExtensions();
      var rows = Object.values(discovered || {});
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var ext = rows[i];
        var manifest = null;
        if (ext && ext.manifestPath && typeof api.tauriInvoke === 'function') {
          var raw = await api.tauriInvoke('marketplace_read_text_file', { path: ext.manifestPath });
          manifest = safeJsonParse(raw);
        }
        // Only run strict checks when we successfully parsed an actual manifest file.
        var strictManifestMode = !!manifest;
        out.push(analyzeExtension(ext || {}, manifest || ext || {}, strictManifestMode));
      }
      out.sort(function (a, b) { return b.score - a.score; });
      setReport(out);
      setSharedContext(api.getSharedContext ? api.getSharedContext() : null);
      if (api.interopGetRecent) {
        var recent = api.interopGetRecent();
        setEvents(Array.isArray(recent) ? recent.slice().reverse() : []);
      }
    } catch (e) {
      setStatus(e && e.message ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () {
    refreshScan();
    refreshAnalytics();
    var api = getApi();
    if (!api || typeof api.interopSubscribe !== 'function') return function () {};
    return api.interopSubscribe('*', function (evt) {
      setEvents(function (prev) {
        var next = [evt].concat(prev || []);
        if (next.length > 80) next = next.slice(0, 80);
        return next;
      });
    });
  }, []);

  useEffect(function () {
    var t = setInterval(function () { refreshAnalytics(); }, 4000);
    return function () { clearInterval(t); };
  }, []);

  function publishTest() {
    var api = getApi();
    if (!api || typeof api.interopPublish !== 'function') return;
    var res = api.interopPublish({
      channel: 'interop-hub/diagnostics/ping',
      source: 'interop-hub',
      payload: { ts: Date.now(), note: 'Manual diagnostics ping' },
    });
    if (res && res.ok) setStatus('Published diagnostics ping (delivered: ' + res.delivered + ')');
  }

  async function toggleAnalytics() {
    var api = getApi();
    if (!api || typeof api.analyticsSetEnabled !== 'function') return;
    await api.analyticsSetEnabled(!analyticsStatus.enabled);
    await refreshAnalytics();
  }

  async function clearAnalytics() {
    var api = getApi();
    if (!api || typeof api.analyticsClear !== 'function') return;
    await api.analyticsClear();
    await refreshAnalytics();
    setStatus('Usage analytics cleared');
  }

  async function exportAnalytics() {
    var api = getApi();
    if (!api || typeof api.analyticsExport !== 'function') return;
    var res = await api.analyticsExport();
    if (!res || !res.ok || !res.data) return;
    var txt = JSON.stringify(res.data, null, 2);
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        setStatus('Analytics JSON copied to clipboard');
        return;
      }
    } catch (e) {}
    setStatus('Analytics export ready (clipboard unavailable)');
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Interop Hub</h3>
            <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark mt-0.5">
              Scans extension compatibility and monitors live interop events.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={publishTest} className="px-2.5 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white">Publish Ping</button>
            <button onClick={refreshScan} className="px-2.5 py-1.5 text-xs rounded border border-hp-border dark:border-hp-border-dark text-hp-text dark:text-hp-text-dark hover:bg-gray-100 dark:hover:bg-gray-800">Rescan</button>
          </div>
        </div>
        {status ? <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">{status}</p> : null}
      </div>

      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark">Usage Analytics Trace</p>
          <div className="flex items-center gap-2">
            <button onClick={toggleAnalytics} className={`px-2 py-1 text-[10px] rounded ${analyticsStatus.enabled ? 'bg-green-600 text-white' : 'bg-gray-300 dark:bg-gray-700 text-hp-text dark:text-hp-text-dark'}`}>
              {analyticsStatus.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button onClick={refreshAnalytics} className="px-2 py-1 text-[10px] rounded border border-hp-border dark:border-hp-border-dark">Refresh</button>
            <button onClick={clearAnalytics} className="px-2 py-1 text-[10px] rounded border border-hp-border dark:border-hp-border-dark">Clear</button>
            <button onClick={exportAnalytics} className="px-2 py-1 text-[10px] rounded border border-hp-border dark:border-hp-border-dark">Copy JSON</button>
          </div>
        </div>
        <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark mb-2">
          Stored events: <strong>{analyticsStatus.count || 0}</strong> / {analyticsStatus.maxEvents || 0}
        </p>
        <div className="flex items-center justify-between gap-2 mb-2">
          <input
            value={analyticsFilter}
            onChange={function (e) { setAnalyticsFilter(e.target.value); }}
            placeholder="Filter event prefix (e.g. ai., ui., interop.)"
            className="w-full px-2 py-1 text-[11px] font-mono rounded border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          />
        </div>
        <div className="max-h-56 overflow-auto space-y-1">
          {filteredAnalyticsEvents.length === 0 ? (
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark">No analytics events captured yet.</p>
          ) : filteredAnalyticsEvents.map(function (e) {
            var payloadText = '';
            try { payloadText = JSON.stringify(e.payload || {}); } catch (_) { payloadText = '{}'; }
            return (
              <div key={e.id || (e.ts + '_' + e.event)} className="rounded border border-hp-border dark:border-hp-border-dark px-2 py-1">
                <p className="text-[11px] font-mono text-hp-text dark:text-hp-text-dark">{e.event}</p>
                <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark">{new Date(e.ts || Date.now()).toLocaleTimeString()}</p>
                <p className="text-[10px] font-mono text-hp-muted dark:text-hp-muted-dark break-all">{payloadText.slice(0, 240)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {sharedContext && (
        <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
          <p className="text-[10px] uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark mb-2">Shared Context Snapshot</p>
          <p className="text-xs text-hp-text dark:text-hp-text-dark">
            User: <strong>{sharedContext.username || '(unset)'}</strong> · House: <strong>{sharedContext.house || '(unset)'}</strong> · Departments: <strong>{(sharedContext.departments || []).length}</strong>
          </p>
        </div>
      )}

      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <p className="text-[10px] uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark mb-2">Compatibility Report</p>
        {loading ? (
          <p className="text-xs text-hp-muted dark:text-hp-muted-dark">Scanning...</p>
        ) : (
          <div className="space-y-2">
            {report.map(function (r) {
              return (
                <div key={r.id} className="rounded border border-hp-border dark:border-hp-border-dark px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-hp-text dark:text-hp-text-dark font-semibold truncate">{r.name} <span className="opacity-60">({r.id})</span></p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.errors.length ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : r.warnings.length ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'}`}>
                      {r.errors.length ? (r.errors.length + ' error(s)') : r.warnings.length ? (r.warnings.length + ' warning(s)') : 'OK'}
                    </span>
                  </div>
                  {r.errors.concat(r.warnings).length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {r.errors.map(function (e, i) { return <li key={'e' + i} className="text-[10px] text-red-600 dark:text-red-400">- {e}</li>; })}
                      {r.warnings.map(function (w, i) { return <li key={'w' + i} className="text-[10px] text-amber-600 dark:text-amber-400">- {w}</li>; })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-hp-muted dark:text-hp-muted-dark">Recent Interop Events</p>
          <input
            value={channel}
            onChange={function (e) { setChannel(e.target.value); }}
            placeholder="Filter by channel..."
            className="w-52 px-2 py-1 text-[11px] font-mono rounded border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          />
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {filteredEvents.length === 0 ? (
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark">No events yet.</p>
          ) : filteredEvents.map(function (evt, idx) {
            return (
              <div key={idx} className="rounded border border-hp-border dark:border-hp-border-dark px-2 py-1">
                <p className="text-[11px] font-mono text-hp-text dark:text-hp-text-dark">{evt.channel}</p>
                <p className="text-[10px] text-hp-muted dark:text-hp-muted-dark">
                  source: {evt.source || 'unknown'} · target: {evt.target || 'broadcast'} · {new Date(evt.ts || Date.now()).toLocaleTimeString()}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

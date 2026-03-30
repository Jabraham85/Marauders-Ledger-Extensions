/**
 * Avalanche extension — background hooks for The Marauder's Ledger.
 * No side effects at module load; all state lives in module-scoped variables
 * so init/destroy work regardless of how the host calls them (destructured,
 * .call, arrow wrapper, etc.).
 */

const EXTENSION_ID = "avalanche-jira";
const PREFIX = "[avalanche-jira/service]";
const STORAGE_KEY = "avalanche-jira/v1/blob";
const CONFIG_OVERLAY = "avalanche-jira-config-overlay";

let _api = null;
let _unsubs = [];
let _syncTimer = null;

function log(...args) {
  console.log(PREFIX, ...args);
}
function warn(...args) {
  console.warn(PREFIX, ...args);
}

function readConfig() {
  let overlay = {};
  try {
    overlay = JSON.parse(localStorage.getItem(CONFIG_OVERLAY) || "{}");
  } catch { overlay = {}; }

  let host = {};
  if (_api && typeof _api.getSharedContext === "function") {
    try {
      const ctx = _api.getSharedContext();
      if (ctx && ctx.extensionConfig) host = ctx.extensionConfig;
    } catch { /* ignore */ }
  }
  return { ...host, ...overlay };
}

function publish(topic, event, payload) {
  if (!_api || typeof _api.interopPublish !== "function") return;
  try {
    _api.interopPublish({
      channel: `${EXTENSION_ID}/${topic}/${event}`,
      payload,
      source: EXTENSION_ID,
      target: "*",
    });
  } catch { /* ignore */ }
}

function track(event, payload) {
  if (!_api || typeof _api.analyticsTrack !== "function") return;
  try {
    _api.analyticsTrack({ event: `avalanche_jira_${event}`, payload });
  } catch { /* ignore */ }
}

function utf8ToBase64(str) {
  if (typeof btoa !== "undefined") {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  throw new Error("No base64 encoder available");
}

function authHeader(email, token) {
  return "Basic " + utf8ToBase64(email + ":" + token);
}

async function jiraRequest(method, url, headers, jsonBody) {
  if (!_api || typeof _api.httpRequestJson !== "function") return null;
  const opts = { url, method, headers };
  if (jsonBody !== undefined) opts.body = JSON.stringify(jsonBody);
  const res = await _api.httpRequestJson(opts);
  const status = (res && (res.status || res.statusCode)) || 200;
  const body = res && (res.body || res.data || res.json);
  let data = body;
  if (typeof body === "string" && body) {
    try { data = JSON.parse(body); } catch { data = body; }
  }
  if (status >= 400) {
    const msg = (data && data.errorMessages)
      ? JSON.stringify(data.errorMessages)
      : "HTTP " + status;
    const err = new Error(msg);
    err.status = status;
    throw err;
  }
  return status === 204 ? null : data;
}

async function backgroundSync() {
  const cfg = readConfig();
  if (!cfg.jiraBaseUrl || !cfg.jiraEmail || !cfg.jiraApiToken) return;
  if (!_api || typeof _api.httpRequestJson !== "function") return;

  const base = String(cfg.jiraBaseUrl).replace(/\/+$/, "");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: authHeader(cfg.jiraEmail, cfg.jiraApiToken),
  };

  let blob;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    blob = raw ? JSON.parse(raw) : null;
  } catch { blob = null; }
  if (!blob || !blob.meta) return;

  const issues = blob.meta.fetched_issues;
  if (!Array.isArray(issues) || issues.length === 0) return;

  const doneStatuses = new Set([
    "done", "closed", "resolved", "complete", "completed", "cancelled",
  ]);

  const toRefresh = [];
  for (let i = 0; i < issues.length; i++) {
    const it = issues[i];
    const st = String(it.Status || "").trim().toLowerCase();
    const cat = String(it["Status Category"] || "").trim().toLowerCase();
    if (cat === "done" || doneStatuses.has(st)) continue;
    const key = it["Issue key"] || it["Issue id"];
    if (key && !String(key).startsWith("LOCAL-")) {
      toRefresh.push({ idx: i, key });
    }
  }

  if (toRefresh.length === 0) return;
  log("backgroundSync: refreshing", toRefresh.length, "open issue(s)");

  let refreshed = 0;
  let failed = 0;
  let consecutive404 = 0;
  const batch = toRefresh.slice(0, 15);

  for (const { idx, key } of batch) {
    if (consecutive404 >= 3) break;
    try {
      const url = base + "/rest/api/3/issue/" + encodeURIComponent(key)
        + "?fields=summary,status,priority,assignee,updated&expand=";
      const data = await jiraRequest("GET", url, headers);
      if (!data || !data.fields) { failed++; continue; }
      consecutive404 = 0;
      const f = data.fields;
      const row = issues[idx];
      if (f.summary != null) row.Summary = f.summary;
      if (f.status) row.Status = f.status.name || row.Status;
      if (f.status && f.status.statusCategory) {
        row["Status Category"] = f.status.statusCategory.name || "";
      }
      if (f.priority) row.Priority = f.priority.name || row.Priority;
      if (f.assignee) {
        row.Assignee = f.assignee.displayName || f.assignee.emailAddress || row.Assignee;
      }
      if (f.updated) row.Updated = f.updated;
      refreshed++;
    } catch (e) {
      failed++;
      if (String(e).includes("404")) consecutive404++;
    }
  }

  if (refreshed > 0) {
    blob.meta.welcome_updates = {
      ...(blob.meta.welcome_updates || {}),
      refreshed,
      sync_status: "Background sync: " + refreshed + " refreshed.",
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...blob,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* quota */ }
  }

  log("backgroundSync done:", refreshed, "refreshed,", failed, "failed");
  publish("sync", "background_complete", { refreshed, failed });
  track("background_sync", { refreshed, failed });
}

function onRefreshRequest(_payload) {
  log("received refresh request via interop");
  backgroundSync().catch(function (e) {
    warn("interop-triggered sync failed", e && e.message);
  });
}

function onPing(payload) {
  log("ping received", payload);
  publish("service", "pong", { ts: Date.now() });
}

module.exports = {
  init(appAPI) {
    log("init");
    _api = appAPI;
    _unsubs = [];

    if (appAPI && typeof appAPI.interopSubscribe === "function") {
      try {
        const u1 = appAPI.interopSubscribe(
          EXTENSION_ID + "/sync/request",
          onRefreshRequest,
        );
        if (typeof u1 === "function") _unsubs.push(u1);
      } catch (e) { warn("subscribe sync/request failed", e && e.message); }

      try {
        const u2 = appAPI.interopSubscribe(
          EXTENSION_ID + "/service/ping",
          onPing,
        );
        if (typeof u2 === "function") _unsubs.push(u2);
      } catch (e) { warn("subscribe service/ping failed", e && e.message); }
    }

    const cfg = readConfig();
    if (cfg.startupSync !== false && cfg.jiraBaseUrl && cfg.jiraEmail && cfg.jiraApiToken) {
      _syncTimer = setTimeout(function () {
        _syncTimer = null;
        backgroundSync().catch(function (e) {
          warn("startup sync failed", e && e.message);
        });
      }, 1500);
      log("startup sync scheduled (1.5 s)");
    }
  },

  destroy() {
    log("destroy");
    if (_syncTimer != null) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
    }
    for (const unsub of _unsubs) {
      try { if (typeof unsub === "function") unsub(); } catch (_) { /* ignore */ }
    }
    _unsubs = [];
    _api = null;
  },
};

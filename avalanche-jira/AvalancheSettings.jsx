/* avalanche-jira bundled settings — ESM */
import React, { useEffect, useState } from "react";


/* --- fieldStyles.js --- */
/** Shared Tailwind classes so inputs stay dark regardless of host autofill/light defaults. */

const inputClass =
  "w-full rounded-md border border-zinc-600/90 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none ring-0 transition placeholder:text-zinc-500 focus:border-sky-600/80 focus:ring-2 focus:ring-sky-600/40 [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_#18181b] [&:-webkit-autofill]:[-webkit-text-fill-color:#e4e4e7]";

const textareaClass = `${inputClass} min-h-[6rem] resize-y font-mono text-xs leading-relaxed`;

const selectClass = `${inputClass} cursor-pointer appearance-none pr-8`;

const labelClass = "text-xs font-medium text-zinc-400";

const helpTextClass = "text-sm leading-relaxed text-zinc-400";

const checkboxClass =
  "h-4 w-4 shrink-0 rounded border-zinc-500 bg-zinc-800 text-sky-500 focus:ring-2 focus:ring-sky-500/50";


/* --- AvalancheSettings.jsx (body) --- */
const T = {
  surface: "var(--hp-surface, #FDF6E3)",
  card: "var(--hp-card, #FFFBF0)",
  border: "var(--hp-border, #D4A574)",
  text: "var(--hp-text, #3B1010)",
  muted: "var(--hp-muted, #8B6B5B)",
  accent: "var(--hp-accent, #D3A625)",
  heading: "'Cinzel', serif",
  body: "'Crimson Text', serif",
};

const inputStyle = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  fontFamily: T.body,
  borderRadius: 4,
  border: "1px solid " + T.border,
  background: T.card,
  color: T.text,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: T.muted,
};

const OVERLAY_KEY = "avalanche-jira-config-overlay";
const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

export default function AvalancheSettings() {
  const [form, setForm] = useState({
    jiraBaseUrl: "",
    jiraEmail: "",
    jiraApiToken: "",
    defaultProjectKey: "SUNDANCE",
    startupSync: true,
  });

  useEffect(() => {
    let hostConfig = {};
    try {
      const api = typeof window !== "undefined" ? window.electronAPI || window.appAPI : null;
      if (api && typeof api.getSharedContext === "function") {
        const ctx = api.getSharedContext();
        if (ctx && ctx.extensionConfig) hostConfig = ctx.extensionConfig;
      }
    } catch { /* ignore */ }
    let overlay = {};
    try { overlay = JSON.parse(localStorage.getItem(OVERLAY_KEY) || "{}"); } catch { overlay = {}; }
    setForm((f) => ({ ...f, ...hostConfig, ...overlay }));
  }, []);

  function persist(next) { localStorage.setItem(OVERLAY_KEY, JSON.stringify(next)); }

  function update(field, value) {
    setForm((prev) => { const next = { ...prev, [field]: value }; persist(next); return next; });
  }

  function openTokenHelp(e) {
    e.preventDefault();
    const api = typeof window !== "undefined" ? window.electronAPI || window.appAPI : null;
    if (api && typeof api.openExternal === "function") api.openExternal(API_TOKEN_URL);
    else window.open(API_TOKEN_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ maxWidth: 520, padding: 20, fontFamily: T.body, fontSize: 13, color: T.text, background: T.surface }}>
      <h2 style={{ fontFamily: T.heading, fontSize: 20, fontWeight: 600, color: T.text, marginTop: 0, marginBottom: 8 }}>
        Avalanche \u2014 Jira
      </h2>
      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 18 }}>
        Use an Atlassian API token (not your account password). Same auth model
        as the standalone Avalanche app (Basic: email + token).{" "}
        <a
          href={API_TOKEN_URL}
          onClick={openTokenHelp}
          style={{ color: T.accent, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          Create an API token
        </a>
        .
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Jira base URL</span>
          <input
            style={{ ...inputStyle, marginTop: 4 }}
            value={form.jiraBaseUrl}
            onChange={(e) => update("jiraBaseUrl", e.target.value)}
            placeholder="https://your-domain.atlassian.net"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label style={{ display: "block" }}>
          <span style={labelStyle}>Email</span>
          <input style={{ ...inputStyle, marginTop: 4 }} type="email" autoComplete="username" value={form.jiraEmail} onChange={(e) => update("jiraEmail", e.target.value)} />
        </label>

        <label style={{ display: "block" }}>
          <span style={labelStyle}>API token</span>
          <input style={{ ...inputStyle, marginTop: 4 }} type="password" autoComplete="current-password" value={form.jiraApiToken} onChange={(e) => update("jiraApiToken", e.target.value)} />
        </label>

        <label style={{ display: "block" }}>
          <span style={labelStyle}>Default project key</span>
          <input
            style={{ ...inputStyle, marginTop: 4 }}
            value={form.defaultProjectKey}
            onChange={(e) => update("defaultProjectKey", e.target.value)}
            placeholder="e.g. SUNDANCE"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", paddingTop: 4 }}>
          <input
            type="checkbox"
            checked={!!form.startupSync}
            onChange={(e) => update("startupSync", e.target.checked)}
            style={{ width: 16, height: 16, marginTop: 2, accentColor: T.accent, cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: T.text }}>
            Run background sync when the view opens
          </span>
        </label>
      </div>
    </div>
  );
}
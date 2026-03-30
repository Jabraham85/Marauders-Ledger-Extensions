import React, { useState, useEffect } from 'react';

const STORE_KEY = 'chess_settings';
const PLAYER_ID_KEY = 'chess_playerId';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

async function browseFolder() {
  const invoke = window.electronAPI?.tauriInvoke;
  if (!invoke) return null;
  try {
    const r = await invoke('run_powershell', {
      script: `
        Add-Type -AssemblyName System.Windows.Forms
        $d = New-Object System.Windows.Forms.FolderBrowserDialog
        $d.Description = 'Select shared chess folder'
        if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }
      `,
    });
    return r?.stdout?.trim() || null;
  } catch { return null; }
}

export default function ChessSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [appUser, setAppUser] = useState('');
  const playerId = localStorage.getItem(PLAYER_ID_KEY) || '(not generated yet)';

  useEffect(() => {
    window.electronAPI?.marketplaceGetSettings?.().then(s => {
      if (s?.username) setAppUser(s.username);
    }).catch(() => {});
  }, []);

  const update = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const handleBrowse = async () => {
    const path = await browseFolder();
    if (path) update('sharedFolderPath', path);
  };

  const sectionStyle = {
    marginBottom: 24,
  };
  const sectionTitle = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6,
  };
  const descStyle = {
    fontSize: 11,
    opacity: 0.6,
    marginBottom: 10,
    lineHeight: 1.5,
  };
  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
  };
  const fieldStyle = {
    width: '100%',
    padding: '6px 10px',
    fontSize: 12,
    borderRadius: 8,
    border: '1px solid var(--hp-border, #d1d5db)',
    background: 'var(--hp-bg, #fff)',
    color: 'var(--hp-text, #1f2937)',
  };
  const checkStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  };

  return (
    <div style={{ padding: 20, maxWidth: 520 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Wizard's Chess Settings</h3>
      <p style={descStyle}>Configure multiplayer sync, time controls, and chat.</p>

      {/* Identity */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Player Identity</div>
        <div style={descStyle}>
          Your unique player ID is permanent and ensures game continuity even if you change your display name.
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Display Name</label>
          <input type="text" value={appUser || '(set in app settings)'} readOnly style={{ ...fieldStyle, opacity: 0.7 }} />
        </div>
        <div>
          <label style={labelStyle}>Player UUID (read-only)</label>
          <input type="text" value={playerId} readOnly style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 11, opacity: 0.5 }} />
        </div>
      </div>

      {/* Shared Folder */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Shared Folder</div>
        <div style={descStyle}>
          Point this to a shared network drive folder so all players can find each other, send challenges, and sync games. 
          The folder will be created automatically if it doesn't exist.
        </div>
        <label style={labelStyle}>Shared Chess Folder</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={settings.sharedFolderPath || ''}
            onChange={e => update('sharedFolderPath', e.target.value)}
            placeholder="S:\JoseAbraham\extensions\chess\shared"
            style={{ ...fieldStyle, flex: 1, fontFamily: 'monospace', fontSize: 11 }}
          />
          <button onClick={handleBrowse}
            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: '1px solid var(--hp-border, #d1d5db)', background: 'var(--hp-card, #f9fafb)', cursor: 'pointer' }}>
            Browse
          </button>
        </div>
      </div>

      {/* Polling */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Sync</div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Poll Interval (seconds)</label>
          <input
            type="number"
            min={2}
            max={30}
            value={settings.pollInterval || 5}
            onChange={e => update('pollInterval', Math.max(2, Math.min(30, Number(e.target.value) || 5)))}
            style={{ ...fieldStyle, width: 100 }}
          />
        </div>
      </div>

      {/* Time Control */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Default Time Control</div>
        <div style={descStyle}>
          This is the default when sending challenges. You can override it per-challenge from the lobby.
        </div>
        <select
          value={settings.defaultTimeControl || '10'}
          onChange={e => update('defaultTimeControl', e.target.value)}
          style={{ ...fieldStyle, width: 200 }}>
          <option value="1">1 minute (Bullet)</option>
          <option value="3">3 minutes (Blitz)</option>
          <option value="5">5 minutes (Rapid)</option>
          <option value="10">10 minutes (Rapid)</option>
          <option value="30">30 minutes (Classical)</option>
          <option value="0">Casual (untimed)</option>
        </select>
      </div>

      {/* Toggles */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Features</div>
        <div style={checkStyle}>
          <input
            type="checkbox"
            id="chess-notif"
            checked={settings.enableNotifications !== false}
            onChange={e => update('enableNotifications', e.target.checked)}
          />
          <label htmlFor="chess-notif" style={{ fontSize: 12 }}>
            Enable notifications (challenges, turn alerts, chat)
          </label>
        </div>
        <div style={checkStyle}>
          <input
            type="checkbox"
            id="chess-chat"
            checked={settings.enableChat !== false}
            onChange={e => update('enableChat', e.target.checked)}
          />
          <label htmlFor="chess-chat" style={{ fontSize: 12 }}>
            Enable in-game encrypted chat
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * Wizard's Chess — Extension service
 *
 * Background polling for notifications:
 *  - New challenges targeting this player
 *  - Opponent moves (your-turn alerts)
 *  - New chat messages
 *
 * Also maintains player heartbeat and exposes window.chessAPI.
 *
 * Usage from other extensions:
 *   window.chessAPI.getOnlinePlayers()
 *   window.chessAPI.getActiveGames()
 *   window.chessAPI.getMyStats()
 */

const STORE_KEY = 'chess_settings';
const PLAYER_ID_KEY = 'chess_playerId';
const SEEN_CHALLENGES_KEY = 'chess_seenChallenges';
const SEEN_MOVES_KEY = 'chess_seenMoves';
const SEEN_CHATS_KEY = 'chess_seenChats';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function getPlayerId() {
  return localStorage.getItem(PLAYER_ID_KEY) || null;
}

function getSeenSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveSeenSet(key, set) {
  const arr = Array.from(set);
  if (arr.length > 500) arr.splice(0, arr.length - 200);
  localStorage.setItem(key, JSON.stringify(arr));
}

async function readJsonFile(invoke, path) {
  if (!invoke) return null;
  try {
    const raw = await invoke('marketplace_read_text_file', { path });
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function writeJsonFile(invoke, path, data) {
  if (!invoke) return;
  var tmpPath = path + '.tmp.' + Date.now() + '.' + Math.random().toString(36).slice(2, 7);
  var safeTmp = String(tmpPath || '').replace(/'/g, "''");
  var safeDest = String(path || '').replace(/'/g, "''");
  try {
    await invoke('marketplace_write_text_file', { path: tmpPath, contents: JSON.stringify(data, null, 2) });
    var moveResult = await invoke('run_powershell', {
      script:
        "try { " +
        "$tmp = '" + safeTmp + "'; " +
        "$dest = '" + safeDest + "'; " +
        "$dir = Split-Path -Path $dest -Parent; " +
        "if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }; " +
        "Move-Item -LiteralPath $tmp -Destination $dest -Force; " +
        "} catch { exit 1 }",
    });
    if (Number(moveResult && moveResult.exit_code) !== 0) throw new Error('Atomic file move failed');
  } catch {
    try {
      await invoke('marketplace_write_text_file', { path, contents: JSON.stringify(data, null, 2) });
    } catch { /* swallow */ }
  }
}

async function updatePlayersFile(invoke, path, updater) {
  var latest = await readJsonFile(invoke, path);
  if (!latest || typeof latest !== 'object') return null;
  var next = await updater(latest);
  if (!next || typeof next !== 'object') return latest;
  await writeJsonFile(invoke, path, next);
  return next;
}

async function listGameFiles(invoke, gamesDir) {
  if (!invoke) return [];
  try {
    const safe = gamesDir.replace(/'/g, "''");
    const r = await invoke('run_powershell', {
      script: "Get-ChildItem -Path '" + safe + "' -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }",
    });
    if (!r || !r.stdout) return [];
    return r.stdout.trim().split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  } catch { return []; }
}

var _interval = null;
var _heartbeatInterval = null;

function init(appAPI) {
  var invoke = (appAPI && appAPI.tauriInvoke) || (window.electronAPI && window.electronAPI.tauriInvoke) || null;
  var api = appAPI || window.electronAPI || window.appAPI || {};

  var playerId = getPlayerId();
  if (!playerId) {
    console.log('[Chess] No player ID yet — service will activate after first view load.');
    return;
  }

  var settings = loadSettings();
  var basePath = settings.sharedFolderPath || 'S:\\JoseAbraham\\extensions\\chess\\shared';
  var pollMs = ((settings.pollInterval || 5) * 1000);
  var notificationsEnabled = settings.enableNotifications !== false;

  var seenChallenges = getSeenSet(SEEN_CHALLENGES_KEY);
  var seenMoves = getSeenSet(SEEN_MOVES_KEY);
  var seenChats = getSeenSet(SEEN_CHATS_KEY);

  var cachedPlayers = {};
  var cachedGames = [];

  function publish(channel, payload) {
    if (!notificationsEnabled) return;
    if (api.interopPublish && typeof api.interopPublish === 'function') {
      api.interopPublish({ channel: channel, source: 'chess', payload: payload });
    }
  }

  async function poll() {
    try {
      settings = loadSettings();
      basePath = settings.sharedFolderPath || basePath;
      notificationsEnabled = settings.enableNotifications !== false;

      var playersData = await readJsonFile(invoke, basePath + '\\players.json');
      if (playersData && playersData.players) {
        cachedPlayers = playersData.players;
      }

      var challengesData = await readJsonFile(invoke, basePath + '\\challenges.json');
      if (challengesData && challengesData.challenges) {
        var pending = challengesData.challenges.filter(function(ch) {
          return ch.status === 'pending' && ch.to === playerId && !seenChallenges.has(ch.id);
        });
        pending.forEach(function(ch) {
          publish('chess/challenge/received', { from: ch.from, fromName: ch.fromName, challengeId: ch.id });
          seenChallenges.add(ch.id);
        });
        if (pending.length > 0) saveSeenSet(SEEN_CHALLENGES_KEY, seenChallenges);
      }

      var gameFiles = await listGameFiles(invoke, basePath + '\\games');
      var myGames = [];
      for (var i = 0; i < gameFiles.length; i++) {
        var gid = gameFiles[i].replace('.json', '');
        var g = await readJsonFile(invoke, basePath + '\\games\\' + gid + '.json');
        if (!g) continue;
        if (g.white !== playerId && g.black !== playerId) continue;
        myGames.push(g);

        var moveKey = g.id + ':' + g.moves.length;
        if (!seenMoves.has(moveKey) && g.moves.length > 0) {
          var myColor = g.white === playerId ? 'w' : 'b';
          if (g.turn === myColor && g._meta && g._meta.lastWriter !== playerId) {
            var oppName = myColor === 'w' ? g.blackName : g.whiteName;
            publish('chess/game/your-turn', {
              gameId: g.id,
              opponentName: oppName,
              moveNotation: g.moves[g.moves.length - 1],
            });
          }
          seenMoves.add(moveKey);
        }

        var chatKey = g.id + ':' + (g.chat ? g.chat.length : 0);
        if (!seenChats.has(chatKey) && g.chat && g.chat.length > 0) {
          var lastMsg = g.chat[g.chat.length - 1];
          if (lastMsg.sender !== playerId) {
            var senderName = lastMsg.sender === g.white ? g.whiteName : g.blackName;
            publish('chess/chat/new-message', { gameId: g.id, senderName: senderName });
          }
          seenChats.add(chatKey);
        }
      }
      cachedGames = myGames;

      saveSeenSet(SEEN_MOVES_KEY, seenMoves);
      saveSeenSet(SEEN_CHATS_KEY, seenChats);
    } catch (err) {
      console.error('[Chess] Service poll error:', err);
    }
  }

  async function heartbeat() {
    try {
      var path = basePath + '\\players.json';
      await updatePlayersFile(invoke, path, function(data) {
        if (!data || typeof data !== 'object') return data;
        if (!data.players || typeof data.players !== 'object') data.players = {};
        var p = data.players[playerId];
        if (!p) return data;
        data.players[playerId] = {
          ...p,
          lastSeen: Date.now(),
          status: 'online',
        };
        return data;
      });
    } catch { /* swallow */ }
  }

  _interval = setInterval(poll, pollMs);
  _heartbeatInterval = setInterval(heartbeat, pollMs);
  // Do not poll immediately — the interval handles the first tick.
  // An immediate poll on service init hits the network share before startup
  // has settled, competing with React renders and other service inits.

  var publicAPI = {
    getOnlinePlayers: function() {
      var now = Date.now();
      var result = [];
      Object.keys(cachedPlayers).forEach(function(id) {
        var p = cachedPlayers[id];
        if (!p) return;
        var age = now - (p.lastSeen || 0);
        var status = age < 60000 ? 'online' : age < 300000 ? 'away' : 'offline';
        result.push({ id: id, displayName: p.displayName, status: status, stats: p.stats });
      });
      return result;
    },
    getActiveGames: function() {
      return cachedGames.filter(function(g) {
        return g.status === 'active' || g.status === 'check';
      });
    },
    getMyStats: function() {
      var p = cachedPlayers[playerId];
      return p ? (p.stats || { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 }) : null;
    },
  };

  window.chessAPI = publicAPI;
  console.log('[Chess] Service initialized — window.chessAPI ready');
}

function destroy() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
  delete window.chessAPI;
  console.log('[Chess] Service destroyed');
}

module.exports = { init: init, destroy: destroy };

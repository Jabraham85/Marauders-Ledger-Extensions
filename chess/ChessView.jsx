import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const STORE_KEY = 'chess_settings';
const PLAYER_ID_KEY = 'chess_playerId';
const SEEN_MOVES_KEY = 'chess_seenMoves';
const SEEN_CHALLENGES_KEY = 'chess_seenChallenges';
const POLL_DEFAULT = 5000;
const AWAY_THRESHOLD = 60000;
const OFFLINE_THRESHOLD = 300000;

const PIECE_UNICODE = {
  wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659',
  bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F',
};

const TIME_CONTROLS = {
  '1':  { label: '1 min',  ms: 60000 },
  '3':  { label: '3 min',  ms: 180000 },
  '5':  { label: '5 min',  ms: 300000 },
  '10': { label: '10 min', ms: 600000 },
  '30': { label: '30 min', ms: 1800000 },
  '0':  { label: 'Casual (untimed)', ms: 0 },
};

const BOT_DIFFICULTY = {
  easy:   { label: 'Easy',   depth: 0 },
  medium: { label: 'Medium', depth: 1 },
  hard:   { label: 'Hard',   depth: 2 },
};

// ── Hogwarts Theme ───────────────────────────────────────────────────────────

const TH = {
  sqLight:      '#E8D5B5',
  sqDark:       '#7B5B3A',
  sqLightDk:    '#4a3d30',
  sqDarkDk:     '#2e2118',
  selected:     '#6B8E4E',
  selectedDk:   '#4a6633',
  dropPreview:  '#7FA863',
  dropPreviewDk:'#5d7a45',
  invalidDrop:  'rgba(220,38,38,0.42)',
  invalidDropDk:'rgba(180,40,40,0.45)',
  targetDot:    'rgba(211,166,37,0.55)',
  targetRing:   'rgba(211,166,37,0.7)',
  gold:         '#D3A625',
  goldLight:    '#EEBA30',
  maroon:       '#740001',
  maroonLight:  '#9B1B30',
  cream:        '#F5E6CC',
  parchment:    '#2C1A0E',
  darkWood:     '#1C120B',
  boardBorder:  '#5C3D1E',
  boardBorderDk:'#3a2712',
};

const PIECE_RENDER = {
  w: {
    color: '#FFF8DC',
    textShadow: '0 0 4px rgba(211,166,37,0.7), 0 2px 6px rgba(0,0,0,0.6), 0 0 14px rgba(211,166,37,0.25)',
    WebkitTextStroke: '0.5px rgba(139,109,56,0.4)',
  },
  b: {
    color: '#1a0f0a',
    textShadow: '0 0 3px rgba(80,60,40,0.6), 0 2px 5px rgba(0,0,0,0.5), 0 0 10px rgba(20,60,20,0.2)',
    WebkitTextStroke: '0.5px rgba(60,40,20,0.3)',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function uid() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

function fullUid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Ledger applies documentElement zoom (~1.25) + --app-zoom; pointer coords must be scaled for position:fixed overlays (see gameDesign/BoardCanvas getInteractionZoom). */
function getAppRootZoom(doc) {
  const d = doc && doc.documentElement ? doc : document;
  try {
    const z = parseFloat(getComputedStyle(d.documentElement).zoom);
    if (Number.isFinite(z) && z > 0) return z;
  } catch { /* ignore */ }
  try {
    const raw = getComputedStyle(d.documentElement).getPropertyValue('--app-zoom').trim();
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* ignore */ }
  return 1;
}

function clientToFixedOverlayPosition(clientX, clientY, doc) {
  const z = getAppRootZoom(doc);
  return { left: clientX / z, top: clientY / z };
}

function getApi() {
  return window.appAPI || window.electronAPI || null;
}

function getInvoke() {
  const api = getApi();
  return api?.tauriInvoke || null;
}

function psQuote(value) {
  return String(value || '').replace(/'/g, "''");
}

async function readTextFile(path) {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return await invoke('marketplace_read_text_file', { path });
  } catch { return null; }
}

async function writeTextFile(path, contents) {
  const invoke = getInvoke();
  if (!invoke) return false;
  const tmpPath = `${path}.tmp.${Date.now()}.${uid()}`;
  const safeTmp = psQuote(tmpPath);
  const safeDest = psQuote(path);
  try {
    await invoke('marketplace_write_text_file', { path: tmpPath, contents });
    const moveResult = await invoke('run_powershell', {
      script: `
        try {
          $tmp = '${safeTmp}'
          $dest = '${safeDest}'
          $dir = Split-Path -Path $dest -Parent
          if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
          }
          Move-Item -LiteralPath $tmp -Destination $dest -Force
        } catch {
          exit 1
        }
      `,
    });
    if (Number(moveResult?.exit_code) !== 0) {
      throw new Error('Atomic file move failed');
    }
    return true;
  } catch {
    try {
      await invoke('marketplace_write_text_file', { path, contents });
      return true;
    } catch {
      return false;
    }
  }
}

async function ensureDir(dirPath) {
  const invoke = getInvoke();
  if (!invoke) return;
  const safe = dirPath.replace(/'/g, "''");
  try {
    await invoke('run_powershell', {
      script: `if (-not (Test-Path '${safe}')) { New-Item -ItemType Directory -Path '${safe}' -Force | Out-Null }`,
    });
  } catch { /* swallow */ }
}

async function deleteFile(path) {
  const invoke = getInvoke();
  if (!invoke) return;
  const safe = path.replace(/'/g, "''");
  try {
    await invoke('run_powershell', {
      script: `Remove-Item -Path '${safe}' -Force -ErrorAction SilentlyContinue`,
    });
  } catch { /* swallow */ }
}

async function listJsonFiles(dirPath) {
  const invoke = getInvoke();
  if (!invoke) return [];
  const safe = dirPath.replace(/'/g, "''");
  try {
    const r = await invoke('run_powershell', {
      script: `Get-ChildItem -Path '${safe}' -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }`,
    });
    if (!r?.stdout) return [];
    return r.stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

function getPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = fullUid();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

async function getAppUsername() {
  try {
    const settings = await window.electronAPI?.marketplaceGetSettings?.();
    return settings?.username || '';
  } catch { return ''; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Encryption (Web Crypto AES-GCM)
// ═══════════════════════════════════════════════════════════════════════════════

async function deriveGameKey(idA, idB, gameId) {
  const sorted = [idA, idB].sort();
  const material = sorted[0] + ':' + sorted[1] + ':' + gameId;
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(material));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptMessage(text, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

async function decryptMessage(ivB64, ctB64, key) {
  try {
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return '[decryption failed]'; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chess Engine
// ═══════════════════════════════════════════════════════════════════════════════

const INITIAL_BOARD = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

function cloneBoard(board) {
  return board.map(row => [...row]);
}

function pieceColor(p) { return p ? p[0] : null; }
function pieceType(p)  { return p ? p[1] : null; }

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function findKing(board, color) {
  const k = color + 'K';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] === k) return [r, c];
  return null;
}

function isSquareAttacked(board, r, c, byColor) {
  const opp = byColor;

  // Pawn attacks
  const pDir = opp === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pDir, pc = c + dc;
    if (inBounds(pr, pc) && board[pr][pc] === opp + 'P') return true;
  }

  // Knight attacks
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] === opp + 'N') return true;
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] === opp + 'K') return true;
    }

  // Sliding: rook/queen (straight)
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (pieceColor(p) === opp && (pieceType(p) === 'R' || pieceType(p) === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Sliding: bishop/queen (diagonal)
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (pieceColor(p) === opp && (pieceType(p) === 'B' || pieceType(p) === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  return false;
}

function isInCheck(board, color) {
  const kp = findKing(board, color);
  if (!kp) return false;
  const opp = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kp[0], kp[1], opp);
}

function generatePseudoMoves(board, color, castling, enPassant) {
  const moves = [];
  const dir = color === 'w' ? -1 : 1;
  const startRow = color === 'w' ? 6 : 1;
  const promoRow = color === 'w' ? 0 : 7;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || pieceColor(p) !== color) continue;
      const type = pieceType(p);

      if (type === 'P') {
        // Forward
        const nr = r + dir;
        if (inBounds(nr, c) && !board[nr][c]) {
          if (nr === promoRow) {
            for (const promo of ['Q','R','B','N'])
              moves.push({ fr: r, fc: c, tr: nr, tc: c, promo });
          } else {
            moves.push({ fr: r, fc: c, tr: nr, tc: c });
          }
          // Double push
          if (r === startRow) {
            const nr2 = r + 2 * dir;
            if (!board[nr2][c]) moves.push({ fr: r, fc: c, tr: nr2, tc: c });
          }
        }
        // Captures
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = board[nr][nc];
          if (target && pieceColor(target) !== color) {
            if (nr === promoRow) {
              for (const promo of ['Q','R','B','N'])
                moves.push({ fr: r, fc: c, tr: nr, tc: nc, promo });
            } else {
              moves.push({ fr: r, fc: c, tr: nr, tc: nc });
            }
          }
          // En passant
          if (enPassant && enPassant[0] === nr && enPassant[1] === nc) {
            moves.push({ fr: r, fc: c, tr: nr, tc: nc, enPassant: true });
          }
        }
      }

      if (type === 'N') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && pieceColor(board[nr][nc]) !== color)
            moves.push({ fr: r, fc: c, tr: nr, tc: nc });
        }
      }

      if (type === 'K') {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && pieceColor(board[nr][nc]) !== color)
              moves.push({ fr: r, fc: c, tr: nr, tc: nc });
          }
        // Castling
        const opp = color === 'w' ? 'b' : 'w';
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          if (castling[color + 'K'] && board[row][5] === null && board[row][6] === null &&
              board[row][7] === color + 'R' &&
              !isSquareAttacked(board, row, 4, opp) &&
              !isSquareAttacked(board, row, 5, opp) &&
              !isSquareAttacked(board, row, 6, opp)) {
            moves.push({ fr: r, fc: c, tr: row, tc: 6, castle: 'K' });
          }
          if (castling[color + 'Q'] && board[row][3] === null && board[row][2] === null && board[row][1] === null &&
              board[row][0] === color + 'R' &&
              !isSquareAttacked(board, row, 4, opp) &&
              !isSquareAttacked(board, row, 3, opp) &&
              !isSquareAttacked(board, row, 2, opp)) {
            moves.push({ fr: r, fc: c, tr: row, tc: 2, castle: 'Q' });
          }
        }
      }

      // Sliding pieces
      const slides = [];
      if (type === 'R' || type === 'Q') slides.push([0,1],[0,-1],[1,0],[-1,0]);
      if (type === 'B' || type === 'Q') slides.push([1,1],[1,-1],[-1,1],[-1,-1]);
      for (const [dr, dc] of slides) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (target) {
            if (pieceColor(target) !== color)
              moves.push({ fr: r, fc: c, tr: nr, tc: nc });
            break;
          }
          moves.push({ fr: r, fc: c, tr: nr, tc: nc });
          nr += dr; nc += dc;
        }
      }
    }
  }
  return moves;
}

function applyMove(board, move) {
  const b = cloneBoard(board);
  const piece = b[move.fr][move.fc];

  if (move.enPassant) {
    b[move.tr][move.tc] = piece;
    b[move.fr][move.fc] = null;
    b[move.fr][move.tc] = null; // captured pawn
    return b;
  }

  if (move.castle) {
    const row = move.fr;
    b[row][move.tc] = piece;
    b[row][4] = null;
    if (move.castle === 'K') { b[row][5] = b[row][7]; b[row][7] = null; }
    else                      { b[row][3] = b[row][0]; b[row][0] = null; }
    return b;
  }

  b[move.tr][move.tc] = move.promo ? pieceColor(piece) + move.promo : piece;
  b[move.fr][move.fc] = null;
  return b;
}

function getLegalMoves(board, color, castling, enPassant) {
  const pseudo = generatePseudoMoves(board, color, castling, enPassant);
  return pseudo.filter(m => {
    const nb = applyMove(board, m);
    return !isInCheck(nb, color);
  });
}

function getGameStatus(board, color, castling, enPassant, halfmove) {
  const moves = getLegalMoves(board, color, castling, enPassant);
  if (moves.length === 0) {
    return isInCheck(board, color) ? 'checkmate' : 'stalemate';
  }
  if (halfmove >= 100) return 'draw-50';
  if (isInCheck(board, color)) return 'check';
  if (isInsufficientMaterial(board)) return 'draw-material';
  return 'active';
}

function isInsufficientMaterial(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]) pieces.push(board[r][c]);
  if (pieces.length === 2) return true; // K vs K
  if (pieces.length === 3) {
    const types = pieces.map(p => pieceType(p));
    if (types.includes('B') || types.includes('N')) return true; // K+B vs K or K+N vs K
  }
  return false;
}

const COL_NAMES = 'abcdefgh';

function toAlgebraic(board, move, allMoves) {
  const piece = board[move.fr][move.fc];
  const type = pieceType(piece);
  const isCapture = !!board[move.tr][move.tc] || move.enPassant;
  const dest = COL_NAMES[move.tc] + (8 - move.tr);

  if (move.castle) return move.castle === 'K' ? 'O-O' : 'O-O-O';

  let notation = '';
  if (type === 'P') {
    notation = isCapture ? COL_NAMES[move.fc] + 'x' + dest : dest;
  } else {
    notation = type;
    // Disambiguation
    const same = allMoves.filter(m =>
      m.tr === move.tr && m.tc === move.tc &&
      pieceType(board[m.fr][m.fc]) === type &&
      (m.fr !== move.fr || m.fc !== move.fc)
    );
    if (same.length > 0) {
      if (same.every(m => m.fc !== move.fc)) notation += COL_NAMES[move.fc];
      else if (same.every(m => m.fr !== move.fr)) notation += (8 - move.fr);
      else notation += COL_NAMES[move.fc] + (8 - move.fr);
    }
    notation += (isCapture ? 'x' : '') + dest;
  }

  if (move.promo) notation += '=' + move.promo;

  // Check / checkmate marker
  const nb = applyMove(board, move);
  const oppColor = pieceColor(piece) === 'w' ? 'b' : 'w';
  if (isInCheck(nb, oppColor)) {
    const oppMoves = getLegalMoves(nb, oppColor, {wK:true,wQ:true,bK:true,bQ:true}, null);
    notation += oppMoves.length === 0 ? '#' : '+';
  }

  return notation;
}

function newGameState(whiteId, blackId, whiteName, blackName, timeControlKey) {
  const tc = TIME_CONTROLS[timeControlKey] || TIME_CONTROLS['10'];
  return {
    id: fullUid(),
    white: whiteId,
    black: blackId,
    whiteName,
    blackName,
    board: INITIAL_BOARD.map(r => [...r]),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    moves: [],
    status: 'active',
    winner: null,
    timeControl: timeControlKey,
    whiteTimeMs: tc.ms,
    blackTimeMs: tc.ms,
    lastMoveAt: Date.now(),
    startedAt: new Date().toISOString(),
    drawOffer: null,
    chat: [],
    casual: timeControlKey === '0',
    undoRequest: null,
    _meta: { writeId: uid(), lastWriter: whiteId },
  };
}

function normalizeSan(s) {
  return String(s || '').replace(/[+#]$/, '').trim();
}

/** Replays recorded moves from a fresh position; used for history replay and undo. */
function advanceGameByOneRecordedMove(game, recordedNotation) {
  const color = game.turn;
  const legalMoves = getLegalMoves(game.board, color, game.castling, game.enPassant);
  const target = normalizeSan(recordedNotation);
  const legal = legalMoves.find(m => normalizeSan(toAlgebraic(game.board, m, legalMoves)) === target);
  if (!legal) return null;

  const newBoard = applyMove(game.board, legal);
  const piece = game.board[legal.fr][legal.fc];
  const isCapture = !!game.board[legal.tr][legal.tc] || legal.enPassant;
  const isPawnMove = pieceType(piece) === 'P';

  const newCastling = { ...game.castling };
  if (pieceType(piece) === 'K') {
    newCastling[color + 'K'] = false;
    newCastling[color + 'Q'] = false;
  }
  if (pieceType(piece) === 'R') {
    if (legal.fr === 7 && legal.fc === 0) newCastling.wQ = false;
    if (legal.fr === 7 && legal.fc === 7) newCastling.wK = false;
    if (legal.fr === 0 && legal.fc === 0) newCastling.bQ = false;
    if (legal.fr === 0 && legal.fc === 7) newCastling.bK = false;
  }
  if (legal.tr === 7 && legal.tc === 0) newCastling.wQ = false;
  if (legal.tr === 7 && legal.tc === 7) newCastling.wK = false;
  if (legal.tr === 0 && legal.tc === 0) newCastling.bQ = false;
  if (legal.tr === 0 && legal.tc === 7) newCastling.bK = false;

  let newEP = null;
  if (isPawnMove && Math.abs(legal.tr - legal.fr) === 2) {
    newEP = [(legal.fr + legal.tr) / 2, legal.fc];
  }

  const newHalfmove = (isPawnMove || isCapture) ? 0 : game.halfmoveClock + 1;
  const oppColor = color === 'w' ? 'b' : 'w';
  const status = getGameStatus(newBoard, oppColor, newCastling, newEP, newHalfmove);

  let nextStatus = (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) ? status : 'active';
  let winner = status === 'checkmate' ? color : null;
  if (nextStatus === 'active' && isInCheck(newBoard, oppColor)) nextStatus = 'check';

  return {
    ...game,
    board: newBoard,
    turn: oppColor,
    castling: newCastling,
    enPassant: newEP,
    halfmoveClock: newHalfmove,
    fullmoveNumber: color === 'b' ? game.fullmoveNumber + 1 : game.fullmoveNumber,
    moves: [...game.moves, recordedNotation],
    status: nextStatus,
    winner,
  };
}

function replayStateAtMoveCount(game, moveCount) {
  if (moveCount < 0 || moveCount > game.moves.length) return null;
  let g = {
    ...game,
    board: INITIAL_BOARD.map(r => [...r]),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    moves: [],
    status: 'active',
    winner: null,
  };
  for (let i = 0; i < moveCount; i++) {
    g = advanceGameByOneRecordedMove(g, game.moves[i]);
    if (!g) return null;
  }
  return g;
}

function undoLastMove(game, playerId) {
  if (!game.moves || game.moves.length === 0) return null;
  const back = replayStateAtMoveCount(game, game.moves.length - 1);
  if (!back) return null;
  return {
    ...game,
    board: back.board,
    turn: back.turn,
    castling: back.castling,
    enPassant: back.enPassant,
    halfmoveClock: back.halfmoveClock,
    fullmoveNumber: back.fullmoveNumber,
    moves: back.moves,
    status: back.status,
    winner: back.winner,
    drawOffer: null,
    undoRequest: null,
    lastMoveAt: Date.now(),
    _meta: { writeId: uid(), lastWriter: playerId },
  };
}

function makeMove(game, move, playerId) {
  const color = game.turn;
  const myColor = game.white === playerId ? 'w' : 'b';
  if (color !== myColor) return null;

  const legalMoves = getLegalMoves(game.board, color, game.castling, game.enPassant);
  const legal = legalMoves.find(m =>
    m.fr === move.fr && m.fc === move.fc && m.tr === move.tr && m.tc === move.tc &&
    (m.promo || null) === (move.promo || null)
  );
  if (!legal) return null;

  const notation = toAlgebraic(game.board, legal, legalMoves);
  const newBoard = applyMove(game.board, legal);
  const piece = game.board[move.fr][move.fc];
  const isCapture = !!game.board[move.tr][move.tc] || legal.enPassant;
  const isPawnMove = pieceType(piece) === 'P';

  const newCastling = { ...game.castling };
  if (pieceType(piece) === 'K') {
    newCastling[color + 'K'] = false;
    newCastling[color + 'Q'] = false;
  }
  if (pieceType(piece) === 'R') {
    if (move.fr === 7 && move.fc === 0) newCastling.wQ = false;
    if (move.fr === 7 && move.fc === 7) newCastling.wK = false;
    if (move.fr === 0 && move.fc === 0) newCastling.bQ = false;
    if (move.fr === 0 && move.fc === 7) newCastling.bK = false;
  }
  // Rook captured
  if (move.tr === 7 && move.tc === 0) newCastling.wQ = false;
  if (move.tr === 7 && move.tc === 7) newCastling.wK = false;
  if (move.tr === 0 && move.tc === 0) newCastling.bQ = false;
  if (move.tr === 0 && move.tc === 7) newCastling.bK = false;

  let newEP = null;
  if (isPawnMove && Math.abs(move.tr - move.fr) === 2) {
    newEP = [(move.fr + move.tr) / 2, move.fc];
  }

  const now = Date.now();
  const elapsed = now - game.lastMoveAt;

  const newHalfmove = (isPawnMove || isCapture) ? 0 : game.halfmoveClock + 1;
  const oppColor = color === 'w' ? 'b' : 'w';
  const status = getGameStatus(newBoard, oppColor, newCastling, newEP, newHalfmove);

  const updated = {
    ...game,
    board: newBoard,
    turn: oppColor,
    castling: newCastling,
    enPassant: newEP,
    halfmoveClock: newHalfmove,
    fullmoveNumber: color === 'b' ? game.fullmoveNumber + 1 : game.fullmoveNumber,
    moves: [...game.moves, notation],
    status: (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) ? status : 'active',
    winner: status === 'checkmate' ? color : null,
    lastMoveAt: now,
    drawOffer: null,
    undoRequest: null,
    _meta: { writeId: uid(), lastWriter: playerId },
  };

  // Deduct time from the mover
  if (game.timeControl !== '0' && game.moves.length > 0) {
    const timeKey = color === 'w' ? 'whiteTimeMs' : 'blackTimeMs';
    updated[timeKey] = Math.max(0, game[timeKey] - elapsed);
    if (updated[timeKey] <= 0) {
      updated.status = 'timeout';
      updated.winner = oppColor;
    }
  }

  // Check status
  if (updated.status === 'active' && isInCheck(newBoard, oppColor)) {
    updated.status = 'check';
  }

  return updated;
}

// ── Solo / Bot helpers ───────────────────────────────────────────────────────

const SOLO_BOT_ID = '__bot__';

function newSoloGameState(playerId, playerName, timeControlKey, vsBot, difficulty) {
  const tc = TIME_CONTROLS[timeControlKey] || TIME_CONTROLS['0'];
  const diff = difficulty || 'medium';
  const diffLabel = BOT_DIFFICULTY[diff]?.label || 'Medium';
  const botName = vsBot ? `Bot (${diffLabel})` : playerName + ' (black)';
  return {
    id: fullUid(),
    white: playerId,
    black: vsBot ? SOLO_BOT_ID : playerId,
    whiteName: playerName,
    blackName: botName,
    board: INITIAL_BOARD.map(r => [...r]),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    moves: [],
    status: 'active',
    winner: null,
    timeControl: timeControlKey,
    whiteTimeMs: tc.ms,
    blackTimeMs: tc.ms,
    lastMoveAt: Date.now(),
    startedAt: new Date().toISOString(),
    drawOffer: null,
    chat: [],
    solo: true,
    soloType: vsBot ? 'bot' : 'both',
    botDifficulty: vsBot ? diff : null,
    casual: timeControlKey === '0',
    _meta: { writeId: uid(), lastWriter: playerId },
  };
}

function makeSoloMove(game, move) {
  const color = game.turn;
  const legalMoves = getLegalMoves(game.board, color, game.castling, game.enPassant);
  const legal = legalMoves.find(m =>
    m.fr === move.fr && m.fc === move.fc && m.tr === move.tr && m.tc === move.tc &&
    (m.promo || null) === (move.promo || null)
  );
  if (!legal) return null;

  const notation = toAlgebraic(game.board, legal, legalMoves);
  const newBoard = applyMove(game.board, legal);
  const piece = game.board[move.fr][move.fc];
  const isCapture = !!game.board[move.tr][move.tc] || legal.enPassant;
  const isPawnMove = pieceType(piece) === 'P';

  const newCastling = { ...game.castling };
  if (pieceType(piece) === 'K') {
    newCastling[color + 'K'] = false;
    newCastling[color + 'Q'] = false;
  }
  if (pieceType(piece) === 'R') {
    if (move.fr === 7 && move.fc === 0) newCastling.wQ = false;
    if (move.fr === 7 && move.fc === 7) newCastling.wK = false;
    if (move.fr === 0 && move.fc === 0) newCastling.bQ = false;
    if (move.fr === 0 && move.fc === 7) newCastling.bK = false;
  }
  if (move.tr === 7 && move.tc === 0) newCastling.wQ = false;
  if (move.tr === 7 && move.tc === 7) newCastling.wK = false;
  if (move.tr === 0 && move.tc === 0) newCastling.bQ = false;
  if (move.tr === 0 && move.tc === 7) newCastling.bK = false;

  let newEP = null;
  if (isPawnMove && Math.abs(move.tr - move.fr) === 2) {
    newEP = [(move.fr + move.tr) / 2, move.fc];
  }

  const now = Date.now();
  const elapsed = now - game.lastMoveAt;
  const newHalfmove = (isPawnMove || isCapture) ? 0 : game.halfmoveClock + 1;
  const oppColor = color === 'w' ? 'b' : 'w';
  const status = getGameStatus(newBoard, oppColor, newCastling, newEP, newHalfmove);

  const updated = {
    ...game,
    board: newBoard,
    turn: oppColor,
    castling: newCastling,
    enPassant: newEP,
    halfmoveClock: newHalfmove,
    fullmoveNumber: color === 'b' ? game.fullmoveNumber + 1 : game.fullmoveNumber,
    moves: [...game.moves, notation],
    status: (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) ? status : 'active',
    winner: status === 'checkmate' ? color : null,
    lastMoveAt: now,
    _meta: { writeId: uid(), lastWriter: game.white },
  };

  if (game.timeControl !== '0' && game.moves.length > 0) {
    const timeKey = color === 'w' ? 'whiteTimeMs' : 'blackTimeMs';
    updated[timeKey] = Math.max(0, game[timeKey] - elapsed);
    if (updated[timeKey] <= 0) {
      updated.status = 'timeout';
      updated.winner = oppColor;
    }
  }

  if (updated.status === 'active' && isInCheck(newBoard, oppColor)) {
    updated.status = 'check';
  }

  return updated;
}

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUES[pieceType(p)] || 0;
      // Positional bonus: center control and advancement
      const posBonus = (3.5 - Math.abs(r - 3.5)) * 3 + (3.5 - Math.abs(c - 3.5)) * 3;
      const advBonus = pieceType(p) === 'P' ? (pieceColor(p) === 'w' ? (6 - r) * 8 : (r - 1) * 8) : 0;
      score += (pieceColor(p) === 'w' ? 1 : -1) * (val + posBonus + advBonus);
    }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, castling, enPassant) {
  if (depth === 0) return evaluateBoard(board);
  const color = maximizing ? 'w' : 'b';
  const moves = getLegalMoves(board, color, castling, enPassant);
  if (moves.length === 0) {
    if (isInCheck(board, color)) return maximizing ? -99999 + depth : 99999 - depth;
    return 0;
  }
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const nb = applyMove(board, m);
      const ev = minimax(nb, depth - 1, alpha, beta, false, castling, null);
      best = Math.max(best, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const nb = applyMove(board, m);
      const ev = minimax(nb, depth - 1, alpha, beta, true, castling, null);
      best = Math.min(best, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function pickBotMove(game, difficulty) {
  const legal = getLegalMoves(game.board, game.turn, game.castling, game.enPassant);
  if (legal.length === 0) return null;
  const diff = difficulty || 'medium';

  if (diff === 'easy') {
    // Mostly random, small bias toward captures
    const scored = legal.map(m => {
      let s = Math.random() * 10;
      if (game.board[m.tr][m.tc]) s += 3;
      return { move: m, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  if (diff === 'hard') {
    const maximizing = game.turn === 'w';
    let bestMove = legal[0];
    let bestVal = maximizing ? -Infinity : Infinity;
    for (const m of legal) {
      const nb = applyMove(game.board, m);
      const ev = minimax(nb, 2, -Infinity, Infinity, !maximizing, game.castling, null);
      if (maximizing ? ev > bestVal : ev < bestVal) {
        bestVal = ev;
        bestMove = m;
      }
    }
    return bestMove;
  }

  // Medium: heuristic scoring
  const scored = legal.map(m => {
    const nb = applyMove(game.board, m);
    const oppColor = game.turn === 'w' ? 'b' : 'w';
    let score = 0;
    const oppLegal = getLegalMoves(nb, oppColor, game.castling, game.enPassant);
    if (oppLegal.length === 0 && isInCheck(nb, oppColor)) score += 10000;
    if (isInCheck(nb, oppColor)) score += 50;
    const captured = game.board[m.tr][m.tc];
    if (captured) score += (PIECE_VALUES[pieceType(captured)] || 0) / 10;
    if (m.enPassant) score += 10;
    if (m.promo) score += (m.promo === 'Q' ? 90 : 30);
    score += (3.5 - Math.abs(m.tr - 3.5)) + (3.5 - Math.abs(m.tc - 3.5));
    score += Math.random() * 3;
    return { move: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Folder Sync
// ═══════════════════════════════════════════════════════════════════════════════

async function readJsonFile(path) {
  const raw = await readTextFile(path);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function writeJsonFile(path, data) {
  await writeTextFile(path, JSON.stringify(data, null, 2));
}

async function mutateJsonFile(path, mutator) {
  const current = await readJsonFile(path) || {};
  const next = await mutator(current);
  if (!next || typeof next !== 'object') return current;
  await writeJsonFile(path, next);
  return next;
}

function mergeUniqueById(remoteItems, incomingItems, scoreFn) {
  const byId = new Map();
  const put = (item, preferOnTie) => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || '').trim();
    if (!id) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      return;
    }
    const prevScore = Number(scoreFn(existing) || 0);
    const nextScore = Number(scoreFn(item) || 0);
    if (nextScore > prevScore || (nextScore === prevScore && preferOnTie)) {
      byId.set(id, item);
    }
  };
  (Array.isArray(remoteItems) ? remoteItems : []).forEach(item => put(item, false));
  (Array.isArray(incomingItems) ? incomingItems : []).forEach(item => put(item, true));
  return Array.from(byId.values());
}

function mergeChallengeLists(remoteList, incomingList) {
  const statusRank = { pending: 1, accepted: 3, declined: 2, cancelled: 2 };
  return mergeUniqueById(remoteList, incomingList, (challenge) => {
    const ts = Number(challenge?.updatedAt || challenge?.createdAt || 0);
    const rank = statusRank[String(challenge?.status || 'pending')] || 0;
    return ts * 10 + rank;
  });
}

function mergeChatMessages(remoteChat, incomingChat) {
  return mergeUniqueById(remoteChat, incomingChat, (msg) => Number(msg?.ts || 0))
    .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
}

function mergeGameForWrite(remoteGame, incomingGame) {
  if (!remoteGame || typeof remoteGame !== 'object') return incomingGame;
  if (!incomingGame || typeof incomingGame !== 'object') return remoteGame;
  const remoteMoves = Array.isArray(remoteGame.moves) ? remoteGame.moves : [];
  const incomingMoves = Array.isArray(incomingGame.moves) ? incomingGame.moves : [];
  const terminalStatuses = new Set(['checkmate', 'stalemate', 'timeout', 'resigned', 'draw-agreed', 'draw-50', 'draw-material']);
  const incomingTerminal = terminalStatuses.has(String(incomingGame.status || ''));
  const remoteTerminal = terminalStatuses.has(String(remoteGame.status || ''));
  const incomingIsUndoPrefix =
    incomingMoves.length < remoteMoves.length &&
    incomingMoves.every((m, i) => m === remoteMoves[i]);
  const preferIncoming = incomingTerminal && !remoteTerminal
    ? true
    : remoteTerminal && !incomingTerminal
      ? false
      : incomingIsUndoPrefix
        ? true
        : (
          incomingMoves.length > remoteMoves.length ||
          (incomingMoves.length === remoteMoves.length && Number(incomingGame.lastMoveAt || 0) >= Number(remoteGame.lastMoveAt || 0))
        );
  const primary = preferIncoming ? incomingGame : remoteGame;
  const secondary = preferIncoming ? remoteGame : incomingGame;
  return {
    ...secondary,
    ...primary,
    id: String(incomingGame.id || remoteGame.id || ''),
    chat: mergeChatMessages(remoteGame.chat, incomingGame.chat),
  };
}

async function initSharedFolder(basePath) {
  await ensureDir(basePath);
  await ensureDir(basePath + '\\games');

  const playersPath = basePath + '\\players.json';
  const challengesPath = basePath + '\\challenges.json';

  const players = await readJsonFile(playersPath);
  if (!players) await writeJsonFile(playersPath, { players: {} });

  const challenges = await readJsonFile(challengesPath);
  if (!challenges) await writeJsonFile(challengesPath, { challenges: [] });
}

async function registerPlayer(basePath, playerId, displayName) {
  const path = basePath + '\\players.json';
  return mutateJsonFile(path, (current) => {
    const players = current?.players && typeof current.players === 'object' ? current.players : {};
    const existing = players[playerId] || {};
    return {
      ...current,
      players: {
        ...players,
        [playerId]: {
          ...existing,
          displayName: displayName || existing.displayName || 'Anonymous',
          lastSeen: Date.now(),
          status: 'online',
          stats: existing.stats || { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 },
        },
      },
    };
  });
}

async function readPlayers(basePath) {
  return await readJsonFile(basePath + '\\players.json') || { players: {} };
}

async function readChallenges(basePath) {
  return await readJsonFile(basePath + '\\challenges.json') || { challenges: [] };
}

async function writeChallenges(basePath, data) {
  const path = basePath + '\\challenges.json';
  return mutateJsonFile(path, (current) => {
    const remoteChallenges = Array.isArray(current?.challenges) ? current.challenges : [];
    const incomingChallenges = Array.isArray(data?.challenges) ? data.challenges : [];
    return {
      ...current,
      ...data,
      challenges: mergeChallengeLists(remoteChallenges, incomingChallenges),
    };
  });
}

async function readGame(basePath, gameId) {
  return await readJsonFile(basePath + '\\games\\' + gameId + '.json');
}

async function writeGame(basePath, game) {
  const path = basePath + '\\games\\' + game.id + '.json';
  const remote = await readJsonFile(path);
  const merged = mergeGameForWrite(remote, game);
  await writeJsonFile(path, merged);
  return merged;
}

async function deleteGame(basePath, gameId) {
  await deleteFile(basePath + '\\games\\' + gameId + '.json');
}

async function listActiveGameIds(basePath) {
  return (await listJsonFiles(basePath + '\\games')).map(f => f.replace('.json', ''));
}

async function updatePlayerStats(basePath, playerId, result) {
  const path = basePath + '\\players.json';
  await mutateJsonFile(path, (current) => {
    const players = current?.players && typeof current.players === 'object' ? current.players : {};
    const player = players[playerId];
    if (!player) return current;
    const stats = player.stats || { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 };
    const nextStats = {
      wins: Number(stats.wins || 0),
      losses: Number(stats.losses || 0),
      draws: Number(stats.draws || 0),
      gamesPlayed: Number(stats.gamesPlayed || 0) + 1,
    };
    if (result === 'win') nextStats.wins += 1;
    else if (result === 'loss') nextStats.losses += 1;
    else nextStats.draws += 1;
    return {
      ...current,
      players: {
        ...players,
        [playerId]: {
          ...player,
          stats: nextStats,
        },
      },
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Components
// ═══════════════════════════════════════════════════════════════════════════════

function formatTime(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min + ':' + String(sec).padStart(2, '0');
}

function StatusBadge({ status }) {
  const colors = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-400 dark:bg-gray-600',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || colors.offline}`} />;
}

// ── Promotion Dialog ─────────────────────────────────────────────────────────

function PromotionDialog({ color, onSelect }) {
  const pieces = ['Q', 'R', 'B', 'N'];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', borderRadius: 10 }}>
      <div style={{
        background: TH.parchment, borderRadius: 12, padding: 20,
        boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 0 2px ${TH.gold}44`,
        border: `2px solid ${TH.boardBorder}`,
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: TH.gold, marginBottom: 10, fontFamily: 'Georgia, serif', letterSpacing: 0.5 }}>Promote to:</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {pieces.map(p => (
            <button key={p} onClick={() => onSelect(p)}
              style={{
                width: 52, height: 52, fontSize: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: `2px solid ${TH.gold}44`, background: 'rgba(211,166,37,0.08)',
                cursor: 'pointer', transition: 'all 0.15s',
                ...PIECE_RENDER[color],
              }}>
              {PIECE_UNICODE[color + p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Chess Board ──────────────────────────────────────────────────────────────

function ChessBoard({ game, playerId, onMove, interactive, soloMode }) {
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingPromo, setPendingPromo] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [draggingFrom, setDraggingFrom] = useState(null);
  const [dragClient, setDragClient] = useState(null);
  const draggingRef = useRef(null);
  const draggingPieceRef = useRef(null);
  const dragGhostElRef = useRef(null);
  const captureTargetRef = useRef(null);
  const boardInnerRef = useRef(null);

  const myColor = soloMode ? game.turn : (game.white === playerId ? 'w' : 'b');
  const isFlipped = soloMode ? false : myColor === 'b';
  const isMyTurn = soloMode ? interactive : (game.turn === myColor && interactive);

  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
    setPendingPromo(null);
    setDragOver(null);
    setDraggingFrom(null);
    setDragClient(null);
    draggingRef.current = null;
    draggingPieceRef.current = null;
    const g = dragGhostElRef.current;
    if (g && typeof document !== 'undefined') {
      try {
        if (typeof g.remove === 'function') g.remove();
        else g.parentNode?.removeChild(g);
      } catch { /* ignore */ }
      dragGhostElRef.current = null;
    }
  }, [game.moves.length]);

  const allLegal = useMemo(() => {
    if (!isMyTurn) return [];
    return getLegalMoves(game.board, game.turn, game.castling, game.enPassant);
  }, [game.board, game.turn, game.castling, game.enPassant, isMyTurn]);

  const tryMove = useCallback((fr, fc, tr, tc) => {
    const move = allLegal.find(m => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc && !m.promo);
    const promoMove = allLegal.find(m => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc && m.promo);
    if (promoMove && !move) {
      setPendingPromo({ fr, fc, tr, tc });
      return true;
    }
    if (move) {
      onMove(move);
      setSelected(null);
      setLegalTargets([]);
      return true;
    }
    return false;
  }, [allLegal, onMove]);

  const SQ = 56;
  const LABEL_W = 22;
  const BOARD_BORDER = 3;

  /** Map pointer to square using layout proportions vs getBoundingClientRect so hit-testing matches the ghost under zoom/scale (fixed SQ math alone can drift). */
  const clientToSquare = useCallback((clientX, clientY) => {
    const el = boardInnerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const contentW = LABEL_W + SQ * 8;
    const contentH = SQ * 8 + 22;
    const innerLeft = rect.left + BOARD_BORDER;
    const innerTop = rect.top + BOARD_BORDER;
    const innerW = rect.width - 2 * BOARD_BORDER;
    const innerH = rect.height - 2 * BOARD_BORDER;
    if (innerW <= 0 || innerH <= 0) return null;
    const labelW = innerW * (LABEL_W / contentW);
    const rankAreaH = innerH * ((SQ * 8) / contentH);
    const fileW = (innerW - labelW) / 8;
    const rankH = rankAreaH / 8;
    const rx = clientX - innerLeft;
    const ry = clientY - innerTop;
    if (rx < 0 || ry < 0 || rx >= innerW || ry >= innerH) return null;
    if (rx < labelW || ry >= rankAreaH) return null;
    const rDisplay = Math.min(7, Math.floor(ry / rankH));
    const cDisplay = Math.min(7, Math.floor((rx - labelW) / fileW));
    if (rDisplay < 0 || rDisplay > 7 || cDisplay < 0 || cDisplay > 7) return null;
    const r = isFlipped ? 7 - rDisplay : rDisplay;
    const c = isFlipped ? 7 - cDisplay : cDisplay;
    return { r, c };
  }, [isFlipped]);

  const endPointerDrag = useCallback((e) => {
    const el = captureTargetRef.current;
    const pid = e?.pointerId;
    try {
      if (el && pid != null && el.hasPointerCapture?.(pid)) {
        el.releasePointerCapture(pid);
      }
    } catch { /* ignore */ }
    captureTargetRef.current = null;
    draggingRef.current = null;
    draggingPieceRef.current = null;
    setDraggingFrom(null);
    setDragOver(null);
    setDragClient(null);
    const g = dragGhostElRef.current;
    if (g && typeof document !== 'undefined') {
      try {
        if (typeof g.remove === 'function') g.remove();
        else g.parentNode?.removeChild(g);
      } catch { /* ignore */ }
      dragGhostElRef.current = null;
    }
  }, []);

  const handlePiecePointerDown = useCallback((e, r, c) => {
    if (!isMyTurn || e.button !== 0) return;
    const piece = game.board[r][c];
    if (!piece || pieceColor(piece) !== myColor) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      captureTargetRef.current = e.currentTarget;
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
    const payload = { fr: r, fc: c };
    draggingRef.current = payload;
    draggingPieceRef.current = piece;
    setDraggingFrom(payload);
    setDragClient({ x: e.clientX, y: e.clientY });
    setSelected([r, c]);
    setLegalTargets(allLegal.filter(m => m.fr === r && m.fc === c).map(m => [m.tr, m.tc]));
  }, [isMyTurn, game.board, myColor, allLegal]);

  // Window-level move/up so the drag ghost tracks the cursor even inside iframes / transformed parents.
  useEffect(() => {
    if (!draggingFrom) return;
    const onMove = (e) => {
      if (!draggingRef.current) return;
      setDragClient({ x: e.clientX, y: e.clientY });
      const sq = clientToSquare(e.clientX, e.clientY);
      setDragOver(sq ? `${sq.r},${sq.c}` : null);
    };
    const onUp = (e) => {
      if (!draggingRef.current) return;
      const drag = draggingRef.current;
      const { fr, fc } = drag;
      const sq = clientToSquare(e.clientX, e.clientY);
      try {
        if (sq) {
          if (!tryMove(fr, fc, sq.r, sq.c)) {
            setSelected(null);
            setLegalTargets([]);
          }
        } else {
          setSelected(null);
          setLegalTargets([]);
        }
      } finally {
        endPointerDrag(e);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingFrom, clientToSquare, tryMove, endPointerDrag]);

  // Imperative ghost on document.body — extension host does not bundle react-dom (no createPortal).
  // Use useEffect only: some extension React shims omit useLayoutEffect (would crash with undefined.call).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!draggingFrom || !dragClient) {
      const ghost = dragGhostElRef.current;
      if (ghost) {
        try {
          if (typeof ghost.remove === 'function') ghost.remove();
          else ghost.parentNode?.removeChild(ghost);
        } catch { /* ignore */ }
        dragGhostElRef.current = null;
      }
      return;
    }
    const p = draggingPieceRef.current;
    if (!p) return;
    const col = pieceColor(p);
    const pr = PIECE_RENDER[col] || PIECE_RENDER.w;
    let el = dragGhostElRef.current;
    const doc = boardInnerRef.current?.ownerDocument ?? document;
    const { left, top } = clientToFixedOverlayPosition(dragClient.x, dragClient.y, doc);
    if (!el) {
      el = doc.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      const st = el.style;
      st.position = 'fixed';
      st.pointerEvents = 'none';
      st.zIndex = '2147483646';
      st.fontSize = '46px';
      st.lineHeight = '1';
      st.transform = 'translate(-50%, -54%) scale(1.08)';
      st.willChange = 'transform';
      st.filter = 'drop-shadow(0 10px 18px rgba(0,0,0,0.55)) drop-shadow(0 2px 4px rgba(0,0,0,0.35))';
      if (pr) {
        if (pr.color) st.color = pr.color;
        if (pr.textShadow) st.textShadow = pr.textShadow;
        if (pr.WebkitTextStroke) st.webkitTextStroke = pr.WebkitTextStroke;
      }
      doc.body.appendChild(el);
      dragGhostElRef.current = el;
    }
    el.textContent = PIECE_UNICODE[p] || '';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [draggingFrom, dragClient]);

  useEffect(() => {
    return () => {
      const ghost = dragGhostElRef.current;
      if (ghost && typeof document !== 'undefined') {
        try {
          if (typeof ghost.remove === 'function') ghost.remove();
          else ghost.parentNode?.removeChild(ghost);
        } catch { /* ignore */ }
        dragGhostElRef.current = null;
      }
    };
  }, []);

  const handlePromoSelect = useCallback((promoType) => {
    if (!pendingPromo) return;
    onMove({ ...pendingPromo, promo: promoType });
    setPendingPromo(null);
    setSelected(null);
    setLegalTargets([]);
  }, [pendingPromo, onMove]);

  const isDark = typeof document !== 'undefined' && document.documentElement?.classList?.contains('dark');

  return (
    <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      <div
        ref={boardInnerRef}
        style={{
        borderRadius: 10, overflow: 'hidden',
        border: `3px solid ${isDark ? TH.boardBorderDk : TH.boardBorder}`,
        boxShadow: isDark
          ? '0 4px 20px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.1)'
          : '0 4px 20px rgba(92,61,30,0.3), inset 0 0 30px rgba(0,0,0,0.05)',
      }}>
        {Array.from({ length: 8 }, (_, ri) => {
          const r = isFlipped ? 7 - ri : ri;
          return (
            <div key={ri} style={{ display: 'flex', height: SQ }}>
              <div style={{
                width: LABEL_W, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, fontFamily: 'Georgia, serif',
                color: isDark ? '#8a7a66' : '#8B7355',
                background: isDark ? TH.darkWood : '#C4A882',
              }}>
                {8 - r}
              </div>
              {Array.from({ length: 8 }, (_, ci) => {
                const c = isFlipped ? 7 - ci : ci;
                const isLight = (r + c) % 2 === 0;
                const piece = game.board[r][c];
                const isSel = selected && selected[0] === r && selected[1] === c;
                const isTarget = legalTargets.some(([tr, tc]) => tr === r && tc === c);
                const isOccTarget = isTarget && piece;
                const isDraggingThis = draggingFrom && draggingFrom.fr === r && draggingFrom.fc === c;
                const isDragHoverSquare = Boolean(draggingFrom && dragOver === `${r},${c}`);
                const isDragOrigin = draggingFrom && draggingFrom.fr === r && draggingFrom.fc === c;
                const isLegalDragHover = isDragHoverSquare && isTarget;
                const isIllegalDragHover = isDragHoverSquare && !isTarget && !isDragOrigin;

                let bg;
                if (isIllegalDragHover) bg = isDark ? TH.invalidDropDk : TH.invalidDrop;
                else if (isLegalDragHover) bg = isDark ? TH.dropPreviewDk : TH.dropPreview;
                else if (isSel) bg = isDark ? TH.selectedDk : TH.selected;
                else bg = isLight ? (isDark ? TH.sqLightDk : TH.sqLight) : (isDark ? TH.sqDarkDk : TH.sqDark);

                const pStyle = piece ? {
                  fontSize: 38, lineHeight: 1, userSelect: 'none', touchAction: 'none',
                  cursor: isMyTurn && pieceColor(piece) === myColor ? 'grab' : 'default',
                  opacity: isDraggingThis ? 0 : 1,
                  ...PIECE_RENDER[pieceColor(piece)],
                } : null;

                return (
                  <div key={`${r}-${c}`}
                    style={{
                      width: SQ, height: SQ, position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: bg, cursor: 'default',
                      transition: 'background 0.15s ease',
                    }}>
                    {isTarget && !isOccTarget && (
                      <span style={{
                        position: 'absolute', width: 16, height: 16, borderRadius: '50%',
                        background: TH.targetDot,
                        boxShadow: `0 0 6px ${TH.targetDot}`,
                      }} />
                    )}
                    {isOccTarget && (
                      <span style={{
                        position: 'absolute', inset: 2,
                        border: `2.5px solid ${TH.targetRing}`,
                        borderRadius: 3,
                        boxShadow: `inset 0 0 8px ${TH.targetDot}`,
                      }} />
                    )}
                    {piece && (
                      <span
                        style={pStyle}
                        onPointerDown={(e) => handlePiecePointerDown(e, r, c)}
                      >
                        {PIECE_UNICODE[piece]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{
          display: 'flex', height: 22, paddingLeft: LABEL_W,
          background: isDark ? TH.darkWood : '#C4A882',
        }}>
          {Array.from({ length: 8 }, (_, i) => {
            const c = isFlipped ? 7 - i : i;
            return (
              <div key={i} style={{
                width: SQ, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, fontFamily: 'Georgia, serif',
                color: isDark ? '#8a7a66' : '#8B7355',
              }}>
                {COL_NAMES[c]}
              </div>
            );
          })}
        </div>
      </div>

      {pendingPromo && <PromotionDialog color={myColor} onSelect={handlePromoSelect} />}
    </div>
  );
}

// ── Clock Display ────────────────────────────────────────────────────────────

function ClockDisplay({ game, playerId }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (game.timeControl === '0' || game.status !== 'active' && game.status !== 'check') return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [game.timeControl, game.status]);

  if (game.timeControl === '0') return null;

  const elapsed = now - game.lastMoveAt;
  const myColor = game.white === playerId ? 'w' : 'b';

  let whiteMs = game.whiteTimeMs;
  let blackMs = game.blackTimeMs;
  if ((game.status === 'active' || game.status === 'check') && game.moves.length > 0) {
    if (game.turn === 'w') whiteMs = Math.max(0, whiteMs - elapsed);
    else blackMs = Math.max(0, blackMs - elapsed);
  }

  const topColor = myColor === 'w' ? 'b' : 'w';
  const botColor = myColor;
  const topMs = topColor === 'w' ? whiteMs : blackMs;
  const botMs = botColor === 'w' ? whiteMs : blackMs;
  const topActive = game.turn === topColor && (game.status === 'active' || game.status === 'check');
  const botActive = game.turn === botColor && (game.status === 'active' || game.status === 'check');

  const clockStyle = (active, ms) => ({
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 8,
    textAlign: 'center',
    minWidth: 72,
    background: active
      ? ms < 30000 ? 'rgba(220,38,38,0.12)' : 'rgba(37,99,235,0.12)'
      : 'var(--hp-card, #f3f4f6)',
    color: active
      ? ms < 30000 ? '#dc2626' : '#1d4ed8'
      : 'var(--hp-muted, #6b7280)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={clockStyle(topActive, topMs)}>{formatTime(topMs)}</div>
      <div style={{ fontSize: 10, color: 'var(--hp-muted, #6b7280)' }}>vs</div>
      <div style={clockStyle(botActive, botMs)}>{formatTime(botMs)}</div>
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ game, playerId, basePath, onGameUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    deriveGameKey(game.white, game.black, game.id).then(setCryptoKey);
  }, [game.white, game.black, game.id]);

  useEffect(() => {
    if (!cryptoKey || !game.chat) return;
    let cancelled = false;
    Promise.all(
      game.chat.map(async msg => ({
        ...msg,
        text: await decryptMessage(msg.iv, msg.ct, cryptoKey),
      }))
    ).then(decrypted => {
      if (!cancelled) setMessages(decrypted);
    });
    return () => { cancelled = true; };
  }, [game.chat, cryptoKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !cryptoKey) return;
    const { iv, ct } = await encryptMessage(input.trim(), cryptoKey);
    const msg = { id: uid(), sender: playerId, ts: Date.now(), iv, ct };
    const latest = await readGame(basePath, game.id);
    const baseGame = latest && latest.id === game.id ? latest : game;
    const currentChat = Array.isArray(baseGame.chat) ? baseGame.chat : [];
    if (currentChat.some((entry) => entry?.id === msg.id)) return;
    const updatedGame = {
      ...baseGame,
      chat: [...currentChat, msg],
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updatedGame);
    onGameUpdate(persisted || updatedGame);
    setInput('');
  }, [input, cryptoKey, game, playerId, basePath, onGameUpdate]);

  const myColor = game.white === playerId ? 'w' : 'b';
  const getName = (senderId) => senderId === game.white ? game.whiteName : game.blackName;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.map(msg => {
          const isMe = msg.sender === playerId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${
                isMe
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-200 dark:bg-gray-700 text-hp-text dark:text-hp-text-dark rounded-bl-sm'
              }`}>
                {!isMe && <div className="font-semibold text-[10px] opacity-70 mb-0.5">{getName(msg.sender)}</div>}
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{msg.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-hp-border dark:border-hp-border-dark p-2 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type a message..."
          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-800 text-hp-text dark:text-hp-text-dark placeholder:text-hp-muted dark:placeholder:text-hp-muted-dark focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={sendMessage}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          Send
        </button>
      </div>
    </div>
  );
}

// ── Move History ─────────────────────────────────────────────────────────────

function MoveHistory({ moves, replayHalfMove, replayAnimating, onReplayToHalfMove }) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || '',
      whiteIdx: i,
      blackIdx: i + 1,
    });
  }
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [moves.length]);

  const hl = (moveIdxInArray) => {
    if (replayHalfMove == null) return false;
    return moveIdxInArray === replayHalfMove - 1;
  };

  return (
    <div className="overflow-y-auto max-h-60 text-xs font-mono">
      {pairs.map(p => (
        <div key={p.num} className="flex gap-1 px-2 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <span className="w-6 text-hp-muted dark:text-hp-muted-dark text-right shrink-0">{p.num}.</span>
          <button
            type="button"
            disabled={replayAnimating || !p.white}
            onClick={() => p.white && onReplayToHalfMove(p.whiteIdx + 1)}
            className={`w-16 text-left rounded px-0.5 transition-colors ${
              hl(p.whiteIdx) ? 'bg-amber-200/80 dark:bg-amber-900/40 text-hp-text dark:text-hp-text-dark' : 'text-hp-text dark:text-hp-text-dark hover:bg-amber-100/50 dark:hover:bg-amber-900/20'
            } disabled:opacity-50 disabled:hover:bg-transparent`}>
            {p.white}
          </button>
          <button
            type="button"
            disabled={replayAnimating || !p.black}
            onClick={() => p.black && onReplayToHalfMove(p.blackIdx + 1)}
            className={`w-16 text-left rounded px-0.5 transition-colors ${
              hl(p.blackIdx) ? 'bg-amber-200/80 dark:bg-amber-900/40 text-hp-text dark:text-hp-text-dark' : 'text-hp-text dark:text-hp-text-dark hover:bg-amber-100/50 dark:hover:bg-amber-900/20'
            } disabled:opacity-50 disabled:hover:bg-transparent`}>
            {p.black}
          </button>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ── Game View ────────────────────────────────────────────────────────────────

function GameView({ game, playerId, basePath, onGameUpdate, onBack, enableChat }) {
  const isSolo = !!game.solo;
  const isBot = game.soloType === 'bot';
  const myColor = isSolo ? 'w' : (game.white === playerId ? 'w' : 'b');
  const opponentName = myColor === 'w' ? game.blackName : game.whiteName;
  const myName = myColor === 'w' ? game.whiteName : game.blackName;
  const isMyTurn = isSolo ? (isBot ? game.turn === 'w' : true) : game.turn === myColor;
  const isOver = ['checkmate', 'stalemate', 'timeout', 'resigned', 'draw-agreed', 'draw-50', 'draw-material'].includes(game.status);
  const botTimerRef = useRef(null);
  const [replayHalfMove, setReplayHalfMove] = useState(null);
  const [replayAnimating, setReplayAnimating] = useState(false);
  const replayTimerRef = useRef(null);
  const lastSyncedWriteIdRef = useRef(undefined);

  const displayGame = useMemo(() => {
    if (replayHalfMove === null) return game;
    const r = replayStateAtMoveCount(game, replayHalfMove);
    if (!r) return game;
    return { ...game, ...r };
  }, [game, replayHalfMove]);

  useEffect(() => {
    const w = game._meta?.writeId;
    if (lastSyncedWriteIdRef.current !== undefined && w !== lastSyncedWriteIdRef.current) {
      setReplayHalfMove(null);
      setReplayAnimating(false);
    }
    lastSyncedWriteIdRef.current = w;
  }, [game._meta?.writeId]);

  useEffect(() => () => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
  }, []);

  const handleReplayToHalfMove = useCallback((targetCount) => {
    if (targetCount <= 0) return;
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    setReplayAnimating(true);
    setReplayHalfMove(0);
    let step = 0;
    const run = () => {
      step++;
      if (step > targetCount) {
        setReplayHalfMove(targetCount);
        setReplayAnimating(false);
        return;
      }
      setReplayHalfMove(step);
      replayTimerRef.current = setTimeout(run, 260);
    };
    replayTimerRef.current = setTimeout(run, 260);
  }, []);

  const exitReplay = useCallback(() => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    setReplayAnimating(false);
    setReplayHalfMove(null);
  }, []);

  const lastMoverId = game.moves.length === 0 ? null : (game.turn === 'w' ? game.black : game.white);

  // Bot auto-move (paused while viewing move replay)
  useEffect(() => {
    if (!isBot || isOver || game.turn !== 'b' || replayHalfMove !== null) return;
    const delay = game.botDifficulty === 'hard' ? 600 + Math.random() * 800 : 300 + Math.random() * 500;
    botTimerRef.current = setTimeout(() => {
      const botMove = pickBotMove(game, game.botDifficulty);
      if (!botMove) return;
      const updated = makeSoloMove(game, botMove);
      if (updated) onGameUpdate(updated);
    }, delay);
    return () => clearTimeout(botTimerRef.current);
  }, [isBot, isOver, game, onGameUpdate, replayHalfMove]);

  const handleMove = useCallback(async (move) => {
    if (isSolo) {
      const updated = makeSoloMove(game, move);
      if (updated) onGameUpdate(updated);
      return;
    }
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = makeMove(baseGame, move, playerId);
    if (!updated) {
      if (remote && remote._meta?.writeId !== game._meta?.writeId) onGameUpdate(remote);
      return;
    }
    const persisted = await writeGame(basePath, updated);
    const nextGame = persisted || updated;
    onGameUpdate(nextGame);

    const api = getApi();
    if (api?.interopPublish) {
      api.interopPublish({
        channel: 'chess/game/your-turn',
        source: 'chess',
        payload: { gameId: nextGame.id, opponentName: myName, moveNotation: nextGame.moves[nextGame.moves.length - 1] },
      });
    }
  }, [game, playerId, basePath, onGameUpdate, myName, isSolo]);

  const handleResign = useCallback(async () => {
    if (isSolo) {
      onBack();
      return;
    }
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = {
      ...baseGame,
      status: 'resigned',
      winner: myColor === 'w' ? 'b' : 'w',
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updated);
    const nextGame = persisted || updated;
    onGameUpdate(nextGame);
    await updatePlayerStats(basePath, playerId, 'loss');
    const oppId = myColor === 'w' ? nextGame.black : nextGame.white;
    await updatePlayerStats(basePath, oppId, 'win');
  }, [game, playerId, myColor, basePath, onGameUpdate, isSolo, onBack]);

  const handleOfferDraw = useCallback(async () => {
    if (isSolo) return;
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = {
      ...baseGame,
      drawOffer: playerId,
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updated);
    onGameUpdate(persisted || updated);
  }, [game, playerId, basePath, onGameUpdate, isSolo]);

  const handleAcceptDraw = useCallback(async () => {
    if (isSolo) return;
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = {
      ...baseGame,
      status: 'draw-agreed',
      winner: null,
      drawOffer: null,
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updated);
    const nextGame = persisted || updated;
    onGameUpdate(nextGame);
    await updatePlayerStats(basePath, nextGame.white, 'draw');
    await updatePlayerStats(basePath, nextGame.black, 'draw');
  }, [game, playerId, basePath, onGameUpdate, isSolo]);

  const handleRequestUndo = useCallback(async () => {
    if (isSolo) return;
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = {
      ...baseGame,
      undoRequest: { from: playerId, atTs: Date.now() },
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updated);
    onGameUpdate(persisted || updated);
  }, [game, playerId, basePath, onGameUpdate, isSolo]);

  const handleAcceptUndo = useCallback(async () => {
    if (isSolo) return;
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const req = baseGame.undoRequest;
    const lastMover = baseGame.moves.length === 0 ? null : (baseGame.turn === 'w' ? baseGame.black : baseGame.white);
    if (!req?.from || req.from !== lastMover) {
      const declined = {
        ...baseGame,
        undoRequest: null,
        _meta: { writeId: uid(), lastWriter: playerId },
      };
      const persisted = await writeGame(basePath, declined);
      onGameUpdate(persisted || declined);
      return;
    }
    const undone = undoLastMove(baseGame, playerId);
    if (!undone) return;
    const persisted = await writeGame(basePath, undone);
    onGameUpdate(persisted || undone);
  }, [game, playerId, basePath, onGameUpdate, isSolo]);

  const handleDeclineUndo = useCallback(async () => {
    if (isSolo) return;
    const remote = await readGame(basePath, game.id);
    const baseGame = remote && remote.id === game.id ? remote : game;
    const updated = {
      ...baseGame,
      undoRequest: null,
      _meta: { writeId: uid(), lastWriter: playerId },
    };
    const persisted = await writeGame(basePath, updated);
    onGameUpdate(persisted || updated);
  }, [game, playerId, basePath, onGameUpdate, isSolo]);

  const handleCleanup = useCallback(async () => {
    if (isSolo) {
      onBack();
      return;
    }
    await deleteGame(basePath, game.id);
    onBack();
  }, [basePath, game.id, onBack, isSolo]);

  const handleNewGame = useCallback(() => {
    const fresh = newSoloGameState(playerId, myName, game.timeControl, isBot, game.botDifficulty);
    onGameUpdate(fresh);
  }, [playerId, myName, game.timeControl, isBot, game.botDifficulty, onGameUpdate]);

  const statusText = () => {
    if (isSolo && !isBot) {
      switch (game.status) {
        case 'checkmate': return `Checkmate! ${game.winner === 'w' ? 'White' : 'Black'} wins.`;
        case 'stalemate': return 'Stalemate — draw.';
        case 'timeout': return `Time out! ${game.winner === 'w' ? 'White' : 'Black'} wins.`;
        case 'draw-50': return 'Draw by 50-move rule.';
        case 'draw-material': return 'Draw — insufficient material.';
        case 'check': return `${game.turn === 'w' ? 'White' : 'Black'} is in check!`;
        default: return `${game.turn === 'w' ? 'White' : 'Black'} to move`;
      }
    }
    switch (game.status) {
      case 'checkmate': return `Checkmate! ${game.winner === 'w' ? game.whiteName : game.blackName} wins.`;
      case 'stalemate': return 'Stalemate — draw.';
      case 'timeout': return `Time out! ${game.winner === 'w' ? game.whiteName : game.blackName} wins.`;
      case 'resigned': return `${game.winner === 'w' ? game.blackName : game.whiteName} resigned. ${game.winner === 'w' ? game.whiteName : game.blackName} wins.`;
      case 'draw-agreed': return 'Draw by agreement.';
      case 'draw-50': return 'Draw by 50-move rule.';
      case 'draw-material': return 'Draw — insufficient material.';
      case 'check': return isMyTurn ? 'You are in check!' : `${opponentName} is in check.`;
      default: return isMyTurn ? 'Your move' : `Waiting for ${opponentName}...`;
    }
  };

  const soloLabel = isSolo
    ? isBot ? `vs Bot (${BOT_DIFFICULTY[game.botDifficulty]?.label || 'Medium'})` : 'Both Sides'
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hp-border dark:border-hp-border-dark">
        <button onClick={onBack}
          className="text-xs px-2 py-1 rounded-lg border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          Back
        </button>
        <div className="flex-1">
          <span className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">{game.whiteName}</span>
          <span className="text-xs text-hp-muted dark:text-hp-muted-dark mx-2">vs</span>
          <span className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">{game.blackName}</span>
          {soloLabel && (
            <span style={{
              marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${TH.gold}22`, color: TH.gold, fontWeight: 700,
              border: `1px solid ${TH.gold}44`, fontFamily: 'Georgia, serif',
            }}>{soloLabel}</span>
          )}
          {!isSolo && (game.casual || game.timeControl === '0') && (
            <span style={{
              marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(34,197,94,0.15)', color: '#16a34a', fontWeight: 700,
              border: '1px solid rgba(34,197,94,0.35)', fontFamily: 'Georgia, serif',
            }}>Casual</span>
          )}
        </div>
        <div className={`text-xs font-medium px-2 py-1 rounded-lg ${
          isOver
            ? 'bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark'
            : isMyTurn
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
        }`}>
          {statusText()}
        </div>
      </div>

      {/* Body: column on narrow viewports so moves/chat stay on-screen; row on large screens */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Board + controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-4 min-w-0 min-h-0 overflow-y-auto overflow-x-auto">
          <div
            className="flex flex-wrap items-start justify-center gap-4 sm:gap-6 max-w-full"
            style={{ width: '100%' }}
          >
            <ChessBoard
              game={displayGame}
              playerId={playerId}
              onMove={handleMove}
              interactive={!isOver && replayHalfMove === null && (isSolo ? (isBot ? game.turn === 'w' : true) : true)}
              soloMode={isSolo && !isBot}
            />
            <ClockDisplay game={game} playerId={playerId} />
          </div>

          {/* Controls */}
          {!isOver && !isSolo && (
            <div className="flex flex-wrap gap-2 justify-center">
              {game.drawOffer && game.drawOffer !== playerId ? (
                <button onClick={handleAcceptDraw}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors">
                  Accept Draw
                </button>
              ) : (
                <button onClick={handleOfferDraw}
                  disabled={game.drawOffer === playerId}
                  className="px-3 py-1.5 text-xs font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {game.drawOffer === playerId ? 'Draw Offered' : 'Offer Draw'}
                </button>
              )}
              <button onClick={handleResign}
                className="px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Resign
              </button>
              {game.moves.length > 0 && lastMoverId === playerId && !game.undoRequest && (
                <button onClick={handleRequestUndo}
                  className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                  Request undo
                </button>
              )}
              {game.undoRequest && game.undoRequest.from !== playerId && (
                <>
                  <button onClick={handleAcceptUndo}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                    Accept undo
                  </button>
                  <button onClick={handleDeclineUndo}
                    className="px-3 py-1.5 text-xs font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    Decline
                  </button>
                </>
              )}
              {game.undoRequest && game.undoRequest.from === playerId && (
                <span className="text-xs text-amber-700 dark:text-amber-300 px-2 py-1.5">Undo requested…</span>
              )}
            </div>
          )}

          {!isOver && isSolo && (
            <div className="flex gap-2">
              <button onClick={onBack}
                className="px-3 py-1.5 text-xs font-medium border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Quit Game
              </button>
            </div>
          )}

          {isOver && (
            <div className="flex gap-2 items-center">
              <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                (isSolo && !isBot) ? 'bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark border border-hp-border dark:border-hp-border-dark'
                : game.winner === myColor
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                  : game.winner
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark border border-hp-border dark:border-hp-border-dark'
              }`}>
                {statusText()}
              </div>
              {isSolo && (
                <button onClick={handleNewGame}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                  New Game
                </button>
              )}
              <button onClick={handleCleanup}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                {isSolo ? 'Back to Lobby' : 'Close Game'}
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: moves + chat — full width below board on small screens so it is not clipped */}
        <div className="w-full min-h-0 shrink-0 lg:w-72 lg:shrink-0 border-t lg:border-t-0 lg:border-l border-hp-border dark:border-hp-border-dark flex flex-col bg-hp-card/50 dark:bg-hp-card-dark/50 max-h-[min(50vh,24rem)] lg:max-h-none">
          <div className="border-b border-hp-border dark:border-hp-border-dark px-3 py-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider">Moves</h4>
            {replayHalfMove !== null && (
              <button type="button" onClick={exitReplay}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:opacity-90">
                Exit replay
              </button>
            )}
          </div>
          <div className={`flex-shrink-0 overflow-hidden ${enableChat && !isSolo ? 'max-h-48' : 'flex-1'}`}>
            <MoveHistory
              moves={game.moves}
              replayHalfMove={replayHalfMove}
              replayAnimating={replayAnimating}
              onReplayToHalfMove={handleReplayToHalfMove}
            />
          </div>

          {enableChat && !isSolo && (
            <>
              <div className="border-t border-b border-hp-border dark:border-hp-border-dark px-3 py-2">
                <h4 className="text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider">Chat</h4>
              </div>
              <div className="flex-1 min-h-0">
                <ChatPanel game={game} playerId={playerId} basePath={basePath} onGameUpdate={onGameUpdate} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lobby ────────────────────────────────────────────────────────────────────

function Lobby({ basePath, playerId, userName, onOpenGame, onStartSolo, settings }) {
  const [players, setPlayers] = useState({});
  const [challenges, setChallengesState] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [tab, setTab] = useState('players');
  const [challengeTC, setChallengeTC] = useState(settings.defaultTimeControl || '10');
  const [botDiff, setBotDiff] = useState('medium');
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    const [pData, cData, gameIds] = await Promise.all([
      readPlayers(basePath),
      readChallenges(basePath),
      listActiveGameIds(basePath),
    ]);
    setPlayers(pData.players || {});
    setChallengesState(cData.challenges || []);

    const games = [];
    for (const gid of gameIds) {
      const g = await readGame(basePath, gid);
      if (g && (g.white === playerId || g.black === playerId)) games.push(g);
    }
    setActiveGames(games);
  }, [basePath, playerId]);

  useEffect(() => {
    refresh();
    const ms = (settings.pollInterval || 5) * 1000;
    pollRef.current = setInterval(refresh, ms);
    return () => clearInterval(pollRef.current);
  }, [refresh, settings.pollInterval]);

  const sendChallenge = useCallback(async (targetId) => {
    const cData = await readChallenges(basePath);
    const existing = (cData.challenges || []).find(ch =>
      ch.status === 'pending' &&
      ((ch.from === playerId && ch.to === targetId) || (ch.from === targetId && ch.to === playerId))
    );
    if (existing) return;

    const targetName = players[targetId]?.displayName || 'Unknown';
    const challenge = {
      id: uid(),
      from: playerId,
      to: targetId,
      fromName: userName,
      toName: targetName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timeControl: challengeTC,
      status: 'pending',
    };
    cData.challenges = [...(cData.challenges || []), challenge];
    await writeChallenges(basePath, cData);
    await refresh();

    const api = getApi();
    if (api?.interopPublish) {
      api.interopPublish({
        channel: 'chess/challenge/received',
        source: 'chess',
        payload: { from: playerId, fromName: userName, challengeId: challenge.id },
      });
    }
  }, [basePath, playerId, userName, players, challengeTC, refresh]);

  const acceptChallenge = useCallback(async (challenge) => {
    const colorRoll = Math.random() < 0.5;
    const whiteId = colorRoll ? challenge.from : challenge.to;
    const blackId = colorRoll ? challenge.to : challenge.from;
    const whiteName = colorRoll ? challenge.fromName : challenge.toName;
    const blackName = colorRoll ? challenge.toName : challenge.fromName;

    const game = newGameState(whiteId, blackId, whiteName, blackName, challenge.timeControl || '10');
    const persistedGame = await writeGame(basePath, game);

    const cData = await readChallenges(basePath);
    cData.challenges = (cData.challenges || []).map(ch =>
      ch.id === challenge.id ? { ...ch, status: 'accepted', gameId: game.id, updatedAt: Date.now() } : ch
    );
    await writeChallenges(basePath, cData);
    await refresh();
    onOpenGame(persistedGame || game);
  }, [basePath, refresh, onOpenGame]);

  const declineChallenge = useCallback(async (challengeId) => {
    const cData = await readChallenges(basePath);
    cData.challenges = (cData.challenges || []).map(ch =>
      ch.id === challengeId ? { ...ch, status: 'declined', updatedAt: Date.now() } : ch
    );
    await writeChallenges(basePath, cData);
    await refresh();
  }, [basePath, refresh]);

  const now = Date.now();
  const sortedPlayers = useMemo(() => {
    return Object.entries(players)
      .filter(([id]) => id !== playerId)
      .map(([id, p]) => {
        let status = 'offline';
        if (p.lastSeen) {
          const age = now - p.lastSeen;
          if (age < AWAY_THRESHOLD) status = 'online';
          else if (age < OFFLINE_THRESHOLD) status = 'away';
        }
        return { id, ...p, status };
      })
      .sort((a, b) => {
        const order = { online: 0, away: 1, offline: 2 };
        return (order[a.status] || 2) - (order[b.status] || 2);
      });
  }, [players, playerId, now]);

  const myChallenges = challenges.filter(ch => ch.status === 'pending' && ch.to === playerId);
  const myPending = challenges.filter(ch => ch.status === 'pending' && ch.from === playerId);

  const leaderboard = useMemo(() => {
    return Object.entries(players)
      .map(([id, p]) => ({ id, name: p.displayName, ...(p.stats || { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 }) }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [players]);

  return (
    <div className="h-full flex flex-col">
      {/* Quick Start Bar */}
      <div style={{
        padding: '12px 16px',
        background: `linear-gradient(135deg, ${TH.parchment}, ${TH.darkWood})`,
        borderBottom: `2px solid ${TH.gold}44`,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      }}>
        {/* Difficulty selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: TH.gold, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Difficulty</span>
          {Object.entries(BOT_DIFFICULTY).map(([k, v]) => (
            <button key={k} onClick={() => setBotDiff(k)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                fontFamily: 'Georgia, serif', transition: 'all 0.15s',
                background: botDiff === k ? TH.gold : 'rgba(211,166,37,0.15)',
                color: botDiff === k ? TH.darkWood : TH.cream,
              }}>
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: `${TH.gold}33`, margin: '0 4px' }} />

        {/* Solo buttons */}
        <button onClick={() => onStartSolo('both', '0', botDiff)}
          style={{
            padding: '5px 14px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid ${TH.gold}66`,
            background: 'rgba(211,166,37,0.12)', color: TH.goldLight, cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
          Both Sides
        </button>
        <button onClick={() => onStartSolo('bot', '0', botDiff)}
          style={{
            padding: '5px 14px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none',
            background: TH.maroon, color: TH.cream, cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
          vs Bot
        </button>

        <div style={{ width: 1, height: 24, background: `${TH.gold}33`, margin: '0 4px' }} />

        {/* Speed Chess */}
        <span style={{ fontSize: 10, fontWeight: 700, color: TH.gold, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Speed</span>
        {[['1', 'Bullet'], ['3', 'Blitz'], ['5', 'Rapid']].map(([tc, label]) => (
          <button key={tc} onClick={() => onStartSolo('bot', tc, botDiff)}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'Georgia, serif',
              background: tc === '1' ? '#991B1B' : tc === '3' ? '#92400E' : '#78350F',
              color: TH.cream,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hp-border dark:border-hp-border-dark px-4">
        {['players', 'games', 'leaderboard'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-500 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark'
            }`}>
            {t === 'players' ? `Players (${sortedPlayers.length})` : t === 'games' ? `My Games (${activeGames.length})` : 'Leaderboard'}
          </button>
        ))}
      </div>

      {/* Incoming challenges banner */}
      {myChallenges.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          {myChallenges.map(ch => (
            <div key={ch.id} className="flex items-center gap-2 py-1">
              <span className="text-xs text-yellow-800 dark:text-yellow-200 flex-1">
                <strong>{ch.fromName}</strong> challenged you!
                {ch.timeControl && ch.timeControl !== '0' ? ` (${TIME_CONTROLS[ch.timeControl]?.label || ch.timeControl})` : ' (Untimed)'}
              </span>
              <button onClick={() => acceptChallenge(ch)}
                className="px-2 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors">
                Accept
              </button>
              <button onClick={() => declineChallenge(ch.id)}
                className="px-2 py-1 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Players tab */}
        {tab === 'players' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-hp-muted dark:text-hp-muted-dark">Time control:</label>
              <select value={challengeTC} onChange={e => setChallengeTC(e.target.value)}
                className="text-xs px-2 py-1 rounded-md border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-800 text-hp-text dark:text-hp-text-dark">
                {Object.entries(TIME_CONTROLS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            {sortedPlayers.length === 0 && (
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark py-8 text-center">No other players have joined yet. Share the extension!</p>
            )}
            {sortedPlayers.map(p => {
              const hasPending = myPending.some(ch => ch.to === p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark hover:shadow-sm transition-shadow">
                  <StatusBadge status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-hp-text dark:text-hp-text-dark truncate">{p.displayName}</div>
                    <div className="text-[10px] text-hp-muted dark:text-hp-muted-dark">
                      {p.stats?.wins || 0}W / {p.stats?.losses || 0}L / {p.stats?.draws || 0}D
                    </div>
                  </div>
                  <button
                    onClick={() => sendChallenge(p.id)}
                    disabled={hasPending || p.status === 'offline'}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 dark:disabled:text-gray-500 rounded-lg transition-colors">
                    {hasPending ? 'Pending' : 'Challenge'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Games tab */}
        {tab === 'games' && (
          <div className="space-y-2">
            {activeGames.length === 0 && (
              <p className="text-xs text-hp-muted dark:text-hp-muted-dark py-8 text-center">No active games. Challenge someone to play!</p>
            )}
            {activeGames.map(g => {
              const myColor = g.white === playerId ? 'w' : 'b';
              const isMyTurn = g.turn === myColor;
              const oppName = myColor === 'w' ? g.blackName : g.whiteName;
              const isOver = ['checkmate', 'stalemate', 'timeout', 'resigned', 'draw-agreed', 'draw-50', 'draw-material'].includes(g.status);
              return (
                <button key={g.id} onClick={() => onOpenGame(g)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark hover:shadow-sm transition-shadow text-left">
                  <div className="text-2xl">{myColor === 'w' ? '\u2654' : '\u265A'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-hp-text dark:text-hp-text-dark truncate">vs {oppName}</div>
                    <div className="text-[10px] text-hp-muted dark:text-hp-muted-dark">
                      {g.moves.length} moves
                      {g.timeControl === '0' ? ' \u00B7 Casual' : ` \u00B7 ${TIME_CONTROLS[g.timeControl]?.label || ''}`}
                    </div>
                  </div>
                  <div className={`text-xs font-medium px-2 py-1 rounded-lg ${
                    isOver
                      ? 'bg-gray-100 dark:bg-gray-800 text-hp-muted dark:text-hp-muted-dark'
                      : isMyTurn
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  }`}>
                    {isOver ? g.status : isMyTurn ? 'Your turn' : 'Waiting'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Leaderboard tab */}
        {tab === 'leaderboard' && (
          <div className="rounded-xl border border-hp-border dark:border-hp-border-dark overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-3 py-2 text-left font-semibold text-hp-muted dark:text-hp-muted-dark">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-hp-muted dark:text-hp-muted-dark">Player</th>
                  <th className="px-3 py-2 text-center font-semibold text-hp-muted dark:text-hp-muted-dark">W</th>
                  <th className="px-3 py-2 text-center font-semibold text-hp-muted dark:text-hp-muted-dark">L</th>
                  <th className="px-3 py-2 text-center font-semibold text-hp-muted dark:text-hp-muted-dark">D</th>
                  <th className="px-3 py-2 text-center font-semibold text-hp-muted dark:text-hp-muted-dark">Games</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id} className={`border-t border-hp-border dark:border-hp-border-dark ${p.id === playerId ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                    <td className="px-3 py-2 text-hp-muted dark:text-hp-muted-dark font-mono">{i + 1}</td>
                    <td className="px-3 py-2 text-hp-text dark:text-hp-text-dark font-medium">
                      {p.name}{p.id === playerId && <span className="ml-1 text-[10px] text-hp-muted dark:text-hp-muted-dark">(you)</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-green-600 dark:text-green-400 font-mono">{p.wins}</td>
                    <td className="px-3 py-2 text-center text-red-600 dark:text-red-400 font-mono">{p.losses}</td>
                    <td className="px-3 py-2 text-center text-hp-muted dark:text-hp-muted-dark font-mono">{p.draws}</td>
                    <td className="px-3 py-2 text-center text-hp-muted dark:text-hp-muted-dark font-mono">{p.gamesPlayed}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-hp-muted dark:text-hp-muted-dark">No players yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main View
// ═══════════════════════════════════════════════════════════════════════════════

export default function ChessView() {
  const [playerId] = useState(getPlayerId);
  const [userName, setUserName] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [currentGame, setCurrentGame] = useState(null);
  const [ready, setReady] = useState(false);
  const [yourTurnGames, setYourTurnGames] = useState([]);
  const pollRef = useRef(null);

  const basePath = settings.sharedFolderPath || 'S:\\JoseAbraham\\extensions\\chess\\shared';
  const enableChat = settings.enableChat !== false;

  // Init: get username, init shared folder, register player
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const name = await getAppUsername() || 'Player_' + playerId.slice(0, 6);
      if (cancelled) return;
      setUserName(name);
      await initSharedFolder(basePath);
      await registerPlayer(basePath, playerId, name);
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [basePath, playerId]);

  // Heartbeat: update lastSeen in players.json
  useEffect(() => {
    if (!ready || !userName) return;
    const ms = (settings.pollInterval || 5) * 1000;
    const beat = () => registerPlayer(basePath, playerId, userName);
    const interval = setInterval(beat, ms);
    return () => clearInterval(interval);
  }, [ready, basePath, playerId, userName, settings.pollInterval]);

  // Lobby: surface games where it is your turn (casual / async-friendly alert in this window)
  useEffect(() => {
    if (!ready || currentGame) {
      setYourTurnGames([]);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const ids = await listActiveGameIds(basePath);
      const out = [];
      for (const gid of ids) {
        const g = await readGame(basePath, gid);
        if (cancelled || !g || g.solo) continue;
        if (g.white !== playerId && g.black !== playerId) continue;
        const myColor = g.white === playerId ? 'w' : 'b';
        const isOver = ['checkmate', 'stalemate', 'timeout', 'resigned', 'draw-agreed', 'draw-50', 'draw-material'].includes(g.status);
        if (!isOver && g.turn === myColor) out.push(g);
      }
      if (!cancelled) setYourTurnGames(out);
    };
    poll();
    const ms = (settings.pollInterval || 5) * 1000;
    const id = setInterval(poll, ms);
    return () => { cancelled = true; clearInterval(id); };
  }, [ready, currentGame, basePath, playerId, settings.pollInterval]);

  // Poll active game for remote updates (skip solo games)
  useEffect(() => {
    if (!currentGame || !ready || currentGame.solo) return;
    const ms = (settings.pollInterval || 5) * 1000;
    const poll = async () => {
      const remote = await readGame(basePath, currentGame.id);
      if (!remote) return;
      if (remote._meta?.writeId !== currentGame._meta?.writeId) {
        setCurrentGame(remote);

        // Check for timeout while polling
        if (remote.timeControl !== '0' && (remote.status === 'active' || remote.status === 'check')) {
          const elapsed = Date.now() - remote.lastMoveAt;
          const timeKey = remote.turn === 'w' ? 'whiteTimeMs' : 'blackTimeMs';
          if (remote[timeKey] - elapsed <= 0 && remote.moves.length > 0) {
            const updated = {
              ...remote,
              status: 'timeout',
              winner: remote.turn === 'w' ? 'b' : 'w',
              [timeKey]: 0,
              _meta: { writeId: uid(), lastWriter: playerId },
            };
            const persisted = await writeGame(basePath, updated);
            const nextGame = persisted || updated;
            setCurrentGame(nextGame);
            const winnerId = nextGame.winner === 'w' ? nextGame.white : nextGame.black;
            const loserId = nextGame.winner === 'w' ? nextGame.black : nextGame.white;
            await updatePlayerStats(basePath, winnerId, 'win');
            await updatePlayerStats(basePath, loserId, 'loss');
          }
        }
      }
    };
    pollRef.current = setInterval(poll, ms);
    return () => clearInterval(pollRef.current);
  }, [currentGame, ready, basePath, playerId, settings.pollInterval]);

  // Reload settings when they change externally
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORE_KEY) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleGameUpdate = useCallback((game) => {
    setCurrentGame(game);
  }, []);

  const handleOpenGame = useCallback((game) => {
    setCurrentGame(game);
  }, []);

  const handleStartSolo = useCallback((soloType, timeControl, difficulty) => {
    const game = newSoloGameState(playerId, userName, timeControl, soloType === 'bot', difficulty);
    setCurrentGame(game);
  }, [playerId, userName]);

  const handleBack = useCallback(() => {
    setCurrentGame(null);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-hp-muted dark:text-hp-muted-dark">Connecting to chess lobby...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Title bar */}
      {!currentGame && (
        <div style={{ padding: '20px 24px 8px' }}>
          <h2 style={{
            fontSize: 26, fontWeight: 800, fontFamily: 'Georgia, serif',
            color: TH.gold, letterSpacing: 0.5,
            textShadow: '0 0 20px rgba(211,166,37,0.15)',
          }}>
            Wizard's Chess
          </h2>
          <p style={{ fontSize: 13, color: 'var(--hp-muted, #6b7280)', marginTop: 4 }}>
            Playing as <strong style={{ color: 'var(--hp-text, #1f2937)' }}>{userName}</strong>
          </p>
          {settings.enableNotifications !== false && yourTurnGames.length > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/25 text-sm text-green-900 dark:text-green-100"
              role="status"
            >
              <div className="font-semibold mb-2">It&apos;s your turn</div>
              <div className="flex flex-col gap-2">
                {yourTurnGames.map(g => {
                  const opp = g.white === playerId ? g.blackName : g.whiteName;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setCurrentGame(g)}
                      className="text-left px-3 py-2 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-green-200 dark:border-green-800 hover:bg-green-100/80 dark:hover:bg-green-900/40 transition-colors text-green-900 dark:text-green-100"
                    >
                      Open game vs <strong>{opp}</strong>
                      {g.casual || g.timeControl === '0' ? (
                        <span className="text-xs opacity-80 ml-2">(Casual)</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {currentGame ? (
        <GameView
          game={currentGame}
          playerId={playerId}
          basePath={basePath}
          onGameUpdate={handleGameUpdate}
          onBack={handleBack}
          enableChat={enableChat}
        />
      ) : (
        <div className="flex-1 min-h-0">
          <Lobby
            basePath={basePath}
            playerId={playerId}
            userName={userName}
            onOpenGame={handleOpenGame}
            onStartSolo={handleStartSolo}
            settings={settings}
          />
        </div>
      )}
    </div>
  );
}

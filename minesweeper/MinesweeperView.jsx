import React, { useState, useEffect, useCallback, useRef } from 'react';

const DIFFICULTIES = {
  beginner:     { label: 'Beginner',     rows: 9,  cols: 9,  mines: 10 },
  intermediate: { label: 'Intermediate', rows: 16, cols: 16, mines: 40 },
  expert:       { label: 'Expert',       rows: 16, cols: 30, mines: 99 },
};

const FACES = { ready: '\u{1F642}', playing: '\u{1F642}', won: '\u{1F60E}', lost: '\u{1F635}' };

function createEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );
}

function placeMines(grid, rows, cols, mines, safeR, safeC) {
  const g = grid.map(r => r.map(c => ({ ...c })));
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (g[r][c].mine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    g[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (g[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && g[nr][nc].mine) count++;
        }
      }
      g[r][c].adjacent = count;
    }
  }
  return g;
}

function floodReveal(grid, rows, cols, r, c) {
  const g = grid.map(row => row.map(cell => ({ ...cell })));
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
    if (g[cr][cc].revealed || g[cr][cc].flagged) continue;
    g[cr][cc].revealed = true;
    if (g[cr][cc].adjacent === 0 && !g[cr][cc].mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([cr + dr, cc + dc]);
        }
      }
    }
  }
  return g;
}

function checkWin(grid, rows, cols, totalMines) {
  let revealed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].revealed) revealed++;
    }
  }
  return revealed === rows * cols - totalMines;
}

const NUMBER_COLORS = [
  '',
  'text-blue-600 dark:text-blue-400',
  'text-green-700 dark:text-green-400',
  'text-red-600 dark:text-red-400',
  'text-purple-700 dark:text-purple-400',
  'text-amber-800 dark:text-amber-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-gray-800 dark:text-gray-300',
  'text-gray-500 dark:text-gray-400',
];

export default function MinesweeperView() {
  const [difficulty, setDifficulty] = useState('beginner');
  const [grid, setGrid] = useState(() => createEmptyGrid(9, 9));
  const [gameState, setGameState] = useState('ready');
  const [time, setTime] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [bestTimes, setBestTimes] = useState({});
  const timerRef = useRef(null);

  const { rows, cols, mines } = DIFFICULTIES[difficulty];

  useEffect(() => {
    window.electronAPI?.storeGet?.('minesweeper-best-times').then(t => {
      if (t) setBestTimes(t);
    });
  }, []);

  const saveBestTime = useCallback((diff, seconds) => {
    setBestTimes(prev => {
      const next = { ...prev };
      if (!next[diff] || seconds < next[diff]) {
        next[diff] = seconds;
        window.electronAPI?.storeSet?.('minesweeper-best-times', next);
      }
      return next;
    });
  }, []);

  const resetGame = useCallback((diff) => {
    const d = diff || difficulty;
    const { rows: r, cols: c } = DIFFICULTIES[d];
    clearInterval(timerRef.current);
    setGrid(createEmptyGrid(r, c));
    setGameState('ready');
    setTime(0);
    setFlagCount(0);
    if (diff) setDifficulty(diff);
  }, [difficulty]);

  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => setTime(t => Math.min(t + 1, 999)), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState]);

  const handleCellClick = useCallback((r, c) => {
    if (gameState === 'won' || gameState === 'lost') return;

    setGrid(prev => {
      if (prev[r][c].flagged || prev[r][c].revealed) return prev;

      let g = prev;
      if (gameState === 'ready') {
        g = placeMines(prev, rows, cols, mines, r, c);
        setGameState('playing');
      }

      if (g[r][c].mine) {
        const final = g.map(row => row.map(cell => ({
          ...cell,
          revealed: cell.mine ? true : cell.revealed,
        })));
        final[r][c].detonated = true;
        setGameState('lost');
        return final;
      }

      const next = floodReveal(g, rows, cols, r, c);
      if (checkWin(next, rows, cols, mines)) {
        setGameState('won');
        setTime(t => { saveBestTime(difficulty, t); return t; });
        return next.map(row => row.map(cell => ({
          ...cell,
          flagged: cell.mine ? true : cell.flagged,
        })));
      }
      return next;
    });
  }, [gameState, rows, cols, mines, difficulty, saveBestTime]);

  const handleCellContext = useCallback((e, r, c) => {
    e.preventDefault();
    if (gameState === 'won' || gameState === 'lost') return;

    setGrid(prev => {
      if (prev[r][c].revealed) return prev;
      const g = prev.map(row => row.map(cell => ({ ...cell })));
      g[r][c].flagged = !g[r][c].flagged;
      setFlagCount(fc => g[r][c].flagged ? fc + 1 : fc - 1);
      return g;
    });
  }, [gameState]);

  const handleChord = useCallback((r, c) => {
    if (gameState !== 'playing') return;
    setGrid(prev => {
      const cell = prev[r][c];
      if (!cell.revealed || cell.adjacent === 0) return prev;

      let adjFlags = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && prev[nr][nc].flagged) adjFlags++;
        }
      }
      if (adjFlags !== cell.adjacent) return prev;

      let g = prev.map(row => row.map(cl => ({ ...cl })));
      let hitMine = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (!g[nr][nc].revealed && !g[nr][nc].flagged) {
              if (g[nr][nc].mine) {
                hitMine = true;
                g[nr][nc].revealed = true;
                g[nr][nc].detonated = true;
              } else {
                g = floodReveal(g, rows, cols, nr, nc);
              }
            }
          }
        }
      }

      if (hitMine) {
        const final = g.map(row => row.map(cl => ({
          ...cl,
          revealed: cl.mine ? true : cl.revealed,
        })));
        setGameState('lost');
        return final;
      }

      if (checkWin(g, rows, cols, mines)) {
        setGameState('won');
        setTime(t => { saveBestTime(difficulty, t); return t; });
        return g.map(row => row.map(cl => ({
          ...cl,
          flagged: cl.mine ? true : cl.flagged,
        })));
      }

      return g;
    });
  }, [gameState, rows, cols, mines, difficulty, saveBestTime]);

  const minesRemaining = mines - flagCount;
  const pad3 = (n) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');

  const isExpert = difficulty === 'expert';
  const cellSizePx = isExpert ? 24 : 28;
  const cellFontSizePx = isExpert ? 10 : 12;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-hp-text dark:text-hp-text-dark font-display">Minesweeper</h2>
        <p className="text-hp-muted dark:text-hp-muted-dark mt-1">
          Left-click to reveal, right-click to flag, middle-click to chord.
        </p>
      </div>

      {/* Difficulty selector */}
      <div className="flex gap-2 mb-4">
        {Object.entries(DIFFICULTIES).map(([key, d]) => (
          <button
            key={key}
            onClick={() => resetGame(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              difficulty === key
                ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                : 'border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:border-gray-400'
            }`}
          >
            {d.label}
            <span className="ml-1.5 opacity-60">{d.cols}x{d.rows}</span>
          </button>
        ))}
      </div>

      {/* Game board container */}
      <div className="w-full overflow-x-auto pb-1">
        <div className="inline-block rounded-2xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark shadow-sm">
          {/* Header bar: mine count, face, timer */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-hp-border dark:border-hp-border-dark bg-gray-50 dark:bg-gray-800/50 rounded-t-2xl">
            {/* Mine counter */}
            <div className="font-mono text-lg font-bold tracking-wider text-red-600 dark:text-red-400 bg-gray-900 dark:bg-black px-2 py-0.5 rounded min-w-[3.5rem] text-center select-none">
              {pad3(minesRemaining)}
            </div>

            {/* Face button */}
            <button
              onClick={() => resetGame()}
              className="text-2xl hover:scale-110 active:scale-95 transition-transform select-none"
              title="New game"
            >
              {FACES[gameState]}
            </button>

            {/* Timer */}
            <div className="font-mono text-lg font-bold tracking-wider text-red-600 dark:text-red-400 bg-gray-900 dark:bg-black px-2 py-0.5 rounded min-w-[3.5rem] text-center select-none">
              {pad3(time)}
            </div>
          </div>

          {/* Grid */}
          <div className="p-3 select-none" onContextMenu={e => e.preventDefault()}>
            <div
              className="inline-grid gap-px bg-gray-300 dark:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden"
              style={{
                display: 'grid',
                gap: '1px',
                gridTemplateColumns: `repeat(${cols}, ${cellSizePx}px)`,
                width: `${cols * cellSizePx}px`,
              }}
            >
              {grid.map((row, r) =>
                row.map((cell, c) => {
                  const key = `${r}-${c}`;
                  if (cell.revealed) {
                    if (cell.mine) {
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-center font-bold ${cell.detonated ? 'bg-red-500 dark:bg-red-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                          style={{ width: `${cellSizePx}px`, height: `${cellSizePx}px`, fontSize: `${cellFontSizePx}px` }}
                        >
                          {'\u{1F4A3}'}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-center font-bold bg-gray-100 dark:bg-gray-800 ${NUMBER_COLORS[cell.adjacent] || ''} cursor-default`}
                        style={{ width: `${cellSizePx}px`, height: `${cellSizePx}px`, fontSize: `${cellFontSizePx}px` }}
                        onMouseDown={(e) => { if (e.button === 1) handleChord(r, c); }}
                      >
                        {cell.adjacent > 0 ? cell.adjacent : ''}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={key}
                      className="flex items-center justify-center font-bold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-100 dark:active:bg-gray-800 transition-colors border-t border-l border-white/40 dark:border-white/10"
                      style={{ width: `${cellSizePx}px`, height: `${cellSizePx}px`, fontSize: `${cellFontSizePx}px` }}
                      onClick={() => handleCellClick(r, c)}
                      onContextMenu={(e) => handleCellContext(e, r, c)}
                      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); handleChord(r, c); } }}
                    >
                      {cell.flagged ? '\u{1F6A9}' : ''}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Game over / win overlays */}
      {(gameState === 'won' || gameState === 'lost') && (
        <div className="mt-4 flex items-center gap-3">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${
            gameState === 'won'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
          }`}>
            {gameState === 'won' ? `You won in ${time}s!` : 'Game over!'}
          </div>
          <button
            onClick={() => resetGame()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Play Again
          </button>
        </div>
      )}

      {/* Best times */}
      {Object.keys(bestTimes).length > 0 && (
        <div className="mt-6 rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card/50 dark:bg-hp-card-dark/50 p-4">
          <h4 className="text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider mb-2">Best Times</h4>
          <div className="flex gap-4">
            {Object.entries(DIFFICULTIES).map(([key, d]) => (
              <div key={key} className="text-xs text-hp-text dark:text-hp-text-dark">
                <span className="font-medium">{d.label}:</span>{' '}
                <span className="font-mono">{bestTimes[key] != null ? `${bestTimes[key]}s` : '--'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

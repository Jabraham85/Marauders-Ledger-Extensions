import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GAME_DESIGN_NODE_TYPE_COLORS, GAME_DESIGN_NODE_TYPE_LABELS } from '../../platform/gameDesignDefaults';

// Extend host defaults with the audioPlayer node type (no EXE rebuild needed)
var EXTENDED_NODE_COLORS = Object.assign({}, GAME_DESIGN_NODE_TYPE_COLORS, { audioPlayer: '#10b981' });
var EXTENDED_NODE_LABELS = Object.assign({}, GAME_DESIGN_NODE_TYPE_LABELS, { audioPlayer: 'Audio Cue' });

function _fmtDur(secs) {
  if (!secs || secs <= 0) return '';
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// ─── AudioPlayerNodeCard ──────────────────────────────────────────────────────
function AudioPlayerNodeCard({ node }) {
  var audio = (node.meta && node.meta.audio) ? node.meta.audio : {};
  var filePath = audio.filePath || '';
  var [playState, setPlayState] = useState('idle');
  var [progress,  setProgress]  = useState(0);
  var [duration,  setDuration]  = useState(audio.duration || 0);
  var audioRef = useRef(null);
  var urlRef   = useRef(null);

  useEffect(function() {
    return function() {
      if (audioRef.current) audioRef.current.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  var handleToggle = async function(e) {
    e.stopPropagation();
    if (!filePath) return;
    if (playState === 'playing')  { audioRef.current && audioRef.current.pause(); setPlayState('paused'); return; }
    if (playState === 'paused' && audioRef.current) { audioRef.current.play(); setPlayState('playing'); return; }
    setPlayState('loading');
    try {
      // Use appAPI.readLocalFileBase64 — host-side method in tauriApiLayer.js that runs
      // PowerShell in trusted frame context, bypassing extension sandbox IPC restrictions.
      var api = window.appAPI || window.electronAPI;
      var b64 = api && typeof api.readLocalFileBase64 === 'function'
        ? await api.readLocalFileBase64(filePath)
        : null;
      if (!b64) { setPlayState('error'); return; }
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var ext  = filePath.split('.').pop().toLowerCase();
      var mime = ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      var blob = new Blob([bytes], { type: mime });
      var url  = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      var a = new Audio(url);
      audioRef.current = a;
      a.onloadedmetadata = function() { setDuration(a.duration); };
      a.ontimeupdate     = function() { setProgress(a.duration ? a.currentTime / a.duration : 0); };
      a.onended          = function() { setPlayState('paused'); setProgress(0); };
      a.onerror          = function() { setPlayState('error'); };
      await a.play();
      setPlayState('playing');
    } catch(err) { setPlayState('error'); }
  };

  var handleSeek = function(e) {
    e.stopPropagation();
    if (!audioRef.current || !duration) return;
    var rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  var isErr  = playState === 'error';
  var noFile = !filePath;
  var icon   = playState === 'loading' ? '…' : playState === 'playing' ? '⏸' : '▶';
  var accentColor = '#10b981';

  var hasDetails = audio.composingStatus || audio.implementationStatus || audio.composer;

  return (
    <div className="px-2.5 py-2 space-y-1.5" onClick={function(e) { e.stopPropagation(); }}>
      <h4 className="text-xs font-semibold text-slate-100 break-words leading-snug">{node.title || 'Untitled'}</h4>
      <div className="rounded border border-emerald-700/50 bg-emerald-900/30 p-1.5 space-y-1.5">
        {/* Filename + version */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-[9px] font-mono text-emerald-300 truncate flex-1" title={filePath || 'No file'}>
            {audio.fileName || (filePath ? filePath.split(/[\\/]/).pop() : 'No file')}
          </span>
          {audio.versionLabel && (
            <span className="text-[8px] text-emerald-500 shrink-0 font-mono">{audio.versionLabel}</span>
          )}
        </div>
        {/* Player controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            disabled={noFile}
            style={{
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, borderRadius: 4, flexShrink: 0, padding: 0, cursor: noFile ? 'not-allowed' : 'pointer',
              border: '1px solid ' + (isErr ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'),
              background: isErr ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              color: isErr ? '#f87171' : noFile ? '#6b7280' : accentColor,
            }}
          >
            {isErr ? '!' : noFile ? '—' : icon}
          </button>
          <div
            onClick={handleSeek}
            style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, cursor: filePath ? 'pointer' : 'default', position: 'relative' }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: (progress * 100) + '%', background: accentColor, borderRadius: 2 }} />
          </div>
          <span className="text-[9px] text-slate-400 font-mono shrink-0">{duration > 0 ? _fmtDur(duration) : '--:--'}</span>
        </div>
        {/* Metadata chips — composer / composing status / impl status */}
        {hasDetails && (
          <div className="flex flex-wrap gap-1">
            {audio.composer && (
              <span className="px-1 py-0 text-[9px] rounded bg-slate-700/70 text-slate-300">{audio.composer}</span>
            )}
            {audio.composingStatus && audio.composingStatus !== 'Not Started' && (
              <span className="px-1 py-0 text-[9px] rounded bg-emerald-800/60 text-emerald-200">{audio.composingStatus}</span>
            )}
            {audio.implementationStatus && audio.implementationStatus !== 'Not Started' && (
              <span className="px-1 py-0 text-[9px] rounded bg-teal-800/60 text-teal-200">{audio.implementationStatus}</span>
            )}
          </div>
        )}
        {/* Perforce path */}
        {audio.perforceLocation && (
          <div className="text-[8px] font-mono text-slate-500 truncate" title={audio.perforceLocation}>
            P4: {audio.perforceLocation}
          </div>
        )}
        {/* Error states */}
        {isErr && (
          <div className="text-[9px] text-red-400 leading-snug">
            Could not load file — verify path:<br />
            <span className="font-mono opacity-70 break-all">{filePath}</span>
          </div>
        )}
        {noFile && !audio.perforceLocation && (
          <div className="text-[9px] text-slate-500 italic">No audio file attached</div>
        )}
      </div>
    </div>
  );
}

const CANVAS_SIZE = 8000;
const CANVAS_CENTER = CANVAS_SIZE / 2;

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function pointsToPath(points = []) {
  if (!Array.isArray(points) || points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

function asNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeGuides(guides) {
  if (!guides || typeof guides !== 'object') return null;
  const columns = Array.isArray(guides.columns) ? guides.columns.map((c) => String(c || '')).filter(Boolean) : [];
  const lanes = Array.isArray(guides.lanes) ? guides.lanes.map((l) => String(l || '')).filter(Boolean) : [];
  if (!columns.length || !lanes.length) return null;
  return {
    columns,
    lanes,
    originX: asNum(guides.originX, -560),
    originY: asNum(guides.originY, -120),
    cellWidth: Math.max(120, asNum(guides.cellWidth, 260)),
    cellHeight: Math.max(84, asNum(guides.cellHeight, 130)),
    leftRailWidth: Math.max(120, asNum(guides.leftRailWidth, 210)),
    headerHeight: Math.max(54, asNum(guides.headerHeight, 82)),
  };
}

function snapPointToGuides(point, guides) {
  const spec = normalizeGuides(guides);
  if (!spec || !point) return point;
  const col = Math.max(0, Math.min(spec.columns.length - 1, Math.round((point.x - spec.originX) / spec.cellWidth)));
  const row = Math.max(0, Math.min(spec.lanes.length - 1, Math.round((point.y - spec.originY) / spec.cellHeight)));
  return {
    x: spec.originX + col * spec.cellWidth,
    y: spec.originY + row * spec.cellHeight,
  };
}

function mediaPathToSrc(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw) || /^\\\\/.test(raw) || raw.startsWith('/')) {
    const convert = window.__TAURI__?.core?.convertFileSrc || window.__TAURI__?.convertFileSrc;
    if (typeof convert === 'function') return convert(raw);
    return `http://asset.localhost/${encodeURIComponent(raw)}`;
  }
  return '';
}

function resolveMediaSrc(media) {
  if (!media || typeof media !== 'object') return '';
  return (
    mediaPathToSrc(media.dataUrl)
    || mediaPathToSrc(media.path)
    || mediaPathToSrc(media.sourcePath)
    || mediaPathToSrc(media.relativePath)
    || ''
  );
}

function isImageMedia(media) {
  const mime = String(media?.mimeType || '').toLowerCase();
  const ref = String(media?.path || media?.sourcePath || media?.relativePath || '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ref);
}

function isVideoMedia(media) {
  const mime = String(media?.mimeType || '').toLowerCase();
  const ref = String(media?.path || media?.sourcePath || media?.relativePath || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/.test(ref);
}

// Orthogonal edge router — exits the node axis-aligned and connects with two 90° rounded bends.

function getExitSide(scx, scy, tcx, tcy) {
  return Math.abs(tcx - scx) >= Math.abs(tcy - scy)
    ? (tcx >= scx ? 'right' : 'left')
    : (tcy >= scy ? 'bottom' : 'top');
}

function exitPoint(cx, cy, hw, hh, side) {
  if (side === 'right')  return { x: cx + hw, y: cy };
  if (side === 'left')   return { x: cx - hw, y: cy };
  if (side === 'bottom') return { x: cx, y: cy + hh };
  return { x: cx, y: cy - hh };
}

// Build an orthogonal SVG path with two axis-aligned segments and rounded corners.
// elbowFrac (0–1) controls where the single elbow column/row sits — 0.5 = midpoint,
// values closer to 0 or 1 stagger multiple parallel edges so they don't share a corridor.
function orthoSvgPath(p1x, p1y, p2x, p2y, exitSide, r, elbowFrac) {
  if (elbowFrac === undefined) elbowFrac = 0.5;
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 1 && ady < 1) return `M ${p1x} ${p1y} L ${p2x} ${p2y}`;

  if (exitSide === 'right' || exitSide === 'left') {
    if (ady < 2) return `M ${p1x} ${p1y} H ${p2x}`;
    const midX = p1x + dx * elbowFrac;
    const halfH1 = Math.abs(midX - p1x);
    const halfH2 = Math.abs(p2x - midX);
    const cr = Math.min(r, ady / 2, halfH1, halfH2);
    if (cr < 1) return `M ${p1x} ${p1y} H ${midX} V ${p2y} H ${p2x}`;
    const xs1 = midX > p1x ? 1 : -1;
    const xs2 = p2x > midX ? 1 : -1;
    const ys  = dy > 0 ? 1 : -1;
    return [
      `M ${p1x} ${p1y}`,
      `H ${midX - xs1 * cr}`,
      `Q ${midX} ${p1y} ${midX} ${p1y + ys * cr}`,
      `V ${p2y - ys * cr}`,
      `Q ${midX} ${p2y} ${midX + xs2 * cr} ${p2y}`,
      `H ${p2x}`,
    ].join(' ');
  } else {
    if (adx < 2) return `M ${p1x} ${p1y} V ${p2y}`;
    const midY = p1y + dy * elbowFrac;
    const halfV1 = Math.abs(midY - p1y);
    const halfV2 = Math.abs(p2y - midY);
    const cr = Math.min(r, adx / 2, halfV1, halfV2);
    if (cr < 1) return `M ${p1x} ${p1y} V ${midY} H ${p2x} V ${p2y}`;
    const ys1 = midY > p1y ? 1 : -1;
    const ys2 = p2y > midY ? 1 : -1;
    const xs  = dx > 0 ? 1 : -1;
    return [
      `M ${p1x} ${p1y}`,
      `V ${midY - ys1 * cr}`,
      `Q ${p1x} ${midY} ${p1x + xs * cr} ${midY}`,
      `H ${p2x - xs * cr}`,
      `Q ${p2x} ${midY} ${p2x} ${midY + ys2 * cr}`,
      `V ${p2y}`,
    ].join(' ');
  }
}

const TWO_WAY_TYPES = new Set(['bidirectional', 'related', 'twoWay']);

// Color palette for each relationship type — drives both the edge stroke and the arrowhead marker.
const EDGE_COLORS = {
  supports:      '#818cf8',  // indigo
  requires:      '#fbbf24',  // amber
  conflicts:     '#f87171',  // red
  extends:       '#34d399',  // emerald
  bidirectional: '#c084fc',  // purple
  related:       '#94a3b8',  // slate
  twoWay:        '#c084fc',  // purple (alias)
};
const EDGE_COLOR_DEFAULT = '#818cf8';

const EDGE_LEGEND = [
  { type: 'supports',      label: 'Supports' },
  { type: 'requires',      label: 'Requires' },
  { type: 'conflicts',     label: 'Conflicts' },
  { type: 'extends',       label: 'Extends' },
  { type: 'bidirectional', label: 'Bidirectional' },
];
const CORNER_CURSORS = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };

export default function BoardCanvas({
  nodes = [],
  edges = [],
  drawings = [],
  guides = null,
  snapToGuides = false,
  selectedNodeId,
  pendingEdgeSource,
  focusNodeId,
  defaultAddType = 'mechanic',
  toolMode = 'select',
  placementType = '',
  drawTool = 'none',
  drawColor = '#60a5fa',
  drawWidth = 3,
  onAddNodeAt,
  onMoveNode,
  onResizeNode,
  onUpdateNode,
  onSelectNode,
  onStartEdge,
  onCompleteEdge,
  onCancelEdge,
  onOpenLink,
  onDeleteNode,
  onDuplicateNode,
  onFilesDropped,
  onPlacementConsumed,
  onAddDrawingStroke,
  onEraseAtPoint,
  selectedNodeIds,
  onMultiSelect,
  onDeleteNodes,
  onExportNode,
  onExportNodeCsv,
  onExportSelected,
  onExportSelectedCsv,
  onExportBoard,
  onExportBoardCsv,
}) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const panRef = useRef(null);
  const lassoRef = useRef(null);
  const lassoDidSelectRef = useRef(false);
  const dragNodeRef = useRef(null);
  const resizeNodeRef = useRef(null);
  const drawSessionRef = useRef(null);
  const eraseSessionRef = useRef(null);
  const panMovedRef = useRef(false);
  const nodesRef = useRef(nodes);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [draftStroke, setDraftStroke] = useState(null);
  const [lassoRect, setLassoRect] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const editTitleRef = useRef(null);

  const nodeMap = useMemo(() => {
    const out = new Map();
    for (const node of nodes || []) out.set(node.id, node);
    return out;
  }, [nodes]);

  const setViewAndRef = (updater) => {
    setView((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      viewRef.current = next;
      return next;
    });
  };

  const getInteractionZoom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return 1;
    const rect = viewport.getBoundingClientRect();
    const baseWidth = viewport.clientWidth || viewport.offsetWidth || rect.width;
    if (!baseWidth) return 1;
    const ratio = rect.width / baseWidth;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  };

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (editingNodeId && editTitleRef.current) {
      editTitleRef.current.focus();
      editTitleRef.current.select();
    }
  }, [editingNodeId]);

  const toBoardPoint = (clientX, clientY) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const currentView = viewRef.current;
    const interactionZoom = getInteractionZoom();
    const rect = viewport.getBoundingClientRect();
    const localX = (clientX - rect.left) / interactionZoom;
    const localY = (clientY - rect.top) / interactionZoom;
    return {
      x: (localX - currentView.x) / currentView.scale - CANVAS_CENTER,
      y: (localY - currentView.y) / currentView.scale - CANVAS_CENTER,
    };
  };

  const openContextMenu = (clientX, clientY, payload = {}) => {
    const host = containerRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const iz = getInteractionZoom();
    setContextMenu({
      x: Math.max(8, (clientX - rect.left) / iz),
      y: Math.max(8, (clientY - rect.top) / iz),
      ...payload,
    });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space') setSpacePressed(true);
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
      if (isTyping) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedNodeIds && selectedNodeIds.size > 1) {
          onDeleteNodes?.([...selectedNodeIds]);
        } else if (selectedNodeId) {
          onDeleteNode?.(selectedNodeId);
        }
      }
      if (e.key === 'Escape') {
        onCancelEdge?.();
        onSelectNode?.(null);
      }
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        onMultiSelect?.((nodesRef.current || []).map((n) => n.id));
      }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        if (selectedNodeId) onDuplicateNode?.(selectedNodeId);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedNodeId, selectedNodeIds, onDeleteNode, onDeleteNodes, onCancelEdge, onSelectNode, onMultiSelect, onDuplicateNode]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (drawSessionRef.current) {
        const pt = toBoardPoint(e.clientX, e.clientY);
        const points = drawSessionRef.current.points;
        const prev = points[points.length - 1];
        if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1.5) {
          points.push(pt);
          setDraftStroke({ ...drawSessionRef.current, points: [...points] });
        }
        return;
      }
      if (eraseSessionRef.current) {
        const pt = toBoardPoint(e.clientX, e.clientY);
        onEraseAtPoint?.(pt, eraseSessionRef.current.radius);
        return;
      }
      if (resizeNodeRef.current) {
        const s = resizeNodeRef.current;
        const iz = getInteractionZoom();
        const dx = (e.clientX - s.startClientX) / (view.scale * iz);
        const dy = (e.clientY - s.startClientY) / (view.scale * iz);
        const growsRight = s.corner === 'se' || s.corner === 'ne';
        const growsDown = s.corner === 'se' || s.corner === 'sw';
        const nw = Math.max(s.minWidth, Math.round(s.startWidth + (growsRight ? dx : -dx)));
        const nh = Math.max(s.minHeight, Math.round(s.startHeight + (growsDown ? dy : -dy)));
        const nx = growsRight ? s.startX : s.startX + s.startWidth - nw;
        const ny = growsDown ? s.startY : s.startY + s.startHeight - nh;
        onResizeNode?.(s.nodeId, { x: nx, y: ny, width: nw, height: nh });
        return;
      }
      if (dragNodeRef.current) {
        const session = dragNodeRef.current;
        const interactionZoom = getInteractionZoom();
        const dx = (e.clientX - session.startClientX) / (view.scale * interactionZoom);
        const dy = (e.clientY - session.startClientY) / (view.scale * interactionZoom);
        let nextPoint = {
          x: session.startX + dx,
          y: session.startY + dy,
        };
        if (snapToGuides) nextPoint = snapPointToGuides(nextPoint, guides);
        onMoveNode?.(session.nodeId, nextPoint);
        return;
      }
      if (lassoRef.current) {
        const pt = toBoardPoint(e.clientX, e.clientY);
        lassoRef.current.endX = pt.x;
        lassoRef.current.endY = pt.y;
        if (Math.abs(pt.x - lassoRef.current.startX) > 5 || Math.abs(pt.y - lassoRef.current.startY) > 5) {
          lassoRef.current.active = true;
        }
        if (lassoRef.current.active) {
          setLassoRect({
            x: Math.min(lassoRef.current.endX, lassoRef.current.startX),
            y: Math.min(lassoRef.current.endY, lassoRef.current.startY),
            w: Math.abs(lassoRef.current.endX - lassoRef.current.startX),
            h: Math.abs(lassoRef.current.endY - lassoRef.current.startY),
          });
        }
        return;
      }
      if (!panRef.current) return;
      const session = panRef.current;
      if (Math.abs(e.clientX - session.clientX) > 2 || Math.abs(e.clientY - session.clientY) > 2) {
        panMovedRef.current = true;
      }
      const interactionZoom = getInteractionZoom();
      setViewAndRef((prev) => ({
        ...prev,
        x: session.startX + ((e.clientX - session.clientX) / interactionZoom),
        y: session.startY + ((e.clientY - session.clientY) / interactionZoom),
      }));
    };
    const onUp = () => {
      if (lassoRef.current) {
        const lasso = lassoRef.current;
        if (lasso.active) {
          const rectX = Math.min(lasso.startX, lasso.endX);
          const rectY = Math.min(lasso.startY, lasso.endY);
          const rectW = Math.abs(lasso.endX - lasso.startX);
          const rectH = Math.abs(lasso.endY - lasso.startY);
          const selected = (nodesRef.current || []).filter((node) => {
            const nw = node.width || (node.type === 'sticky' ? 152 : 260);
            const nh = node.height || (node.type === 'sticky' ? 100 : 140);
            return (
              node.x < rectX + rectW &&
              node.x + nw > rectX &&
              node.y < rectY + rectH &&
              node.y + nh > rectY
            );
          }).map((n) => n.id);
          if (selected.length > 0) {
            onMultiSelect?.(selected);
            lassoDidSelectRef.current = true;
          } else {
            onSelectNode?.(null);
          }
        }
        lassoRef.current = null;
        setLassoRect(null);
        return;
      }
      if (drawSessionRef.current) {
        const stroke = drawSessionRef.current;
        if ((stroke.points || []).length > 1) {
          onAddDrawingStroke?.({
            tool: stroke.tool,
            color: stroke.color,
            width: stroke.width,
            opacity: stroke.opacity,
            points: stroke.points,
          });
        }
      }
      drawSessionRef.current = null;
      eraseSessionRef.current = null;
      setDraftStroke(null);
      resizeNodeRef.current = null;
      dragNodeRef.current = null;
      panRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [guides, onMoveNode, onResizeNode, onAddDrawingStroke, onEraseAtPoint, onMultiSelect, onSelectNode, snapToGuides, view.scale]);

  useEffect(() => {
    if (!focusNodeId) return;
    // Read nodeMap and scale from their current values at focus time.
    // nodeMap and view.scale are intentionally NOT in the dependency array —
    // if they were, this effect would re-fire on every zoom or node move,
    // snapping the view back every time the user tries to pan away.
    const node = nodeMap.get(focusNodeId);
    const viewport = viewportRef.current;
    if (!node || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = viewRef.current.scale; // read from ref, not reactive
    const targetX = rect.width / 2 - (node.x + CANVAS_CENTER + (node.width || 260) / 2) * scale;
    const targetY = rect.height / 2 - (node.y + CANVAS_CENTER + (node.height || 140) / 2) * scale;
    setViewAndRef((prev) => ({ ...prev, x: targetX, y: targetY }));
  }, [focusNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const iz = getInteractionZoom();
      const pointerX = (e.clientX - rect.left) / iz;
      const pointerY = (e.clientY - rect.top) / iz;
      setViewAndRef((prev) => {
        const nextScale = clamp(prev.scale + (e.deltaY < 0 ? 0.08 : -0.08), 0.45, 2.5);
        const boardX = (pointerX - prev.x) / prev.scale;
        const boardY = (pointerY - prev.y) / prev.scale;
        return {
          scale: nextScale,
          x: pointerX - boardX * nextScale,
          y: pointerY - boardY * nextScale,
        };
      });
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const handleBackgroundMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target?.dataset?.nodeCard === 'true') return;
    if (e.button === 0 && (drawTool === 'pen' || drawTool === 'highlighter')) {
      const pt = toBoardPoint(e.clientX, e.clientY);
      const width = drawTool === 'highlighter' ? Math.max(8, drawWidth * 2.2) : drawWidth;
      const opacity = drawTool === 'highlighter' ? 0.35 : 0.95;
      drawSessionRef.current = {
        tool: drawTool,
        color: drawColor,
        width,
        opacity,
        points: [pt],
      };
      setDraftStroke({ ...drawSessionRef.current, points: [...drawSessionRef.current.points] });
      return;
    }
    if (e.button === 0 && drawTool === 'eraser') {
      const pt = toBoardPoint(e.clientX, e.clientY);
      const radius = Math.max(10, drawWidth * 2.5);
      eraseSessionRef.current = { radius };
      onEraseAtPoint?.(pt, radius);
      return;
    }
    const shouldPan = toolMode === 'pan' || spacePressed || e.button === 1;
    if (!shouldPan) {
      if (e.button === 0 && toolMode === 'select' && drawTool === 'none') {
        const pt = toBoardPoint(e.clientX, e.clientY);
        lassoRef.current = { startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y, active: false };
      }
      return;
    }
    panMovedRef.current = false;
    setIsPanning(true);
    panRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: view.x,
      startY: view.y,
    };
  };

  const handleBackgroundClick = (e) => {
    if (panMovedRef.current) return;
    if (lassoDidSelectRef.current) { lassoDidSelectRef.current = false; return; }
    if (e.target?.dataset?.nodeCard === 'true') return;
    if (pendingEdgeSource) onCancelEdge?.();
    if (placementType && toolMode !== 'pan') {
      let boardPt = toBoardPoint(e.clientX, e.clientY);
      if (snapToGuides) boardPt = snapPointToGuides(boardPt, guides);
      onAddNodeAt?.(placementType, boardPt);
      onPlacementConsumed?.();
      return;
    }
    onSelectNode?.(null);
  };

  const handleBackgroundDoubleClick = (e) => {
    if (toolMode === 'pan') return;
    let boardPt = toBoardPoint(e.clientX, e.clientY);
    if (snapToGuides) boardPt = snapPointToGuides(boardPt, guides);
    onAddNodeAt?.(placementType || defaultAddType, boardPt);
    if (placementType) onPlacementConsumed?.();
  };

  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (drawTool !== 'none') return;
    if (toolMode === 'pan') return;
    if (editingNodeId === node.id) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('[data-node-resize="true"]')) return;
    onSelectNode?.(node.id);
    dragNodeRef.current = {
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: Number(node.x) || 0,
      startY: Number(node.y) || 0,
    };
  };

  const handleNodeResizeMouseDown = (e, node, corner = 'se') => {
    e.stopPropagation();
    e.preventDefault();
    if (drawTool !== 'none') return;
    if (toolMode === 'pan') return;
    setEditingNodeId(null);
    onSelectNode?.(node.id);
    resizeNodeRef.current = {
      nodeId: node.id,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: Number(node.x) || 0,
      startY: Number(node.y) || 0,
      startWidth: Number(node.width) || (node.type === 'sticky' ? 152 : 260),
      startHeight: Number(node.height) || (node.type === 'sticky' ? 100 : 140),
      minWidth: node.type === 'sticky' ? 90 : 140,
      minHeight: node.type === 'sticky' ? 54 : 84,
    };
  };

  const handleNodeDoubleClick = (e, node) => {
    e.stopPropagation();
    if (drawTool !== 'none' || toolMode === 'pan') return;
    setEditingNodeId(node.id);
  };

  const handleEditBlur = (e) => {
    const nodeEl = e.currentTarget?.closest?.('[data-node-card="true"]');
    if (nodeEl && nodeEl.contains(e.relatedTarget)) return;
    setEditingNodeId(null);
  };

  const handleNodeClick = (e, node) => {
    e.stopPropagation();
    if (pendingEdgeSource && pendingEdgeSource !== node.id) {
      onCompleteEdge?.(node.id);
      return;
    }
    onSelectNode?.(node.id);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length || typeof onFilesDropped !== 'function') return;
    const point = toBoardPoint(e.clientX, e.clientY);
    onFilesDropped(files, point);
  };

  const handleCanvasContextMenu = (e) => {
    const nodeEl = e.target instanceof HTMLElement ? e.target.closest('[data-node-card="true"]') : null;
    if (nodeEl) return;
    e.preventDefault();
    const boardPoint = toBoardPoint(e.clientX, e.clientY);
    openContextMenu(e.clientX, e.clientY, {
      nodeId: null,
      boardPoint,
    });
  };

  const handleNodeContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectNode?.(node.id);
    openContextMenu(e.clientX, e.clientY, {
      nodeId: node.id,
      boardPoint: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
    });
  };

  const edgeLines = useMemo(() => {
    const edgeList = edges || [];
    const PORT_MARGIN = 12; // px from node corner — keeps ports away from rounded corners

    // ── Pass 1: determine exit/entry side for every edge; bucket by (nodeId:side) ──
    // We need this to spread attachment points when multiple edges share the same side.
    const srcSideMap = new Map(); // "nodeId:side" -> [edgeIdx]
    const tgtSideMap = new Map(); // "nodeId:side" -> [edgeIdx]

    const pass1 = edgeList.map((edge, i) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return null;
      const sw = source.width || (source.type === 'sticky' ? 152 : 260);
      const sh = source.height || (source.type === 'sticky' ? 100 : 140);
      const tw = target.width || (target.type === 'sticky' ? 152 : 260);
      const th = target.height || (target.type === 'sticky' ? 100 : 140);
      const scx = source.x + sw / 2 + CANVAS_CENTER;
      const scy = source.y + sh / 2 + CANVAS_CENTER;
      const tcx = target.x + tw / 2 + CANVAS_CENTER;
      const tcy = target.y + th / 2 + CANVAS_CENTER;
      const exitSide  = getExitSide(scx, scy, tcx, tcy);
      const entrySide = getExitSide(tcx, tcy, scx, scy);
      const srcKey = edge.source + ':' + exitSide;
      const tgtKey = edge.target + ':' + entrySide;
      if (!srcSideMap.has(srcKey)) srcSideMap.set(srcKey, []);
      srcSideMap.get(srcKey).push(i);
      if (!tgtSideMap.has(tgtKey)) tgtSideMap.set(tgtKey, []);
      tgtSideMap.get(tgtKey).push(i);
      return { source, target, sw, sh, tw, th, exitSide, entrySide, srcKey, tgtKey };
    });

    // ── Pass 2: compute spread attachment points and build orthogonal paths ──
    return pass1.map((meta, i) => {
      if (!meta) return null;
      const { source, target, sw, sh, tw, th, exitSide, entrySide, srcKey, tgtKey } = meta;
      const edge = edgeList[i];

      // Rank within peers sharing this side → evenly-spaced port fraction
      const srcPeers = srcSideMap.get(srcKey);
      const tgtPeers = tgtSideMap.get(tgtKey);
      const srcRank = (srcPeers.indexOf(i) + 1) / (srcPeers.length + 1);
      const tgtRank = (tgtPeers.indexOf(i) + 1) / (tgtPeers.length + 1);

      // Source attachment — spread along the exit side
      let p1x, p1y;
      const sx0 = source.x + CANVAS_CENTER;
      const sy0 = source.y + CANVAS_CENTER;
      if (exitSide === 'right') {
        p1x = sx0 + sw;
        p1y = sy0 + PORT_MARGIN + (sh - PORT_MARGIN * 2) * srcRank;
      } else if (exitSide === 'left') {
        p1x = sx0;
        p1y = sy0 + PORT_MARGIN + (sh - PORT_MARGIN * 2) * srcRank;
      } else if (exitSide === 'bottom') {
        p1x = sx0 + PORT_MARGIN + (sw - PORT_MARGIN * 2) * srcRank;
        p1y = sy0 + sh;
      } else {
        p1x = sx0 + PORT_MARGIN + (sw - PORT_MARGIN * 2) * srcRank;
        p1y = sy0;
      }

      // Target attachment — spread along the entry side
      let p2x, p2y;
      const tx0 = target.x + CANVAS_CENTER;
      const ty0 = target.y + CANVAS_CENTER;
      if (entrySide === 'left') {
        p2x = tx0;
        p2y = ty0 + PORT_MARGIN + (th - PORT_MARGIN * 2) * tgtRank;
      } else if (entrySide === 'right') {
        p2x = tx0 + tw;
        p2y = ty0 + PORT_MARGIN + (th - PORT_MARGIN * 2) * tgtRank;
      } else if (entrySide === 'top') {
        p2x = tx0 + PORT_MARGIN + (tw - PORT_MARGIN * 2) * tgtRank;
        p2y = ty0;
      } else {
        p2x = tx0 + PORT_MARGIN + (tw - PORT_MARGIN * 2) * tgtRank;
        p2y = ty0 + th;
      }

      // Stagger the elbow X (for horizontal flow) or elbow Y (for vertical flow)
      // so parallel edges don't share the same vertical/horizontal corridor.
      // With n peers: fracs spread from 0.35 to 0.65 around the midpoint.
      const nSrc = srcPeers.length;
      const elbowFrac = nSrc <= 1
        ? 0.5
        : 0.35 + (srcPeers.indexOf(i) / Math.max(1, nSrc - 1)) * 0.30;

      const pathD = orthoSvgPath(p1x, p1y, p2x, p2y, exitSide, 10, elbowFrac);
      return {
        id: edge.id,
        pathD,
        relationType: edge.relationType || 'supports',
        isTwoWay: TWO_WAY_TYPES.has(edge.relationType),
        labelX: (p1x + p2x) / 2,
        labelY: (p1y + p2y) / 2 - 10,
      };
    }).filter(Boolean);
  }, [edges, nodeMap]);

  const isDrawMode = drawTool === 'pen' || drawTool === 'highlighter';
  const guideSpec = useMemo(() => normalizeGuides(guides), [guides]);
  const viewportCursor = isPanning
    ? 'cursor-grabbing'
    : drawTool === 'eraser'
      ? 'cursor-cell'
      : isDrawMode
        ? 'cursor-crosshair'
        : toolMode === 'pan' || spacePressed
          ? 'cursor-grab'
          : placementType
            ? 'cursor-crosshair'
            : lassoRect
              ? 'cursor-crosshair'
              : 'cursor-default';

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[540px] rounded-xl border border-slate-700/70 bg-slate-900 overflow-hidden shadow-inner">
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setViewAndRef((prev) => ({ ...prev, scale: clamp(prev.scale + 0.1, 0.45, 2.5) }))}
          className="h-7 w-7 rounded border border-slate-600 bg-slate-800 text-slate-100 text-sm"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setViewAndRef((prev) => ({ ...prev, scale: clamp(prev.scale - 0.1, 0.45, 2.5) }))}
          className="h-7 w-7 rounded border border-slate-600 bg-slate-800 text-slate-100 text-sm"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => setViewAndRef({ x: 0, y: 0, scale: 1 })}
          className="px-2 h-7 rounded border border-slate-600 bg-slate-800 text-[11px] text-slate-100"
        >
          Reset
        </button>
        <span className="px-2 py-1 text-[11px] rounded bg-black/55 text-white tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
        {isPanning && (
          <span className="px-2 py-1 text-[11px] rounded bg-blue-700 text-white">
            Panning
          </span>
        )}
      </div>

      {/* Edge colour legend — fixed to the viewport bottom-left */}
      <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1 rounded-lg border border-slate-600/60 bg-slate-900/80 px-3 py-2 backdrop-blur-sm select-none pointer-events-none">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Connections</span>
        {EDGE_LEGEND.map(({ type, label }) => (
          <div key={type} className="flex items-center gap-2">
            <svg width="28" height="10" className="shrink-0">
              <line x1="0" y1="5" x2="20" y2="5" stroke={EDGE_COLORS[type]} strokeWidth="2" />
              <polygon points="20,2 28,5 20,8" fill={EDGE_COLORS[type]} />
            </svg>
            <span className="text-[10px] text-slate-300">{label}</span>
          </div>
        ))}
      </div>

      {pendingEdgeSource && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2 rounded-lg border border-blue-400/60 bg-blue-900/60 px-2 py-1">
          <span className="text-[11px] text-blue-100">Select a target node</span>
          <button
            type="button"
            onClick={onCancelEdge}
            className="text-[11px] rounded px-2 py-1 border border-blue-300/70 text-blue-100"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`absolute inset-0 ${viewportCursor}`}
        onMouseDown={handleBackgroundMouseDown}
        onClick={handleBackgroundClick}
        onDoubleClick={handleBackgroundDoubleClick}
        onContextMenu={handleCanvasContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundSize: `${28 * view.scale}px ${28 * view.scale}px`,
            backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.14) 1px, transparent 1px)',
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: `${CANVAS_SIZE}px`,
            height: `${CANVAS_SIZE}px`,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="absolute left-0 top-0 pointer-events-none"
          >
            <defs>
              {Object.entries(EDGE_COLORS).map(([type, color]) => (
                <React.Fragment key={type}>
                  <marker id={`gd-arrow-end-${type}`} viewBox="0 0 10 8" refX="9" refY="4" markerWidth="10" markerHeight="8" orient="auto">
                    <path d="M0 0 L10 4 L0 8z" fill={color} />
                  </marker>
                  <marker id={`gd-arrow-start-${type}`} viewBox="0 0 10 8" refX="1" refY="4" markerWidth="10" markerHeight="8" orient="auto">
                    <path d="M10 0 L0 4 L10 8z" fill={color} />
                  </marker>
                </React.Fragment>
              ))}
            </defs>
            {guideSpec && (
              <g>
                {guideSpec.columns.map((label, idx) => {
                  const x = guideSpec.originX + idx * guideSpec.cellWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + CANVAS_CENTER;
                  return (
                    <g key={`col-${label}-${idx}`}>
                      <rect
                        x={x}
                        y={y - guideSpec.headerHeight}
                        width={guideSpec.cellWidth - 2}
                        height={guideSpec.headerHeight - 6}
                        fill={idx % 2 === 0 ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.16)'}
                        stroke="rgba(148,163,184,0.38)"
                      />
                      <text
                        x={x + guideSpec.cellWidth / 2}
                        y={y - guideSpec.headerHeight / 2}
                        fill="rgba(226,232,240,0.96)"
                        style={{ fontSize: 16, fontWeight: 700 }}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
                {guideSpec.lanes.map((label, idx) => {
                  const x = guideSpec.originX - guideSpec.leftRailWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + idx * guideSpec.cellHeight + CANVAS_CENTER;
                  return (
                    <g key={`lane-${label}-${idx}`}>
                      <rect
                        x={x}
                        y={y}
                        width={guideSpec.leftRailWidth}
                        height={guideSpec.cellHeight - 2}
                        fill={idx % 2 === 0 ? 'rgba(125,211,252,0.24)' : 'rgba(134,239,172,0.22)'}
                        stroke="rgba(148,163,184,0.35)"
                      />
                      <text
                        x={x + guideSpec.leftRailWidth / 2}
                        y={y + guideSpec.cellHeight / 2}
                        fill="rgba(15,23,42,0.95)"
                        style={{ fontSize: 17, fontWeight: 700 }}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
                {guideSpec.columns.map((_, cIdx) => guideSpec.lanes.map((__, rIdx) => {
                  const x = guideSpec.originX + cIdx * guideSpec.cellWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + rIdx * guideSpec.cellHeight + CANVAS_CENTER;
                  return (
                    <rect
                      key={`cell-${cIdx}-${rIdx}`}
                      x={x}
                      y={y}
                      width={guideSpec.cellWidth - 2}
                      height={guideSpec.cellHeight - 2}
                      fill={rIdx % 2 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(248,250,252,0.88)'}
                      stroke="rgba(148,163,184,0.26)"
                    />
                  );
                }))}
              </g>
            )}
            {edgeLines.map((edge) => {
              const edgeColor = EDGE_COLORS[edge.relationType] || EDGE_COLOR_DEFAULT;
              const typeKey = EDGE_COLORS[edge.relationType] ? edge.relationType : 'supports';
              return (
                <g key={edge.id}>
                  {/* Wide transparent hit target */}
                  <path d={edge.pathD} fill="none" stroke="transparent" strokeWidth="10" />
                  <path
                    d={edge.pathD}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    markerEnd={`url(#gd-arrow-end-${typeKey})`}
                    markerStart={edge.isTwoWay ? `url(#gd-arrow-start-${typeKey})` : undefined}
                  />
                </g>
              );
            })}
            {(drawings || []).map((stroke) => {
              const points = (stroke.points || []).map((p) => ({
                x: p.x + CANVAS_CENTER,
                y: p.y + CANVAS_CENTER,
              }));
              const d = pointsToPath(points);
              if (!d) return null;
              return (
                <path
                  key={stroke.id}
                  d={d}
                  fill="none"
                  stroke={stroke.color || '#60a5fa'}
                  strokeOpacity={Number.isFinite(stroke.opacity) ? stroke.opacity : 1}
                  strokeWidth={Math.max(1, Number(stroke.width) || 3)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
            {draftStroke && (() => {
              const points = (draftStroke.points || []).map((p) => ({
                x: p.x + CANVAS_CENTER,
                y: p.y + CANVAS_CENTER,
              }));
              const d = pointsToPath(points);
              if (!d) return null;
              return (
                <path
                  d={d}
                  fill="none"
                  stroke={draftStroke.color || '#60a5fa'}
                  strokeOpacity={Number.isFinite(draftStroke.opacity) ? draftStroke.opacity : 0.9}
                  strokeWidth={Math.max(1, Number(draftStroke.width) || 3)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })()}
          </svg>

          {lassoRect && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${lassoRect.x + CANVAS_CENTER}px`,
                top: `${lassoRect.y + CANVAS_CENTER}px`,
                width: `${Math.max(1, lassoRect.w)}px`,
                height: `${Math.max(1, lassoRect.h)}px`,
                border: '2px dashed #818cf8',
                background: 'rgba(99,102,241,0.08)',
                zIndex: 10,
              }}
            />
          )}

          {(nodes || []).map((node) => {
            const color = EXTENDED_NODE_COLORS[node.type] || '#64748b';
            const isSelected = selectedNodeId === node.id || (selectedNodeIds ? selectedNodeIds.has(node.id) : false);
            const isEditing = editingNodeId === node.id;
            const isSticky = node.type === 'sticky';
            const isMissionCard = node.type === 'missionCard';
            const isAudioPlayer = node.type === 'audioPlayer';
            const stickyFill = node.style?.fill || '#bfdbfe';
            const stickyText = node.style?.text || '#0f172a';
            const stickyBorder = node.style?.border || '#93c5fd';
            const nodeWidth = node.width || (isSticky ? 152 : 260);
            const nodeHeight = node.height || (isSticky ? 100 : 140);
            const mission = node.meta?.mission && typeof node.meta.mission === 'object' ? node.meta.mission : null;
            const mediaSrc = resolveMediaSrc(node.media);
            const imageMedia = isImageMedia(node.media);
            const videoMedia = isVideoMedia(node.media);
            return (
              <article
                key={node.id}
                data-node-card="true"
                className={`group absolute rounded-xl border shadow-lg select-none ${
                  isSelected
                    ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-indigo-500 border-indigo-400'
                    : isSticky
                      ? ''
                      : ''
                }`}
                style={{
                  left: `${node.x + CANVAS_CENTER}px`,
                  top: `${node.y + CANVAS_CENTER}px`,
                  width: `${nodeWidth}px`,
                  minHeight: `${nodeHeight}px`,
                  background: isSticky ? stickyFill : '#111827',
                  borderColor: isSticky ? stickyBorder : color,
                  borderWidth: isSticky ? 1 : 1,
                  borderLeftWidth: isSticky ? 1 : 4,
                  borderStyle: 'solid',
                  overflow: 'hidden',
                  boxShadow: isSelected
                    ? `0 0 0 2px #6366f1, 0 0 0 4px rgba(99,102,241,0.2), 0 4px 24px rgba(0,0,0,0.5)`
                    : `0 2px 12px rgba(0,0,0,0.45), 0 0 0 0 transparent`,
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => handleNodeClick(e, node)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
              >
                <button
                  type="button"
                  title="Start connection"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pendingEdgeSource === node.id) onCancelEdge?.();
                    else onStartEdge?.(node.id);
                  }}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 z-20 h-4 w-4 rounded-full border border-indigo-200 bg-indigo-500 shadow"
                />
                <button
                  type="button"
                  title="Complete connection"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pendingEdgeSource && pendingEdgeSource !== node.id) onCompleteEdge?.(node.id);
                  }}
                  className={`absolute -left-2 top-1/2 -translate-y-1/2 z-20 h-4 w-4 rounded-full border shadow ${
                    pendingEdgeSource && pendingEdgeSource !== node.id
                      ? 'border-emerald-200 bg-emerald-500'
                      : 'border-slate-300 bg-slate-400'
                  }`}
                />
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <div
                    key={corner}
                    data-node-resize="true"
                    onMouseDown={(e) => handleNodeResizeMouseDown(e, node, corner)}
                    className={`absolute z-20 h-3.5 w-3.5 rounded-sm border border-indigo-300/70 transition-opacity ${
                      isSelected ? 'bg-indigo-500/80 opacity-100' : 'bg-indigo-400/60 opacity-0 group-hover:opacity-100'
                    }`}
                    style={{
                      cursor: CORNER_CURSORS[corner],
                      top: corner[0] === 'n' ? '0' : undefined,
                      bottom: corner[0] === 's' ? '0' : undefined,
                      left: corner[1] === 'w' ? '0' : undefined,
                      right: corner[1] === 'e' ? '0' : undefined,
                    }}
                  />
                ))}
                {!isSticky && (
                  <header
                    className="px-3 py-2 border-b flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: `${color}28`,
                      borderBottomColor: `${color}55`,
                    }}
                  >
                    <span
                      className="text-[11px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                      style={{
                        color: color,
                        background: `${color}22`,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {EXTENDED_NODE_LABELS[node.type] || node.type}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {pendingEdgeSource === node.id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelEdge?.();
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartEdge?.(node.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                        >
                          Link
                        </button>
                      )}
                      {node.link?.url && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLink?.(node.link.url);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </header>
                )}
                {isAudioPlayer ? (
                  <AudioPlayerNodeCard node={node} />
                ) : isEditing ? (
                  <div className="px-3 py-2.5">
                    <input
                      ref={editTitleRef}
                      value={node.title || ''}
                      onChange={(e) => onUpdateNode?.(node.id, { title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.parentElement?.querySelector('textarea')?.focus();
                        if (e.key === 'Escape') setEditingNodeId(null);
                      }}
                      onBlur={handleEditBlur}
                      className="w-full bg-transparent text-sm font-bold border-b outline-none mb-1.5"
                      style={{
                        color: isSticky ? (stickyText || '#1e293b') : '#ffffff',
                        borderColor: isSticky ? (stickyBorder || '#94a3b8') : color,
                        caretColor: isSticky ? '#1e293b' : '#f1f5f9',
                      }}
                      placeholder="Title"
                    />
                    <textarea
                      value={node.description || ''}
                      onChange={(e) => onUpdateNode?.(node.id, { description: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingNodeId(null);
                      }}
                      onBlur={handleEditBlur}
                      className="w-full min-h-[60px] bg-transparent text-[12px] leading-relaxed border-b outline-none resize-y"
                      style={{
                        color: isSticky ? (stickyText || '#334155') : '#cbd5e1',
                        borderColor: isSticky ? (stickyBorder || '#94a3b8') : '#475569',
                        caretColor: isSticky ? '#1e293b' : '#cbd5e1',
                      }}
                      placeholder="Description"
                    />
                  </div>
                ) : (
                  <div className="px-3 py-2.5">
                    <h4
                      className={`text-sm font-bold leading-snug break-words ${isSticky ? '' : 'text-white'}`}
                      style={isSticky ? { color: stickyText } : undefined}
                    >
                      {node.title || 'Untitled node'}
                    </h4>
                    {!isMissionCard && (
                      <p
                        className={`mt-1.5 text-[12px] leading-relaxed ${isSticky ? '' : 'text-slate-300'}`}
                        style={isSticky ? { color: stickyText } : undefined}
                      >
                        {node.description || ''}
                      </p>
                    )}
                    {isMissionCard && mission && (
                      <div className="mt-2 rounded border border-violet-400/35 bg-violet-500/10 p-1.5 space-y-1.5">
                        {/* Header name + type badge row */}
                        <div className="flex items-start justify-between gap-1">
                          {mission.headerName ? (
                            <span className="text-[11px] font-medium text-violet-200 leading-tight break-words min-w-0">{mission.headerName}</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">No header name</span>
                          )}
                          {mission.missionType && (
                            <span className="shrink-0 px-1 py-0.5 text-[9px] rounded bg-violet-700/70 text-violet-200 uppercase tracking-wide leading-none ml-1">
                              {mission.missionType === 'brandFantasy' ? 'Brand' : mission.missionType === 'worldProblem' ? 'World' : mission.missionType}
                            </span>
                          )}
                        </div>
                        {/* Key metadata grid */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                          <span className="text-slate-400">Code:</span>
                          <span className="text-violet-100 text-right break-all">{mission.missionId || '—'}</span>
                          {mission.playtime ? (
                            <>
                              <span className="text-slate-400">Playtime:</span>
                              <span className="text-violet-100 text-right">{mission.playtime}</span>
                            </>
                          ) : null}
                          {mission.season ? (
                            <>
                              <span className="text-slate-400">Season:</span>
                              <span className="text-violet-100 text-right">{mission.season}</span>
                            </>
                          ) : null}
                          {mission.term ? (
                            <>
                              <span className="text-slate-400">Term:</span>
                              <span className="text-violet-100 text-right">{mission.term}</span>
                            </>
                          ) : null}
                          {mission.team ? (
                            <>
                              <span className="text-slate-400">Team:</span>
                              <span className="text-violet-100 text-right">{mission.team}</span>
                            </>
                          ) : null}
                        </div>
                        {/* NPCs */}
                        {Array.isArray(mission.npcs) && mission.npcs.length > 0 && (
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">NPCs</div>
                            <div className="flex flex-wrap gap-0.5">
                              {mission.npcs.map(function(n) {
                                return <span key={n} className="px-1 py-0 text-[9px] rounded bg-slate-700 text-slate-200">{n}</span>;
                              })}
                            </div>
                          </div>
                        )}
                        {/* Locations */}
                        {Array.isArray(mission.locations) && mission.locations.length > 0 && (
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Locations</div>
                            <div className="flex flex-wrap gap-0.5">
                              {mission.locations.map(function(l) {
                                return <span key={l} className="px-1 py-0 text-[9px] rounded bg-indigo-900/70 text-indigo-200">{l}</span>;
                              })}
                            </div>
                          </div>
                        )}
                        {/* Systems */}
                        {Array.isArray(mission.systems) && mission.systems.length > 0 && (
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Systems</div>
                            <div className="flex flex-wrap gap-0.5">
                              {mission.systems.map(function(s) {
                                return <span key={s} className="px-1 py-0 text-[9px] rounded bg-teal-900/70 text-teal-200">{s}</span>;
                              })}
                            </div>
                          </div>
                        )}
                        {/* Synopsis */}
                        {mission.synopsis && (
                          <p className="text-[10px] text-slate-300 leading-snug border-t border-violet-700/30 pt-1">
                            {mission.synopsis}
                          </p>
                        )}
                      </div>
                    )}
                    {imageMedia && mediaSrc && (
                      <img
                        src={mediaSrc}
                        alt={node.title || 'Node image'}
                        className="mt-2 w-full h-24 rounded border border-slate-600 object-cover"
                        draggable={false}
                      />
                    )}
                    {videoMedia && mediaSrc && (
                      <video
                        src={mediaSrc}
                        className="mt-2 w-full h-24 rounded border border-slate-600 bg-black"
                        controls
                        preload="metadata"
                      />
                    )}
                    {!mediaSrc && (node.media?.path || node.media?.relativePath) && (
                      <p className="mt-2 text-[10px] text-amber-300 truncate">
                        Asset saved: {node.media.relativePath || node.media.path}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {contextMenu && (
        <div
          className="absolute z-40 min-w-[170px] rounded-lg border border-slate-600 bg-slate-950/95 p-1.5 shadow-2xl"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeId ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onSelectNode?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Select
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingEdgeSource === contextMenu.nodeId) onCancelEdge?.();
                  else onStartEdge?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                {pendingEdgeSource === contextMenu.nodeId ? 'Cancel Connection' : 'Start Connection'}
              </button>
              {pendingEdgeSource && pendingEdgeSource !== contextMenu.nodeId && (
                <button
                  type="button"
                  onClick={() => {
                    onCompleteEdge?.(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
                >
                  Connect To This
                </button>
              )}
              {nodeMap.get(contextMenu.nodeId)?.link?.url && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenLink?.(nodeMap.get(contextMenu.nodeId)?.link?.url);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
                >
                  Open Link
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onDuplicateNode?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Duplicate
              </button>
              <div className="my-0.5 border-t border-slate-700/80" />
              <button
                type="button"
                onClick={() => {
                  onExportNode?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
              >
                Export as Text
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportNodeCsv?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
              >
                Export as CSV
              </button>
              {selectedNodeIds && selectedNodeIds.size > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onExportSelected?.([...selectedNodeIds]);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
                  >
                    Export {selectedNodeIds.size} Selected as Text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportSelectedCsv?.([...selectedNodeIds]);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
                  >
                    Export {selectedNodeIds.size} Selected as CSV
                  </button>
                </>
              )}
              <div className="my-0.5 border-t border-slate-700/80" />
              <button
                type="button"
                onClick={() => {
                  onDeleteNode?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-red-300 hover:bg-red-900/30"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onAddNodeAt?.('sticky', contextMenu.boardPoint || null);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Add Sticky Here
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddNodeAt?.('mechanic', contextMenu.boardPoint || null);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Add Mechanic Here
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddNodeAt?.('questContent', contextMenu.boardPoint || null);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Add Content Here
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddNodeAt?.('missionCard', contextMenu.boardPoint || null);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-100 hover:bg-slate-800"
              >
                Add Mission Card Here
              </button>
              <div className="my-0.5 border-t border-slate-700/80" />
              <button
                type="button"
                onClick={() => {
                  onExportBoard?.();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
              >
                Export Board as Text
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportBoardCsv?.();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded text-slate-300 hover:bg-slate-800"
              >
                Export Board as CSV
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

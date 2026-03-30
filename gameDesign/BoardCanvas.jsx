import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GAME_DESIGN_NODE_TYPE_COLORS,
  GAME_DESIGN_NODE_TYPE_LABELS,
} from '../../platform/gameDesignDefaults';

const CANVAS_SIZE = 8000;
const CANVAS_CENTER = CANVAS_SIZE / 2;

// ─── Node tier system ────────────────────────────────────────────────────────
// Tier 0: Frame container (renders behind everything)
// Tier 1: Strategic (pillar, coreLoop) — largest, gradient header, Cinzel titles
// Tier 2: Design (mechanic, system, progression, economy, questContent) — standard
// Tier 3: Content (missionCard) — structured kernel sections
// Tier 4: Annotation (risk, playtestFinding, sticky) — smaller, personality
// Tier 5: Media (audioPlayer, videoPlayer, imageNode) — media-focused card
const NODE_TIER = {
  frame: 0,
  pillar: 1, coreLoop: 1,
  mechanic: 2, system: 2, progression: 2, economy: 2, questContent: 2,
  missionCard: 3,
  risk: 4, playtestFinding: 4, sticky: 4,
  audioPlayer: 5, videoPlayer: 5, imageNode: 5,
};

function getNodeWidth(node) {
  if (node.width) return node.width;
  if (node.type === 'sticky') return 180;
  if (node.type === 'frame') return 640;
  const tier = NODE_TIER[node.type] || 2;
  if (tier === 1) return 300;
  if (tier === 3) return 280;
  if (tier === 4) return 210;
  if (tier === 5) return 240;
  return 260;
}

function getDefaultNodeHeight(node) {
  if (node.height) return node.height;
  if (node.type === 'sticky') return 120;
  if (node.type === 'frame') return 420;
  return 140;
}

// ─── Edge styling ────────────────────────────────────────────────────────────
const EDGE_COLORS = {
  supports:      '#818cf8',
  requires:      '#fbbf24',
  conflicts:     '#f87171',
  extends:       '#34d399',
  bidirectional: '#c084fc',
  related:       '#94a3b8',
  twoWay:        '#c084fc',
};
const EDGE_STROKE_WIDTHS = { requires: 2.5, conflicts: 2, supports: 2, extends: 1.5, related: 1.5, bidirectional: 2, twoWay: 2 };
const EDGE_DASH_PATTERNS = { extends: '7 3', related: '4 3' };
const EDGE_COLOR_DEFAULT = '#818cf8';
const TWO_WAY_TYPES = new Set(['bidirectional', 'related', 'twoWay']);
const EDGE_LEGEND = [
  { type: 'supports',      label: 'Supports' },
  { type: 'requires',      label: 'Requires' },
  { type: 'conflicts',     label: 'Conflicts' },
  { type: 'extends',       label: 'Extends (opt.)' },
  { type: 'bidirectional', label: 'Bidirectional' },
];

// ─── Domain layers for filter panel ──────────────────────────────────────────
const DOMAIN_LAYERS = [
  { id: 'strategic',   label: 'Strategic',  types: new Set(['pillar', 'coreLoop']),                                               color: '#a78bfa' },
  { id: 'design',      label: 'Design',     types: new Set(['mechanic', 'system', 'progression', 'economy', 'questContent']),    color: '#38bdf8' },
  { id: 'content',     label: 'Content',    types: new Set(['missionCard']),                                                      color: '#c084fc' },
  { id: 'media',       label: 'Media',      types: new Set(['audioPlayer', 'videoPlayer', 'imageNode']),                  color: '#34d399' },
  { id: 'annotations', label: 'Notes/QA',   types: new Set(['risk', 'playtestFinding', 'sticky']),                               color: '#fbbf24' },
  { id: 'frames',      label: 'Frames',     types: new Set(['frame']),                                                            color: '#64748b' },
];

const CORNER_CURSORS = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };

// ─── Node type icons (inline SVG paths, viewBox 0 0 20 20) ───────────────────
const NODE_TYPE_ICON_PATHS = {
  pillar:          '<rect x="4" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="4" y="15" width="12" height="2" rx="1" fill="currentColor"/><rect x="5.5" y="5" width="2" height="10" rx="1" fill="currentColor"/><rect x="12.5" y="5" width="2" height="10" rx="1" fill="currentColor"/>',
  coreLoop:        '<path d="M14 4a7 7 0 1 0 2 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><polyline points="13,2 14,6 18,4" fill="currentColor"/>',
  mechanic:        '<circle cx="10" cy="10" r="2.8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 2"/>',
  system:          '<circle cx="10" cy="4" r="2" fill="currentColor"/><circle cx="4" cy="15" r="2" fill="currentColor"/><circle cx="16" cy="15" r="2" fill="currentColor"/><line x1="10" y1="6" x2="4" y2="13" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="6" x2="16" y2="13" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="15" x2="16" y2="15" stroke="currentColor" stroke-width="1.5"/>',
  progression:     '<rect x="2" y="14" width="4" height="3" rx="1" fill="currentColor"/><rect x="8" y="10" width="4" height="7" rx="1" fill="currentColor"/><rect x="14" y="6" width="4" height="11" rx="1" fill="currentColor"/>',
  economy:         '<circle cx="8" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  questContent:    '<path d="M7 3 Q6 10 7 17 Q10 19 13 17 Q14 10 13 3 Q10 1 7 3Z" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8.5" y1="7" x2="11.5" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8.5" y1="10" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  missionCard:     '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="3" x2="10" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="14" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="6" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  playtestFinding: '<circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="13" y1="13" x2="17" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  risk:            '<path d="M10 3L18 16H2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="10" y1="8.5" x2="10" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14.5" r="1" fill="currentColor"/>',
  sticky:          '<path d="M3 3h14v10l-4 4H3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 17v-4h4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  audioPlayer:     '<path d="M4 7h4l5 4V3L8 7H4v6h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 7q2 3 0 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  videoPlayer:     '<rect x="2" y="5" width="11" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13 8l5-2v8l-5-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  imageNode:       '<rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8" r="1.5" fill="currentColor"/><path d="M2 13l5-4 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>',
  frame:           '<rect x="2" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>',
};

function NodeTypeIcon({ type, size = 16, color }) {
  const paths = NODE_TYPE_ICON_PATHS[type];
  if (!paths) return null;
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 20 20"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, color: color || 'currentColor' }}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

// ─── 8-port connection system ─────────────────────────────────────────────────
const PORTS = ['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft'];

function getPortPosition(cx, cy, hw, hh, portId) {
  const r = 6;
  switch (portId) {
    case 'top':         return { x: cx,          y: cy - hh,      side: 'top' };
    case 'topRight':    return { x: cx + hw - r,  y: cy - hh + r,  side: 'right' };
    case 'right':       return { x: cx + hw,      y: cy,           side: 'right' };
    case 'bottomRight': return { x: cx + hw - r,  y: cy + hh - r,  side: 'bottom' };
    case 'bottom':      return { x: cx,           y: cy + hh,      side: 'bottom' };
    case 'bottomLeft':  return { x: cx - hw + r,  y: cy + hh - r,  side: 'bottom' };
    case 'left':        return { x: cx - hw,      y: cy,           side: 'left' };
    case 'topLeft':     return { x: cx - hw + r,  y: cy - hh + r,  side: 'top' };
    default:            return { x: cx + hw,      y: cy,           side: 'right' };
  }
}

function getNearestPort(cx, cy, hw, hh, targetX, targetY) {
  let best = null, bestDist = Infinity;
  for (const portId of PORTS) {
    const pos = getPortPosition(cx, cy, hw, hh, portId);
    const d = Math.hypot(pos.x - targetX, pos.y - targetY);
    if (d < bestDist) { bestDist = d; best = { ...pos, portId }; }
  }
  return best;
}

// CSS positions of 8 port dots relative to node card (dot is 10x10)
const PORT_DOT_STYLES = [
  { id: 'top',         style: { left: 'calc(50% - 5px)', top:    '-5px'  } },
  { id: 'topRight',    style: { right: '5px',            top:    '-5px'  } },
  { id: 'right',       style: { right: '-5px',           top:    'calc(50% - 5px)' } },
  { id: 'bottomRight', style: { right: '5px',            bottom: '-5px'  } },
  { id: 'bottom',      style: { left: 'calc(50% - 5px)', bottom: '-5px'  } },
  { id: 'bottomLeft',  style: { left: '5px',             bottom: '-5px'  } },
  { id: 'left',        style: { left: '-5px',            top:    'calc(50% - 5px)' } },
  { id: 'topLeft',     style: { left: '5px',             top:    '-5px'  } },
];

// ─── Helper functions ─────────────────────────────────────────────────────────
function clamp(num, min, max) { return Math.max(min, Math.min(max, num)); }

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
    columns, lanes,
    originX: asNum(guides.originX, -560), originY: asNum(guides.originY, -120),
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
  return { x: spec.originX + col * spec.cellWidth, y: spec.originY + row * spec.cellHeight };
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
  return mediaPathToSrc(media.dataUrl) || mediaPathToSrc(media.path) || mediaPathToSrc(media.sourcePath) || mediaPathToSrc(media.relativePath) || '';
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

// BFS to collect neighbor node IDs within `radius` hops
function getBfsNeighbors(nodeId, edges, radius) {
  const result = new Set([nodeId]);
  let frontier = new Set([nodeId]);
  for (let i = 0; i < radius; i++) {
    const next = new Set();
    for (const edge of (edges || [])) {
      if (frontier.has(edge.source) && !result.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !result.has(edge.source)) next.add(edge.source);
    }
    next.forEach(id => result.add(id));
    frontier = next;
    if (frontier.size === 0) break;
  }
  return result;
}

// Orthogonal S-curve path between two points
function orthoSvgPath(p1x, p1y, p2x, p2y, exitSide, r) {
  const dx = p2x - p1x, dy = p2y - p1y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < 1 && ady < 1) return `M ${p1x} ${p1y} L ${p2x} ${p2y}`;
  if (exitSide === 'right' || exitSide === 'left') {
    if (ady < 2) return `M ${p1x} ${p1y} H ${p2x}`;
    const midX = (p1x + p2x) / 2;
    const cr = Math.min(r, ady / 2, Math.abs(midX - p1x), Math.abs(p2x - midX));
    if (cr < 1) return `M ${p1x} ${p1y} H ${midX} V ${p2y} H ${p2x}`;
    const xs1 = midX > p1x ? 1 : -1, xs2 = p2x > midX ? 1 : -1, ys = dy > 0 ? 1 : -1;
    return [`M ${p1x} ${p1y}`, `H ${midX - xs1 * cr}`, `Q ${midX} ${p1y} ${midX} ${p1y + ys * cr}`, `V ${p2y - ys * cr}`, `Q ${midX} ${p2y} ${midX + xs2 * cr} ${p2y}`, `H ${p2x}`].join(' ');
  } else {
    if (adx < 2) return `M ${p1x} ${p1y} V ${p2y}`;
    const midY = (p1y + p2y) / 2;
    const cr = Math.min(r, adx / 2, Math.abs(midY - p1y), Math.abs(p2y - midY));
    if (cr < 1) return `M ${p1x} ${p1y} V ${midY} H ${p2x} V ${p2y}`;
    const ys1 = midY > p1y ? 1 : -1, ys2 = p2y > midY ? 1 : -1, xs = dx > 0 ? 1 : -1;
    return [`M ${p1x} ${p1y}`, `V ${midY - ys1 * cr}`, `Q ${p1x} ${midY} ${p1x + xs * cr} ${midY}`, `H ${p2x - xs * cr}`, `Q ${p2x} ${midY} ${p2x} ${midY + ys2 * cr}`, `V ${p2y}`].join(' ');
  }
}


// Midpoint for edge label placement
function getEdgeMidpoint(p1x, p1y, p2x, p2y) {
  return { x: (p1x + p2x) / 2, y: (p1y + p2y) / 2 };
}

// Generate a minimal SVG string from board data for export
function generateBoardSVG(nodes, edges) {
  if (!nodes || nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const nw = getNodeWidth(node); const nh = node.height || 140;
    minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + nw); maxY = Math.max(maxY, node.y + nh);
  }
  const pad = 48, ox = minX - pad, oy = minY - pad;
  const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;

  const edgePaths = (edges || []).flatMap((edge) => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    if (!src || !tgt) return [];
    const sw = getNodeWidth(src), sh = src.height || 140;
    const tw = getNodeWidth(tgt), th = tgt.height || 140;
    const scx = src.x - ox + sw / 2, scy = src.y - oy + sh / 2;
    const tcx = tgt.x - ox + tw / 2, tcy = tgt.y - oy + th / 2;
    const srcPort = getNearestPort(scx, scy, sw / 2, sh / 2, tcx, tcy);
    const tgtPort = getNearestPort(tcx, tcy, tw / 2, th / 2, scx, scy);
    const color = EDGE_COLORS[edge.relationType] || EDGE_COLOR_DEFAULT;
    return [`<path d="${orthoSvgPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y, srcPort.side, 10)}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#arr)"/>`];
  }).join('\n  ');

  const nodeRects = nodes.map((node) => {
    const nw = getNodeWidth(node), nh = node.height || 140;
    const x = node.x - ox, y = node.y - oy;
    const color = GAME_DESIGN_NODE_TYPE_COLORS[node.type] || '#64748b';
    const label = (GAME_DESIGN_NODE_TYPE_LABELS[node.type] || node.type).toUpperCase();
    const title = (node.title || 'Untitled').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const desc = (node.description || '').slice(0, 80).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return [
      `<g>`,
      `  <rect x="${x}" y="${y}" width="${nw}" height="${nh}" rx="10" fill="#0c1424" stroke="${color}" stroke-width="3"/>`,
      `  <rect x="${x}" y="${y}" width="${nw}" height="24" rx="10" fill="${color}40"/>`,
      `  <text x="${x + 8}" y="${y + 16}" font-size="9" fill="${color}" font-family="sans-serif" font-weight="800" letter-spacing="1">${label}</text>`,
      `  <text x="${x + 8}" y="${y + 40}" font-size="13" fill="#f1f5f9" font-family="Georgia,serif" font-weight="700">${title}</text>`,
      desc ? `  <text x="${x + 8}" y="${y + 56}" font-size="11" fill="#9ca3af" font-family="Georgia,serif">${desc}</text>` : '',
      `</g>`,
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="background:#0c1220">
  <defs>
    <marker id="arr" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="9" markerHeight="8" orient="auto">
      <path d="M0 0 L10 4 L0 8z" fill="${EDGE_COLOR_DEFAULT}"/>
    </marker>
  </defs>
  ${edgePaths}
  ${nodeRects}
</svg>`;
}

// ─── Main component ───────────────────────────────────────────────────────────
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
  boardTitle,
  onAddNodeAt,
  onMoveNode,
  onResizeNode,
  onUpdateNode,
  onUpdateEdge,
  onDeleteEdge,
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
  onSaveBoardSnapshot,
}) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef   = useRef(null);
  const viewportRef    = useRef(null);
  const panRef         = useRef(null);
  const lassoRef       = useRef(null);
  const lassoDidSelectRef = useRef(false);
  const dragNodeRef    = useRef(null);
  const resizeNodeRef  = useRef(null);
  const drawSessionRef = useRef(null);
  const eraseSessionRef = useRef(null);
  const panMovedRef    = useRef(false);
  const nodesRef       = useRef(nodes);
  const animFrameRef   = useRef(null);
  const editTitleRef   = useRef(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning]       = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [draftStroke, setDraftStroke]   = useState(null);
  const [lassoRect, setLassoRect]       = useState(null);
  const [contextMenu, setContextMenu]   = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [cursorBoardPos, setCursorBoardPos] = useState({ x: 0, y: 0 });

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen]   = useState(false);

  // Filter
  const [hiddenLayers, setHiddenLayers] = useState(new Set());
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Focus mode
  const [focusModeNodeId, setFocusModeNodeId] = useState(null);

  // Legend + minimap
  const [legendOpen, setLegendOpen]   = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);

  // Review mode + comments
  const [reviewMode, setReviewMode] = useState(false);
  const [commentingNodeId, setCommentingNodeId] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');

  // Edge interactions
  const [hoveredEdgeId, setHoveredEdgeId]   = useState(null);
  const [editingEdgeId, setEditingEdgeId]   = useState(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');

  // Drag-to-connect state
  const dragConnectRef  = useRef(null);          // { sourceNodeId, hasMoved } – for global handlers
  const [dragConnectInfo, setDragConnectInfo] = useState(null); // { sourceNodeId } – reactive, for render
  const [dragConnectPos,  setDragConnectPos]  = useState(null); // { x, y } board-space cursor

  // Stable callback refs so global event handlers can call them without dep-array churn
  const onStartEdgeRef    = useRef(onStartEdge);
  const onCompleteEdgeRef = useRef(onCompleteEdge);
  const onCancelEdgeRef   = useRef(onCancelEdge);

  // ── Derived maps ──────────────────────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const out = new Map();
    for (const node of nodes || []) out.set(node.id, node);
    return out;
  }, [nodes]);

  // Hidden types from hidden layers
  const hiddenTypes = useMemo(() => {
    const types = new Set();
    for (const layer of DOMAIN_LAYERS) {
      if (hiddenLayers.has(layer.id)) layer.types.forEach(t => types.add(t));
    }
    return types;
  }, [hiddenLayers]);

  // Search matching IDs (null = no filter active)
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      (nodes || []).filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.description || '').toLowerCase().includes(q) ||
        (n.tags || []).some(t => String(t).toLowerCase().includes(q))
      ).map(n => n.id)
    );
  }, [nodes, searchQuery]);

  // Focus mode neighbor IDs (null = no focus active)
  const focusNeighborIds = useMemo(() => {
    if (!focusModeNodeId) return null;
    return getBfsNeighbors(focusModeNodeId, edges, 2);
  }, [focusModeNodeId, edges]);

  // Per-node opacity
  const getNodeOpacity = useCallback((nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) return 1;
    if (hiddenTypes.has(node.type)) return 0;
    if (searchMatchIds !== null && !searchMatchIds.has(nodeId)) return 0.15;
    if (focusNeighborIds !== null && !focusNeighborIds.has(nodeId)) return 0.1;
    return 1;
  }, [nodeMap, hiddenTypes, searchMatchIds, focusNeighborIds]);

  // Review summary
  const reviewSummary = useMemo(() => {
    if (!reviewMode) return null;
    let approved = 0, concern = 0, question = 0, unreviewed = 0;
    for (const node of (nodes || [])) {
      const votes = Object.values(node.reviews || {});
      if (!votes.length) unreviewed++;
      else if (votes.includes('concern')) concern++;
      else if (votes.includes('question')) question++;
      else approved++;
    }
    return { approved, concern, question, unreviewed, total: (nodes || []).length };
  }, [nodes, reviewMode]);

  // Computed edge lines (8-port routing: nearest port on both source and target)
  const edgeLines = useMemo(() => {
    return (edges || []).map((edge) => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return null;
      const sw = getNodeWidth(src), sh = src.height || 140;
      const tw = getNodeWidth(tgt), th = tgt.height || 140;
      const scx = src.x + sw / 2 + CANVAS_CENTER, scy = src.y + sh / 2 + CANVAS_CENTER;
      const tcx = tgt.x + tw / 2 + CANVAS_CENTER, tcy = tgt.y + th / 2 + CANVAS_CENTER;
      const srcPort = getNearestPort(scx, scy, sw / 2, sh / 2, tcx, tcy);
      const tgtPort = getNearestPort(tcx, tcy, tw / 2, th / 2, scx, scy);
      const pathD = orthoSvgPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y, srcPort.side, 10);
      const midpoint = getEdgeMidpoint(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y);
      return {
        id: edge.id, pathD, midpoint,
        relationType: edge.relationType || 'supports',
        isTwoWay: TWO_WAY_TYPES.has(edge.relationType),
        label: edge.label || '',
        sourceId: edge.source, targetId: edge.target,
      };
    }).filter(Boolean);
  }, [edges, nodeMap]);

  const guideSpec = useMemo(() => normalizeGuides(guides), [guides]);

  // ── Utilities ────────────────────────────────────────────────────────────
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

  const toBoardPoint = (clientX, clientY) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const currentView = viewRef.current;
    const iz = getInteractionZoom();
    const rect = viewport.getBoundingClientRect();
    const localX = (clientX - rect.left) / iz;
    const localY = (clientY - rect.top) / iz;
    return {
      x: (localX - currentView.x) / currentView.scale - CANVAS_CENTER,
      y: (localY - currentView.y) / currentView.scale - CANVAS_CENTER,
    };
  };

  const animateViewTo = useCallback((target) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = { ...viewRef.current };
    const startTime = Date.now();
    const duration = 320;
    function frame() {
      const progress = Math.min(1, (Date.now() - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const next = {
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
        scale: start.scale + (target.scale - start.scale) * ease,
      };
      setViewAndRef(next);
      if (progress < 1) animFrameRef.current = requestAnimationFrame(frame);
    }
    animFrameRef.current = requestAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleZoomToFit = useCallback(() => {
    const ns = nodes || [];
    if (ns.length === 0) { animateViewTo({ x: 0, y: 0, scale: 1 }); return; }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of ns) {
      const nw = getNodeWidth(node), nh = node.height || 140;
      minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + nw); maxY = Math.max(maxY, node.y + nh);
    }
    const pad = 80, rangeX = maxX - minX + pad * 2, rangeY = maxY - minY + pad * 2;
    const scale = clamp(Math.min(rect.width / rangeX, rect.height / rangeY), 0.1, 1.5);
    const centerBoardX = (minX + maxX) / 2 + CANVAS_CENTER;
    const centerBoardY = (minY + maxY) / 2 + CANVAS_CENTER;
    animateViewTo({ x: rect.width / 2 - centerBoardX * scale, y: rect.height / 2 - centerBoardY * scale, scale });
  }, [nodes, animateViewTo]);

  const handleZoomToSelection = useCallback(() => {
    const ids = selectedNodeIds && selectedNodeIds.size > 0 ? selectedNodeIds : (selectedNodeId ? new Set([selectedNodeId]) : null);
    if (!ids || ids.size === 0) { handleZoomToFit(); return; }
    const ns = (nodes || []).filter(n => ids.has(n.id));
    if (!ns.length) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of ns) {
      const nw = getNodeWidth(node), nh = node.height || 140;
      minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + nw); maxY = Math.max(maxY, node.y + nh);
    }
    const pad = 100, rangeX = maxX - minX + pad * 2, rangeY = maxY - minY + pad * 2;
    const scale = clamp(Math.min(rect.width / rangeX, rect.height / rangeY), 0.1, 2.0);
    const centerBoardX = (minX + maxX) / 2 + CANVAS_CENTER;
    const centerBoardY = (minY + maxY) / 2 + CANVAS_CENTER;
    animateViewTo({ x: rect.width / 2 - centerBoardX * scale, y: rect.height / 2 - centerBoardY * scale, scale });
  }, [nodes, selectedNodeIds, selectedNodeId, handleZoomToFit, animateViewTo]);

  const handleExportSVG = useCallback(() => {
    const svg = generateBoardSVG(nodes, edges);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${boardTitle || 'board'}-export.svg`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [nodes, edges, boardTitle]);

  const openContextMenu = (clientX, clientY, payload = {}) => {
    const host = containerRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const iz = getInteractionZoom();
    setContextMenu({ x: Math.max(8, (clientX - rect.left) / iz), y: Math.max(8, (clientY - rect.top) / iz), ...payload });
  };

  const handleAddComment = (nodeId) => {
    const text = commentDraft.trim();
    if (!text) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const comments = Array.isArray(node.comments) ? [...node.comments] : [];
    const username = (typeof window.appAPI?.getUsername === 'function' ? window.appAPI.getUsername() : null) || 'You';
    comments.push({ id: String(Date.now()), author: username, text, resolved: false, ts: Date.now() });
    onUpdateNode?.(nodeId, { comments });
    setCommentDraft('');
  };

  const handleReviewVote = (nodeId, vote) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const username = (typeof window.appAPI?.getUsername === 'function' ? window.appAPI.getUsername() : null) || 'You';
    const reviews = { ...(node.reviews || {}) };
    if (reviews[username] === vote) delete reviews[username]; else reviews[username] = vote;
    onUpdateNode?.(nodeId, { reviews });
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { if (editingNodeId && editTitleRef.current) { editTitleRef.current.focus(); editTitleRef.current.select(); } }, [editingNodeId]);
  useEffect(() => { onStartEdgeRef.current    = onStartEdge; },    [onStartEdge]);
  useEffect(() => { onCompleteEdgeRef.current = onCompleteEdge; }, [onCompleteEdge]);
  useEffect(() => { onCancelEdgeRef.current   = onCancelEdge; },   [onCancelEdge]);

  // Focus on specific node (from AI patch)
  useEffect(() => {
    if (!focusNodeId) return;
    const node = nodeMap.get(focusNodeId);
    const viewport = viewportRef.current;
    if (!node || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const nw = getNodeWidth(node), nh = node.height || 140;
    animateViewTo({
      x: rect.width / 2 - (node.x + CANVAS_CENTER + nw / 2) * viewRef.current.scale,
      y: rect.height / 2 - (node.y + CANVAS_CENTER + nh / 2) * viewRef.current.scale,
      scale: viewRef.current.scale,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space') setSpacePressed(true);
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setSearchOpen(true); return; }
      if (isTyping) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedNodeIds && selectedNodeIds.size > 1) onDeleteNodes?.([...selectedNodeIds]);
        else if (selectedNodeId) onDeleteNode?.(selectedNodeId);
      }
      if (e.key === 'Escape') {
        onCancelEdge?.(); onSelectNode?.(null);
        if (searchOpen) { setSearchOpen(false); setSearchQuery(''); }
        if (focusModeNodeId) setFocusModeNodeId(null);
        setContextMenu(null);
      }
      if (e.ctrlKey && e.key === 'a') { e.preventDefault(); onMultiSelect?.((nodesRef.current || []).map(n => n.id)); }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); if (selectedNodeId) onDuplicateNode?.(selectedNodeId); }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); handleZoomToFit(); }
      // F — toggle focus mode on selected node
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        if (selectedNodeId) setFocusModeNodeId(prev => prev === selectedNodeId ? null : selectedNodeId);
      }
    };
    const onKeyUp = (e) => { if (e.code === 'Space') setSpacePressed(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [selectedNodeId, selectedNodeIds, onDeleteNode, onDeleteNodes, onCancelEdge, onSelectNode, onMultiSelect, onDuplicateNode, searchOpen, focusModeNodeId, handleZoomToFit]);

  // Context menu close
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, []);

  // Mouse move/up for all drag operations
  useEffect(() => {
    const onMove = (e) => {
      const pt = toBoardPoint(e.clientX, e.clientY);
      setCursorBoardPos(pt);
      // Drag-to-connect: update ghost line cursor position
      if (dragConnectRef.current) {
        dragConnectRef.current.hasMoved = true;
        setDragConnectPos(pt);
        return;
      }
      if (drawSessionRef.current) {
        const points = drawSessionRef.current.points;
        const prev = points[points.length - 1];
        if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1.5) {
          points.push(pt);
          setDraftStroke({ ...drawSessionRef.current, points: [...points] });
        }
        return;
      }
      if (eraseSessionRef.current) { onEraseAtPoint?.(pt, eraseSessionRef.current.radius); return; }
      if (resizeNodeRef.current) {
        const s = resizeNodeRef.current;
        const iz = getInteractionZoom();
        const dx = (e.clientX - s.startClientX) / (viewRef.current.scale * iz);
        const dy = (e.clientY - s.startClientY) / (viewRef.current.scale * iz);
        const growsRight = s.corner === 'se' || s.corner === 'ne';
        const growsDown  = s.corner === 'se' || s.corner === 'sw';
        const nw = Math.max(s.minWidth, Math.round(s.startWidth + (growsRight ? dx : -dx)));
        const nh = Math.max(s.minHeight, Math.round(s.startHeight + (growsDown ? dy : -dy)));
        const nx = growsRight ? s.startX : s.startX + s.startWidth - nw;
        const ny = growsDown  ? s.startY : s.startY + s.startHeight - nh;
        onResizeNode?.(s.nodeId, { x: nx, y: ny, width: nw, height: nh });
        return;
      }
      if (dragNodeRef.current) {
        const s = dragNodeRef.current;
        const iz = getInteractionZoom();
        const dx = (e.clientX - s.startClientX) / (viewRef.current.scale * iz);
        const dy = (e.clientY - s.startClientY) / (viewRef.current.scale * iz);
        let nextPoint = { x: s.startX + dx, y: s.startY + dy };
        if (snapToGuides) nextPoint = snapPointToGuides(nextPoint, guides);
        onMoveNode?.(s.nodeId, nextPoint);
        return;
      }
      if (lassoRef.current) {
        lassoRef.current.endX = pt.x; lassoRef.current.endY = pt.y;
        if (Math.abs(pt.x - lassoRef.current.startX) > 5 || Math.abs(pt.y - lassoRef.current.startY) > 5) lassoRef.current.active = true;
        if (lassoRef.current.active) {
          setLassoRect({ x: Math.min(lassoRef.current.endX, lassoRef.current.startX), y: Math.min(lassoRef.current.endY, lassoRef.current.startY), w: Math.abs(lassoRef.current.endX - lassoRef.current.startX), h: Math.abs(lassoRef.current.endY - lassoRef.current.startY) });
        }
        return;
      }
      if (!panRef.current) return;
      const session = panRef.current;
      if (Math.abs(e.clientX - session.clientX) > 2 || Math.abs(e.clientY - session.clientY) > 2) panMovedRef.current = true;
      const iz = getInteractionZoom();
      setViewAndRef(prev => ({ ...prev, x: session.startX + (e.clientX - session.clientX) / iz, y: session.startY + (e.clientY - session.clientY) / iz }));
    };

    const onUp = (e) => {
      // Drag-to-connect: complete or cancel
      if (dragConnectRef.current) {
        const { sourceNodeId, hasMoved } = dragConnectRef.current;
        dragConnectRef.current = null;
        setDragConnectInfo(null);
        setDragConnectPos(null);
        if (!hasMoved) {
          // Quick click on port dot — keep pendingEdgeSource set (click-to-connect mode)
          return;
        }
        // Actual drag — find node under cursor via DOM hit test
        let el = document.elementFromPoint(e.clientX, e.clientY);
        while (el && !el.getAttribute?.('data-node-id')) el = el?.parentElement;
        const targetId = el?.getAttribute?.('data-node-id');
        if (targetId && targetId !== sourceNodeId) {
          onCompleteEdgeRef.current?.(targetId);
        } else {
          onCancelEdgeRef.current?.();
        }
        return;
      }
      if (lassoRef.current) {
        const lasso = lassoRef.current;
        if (lasso.active) {
          const rectX = Math.min(lasso.startX, lasso.endX), rectY = Math.min(lasso.startY, lasso.endY);
          const rectW = Math.abs(lasso.endX - lasso.startX), rectH = Math.abs(lasso.endY - lasso.startY);
          const selected = (nodesRef.current || []).filter(node => {
            const nw = getNodeWidth(node), nh = node.height || (node.type === 'sticky' ? 120 : 140);
            return node.x < rectX + rectW && node.x + nw > rectX && node.y < rectY + rectH && node.y + nh > rectY;
          }).map(n => n.id);
          if (selected.length > 0) { onMultiSelect?.(selected); lassoDidSelectRef.current = true; }
          else onSelectNode?.(null);
        }
        lassoRef.current = null; setLassoRect(null); return;
      }
      if (drawSessionRef.current) {
        const stroke = drawSessionRef.current;
        if ((stroke.points || []).length > 1) onAddDrawingStroke?.({ tool: stroke.tool, color: stroke.color, width: stroke.width, opacity: stroke.opacity, points: stroke.points });
      }
      drawSessionRef.current = null; eraseSessionRef.current = null; setDraftStroke(null);
      resizeNodeRef.current = null; dragNodeRef.current = null; panRef.current = null; setIsPanning(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [guides, onMoveNode, onResizeNode, onAddDrawingStroke, onEraseAtPoint, onMultiSelect, onSelectNode, snapToGuides]);

  // Wheel zoom
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const iz = getInteractionZoom();
      const pointerX = (e.clientX - rect.left) / iz;
      const pointerY = (e.clientY - rect.top) / iz;
      setViewAndRef(prev => {
        const nextScale = clamp(prev.scale + (e.deltaY < 0 ? 0.08 : -0.08), 0.1, 3.0);
        const boardX = (pointerX - prev.x) / prev.scale;
        const boardY = (pointerY - prev.y) / prev.scale;
        return { scale: nextScale, x: pointerX - boardX * nextScale, y: pointerY - boardY * nextScale };
      });
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  // ── Node interaction handlers ─────────────────────────────────────────────
  const isDrawMode = drawTool === 'pen' || drawTool === 'highlighter';

  const handleNodeMouseDown = (e, node) => {
    if (e.button !== 0) return;
    if (e.target?.dataset?.nodeResize === 'true') return;
    e.stopPropagation();
    dragNodeRef.current = { nodeId: node.id, startClientX: e.clientX, startClientY: e.clientY, startX: node.x, startY: node.y };
  };

  const handleNodeResizeMouseDown = (e, node, corner) => {
    e.stopPropagation(); e.preventDefault();
    const nw = getNodeWidth(node), nh = node.height || (node.type === 'sticky' ? 120 : 140);
    resizeNodeRef.current = { nodeId: node.id, corner, startClientX: e.clientX, startClientY: e.clientY, startX: node.x, startY: node.y, startWidth: nw, startHeight: nh, minWidth: node.type === 'sticky' ? 100 : 160, minHeight: 80 };
  };

  const handleNodeClick = (e, node) => {
    e.stopPropagation();
    if (dragNodeRef.current && Math.abs(e.clientX - dragNodeRef.current.startClientX) > 3) return;
    if (pendingEdgeSource && pendingEdgeSource !== node.id) { onCompleteEdge?.(node.id); return; }
    onSelectNode?.(node.id);
    if (focusModeNodeId !== null) setFocusModeNodeId(node.id);
  };

  const handleNodeDoubleClick = (e, node) => { e.stopPropagation(); setEditingNodeId(node.id); };

  const handleNodeContextMenu = (e, node) => { e.preventDefault(); e.stopPropagation(); openContextMenu(e.clientX, e.clientY, { nodeId: node.id }); };

  const handleEditBlur = (e) => {
    const nodeEl = e.currentTarget?.closest?.('[data-node-card="true"]');
    if (nodeEl && nodeEl.contains(e.relatedTarget)) return;
    setEditingNodeId(null);
  };

  const handleBackgroundMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target?.dataset?.nodeCard === 'true') return;
    if (e.button === 0 && isDrawMode) {
      const pt = toBoardPoint(e.clientX, e.clientY);
      const width = drawTool === 'highlighter' ? Math.max(8, drawWidth * 2.2) : drawWidth;
      const opacity = drawTool === 'highlighter' ? 0.35 : 0.95;
      drawSessionRef.current = { tool: drawTool, color: drawColor, width, opacity, points: [pt] };
      setDraftStroke({ ...drawSessionRef.current, points: [pt] });
      return;
    }
    if (e.button === 0 && drawTool === 'eraser') { eraseSessionRef.current = { radius: Math.max(8, drawWidth * 3) }; return; }
    if (toolMode === 'pan' || spacePressed || e.button === 1) {
      panRef.current = { startX: viewRef.current.x, startY: viewRef.current.y, clientX: e.clientX, clientY: e.clientY };
      panMovedRef.current = false; setIsPanning(true); return;
    }
    if (toolMode === 'select') {
      const pt = toBoardPoint(e.clientX, e.clientY);
      lassoRef.current = { startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y, active: false };
    }
  };

  const handleBackgroundClick = (e) => {
    if (panMovedRef.current) return;
    if (lassoDidSelectRef.current) { lassoDidSelectRef.current = false; return; }
    if (e.target?.dataset?.nodeCard === 'true') return;
    if (pendingEdgeSource) onCancelEdge?.();
    if (placementType && toolMode !== 'pan') {
      let boardPt = toBoardPoint(e.clientX, e.clientY);
      if (snapToGuides) boardPt = snapPointToGuides(boardPt, guides);
      onAddNodeAt?.(placementType, boardPt); onPlacementConsumed?.(); return;
    }
    onSelectNode?.(null);
    if (commentingNodeId) setCommentingNodeId(null);
  };

  const handleBackgroundDoubleClick = (e) => {
    if (e.target?.dataset?.nodeCard === 'true') return;
    if (toolMode !== 'select') return;
    let boardPt = toBoardPoint(e.clientX, e.clientY);
    if (snapToGuides) boardPt = snapPointToGuides(boardPt, guides);
    onAddNodeAt?.(defaultAddType, boardPt);
  };

  const handleCanvasContextMenu = (e) => {
    const nodeEl = e.target instanceof HTMLElement ? e.target.closest('[data-node-card="true"]') : null;
    if (nodeEl) return;
    e.preventDefault();
    const boardPoint = toBoardPoint(e.clientX, e.clientY);
    openContextMenu(e.clientX, e.clientY, { boardPoint });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const boardPt = toBoardPoint(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) { onFilesDropped?.(files, boardPt); return; }
    const text = e.dataTransfer?.getData('text/plain') || '';
    if (!text.trim()) return;
    let parsed = null;
    const fenceMatch = text.match(/```board-patch\s*([\s\S]*?)(?:```|$)/);
    if (fenceMatch) { try { parsed = JSON.parse(fenceMatch[1].trim()); } catch {} }
    if (!parsed) { try { const p = JSON.parse(text); if (p && Array.isArray(p.nodes)) parsed = p; } catch {} }
    if (parsed && Array.isArray(parsed.nodes)) { onAddNodeAt?.('_batch_patch', boardPt, parsed); }
  };

  // ── Cursor ───────────────────────────────────────────────────────────────
  const viewportCursor = isPanning ? 'cursor-grabbing'
    : drawTool === 'eraser' ? 'cursor-cell'
    : isDrawMode ? 'cursor-crosshair'
    : toolMode === 'pan' || spacePressed ? 'cursor-grab'
    : placementType ? 'cursor-crosshair'
    : lassoRect ? 'cursor-crosshair'
    : 'cursor-default';

  const isEmptyBoard = !nodes || nodes.length === 0;
  const username = (typeof window.appAPI?.getUsername === 'function' ? window.appAPI?.getUsername() : null) || 'You';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[540px] rounded-xl overflow-hidden"
      style={{
        background: 'var(--hp-surface-dark, #0c1220)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Floating top-right controls (glass pill) ── */}
      <div
        className="absolute top-2 right-2 z-30 flex items-center gap-1 px-2 py-1 rounded-xl select-none"
        style={{ background: 'rgba(10,14,28,0.82)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.3)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Search */}
        <button type="button" title="Search board (Ctrl+F)" onClick={() => setSearchOpen(s => !s)}
          className="h-6 w-6 rounded flex items-center justify-center text-sm transition-colors"
          style={{ background: searchOpen ? 'rgba(99,102,241,0.3)' : 'transparent', color: searchOpen ? '#a5b4fc' : '#64748b' }}
        >⌕</button>

        {/* Filter */}
        <button type="button" title="Filter node layers" onClick={() => setFilterPanelOpen(s => !s)}
          className="h-6 w-6 rounded flex items-center justify-center text-sm transition-colors"
          style={{ background: filterPanelOpen || hiddenLayers.size > 0 ? 'rgba(245,158,11,0.2)' : 'transparent', color: filterPanelOpen || hiddenLayers.size > 0 ? '#fbbf24' : '#64748b' }}
        >☰</button>

        {/* Review mode */}
        <button type="button" title="Design review mode" onClick={() => setReviewMode(m => !m)}
          className="h-6 px-1.5 rounded text-[10px] font-semibold transition-colors"
          style={{ background: reviewMode ? 'rgba(139,92,246,0.3)' : 'transparent', color: reviewMode ? '#c084fc' : '#64748b' }}
        >Review</button>

        {/* Minimap toggle */}
        <button type="button" title="Toggle minimap" onClick={() => setShowMinimap(m => !m)}
          className="h-6 w-6 rounded flex items-center justify-center text-[11px] transition-colors"
          style={{ color: showMinimap ? '#94a3b8' : '#475569' }}
        >⊞</button>

        <div style={{ width: '1px', height: '14px', background: 'rgba(100,116,139,0.4)' }} />

        {/* Zoom to fit */}
        <button type="button" title="Zoom to fit (Ctrl+0)" onClick={handleZoomToFit}
          className="h-6 px-1.5 rounded text-[10px] text-slate-300 hover:text-white transition-colors"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >Fit</button>

        {/* Zoom to selection */}
        <button type="button" title="Zoom to selection" onClick={handleZoomToSelection}
          className="h-6 w-6 rounded flex items-center justify-center text-sm text-slate-400 hover:text-white transition-colors"
        >⊡</button>

        {/* Zoom in */}
        <button type="button" title="Zoom in"
          onClick={() => animateViewTo({ ...viewRef.current, scale: clamp(viewRef.current.scale + 0.15, 0.1, 3.0) })}
          className="h-6 w-6 rounded text-slate-300 hover:text-white transition-colors text-sm"
        >+</button>

        <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#64748b', minWidth: '36px', textAlign: 'center' }}>
          {Math.round(view.scale * 100)}%
        </span>

        {/* Zoom out */}
        <button type="button" title="Zoom out"
          onClick={() => animateViewTo({ ...viewRef.current, scale: clamp(viewRef.current.scale - 0.15, 0.1, 3.0) })}
          className="h-6 w-6 rounded text-slate-300 hover:text-white transition-colors text-sm"
        >−</button>

        <div style={{ width: '1px', height: '14px', background: 'rgba(100,116,139,0.4)' }} />

        {/* Export SVG */}
        <button type="button" title="Export board as SVG" onClick={handleExportSVG}
          className="h-6 px-1.5 rounded text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >↓ SVG</button>

        {/* Save snapshot */}
        {onSaveBoardSnapshot && (
          <button type="button" title="Save version snapshot" onClick={onSaveBoardSnapshot}
            className="h-6 px-1.5 rounded text-[10px] text-slate-400 hover:text-amber-300 transition-colors"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >◷</button>
        )}
      </div>

      {/* Review mode summary bar */}
      {reviewMode && reviewSummary && (
        <div
          className="absolute top-2 left-2 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg select-none"
          style={{ background: 'rgba(10,14,28,0.82)', backdropFilter: 'blur(8px)', border: '1px solid rgba(139,92,246,0.4)', fontFamily: 'system-ui, sans-serif', fontSize: '11px' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <span style={{ color: '#c084fc', fontWeight: 700 }}>Review Mode</span>
          <span style={{ color: '#4ade80' }}>✓ {reviewSummary.approved}</span>
          <span style={{ color: '#f87171' }}>✕ {reviewSummary.concern}</span>
          <span style={{ color: '#fbbf24' }}>? {reviewSummary.question}</span>
          <span style={{ color: '#475569' }}>○ {reviewSummary.unreviewed}</span>
          <button onClick={() => setReviewMode(false)} style={{ color: '#64748b', marginLeft: '2px' }}>✕</button>
        </div>
      )}

      {/* Focus mode indicator */}
      {focusModeNodeId && !reviewMode && (
        <div
          className="absolute top-2 left-2 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg select-none"
          style={{ background: 'rgba(10,14,28,0.82)', backdropFilter: 'blur(8px)', border: '1px solid rgba(245,158,11,0.4)', fontFamily: 'system-ui, sans-serif', fontSize: '11px' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <span style={{ color: '#fbbf24' }}>Focus Mode</span>
          <button onClick={() => setFocusModeNodeId(null)} style={{ color: '#64748b' }}>✕ Exit</button>
        </div>
      )}

      {/* Search bar (slides down from top) */}
      {searchOpen && (
        <div
          className="absolute left-2 right-2 z-[25] flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ top: '44px', background: 'rgba(10,14,28,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(99,102,241,0.4)' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#64748b', flexShrink: 0 }}>Search:</span>
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); } }}
            placeholder="Title, description, or tag…"
            className="flex-1 bg-transparent border-b outline-none"
            style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '13px', color: '#f1f5f9', borderColor: 'rgba(99,102,241,0.5)', paddingBottom: '2px' }}
          />
          {searchMatchIds && <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#818cf8', flexShrink: 0 }}>{searchMatchIds.size} found</span>}
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} style={{ color: '#64748b', fontSize: '12px' }}>✕</button>
        </div>
      )}

      {/* Filter panel (floating, below controls) */}
      {filterPanelOpen && (
        <div
          className="absolute z-[25] p-3 rounded-xl"
          style={{ top: '44px', right: '8px', background: 'rgba(10,14,28,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.4)', minWidth: '155px' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>Node Layers</div>
          {DOMAIN_LAYERS.map(layer => {
            const isHidden = hiddenLayers.has(layer.id);
            return (
              <button key={layer.id} type="button"
                onClick={() => setHiddenLayers(prev => { const next = new Set(prev); if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id); return next; })}
                className="flex items-center gap-2 w-full text-left py-1 px-1 rounded"
                style={{ background: 'transparent' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isHidden ? 'transparent' : layer.color, border: `1.5px solid ${layer.color}`, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '12px', color: isHidden ? '#475569' : '#cbd5e1', textDecoration: isHidden ? 'line-through' : 'none' }}>{layer.label}</span>
              </button>
            );
          })}
          {hiddenLayers.size > 0 && (
            <button type="button" onClick={() => setHiddenLayers(new Set())}
              style={{ marginTop: '8px', width: '100%', textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#818cf8' }}
            >Show all</button>
          )}
        </div>
      )}

      {/* Edge legend (top-left, collapsible) */}
      <div className="absolute z-20 select-none" style={{ top: '8px', left: '8px' }} onMouseDown={e => e.stopPropagation()}>
        <button type="button" onClick={() => setLegendOpen(s => !s)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg"
          style={{ background: 'rgba(10,14,28,0.8)', border: '1px solid rgba(100,116,139,0.35)', fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#64748b' }}
        >
          <span>Connections</span><span style={{ fontSize: '8px' }}>{legendOpen ? '▲' : '▼'}</span>
        </button>
        {legendOpen && (
          <div className="absolute top-8 left-0 p-2.5 rounded-lg" style={{ background: 'rgba(10,14,28,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.4)', minWidth: '148px' }}>
            {EDGE_LEGEND.map(({ type, label }) => (
              <div key={type} className="flex items-center gap-2 py-0.5">
                <svg width="28" height="10" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="5" x2="20" y2="5" stroke={EDGE_COLORS[type]} strokeWidth={EDGE_STROKE_WIDTHS[type] || 2} strokeDasharray={EDGE_DASH_PATTERNS[type] || undefined} />
                  <polygon points="20,2 28,5 20,8" fill={EDGE_COLORS[type]} />
                </svg>
                <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#94a3b8' }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending edge prompt (hidden while drag-connecting — ghost line serves as feedback) */}
      {pendingEdgeSource && !dragConnectInfo && (
        <div className="absolute z-20 flex items-center gap-2 rounded-lg px-2 py-1 pointer-events-none" style={{ top: '44px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(30,58,138,0.8)', border: '1px solid rgba(147,197,253,0.5)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#bfdbfe' }}>Click a target node to connect</span>
          <button type="button" onClick={onCancelEdge} className="pointer-events-auto" style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#93c5fd', border: '1px solid rgba(147,197,253,0.5)', borderRadius: '4px', padding: '1px 8px' }}>Cancel</button>
        </div>
      )}

      {/* ── Canvas viewport ── */}
      <div
        ref={viewportRef}
        className={`absolute inset-0 ${viewportCursor}`}
        style={{ bottom: '28px' }}
        onMouseDown={handleBackgroundMouseDown}
        onClick={handleBackgroundClick}
        onDoubleClick={handleBackgroundDoubleClick}
        onContextMenu={handleCanvasContextMenu}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Dot grid background */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.2) 1.5px, transparent 1.5px)',
          backgroundSize: `${32 * view.scale}px ${32 * view.scale}px`,
          backgroundPosition: `${view.x % (32 * view.scale)}px ${view.y % (32 * view.scale)}px`,
        }} />

        {/* Radial vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)',
        }} />

        {/* World transform container */}
        <div className="absolute left-0 top-0 origin-top-left" style={{
          width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}>
          {/* SVG layer: guides + edges + drawings */}
          <svg width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute left-0 top-0 pointer-events-none" style={{ overflow: 'visible' }}>
            <defs>
              {Object.entries(EDGE_COLORS).map(([type, color]) => (
                <React.Fragment key={type}>
                  <marker id={`gd-arrow-end-${type}`} viewBox="0 0 10 8" refX="9" refY="4" markerWidth="9" markerHeight="8" orient="auto"><path d="M0 0 L10 4 L0 8z" fill={color} /></marker>
                  <marker id={`gd-arrow-start-${type}`} viewBox="0 0 10 8" refX="1" refY="4" markerWidth="9" markerHeight="8" orient="auto"><path d="M10 0 L0 4 L10 8z" fill={color} /></marker>
                </React.Fragment>
              ))}
            </defs>

            {/* Guide grid */}
            {guideSpec && (
              <g>
                {guideSpec.columns.map((label, idx) => {
                  const x = guideSpec.originX + idx * guideSpec.cellWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + CANVAS_CENTER;
                  return (
                    <g key={`col-${idx}`}>
                      <rect x={x} y={y - guideSpec.headerHeight} width={guideSpec.cellWidth - 2} height={guideSpec.headerHeight - 6} fill={idx % 2 === 0 ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.1)'} stroke="rgba(148,163,184,0.28)" />
                      <text x={x + guideSpec.cellWidth / 2} y={y - guideSpec.headerHeight / 2} fill="rgba(226,232,240,0.88)" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Cinzel', serif" }} textAnchor="middle" dominantBaseline="middle">{label}</text>
                    </g>
                  );
                })}
                {guideSpec.lanes.map((label, idx) => {
                  const x = guideSpec.originX - guideSpec.leftRailWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + idx * guideSpec.cellHeight + CANVAS_CENTER;
                  return (
                    <g key={`lane-${idx}`}>
                      <rect x={x} y={y} width={guideSpec.leftRailWidth} height={guideSpec.cellHeight - 2} fill={idx % 2 === 0 ? 'rgba(125,211,252,0.16)' : 'rgba(134,239,172,0.14)'} stroke="rgba(148,163,184,0.25)" />
                      <text x={x + guideSpec.leftRailWidth / 2} y={y + guideSpec.cellHeight / 2} fill="rgba(15,23,42,0.88)" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Cinzel', serif" }} textAnchor="middle" dominantBaseline="middle">{label}</text>
                    </g>
                  );
                })}
                {guideSpec.columns.map((_, cIdx) => guideSpec.lanes.map((__, rIdx) => {
                  const x = guideSpec.originX + cIdx * guideSpec.cellWidth + CANVAS_CENTER;
                  const y = guideSpec.originY + rIdx * guideSpec.cellHeight + CANVAS_CENTER;
                  return <rect key={`cell-${cIdx}-${rIdx}`} x={x} y={y} width={guideSpec.cellWidth - 2} height={guideSpec.cellHeight - 2} fill={rIdx % 2 === 0 ? 'rgba(255,255,255,0.76)' : 'rgba(248,250,252,0.82)'} stroke="rgba(148,163,184,0.2)" />;
                }))}
              </g>
            )}

            {/* Edges */}
            {edgeLines.map((edge) => {
              const edgeColor = EDGE_COLORS[edge.relationType] || EDGE_COLOR_DEFAULT;
              const typeKey   = EDGE_COLORS[edge.relationType] ? edge.relationType : 'supports';
              const isHovered = hoveredEdgeId === edge.id;
              const sw        = EDGE_STROKE_WIDTHS[edge.relationType] || 2;
              const dash      = EDGE_DASH_PATTERNS[edge.relationType];
              return (
                <g key={edge.id}>
                  {/* Wide transparent hit target */}
                  <path d={edge.pathD} fill="none" stroke="transparent" strokeWidth="14"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingEdgeId === edge.id) { setEditingEdgeId(null); setEdgeLabelDraft(''); }
                      else { setEditingEdgeId(edge.id); setEdgeLabelDraft(edge.label || ''); }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openContextMenu(e.clientX, e.clientY, { edgeId: edge.id });
                    }}
                  />
                  {/* Hover glow */}
                  {isHovered && <path d={edge.pathD} fill="none" stroke={edgeColor} strokeWidth={sw + 5} strokeOpacity={0.2} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />}
                  {/* Main path */}
                  <path d={edge.pathD} fill="none" stroke={edgeColor}
                    strokeWidth={isHovered ? sw + 0.5 : sw}
                    strokeOpacity={isHovered ? 1 : 0.82}
                    strokeLinejoin="round"
                    strokeDasharray={dash}
                    markerEnd={`url(#gd-arrow-end-${typeKey})`}
                    markerStart={edge.isTwoWay ? `url(#gd-arrow-start-${typeKey})` : undefined}
                    style={{ pointerEvents: 'none', transition: 'stroke-width 120ms, stroke-opacity 120ms' }}
                  />
                  {/* Edge label */}
                  {edge.label && editingEdgeId !== edge.id && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={edge.midpoint.x - 42} y={edge.midpoint.y - 9} width={84} height={18} rx={4} fill="rgba(10,14,28,0.88)" stroke={edgeColor} strokeWidth={0.8} strokeOpacity={0.6} />
                      <text x={edge.midpoint.x} y={edge.midpoint.y} textAnchor="middle" dominantBaseline="middle" fill={edgeColor} style={{ fontSize: 10, fontFamily: "'Crimson Text', Georgia, serif", fontStyle: 'italic' }}>
                        {edge.label.length > 20 ? edge.label.slice(0, 18) + '…' : edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Drag-to-connect ghost line */}
            {dragConnectInfo && dragConnectPos && (() => {
              const src = nodeMap.get(dragConnectInfo.sourceNodeId);
              if (!src) return null;
              const sw = getNodeWidth(src), sh = src.height || 140;
              const scx = src.x + sw / 2 + CANVAS_CENTER, scy = src.y + sh / 2 + CANVAS_CENTER;
              const tcx = dragConnectPos.x + CANVAS_CENTER, tcy = dragConnectPos.y + CANVAS_CENTER;
              const srcPort = getNearestPort(scx, scy, sw / 2, sh / 2, tcx, tcy);
              const d = orthoSvgPath(srcPort.x, srcPort.y, tcx, tcy, srcPort.side, 10);
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <path d={d} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="8 4" strokeOpacity={0.8} strokeLinecap="round" />
                  <circle cx={tcx} cy={tcy} r={6} fill="#6366f1" fillOpacity={0.3} stroke="#818cf8" strokeWidth={1.5} />
                </g>
              );
            })()}

            {/* Freehand drawings */}
            {(drawings || []).map((stroke) => {
              const points = (stroke.points || []).map(p => ({ x: p.x + CANVAS_CENTER, y: p.y + CANVAS_CENTER }));
              const d = pointsToPath(points);
              if (!d) return null;
              return <path key={stroke.id} d={d} fill="none" stroke={stroke.color || '#60a5fa'} strokeOpacity={Number.isFinite(stroke.opacity) ? stroke.opacity : 1} strokeWidth={Math.max(1, Number(stroke.width) || 3)} strokeLinecap="round" strokeLinejoin="round" />;
            })}
            {draftStroke && (() => {
              const points = (draftStroke.points || []).map(p => ({ x: p.x + CANVAS_CENTER, y: p.y + CANVAS_CENTER }));
              const d = pointsToPath(points);
              if (!d) return null;
              return <path d={d} fill="none" stroke={draftStroke.color || '#60a5fa'} strokeOpacity={Number.isFinite(draftStroke.opacity) ? draftStroke.opacity : 0.9} strokeWidth={Math.max(1, Number(draftStroke.width) || 3)} strokeLinecap="round" strokeLinejoin="round" />;
            })()}
          </svg>

          {/* Lasso selection rect */}
          {lassoRect && (
            <div className="absolute pointer-events-none" style={{
              left: `${lassoRect.x + CANVAS_CENTER}px`, top: `${lassoRect.y + CANVAS_CENTER}px`,
              width: `${Math.max(1, lassoRect.w)}px`, height: `${Math.max(1, lassoRect.h)}px`,
              border: '2px dashed #818cf8', background: 'rgba(99,102,241,0.07)', zIndex: 10, borderRadius: '2px',
            }} />
          )}

          {/* Inline edge label editor */}
          {editingEdgeId && (() => {
            const edgeLine = edgeLines.find(e => e.id === editingEdgeId);
            if (!edgeLine) return null;
            return (
              <div className="absolute" style={{ left: `${edgeLine.midpoint.x - 72}px`, top: `${edgeLine.midpoint.y - 14}px`, zIndex: 30, pointerEvents: 'all' }}
                onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              >
                <input autoFocus type="text" value={edgeLabelDraft} onChange={e => setEdgeLabelDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onUpdateEdge?.(editingEdgeId, { label: edgeLabelDraft.trim() }); setEditingEdgeId(null); setEdgeLabelDraft(''); }
                    if (e.key === 'Escape') { setEditingEdgeId(null); setEdgeLabelDraft(''); }
                  }}
                  onBlur={() => { onUpdateEdge?.(editingEdgeId, { label: edgeLabelDraft.trim() }); setEditingEdgeId(null); setEdgeLabelDraft(''); }}
                  placeholder="Edge label…"
                  style={{ width: '144px', background: 'rgba(10,14,28,0.95)', border: '1px solid rgba(129,140,248,0.7)', borderRadius: '4px', color: '#c7d2fe', fontSize: '11px', fontFamily: "'Crimson Text', Georgia, serif", fontStyle: 'italic', padding: '2px 6px', outline: 'none' }}
                />
              </div>
            );
          })()}

          {/* ── FRAME NODES (render behind all other nodes) ── */}
          {(nodes || []).filter(n => n.type === 'frame').map((node) => {
            const color = GAME_DESIGN_NODE_TYPE_COLORS.frame;
            const isSelected = selectedNodeId === node.id || (selectedNodeIds ? selectedNodeIds.has(node.id) : false);
            const isEditing = editingNodeId === node.id;
            const nodeWidth = getNodeWidth(node);
            const nodeHeight = getDefaultNodeHeight(node);
            const opacity = getNodeOpacity(node.id);
            if (opacity === 0) return null;
            return (
              <article
                key={node.id}
                data-node-card="true"
                data-node-id={node.id}
                style={{
                  position: 'absolute',
                  left: `${node.x + CANVAS_CENTER}px`,
                  top: `${node.y + CANVAS_CENTER}px`,
                  width: `${nodeWidth}px`,
                  height: `${nodeHeight}px`,
                  border: `2px solid ${isSelected ? color : color + '60'}`,
                  borderRadius: '14px',
                  background: 'rgba(100,116,139,0.04)',
                  backdropFilter: 'none',
                  zIndex: 0,
                  opacity,
                  transition: 'border-color 150ms, box-shadow 150ms',
                  boxShadow: isSelected ? `0 0 0 2px ${color}60, 0 0 20px ${color}20` : 'none',
                  overflow: 'visible',
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => handleNodeClick(e, node)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
              >
                {/* Resize handles */}
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <div key={corner} data-node-resize="true"
                    onMouseDown={(e) => handleNodeResizeMouseDown(e, node, corner)}
                    style={{
                      position: 'absolute', cursor: CORNER_CURSORS[corner],
                      top: corner[0] === 'n' ? -4 : undefined, bottom: corner[0] === 's' ? -4 : undefined,
                      left: corner[1] === 'w' ? -4 : undefined, right: corner[1] === 'e' ? -4 : undefined,
                      width: 12, height: 12, borderRadius: '2px',
                      background: isSelected ? color : 'transparent',
                      border: isSelected ? '1px solid rgba(255,255,255,0.3)' : 'none',
                      opacity: isSelected ? 1 : 0, zIndex: 5,
                      transition: 'opacity 150ms',
                    }}
                  />
                ))}
                {/* Frame label */}
                <div style={{
                  position: 'absolute', top: '-26px', left: '8px',
                  background: color + '22', border: `1px solid ${color}50`,
                  borderRadius: '6px', padding: '2px 10px',
                }}>
                  {isEditing ? (
                    <input
                      ref={editTitleRef}
                      value={node.title || ''}
                      onChange={e => onUpdateNode?.(node.id, { title: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingNodeId(null); }}
                      onBlur={() => setEditingNodeId(null)}
                      style={{ background: 'transparent', outline: 'none', fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 700, color, minWidth: '80px' }}
                    />
                  ) : (
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 700, color }}>{node.title || 'Frame'}</span>
                  )}
                </div>
              </article>
            );
          })}

          {/* ── NODE CARDS ── */}
          {(nodes || []).filter(n => n.type !== 'frame').map((node) => {
            const color      = GAME_DESIGN_NODE_TYPE_COLORS[node.type] || '#64748b';
            const tier       = NODE_TIER[node.type] || 2;
            const isSelected = selectedNodeId === node.id || (selectedNodeIds ? selectedNodeIds.has(node.id) : false);
            const isEditing  = editingNodeId === node.id;
            const isSticky   = node.type === 'sticky';
            const isMission  = node.type === 'missionCard';
            const isStrategic = tier === 1;
            const isAnnotation = tier === 4;
            const isRisk     = node.type === 'risk';
            const isPlaytest = node.type === 'playtestFinding';
            const stickyFill   = node.style?.fill   || '#1e3a5f';
            const stickyText   = node.style?.text   || '#e0f2fe';
            const stickyBorder = node.style?.border || '#3b82f6';
            const nodeWidth  = getNodeWidth(node);
            const nodeHeight = getDefaultNodeHeight(node);
            const mission    = node.meta?.mission && typeof node.meta.mission === 'object' ? node.meta.mission : null;
            const mediaSrc   = resolveMediaSrc(node.media);
            const imageMedia = isImageMedia(node.media);
            const videoMedia = isVideoMedia(node.media);
            const opacity    = getNodeOpacity(node.id);
            if (opacity === 0) return null;

            const commentCount = Array.isArray(node.comments) ? node.comments.filter(c => !c.resolved).length : 0;
            const reviewVotes  = node.reviews || {};
            const myVote       = reviewVotes[username];
            const reviewValues = Object.values(reviewVotes);
            const reviewStatus = reviewValues.includes('concern') ? 'concern' : reviewValues.includes('question') ? 'question' : reviewValues.length > 0 ? 'approved' : null;

            // Card background
            const cardBg = isSticky ? stickyFill
              : isRisk      ? 'rgba(24,6,6,0.96)'
              : isPlaytest  ? 'rgba(25,18,4,0.96)'
              : isStrategic ? `rgba(12,18,42,0.97)`
              : '#0c1424';

            return (
              <article
                key={node.id}
                data-node-card="true"
                data-node-id={node.id}
                className="group absolute select-none"
                style={{
                  left: `${node.x + CANVAS_CENTER}px`,
                  top: `${node.y + CANVAS_CENTER}px`,
                  width: `${nodeWidth}px`,
                  minHeight: `${nodeHeight}px`,
                  background: cardBg,
                  borderLeft: isSticky ? undefined : `${isStrategic ? 5 : 4}px solid ${color}`,
                  borderTop:    isSticky ? undefined : `1px solid ${color}28`,
                  borderRight:  isSticky ? undefined : `1px solid ${color}18`,
                  borderBottom: isSticky ? undefined : isRisk ? '1px dashed rgba(248,113,113,0.45)' : `1px solid ${color}18`,
                  borderRadius: isSticky ? '8px 8px 8px 1px' : '12px',
                  boxShadow: isSelected
                    ? `0 0 0 2px ${color}, 0 0 20px ${color}45, 0 6px 24px rgba(0,0,0,0.55)`
                    : isStrategic
                      ? `inset 0 0 24px ${color}0c, 0 4px 18px rgba(0,0,0,0.45)`
                      : '0 3px 14px rgba(0,0,0,0.45)',
                  opacity,
                  overflow: 'hidden',
                  transition: 'transform 150ms ease, box-shadow 150ms ease, opacity 200ms ease',
                  transform: isSelected ? 'translateY(-2px) scale(1.005)' : undefined,
                  zIndex: isSelected ? 10 : 1,
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => handleNodeClick(e, node)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
              >
                {/* Resize handles */}
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <div key={corner} data-node-resize="true"
                    onMouseDown={(e) => handleNodeResizeMouseDown(e, node, corner)}
                    style={{
                      position: 'absolute', cursor: CORNER_CURSORS[corner],
                      top: corner[0] === 'n' ? 0 : undefined, bottom: corner[0] === 's' ? 0 : undefined,
                      left: corner[1] === 'w' ? 0 : undefined, right: corner[1] === 'e' ? 0 : undefined,
                      width: 10, height: 10, borderRadius: '2px',
                      background: isSelected ? `${color}bb` : 'transparent',
                      border: isSelected ? '1px solid rgba(255,255,255,0.25)' : 'none',
                      opacity: isSelected ? 1 : 0, zIndex: 20,
                      transition: 'opacity 150ms',
                    }}
                  />
                ))}

                {/* 8-port connection dots */}
                {PORT_DOT_STYLES.map(({ id: portId, style: portStyle }) => {
                  const isTarget = pendingEdgeSource !== null && pendingEdgeSource !== node.id;
                  const isDragging = dragConnectInfo !== null;
                  return (
                    <button key={portId} type="button"
                      title={isTarget ? 'Connect here' : 'Drag to connect'}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (pendingEdgeSource === node.id) { onCancelEdge?.(); return; }
                        if (isTarget) { onCompleteEdge?.(node.id); return; }
                        // Start drag-to-connect
                        dragConnectRef.current = { sourceNodeId: node.id, hasMoved: false };
                        setDragConnectInfo({ sourceNodeId: node.id });
                        setDragConnectPos(toBoardPoint(e.clientX, e.clientY));
                        onStartEdgeRef.current?.(node.id);
                      }}
                      style={{
                        position: 'absolute', ...portStyle,
                        zIndex: 20, width: 12, height: 12, borderRadius: '50%',
                        background: isTarget || isDragging ? '#10b981' : '#6366f1',
                        border: `1.5px solid ${isTarget || isDragging ? '#6ee7b7' : '#a5b4fc'}`,
                        boxShadow: `0 0 0 3px ${isTarget || isDragging ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        opacity: isTarget ? 1 : 0,
                        transition: 'opacity 150ms, background 100ms',
                        cursor: 'crosshair',
                      }}
                      className="group-hover:opacity-100"
                    />
                  );
                })}

                {/* Comment badge */}
                {commentCount > 0 && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); setCommentingNodeId(commentingNodeId === node.id ? null : node.id); }}
                    style={{ position: 'absolute', top: '-8px', right: '-8px', zIndex: 20, minWidth: 18, height: 18, padding: '0 4px', borderRadius: '9px', background: '#6366f1', color: 'white', fontSize: '9px', fontWeight: 800, border: '1px solid rgba(255,255,255,0.25)', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >{commentCount}</button>
                )}

                {/* Review badge */}
                {reviewMode && reviewStatus && (
                  <div style={{ position: 'absolute', top: '-8px', left: '-8px', zIndex: 20, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800,
                    background: reviewStatus === 'approved' ? '#166534' : reviewStatus === 'concern' ? '#7f1d1d' : '#78350f',
                    border: `1px solid ${reviewStatus === 'approved' ? '#4ade80' : reviewStatus === 'concern' ? '#f87171' : '#fbbf24'}`,
                  }}>
                    {reviewStatus === 'approved' ? '✓' : reviewStatus === 'concern' ? '✕' : '?'}
                  </div>
                )}

                {/* ── NODE HEADER ── */}
                {!isSticky && (
                  <header style={{
                    padding: isStrategic ? '9px 12px 8px' : '7px 10px 6px',
                    background: isStrategic
                      ? `linear-gradient(90deg, ${color}48 0%, ${color}18 55%, transparent 100%)`
                      : `${color}1e`,
                    borderBottom: `1px solid ${color}38`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                  }}>
                    <span style={{
                      fontFamily: 'system-ui, sans-serif',
                      fontSize: '9px', fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase',
                      color, background: `${color}1e`, borderRadius: '4px', padding: '2px 7px',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <NodeTypeIcon type={node.type} size={11} color={color} />
                      {GAME_DESIGN_NODE_TYPE_LABELS[node.type] || node.type}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', opacity: 0, transition: 'opacity 150ms' }} className="group-hover:opacity-100">
                      {node.link?.url && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenLink?.(node.link.url); }}
                          style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(29,78,216,0.6)', color: '#bfdbfe' }}>Open</button>
                      )}
                      {pendingEdgeSource === node.id ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onCancelEdge?.(); }}
                          style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(127,29,29,0.6)', color: '#fca5a5' }}>Cancel</button>
                      ) : (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onStartEdge?.(node.id); }}
                          style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: `${color}28`, color }}>Link</button>
                      )}
                    </div>
                  </header>
                )}

                {/* ── NODE BODY ── */}
                {isEditing ? (
                  <div style={{ padding: '10px 12px' }}>
                    <input ref={editTitleRef} value={node.title || ''} onChange={(e) => onUpdateNode?.(node.id, { title: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.parentElement?.querySelector('textarea')?.focus(); if (e.key === 'Escape') setEditingNodeId(null); }}
                      onBlur={handleEditBlur}
                      style={{ width: '100%', background: 'transparent', outline: 'none', borderBottom: `1px solid ${color}50`, marginBottom: '8px', color: isSticky ? stickyText : '#f1f5f9', fontFamily: "'Cinzel', serif", fontSize: isStrategic ? '14px' : '13px', fontWeight: 700, padding: '0 0 4px' }}
                      placeholder="Title"
                    />
                    <textarea value={node.description || ''} onChange={(e) => onUpdateNode?.(node.id, { description: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEditingNodeId(null); }}
                      onBlur={handleEditBlur}
                      style={{ width: '100%', minHeight: '40px', background: 'transparent', outline: 'none', resize: 'vertical', borderBottom: `1px solid ${color}30`, color: isSticky ? stickyText : '#9ca3af', fontFamily: "'Crimson Text', Georgia, serif", fontSize: '12px', lineHeight: '1.5', padding: '0 0 4px' }}
                      placeholder="Description"
                    />
                  </div>
                ) : (
                  <div style={{ padding: isSticky ? '10px 12px' : '10px 12px' }}>
                    {/* Title */}
                    <h4 style={{
                      color: isSticky ? stickyText : '#f1f5f9',
                      fontFamily: "'Cinzel', serif",
                      fontSize: isStrategic ? '15px' : isMission ? '13px' : '13px',
                      fontWeight: isStrategic ? 800 : 700,
                      lineHeight: 1.3, marginBottom: '6px',
                      wordBreak: 'break-words',
                    }}>
                      {node.title || 'Untitled node'}
                    </h4>

                    {/* Description */}
                    {!isMission && (
                      <p style={{
                        color: isSticky ? stickyText : '#9ca3af',
                        fontFamily: "'Crimson Text', Georgia, serif",
                        fontSize: '12px', lineHeight: '1.55',
                        marginBottom: node.description ? '6px' : 0,
                      }}>
                        {node.description || (!isSticky && <em style={{ color: '#374151', fontSize: '11px' }}>No description yet.</em>)}
                      </p>
                    )}

                    {/* Mission card kernel */}
                    {isMission && mission && (
                      <div style={{ borderRadius: '6px', border: `1px solid ${color}35`, background: `${color}0a`, padding: '8px 10px', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                          {mission.headerName
                            ? <span style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '12px', fontWeight: 600, color: '#ddd6fe', wordBreak: 'break-words', minWidth: 0 }}>{mission.headerName}</span>
                            : <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#4b5563', fontStyle: 'italic' }}>No header name</span>
                          }
                          {mission.missionType && (
                            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', background: '#4c1d95', color: '#ddd6fe', padding: '1px 5px', borderRadius: '3px', flexShrink: 0, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase' }}>
                              {mission.missionType === 'brandFantasy' ? 'Brand' : mission.missionType === 'worldProblem' ? 'World' : mission.missionType}
                            </span>
                          )}
                        </div>
                        {(mission.missionId || mission.playtime || mission.season || mission.team) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', marginBottom: '6px', fontFamily: 'system-ui, sans-serif', fontSize: '10px' }}>
                            {mission.missionId && <><span style={{ color: '#6b7280' }}>Code:</span><span style={{ color: '#c4b5fd', textAlign: 'right', wordBreak: 'break-all' }}>{mission.missionId}</span></>}
                            {mission.playtime   && <><span style={{ color: '#6b7280' }}>Playtime:</span><span style={{ color: '#c4b5fd', textAlign: 'right' }}>{mission.playtime}</span></>}
                            {mission.season     && <><span style={{ color: '#6b7280' }}>Season:</span><span style={{ color: '#c4b5fd', textAlign: 'right' }}>{mission.season}</span></>}
                            {mission.team       && <><span style={{ color: '#6b7280' }}>Team:</span><span style={{ color: '#c4b5fd', textAlign: 'right' }}>{mission.team}</span></>}
                          </div>
                        )}
                        {[['npcs', 'NPCs', '#1e293b', '#cbd5e1'], ['locations', 'Locations', '#1e1b4b', '#a5b4fc'], ['systems', 'Systems', '#0d3d34', '#6ee7b7']].map(([key, label, bg, textC]) =>
                          Array.isArray(mission[key]) && mission[key].length > 0 && (
                            <div key={key} style={{ marginBottom: '4px' }}>
                              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{label}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                {mission[key].map(v => <span key={v} style={{ background: bg, color: textC, padding: '0 5px', borderRadius: '3px', fontSize: '9px', fontFamily: 'system-ui, sans-serif' }}>{v}</span>)}
                              </div>
                            </div>
                          )
                        )}
                        {mission.synopsis && (
                          <p style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', borderTop: `1px solid ${color}28`, paddingTop: '6px', marginTop: '4px' }}>{mission.synopsis}</p>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {Array.isArray(node.tags) && node.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '4px' }}>
                        {node.tags.map(tag => (
                          <span key={tag} style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', padding: '1px 6px', borderRadius: '99px', background: `${color}1e`, color, border: `1px solid ${color}35` }}>{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* Dedicated imageNode display */}
                    {node.type === 'imageNode' && (() => {
                      const imgSrc = node.meta?.image?.dataUrl || resolveMediaSrc(node.meta?.image) || (imageMedia ? mediaSrc : '');
                      return imgSrc ? (
                        <img src={imgSrc} alt={node.title || ''} style={{ marginTop: '8px', width: '100%', maxHeight: '160px', borderRadius: '8px', objectFit: 'contain', background: 'rgba(0,0,0,0.35)', border: `1px solid ${color}35` }} draggable={false} />
                      ) : (
                        <div style={{ marginTop: '8px', width: '100%', height: '110px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `2px dashed ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length) onFilesDropped?.(node.id, [...e.dataTransfer.files]); }}
                        >
                          <NodeTypeIcon type="imageNode" size={28} color={color} />
                          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: `${color}99` }}>Drop image here</span>
                        </div>
                      );
                    })()}

                    {/* Dedicated videoPlayer display */}
                    {node.type === 'videoPlayer' && (() => {
                      const vidSrc = resolveMediaSrc(node.meta?.video) || (videoMedia ? mediaSrc : '');
                      return vidSrc ? (
                        <video src={vidSrc} style={{ marginTop: '8px', width: '100%', maxHeight: '140px', borderRadius: '8px', background: '#000', border: `1px solid ${color}35` }} controls preload="metadata" />
                      ) : (
                        <div style={{ marginTop: '8px', width: '100%', height: '110px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `2px dashed ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length) onFilesDropped?.(node.id, [...e.dataTransfer.files]); }}
                        >
                          <NodeTypeIcon type="videoPlayer" size={28} color={color} />
                          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: `${color}99` }}>Drop video here</span>
                        </div>
                      );
                    })()}

                    {/* Generic media (for non-dedicated types) */}
                    {node.type !== 'imageNode' && node.type !== 'videoPlayer' && imageMedia && mediaSrc && <img src={mediaSrc} alt={node.title || ''} style={{ marginTop: '6px', width: '100%', height: '88px', borderRadius: '6px', objectFit: 'cover', border: `1px solid ${color}28` }} draggable={false} />}
                    {node.type !== 'imageNode' && node.type !== 'videoPlayer' && videoMedia && mediaSrc && <video src={mediaSrc} style={{ marginTop: '6px', width: '100%', height: '88px', borderRadius: '6px', background: '#000', border: `1px solid ${color}28` }} controls preload="metadata" />}
                    {node.type !== 'imageNode' && node.type !== 'videoPlayer' && !mediaSrc && (node.media?.path || node.media?.relativePath) && (
                      <p style={{ marginTop: '6px', fontSize: '10px', color: '#f59e0b', wordBreak: 'break-all' }}>Asset: {node.media.relativePath || node.media.path}</p>
                    )}

                    {/* Review vote buttons */}
                    {reviewMode && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${color}22` }}>
                        {[['approved', '✓', '#4ade80', 'rgba(22,101,52,0.6)'], ['concern', '✕', '#f87171', 'rgba(127,29,29,0.6)'], ['question', '?', '#fbbf24', 'rgba(120,53,15,0.6)']].map(([vote, icon, textCol, bg]) => (
                          <button key={vote} type="button"
                            onClick={e => { e.stopPropagation(); handleReviewVote(node.id, vote); }}
                            style={{ flex: 1, padding: '2px 0', borderRadius: '5px', fontSize: '11px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', transition: 'all 120ms', background: myVote === vote ? bg : 'rgba(255,255,255,0.04)', color: myVote === vote ? textCol : '#4b5563', border: `1px solid ${myVote === vote ? textCol + '55' : 'transparent'}` }}
                          >{icon}</button>
                        ))}
                      </div>
                    )}

                    {/* Comment add button (hover) */}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setCommentingNodeId(commentingNodeId === node.id ? null : node.id); }}
                      style={{ width: '100%', textAlign: 'left', marginTop: '4px', fontSize: '10px', color: '#374151', fontFamily: 'system-ui, sans-serif', opacity: 0, transition: 'opacity 150ms', cursor: 'pointer', background: 'transparent' }}
                      className="group-hover:opacity-100"
                    >+ Comment</button>
                  </div>
                )}

                {/* Comment panel */}
                {commentingNodeId === node.id && !isEditing && (
                  <div style={{ borderTop: `1px solid ${color}28`, background: 'rgba(0,0,0,0.22)', padding: '8px 12px' }}
                    onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                  >
                    {Array.isArray(node.comments) && node.comments.filter(c => !c.resolved).map(c => (
                      <div key={c.id} style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontWeight: 700, color }}>{c.author}</span>
                          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#4b5563' }}>{new Date(c.ts).toLocaleDateString()}</span>
                          <button type="button" onClick={() => { const comments = (node.comments || []).map(cm => cm.id === c.id ? { ...cm, resolved: true } : cm); onUpdateNode?.(node.id, { comments }); }}
                            style={{ marginLeft: 'auto', fontSize: '9px', color: '#4b5563', background: 'transparent' }}>✓</button>
                        </div>
                        <p style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '11px', color: '#cbd5e1' }}>{c.text}</p>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <input type="text" value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddComment(node.id); if (e.key === 'Escape') setCommentingNodeId(null); }}
                        placeholder="Add comment…"
                        style={{ flex: 1, background: 'transparent', borderBottom: `1px solid ${color}38`, outline: 'none', fontSize: '11px', color: '#cbd5e1', fontFamily: "'Crimson Text', Georgia, serif", paddingBottom: '2px' }}
                      />
                      <button type="button" onClick={() => handleAddComment(node.id)}
                        style={{ fontSize: '10px', padding: '1px 8px', borderRadius: '4px', background: `${color}28`, color, fontFamily: 'system-ui, sans-serif' }}>Add</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {/* Empty board splash */}
          {isEmptyBoard && (
            <div style={{ position: 'absolute', left: `${CANVAS_CENTER - 190}px`, top: `${CANVAS_CENTER - 130}px`, width: '380px' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ borderRadius: '16px', padding: '28px 24px', textAlign: 'center', background: 'rgba(12,18,36,0.88)', border: '1px solid rgba(100,116,139,0.38)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: 'var(--hp-accent, #D3A625)', marginBottom: '8px' }}>Start Designing</h3>
                <p style={{ fontFamily: "'Crimson Text', Georgia, serif", fontSize: '13px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.5' }}>
                  Double-click the canvas to place a node, or choose a starting point below.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { type: 'pillar',     label: 'Add Pillar',   color: GAME_DESIGN_NODE_TYPE_COLORS.pillar },
                    { type: 'mechanic',   label: 'Add Mechanic', color: GAME_DESIGN_NODE_TYPE_COLORS.mechanic },
                    { type: 'sticky',     label: 'Add Note',     color: GAME_DESIGN_NODE_TYPE_COLORS.sticky },
                  ].map(({ type, label, color }) => (
                    <button key={type} type="button"
                      onClick={e => { e.stopPropagation(); onAddNodeAt?.(type, { x: 0, y: 0 }); }}
                      style={{ padding: '8px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, fontFamily: 'system-ui, sans-serif', background: `${color}1e`, border: `1px solid ${color}45`, color, cursor: 'pointer', transition: 'transform 150ms', }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Minimap ── */}
      {showMinimap && !isEmptyBoard && (
        <div
          className="absolute overflow-hidden rounded-lg"
          style={{ bottom: '36px', right: '8px', width: '180px', height: '110px', background: 'rgba(10,14,28,0.88)', border: '1px solid rgba(100,116,139,0.4)', backdropFilter: 'blur(6px)', zIndex: 20, cursor: 'crosshair' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const SCALE = 180 / CANVAS_SIZE;
            const boardX = (e.clientX - rect.left) / SCALE - CANVAS_CENTER;
            const boardY = (e.clientY - rect.top)  / SCALE - CANVAS_CENTER;
            const viewport = viewportRef.current;
            if (!viewport) return;
            const vr = viewport.getBoundingClientRect();
            const s = viewRef.current.scale;
            animateViewTo({ scale: s, x: vr.width / 2 - (boardX + CANVAS_CENTER) * s, y: vr.height / 2 - (boardY + CANVAS_CENTER) * s });
          }}
        >
          {/* Node dots */}
          {(nodes || []).map(node => {
            const color = GAME_DESIGN_NODE_TYPE_COLORS[node.type] || '#64748b';
            const SCALE = 180 / CANVAS_SIZE;
            const x = (node.x + CANVAS_CENTER) * SCALE;
            const y = (node.y + CANVAS_CENTER) * SCALE;
            return (
              <div key={node.id} style={{ position: 'absolute', left: x, top: y, width: Math.max(3, getNodeWidth(node) * SCALE), height: Math.max(3, (node.height || 140) * SCALE * 0.5), background: color, borderRadius: '1px', opacity: 0.85, transform: 'translate(-50%, -50%)' }} />
            );
          })}
          {/* Viewport rect */}
          {(() => {
            const viewport = viewportRef.current;
            if (!viewport) return null;
            const vr = viewport.getBoundingClientRect();
            const SCALE = 180 / CANVAS_SIZE;
            const vpX = -view.x / view.scale * SCALE;
            const vpY = -view.y / view.scale * SCALE;
            const vpW = (vr.width / view.scale) * SCALE;
            const vpH = ((vr.height - 28) / view.scale) * SCALE;
            return <div style={{ position: 'absolute', left: vpX, top: vpY, width: Math.max(8, vpW), height: Math.max(5, vpH), border: '1px solid rgba(129,140,248,0.75)', background: 'rgba(99,102,241,0.1)', pointerEvents: 'none', borderRadius: '1px' }} />;
          })()}
        </div>
      )}

      {/* ── Bottom status bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3"
        style={{ height: '28px', background: 'rgba(10,14,28,0.78)', backdropFilter: 'blur(6px)', borderTop: '1px solid rgba(100,116,139,0.22)', zIndex: 20, fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#475569' }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <span>{(nodes || []).length} nodes</span>
          <span>{(edges || []).length} edges</span>
          {selectedNodeIds && selectedNodeIds.size > 1 && <span style={{ color: '#818cf8' }}>{selectedNodeIds.size} selected</span>}
          {hiddenLayers.size > 0 && <span style={{ color: '#f59e0b' }}>{hiddenLayers.size} layer{hiddenLayers.size > 1 ? 's' : ''} hidden</span>}
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {isPanning     && <span style={{ color: '#60a5fa' }}>Panning</span>}
          {isDrawMode    && <span style={{ color: '#34d399' }}>Drawing</span>}
          {pendingEdgeSource && <span style={{ color: '#fbbf24' }}>Click to connect</span>}
          {focusModeNodeId   && <span style={{ color: '#f59e0b' }}>Focus (F to exit)</span>}
          <span style={{ color: '#334155' }} className="tabular-nums">{Math.round(cursorBoardPos.x)}, {Math.round(cursorBoardPos.y)}</span>
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="absolute"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px`, zIndex: 40, minWidth: '175px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(10,14,28,0.96)', backdropFilter: 'blur(12px)', border: '1px solid rgba(100,116,139,0.42)', boxShadow: '0 8px 32px rgba(0,0,0,0.65)', animation: 'fadeIn 80ms ease-out' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.edgeId ? (
            <div style={{ padding: '4px' }}>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748b', padding: '6px 10px 4px', textTransform: 'uppercase' }}>Connection Type</div>
              {EDGE_LEGEND.map(({ type, label }) => {
                const eColor = EDGE_COLORS[type] || '#94a3b8';
                const existingEdge = (edges || []).find(ed => ed.id === contextMenu.edgeId);
                const isActive = existingEdge?.relationType === type;
                return (
                  <button key={type} type="button"
                    onClick={() => { onUpdateEdge?.(contextMenu.edgeId, { relationType: type }); setContextMenu(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '5px 10px', background: isActive ? `${eColor}18` : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <svg width="24" height="10" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="5" x2="17" y2="5" stroke={eColor} strokeWidth={EDGE_STROKE_WIDTHS[type] || 2} strokeDasharray={EDGE_DASH_PATTERNS[type] || undefined} />
                      <polygon points="17,2 24,5 17,8" fill={eColor} />
                    </svg>
                    <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: isActive ? eColor : '#cbd5e1', fontWeight: isActive ? 700 : 400 }}>{label}</span>
                    {isActive && <span style={{ marginLeft: 'auto', color: eColor, fontSize: '11px' }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ margin: '4px 6px', borderTop: '1px solid rgba(100,116,139,0.3)' }} />
              <button type="button"
                onClick={() => { onDeleteEdge?.(contextMenu.edgeId); setContextMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '5px 10px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#f87171', fontFamily: 'system-ui, sans-serif', fontSize: '11px' }}
              >
                <span>✕</span><span>Delete Connection</span>
              </button>
            </div>
          ) : contextMenu.nodeId ? (
            <div style={{ padding: '4px' }}>
              {[
                { label: 'Select',      action: () => { onSelectNode?.(contextMenu.nodeId); setContextMenu(null); } },
                { label: pendingEdgeSource === contextMenu.nodeId ? 'Cancel Connection' : 'Start Connection', action: () => { if (pendingEdgeSource === contextMenu.nodeId) onCancelEdge?.(); else onStartEdge?.(contextMenu.nodeId); setContextMenu(null); } },
                ...(pendingEdgeSource && pendingEdgeSource !== contextMenu.nodeId ? [{ label: 'Connect To This', action: () => { onCompleteEdge?.(contextMenu.nodeId); setContextMenu(null); } }] : []),
                ...(nodeMap.get(contextMenu.nodeId)?.link?.url ? [{ label: 'Open Link', action: () => { onOpenLink?.(nodeMap.get(contextMenu.nodeId)?.link?.url); setContextMenu(null); } }] : []),
                { label: 'Duplicate',  action: () => { onDuplicateNode?.(contextMenu.nodeId); setContextMenu(null); } },
                { label: 'Add Comment', action: () => { setCommentingNodeId(contextMenu.nodeId); setContextMenu(null); } },
              ].map((item, i) => (
                <button key={i} type="button" onClick={item.action}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '12px', borderRadius: '7px', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0', background: 'transparent', display: 'block', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{item.label}</button>
              ))}
              <div style={{ margin: '2px 0', borderTop: '1px solid rgba(100,116,139,0.3)' }} />
              {[
                { label: 'Export as Text',  action: () => { onExportNode?.(contextMenu.nodeId); setContextMenu(null); }, muted: true },
                { label: 'Export as CSV',   action: () => { onExportNodeCsv?.(contextMenu.nodeId); setContextMenu(null); }, muted: true },
                ...(selectedNodeIds && selectedNodeIds.size > 1 ? [
                  { label: `Export ${selectedNodeIds.size} Selected as Text`, action: () => { onExportSelected?.([...selectedNodeIds]); setContextMenu(null); }, muted: true },
                  { label: `Export ${selectedNodeIds.size} Selected as CSV`,  action: () => { onExportSelectedCsv?.([...selectedNodeIds]); setContextMenu(null); }, muted: true },
                ] : []),
              ].map((item, i) => (
                <button key={i} type="button" onClick={item.action}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '12px', borderRadius: '7px', fontFamily: 'system-ui, sans-serif', color: '#64748b', background: 'transparent', display: 'block', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{item.label}</button>
              ))}
              <div style={{ margin: '2px 0', borderTop: '1px solid rgba(100,116,139,0.3)' }} />
              <button type="button" onClick={() => { onDeleteNode?.(contextMenu.nodeId); setContextMenu(null); }}
                style={{ width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '12px', borderRadius: '7px', fontFamily: 'system-ui, sans-serif', color: '#f87171', background: 'transparent', display: 'block', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(127,29,29,0.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >Delete</button>
            </div>
          ) : (
            <div style={{ padding: '4px' }}>
              {[
                { label: 'Add Sticky Here',       action: () => { onAddNodeAt?.('sticky',       contextMenu.boardPoint || null); setContextMenu(null); } },
                { label: 'Add Mechanic Here',     action: () => { onAddNodeAt?.('mechanic',     contextMenu.boardPoint || null); setContextMenu(null); } },
                { label: 'Add Content Here',      action: () => { onAddNodeAt?.('questContent', contextMenu.boardPoint || null); setContextMenu(null); } },
                { label: 'Add Mission Card Here', action: () => { onAddNodeAt?.('missionCard',  contextMenu.boardPoint || null); setContextMenu(null); } },
                { label: 'Add Frame Here',        action: () => { onAddNodeAt?.('frame',        contextMenu.boardPoint || null); setContextMenu(null); } },
              ].map((item, i) => (
                <button key={i} type="button" onClick={item.action}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '12px', borderRadius: '7px', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0', background: 'transparent', display: 'block', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{item.label}</button>
              ))}
              <div style={{ margin: '2px 0', borderTop: '1px solid rgba(100,116,139,0.3)' }} />
              {[
                { label: 'Zoom to Fit',          action: () => { handleZoomToFit(); setContextMenu(null); } },
                { label: 'Export Board as SVG',  action: () => { handleExportSVG(); setContextMenu(null); } },
                { label: 'Export Board as Text', action: () => { onExportBoard?.(); setContextMenu(null); } },
                { label: 'Export Board as CSV',  action: () => { onExportBoardCsv?.(); setContextMenu(null); } },
                ...(onSaveBoardSnapshot ? [{ label: '◷ Save Version Snapshot', action: () => { onSaveBoardSnapshot?.(); setContextMenu(null); } }] : []),
              ].map((item, i) => (
                <button key={i} type="button" onClick={item.action}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '12px', borderRadius: '7px', fontFamily: 'system-ui, sans-serif', color: '#94a3b8', background: 'transparent', display: 'block', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{item.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

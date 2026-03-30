import {
  DEFAULT_GAME_DESIGN_PROJECT_ID,
  GAME_DESIGN_NODE_TYPES,
  GAME_DESIGN_RELATION_RULES,
  GAME_DESIGN_SCHEMA_VERSION,
  stageDefaults,
} from './gameDesignDefaults';
import { emptyBoardLock, normalizeBoardLock } from './gameDesignLock';

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function asFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanNodeType(type) {
  const t = String(type || '').trim();
  if (GAME_DESIGN_NODE_TYPES.includes(t)) return t;
  return 'mechanic';
}

function normalizeNodeStyle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (raw.fill != null) out.fill = String(raw.fill);
  if (raw.text != null) out.text = String(raw.text);
  if (raw.border != null) out.border = String(raw.border);
  return Object.keys(out).length ? out : null;
}

function normalizeGuides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const columns = Array.isArray(raw.columns)
    ? raw.columns.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 48)
    : [];
  const lanes = Array.isArray(raw.lanes)
    ? raw.lanes.map((l) => String(l || '').trim()).filter(Boolean).slice(0, 64)
    : [];
  if (!columns.length || !lanes.length) return null;
  return {
    columns,
    lanes,
    originX: asFinite(raw.originX, -560),
    originY: asFinite(raw.originY, -120),
    cellWidth: Math.max(120, asFinite(raw.cellWidth, 260)),
    cellHeight: Math.max(84, asFinite(raw.cellHeight, 130)),
    leftRailWidth: Math.max(120, asFinite(raw.leftRailWidth, 210)),
    headerHeight: Math.max(54, asFinite(raw.headerHeight, 82)),
  };
}

export function createNode({
  type = 'mechanic',
  x = 0,
  y = 0,
  title = '',
  description = '',
  media = null,
  link = null,
  meta = null,
  width,
  height,
  style = null,
} = {}) {
  const safeType = cleanNodeType(type);
  const isSticky = safeType === 'sticky';
  return {
    id: makeId('node'),
    type: safeType,
    title: title || `${safeType} node`,
    description: description || '',
    x: asFinite(x, 0),
    y: asFinite(y, 0),
    width: asFinite(width, isSticky ? 152 : 220),
    height: asFinite(height, isSticky ? 100 : 140),
    media: media || null,
    link: link || null,
    meta: meta && typeof meta === 'object' ? meta : null,
    style: normalizeNodeStyle(style),
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createEdge({
  source,
  target,
  relationType = 'supports',
} = {}) {
  return {
    id: makeId('edge'),
    source: String(source || ''),
    target: String(target || ''),
    relationType: String(relationType || 'supports'),
    createdAt: Date.now(),
  };
}

export function createDrawingStroke({
  points = [],
  color = '#60a5fa',
  width = 3,
  opacity = 1,
  tool = 'pen',
} = {}) {
  return {
    id: makeId('stroke'),
    tool: String(tool || 'pen'),
    color: String(color || '#60a5fa'),
    width: Math.max(1, asFinite(width, 3)),
    opacity: Math.max(0.05, Math.min(1, asFinite(opacity, 1))),
    points: Array.isArray(points)
      ? points
        .map((p) => ({
          x: asFinite(p?.x, 0),
          y: asFinite(p?.y, 0),
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      : [],
    createdAt: Date.now(),
  };
}

export function createEmptyBoard({
  projectId = DEFAULT_GAME_DESIGN_PROJECT_ID,
  boardId = 'primary',
  updatedBy = '',
} = {}) {
  return {
    schemaVersion: GAME_DESIGN_SCHEMA_VERSION,
    projectId,
    boardId,
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || ''),
    nodes: [],
    edges: [],
    drawings: [],
    guides: null,
    workflow: stageDefaults(),
    boardLock: emptyBoardLock(),
  };
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  return {
    id,
    type: cleanNodeType(raw.type),
    title: String(raw.title || '').trim() || 'Untitled node',
    description: String(raw.description || ''),
    x: asFinite(raw.x, 0),
    y: asFinite(raw.y, 0),
    width: asFinite(raw.width, 220),
    height: asFinite(raw.height, 140),
    media: raw.media && typeof raw.media === 'object' ? raw.media : null,
    link: raw.link && typeof raw.link === 'object' ? raw.link : null,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : null,
    style: normalizeNodeStyle(raw.style),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)).slice(0, 50) : [],
    createdAt: asFinite(raw.createdAt, Date.now()),
    updatedAt: asFinite(raw.updatedAt, Date.now()),
  };
}

function normalizeEdge(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = String(raw.source || '').trim();
  const target = String(raw.target || '').trim();
  if (!source || !target || source === target) return null;
  return {
    id: String(raw.id || makeId('edge')),
    source,
    target,
    relationType: String(raw.relationType || 'supports'),
    createdAt: asFinite(raw.createdAt, Date.now()),
  };
}

function normalizeDrawing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const points = Array.isArray(raw.points)
    ? raw.points
      .map((p) => ({
        x: asFinite(p?.x, NaN),
        y: asFinite(p?.y, NaN),
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  if (points.length < 2) return null;
  return {
    id: String(raw.id || makeId('stroke')),
    tool: String(raw.tool || 'pen'),
    color: String(raw.color || '#60a5fa'),
    width: Math.max(1, asFinite(raw.width, 3)),
    opacity: Math.max(0.05, Math.min(1, asFinite(raw.opacity, 1))),
    points,
    createdAt: asFinite(raw.createdAt, Date.now()),
  };
}

export function normalizeBoard(raw, fallback = {}) {
  const empty = createEmptyBoard(fallback);
  if (!raw || typeof raw !== 'object') return empty;

  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map(normalizeNode).filter(Boolean)
    : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Array.isArray(raw.edges)
    ? raw.edges
      .map(normalizeEdge)
      .filter((e) => e && nodeIds.has(e.source) && nodeIds.has(e.target))
    : [];
  const drawings = Array.isArray(raw.drawings)
    ? raw.drawings.map(normalizeDrawing).filter(Boolean)
    : [];
  const guides = normalizeGuides(raw.guides);
  const boardLock = normalizeBoardLock(raw.boardLock) ?? emptyBoardLock();

  return {
    schemaVersion: asFinite(raw.schemaVersion, GAME_DESIGN_SCHEMA_VERSION),
    projectId: String(raw.projectId || empty.projectId),
    boardId: String(raw.boardId || empty.boardId),
    revision: Math.max(1, asFinite(raw.revision, 1)),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    updatedBy: String(raw.updatedBy || ''),
    nodes,
    edges,
    drawings,
    guides,
    workflow: {
      ...stageDefaults(),
      ...(raw.workflow && typeof raw.workflow === 'object' ? raw.workflow : {}),
    },
    boardLock,
  };
}

export function isValidRelation(sourceType, targetType) {
  const from = cleanNodeType(sourceType);
  const to = cleanNodeType(targetType);
  return !!from && !!to;
}

export function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') {
    return { ok: false, errors: ['Board payload is missing.'] };
  }
  if (!Array.isArray(board.nodes)) errors.push('nodes must be an array');
  if (!Array.isArray(board.edges)) errors.push('edges must be an array');
  if (board.drawings != null && !Array.isArray(board.drawings)) errors.push('drawings must be an array');
  if (board.guides != null && typeof board.guides !== 'object') errors.push('guides must be an object');
  if (board.boardLock != null && typeof board.boardLock !== 'object') errors.push('boardLock must be an object');

  const nodeById = new Map();
  for (const node of board.nodes || []) {
    if (!node?.id) errors.push('Node missing id');
    if (!GAME_DESIGN_NODE_TYPES.includes(cleanNodeType(node?.type))) {
      errors.push(`Node ${node?.id || '<unknown>'} has invalid type`);
    }
    if (node?.id) nodeById.set(node.id, node);
  }
  for (const edge of board.edges || []) {
    const from = nodeById.get(edge?.source);
    const to = nodeById.get(edge?.target);
    if (!from || !to) {
      errors.push(`Edge ${edge?.id || '<unknown>'} references missing nodes`);
      continue;
    }
    if (!isValidRelation(from.type, to.type)) {
      errors.push(`Invalid relation ${from.type} -> ${to.type}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function toSerializableBoard(board, updatedBy = '') {
  const normalized = normalizeBoard(board, {
    projectId: board?.projectId || DEFAULT_GAME_DESIGN_PROJECT_ID,
    boardId: board?.boardId || 'primary',
  });
  return {
    ...normalized,
    revision: Math.max(1, Number(normalized.revision || 1)),
    updatedBy: String(updatedBy || normalized.updatedBy || ''),
    updatedAt: new Date().toISOString(),
  };
}

export function inferWorkflow(board) {
  const workflow = stageDefaults();
  const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
  workflow.vision = nodes.some((n) => n.type === 'pillar');
  workflow.coreLoop = nodes.some((n) => n.type === 'coreLoop');
  workflow.systems = nodes.some((n) => n.type === 'system' || n.type === 'mechanic');
  workflow.progressionEconomy = nodes.some((n) => n.type === 'progression' || n.type === 'economy');
  workflow.content = nodes.some((n) => n.type === 'questContent' || n.type === 'missionCard');
  workflow.playtest = nodes.some((n) => n.type === 'playtestFinding' || n.type === 'risk');
  return workflow;
}

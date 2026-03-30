import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BoardCanvas from './BoardCanvas';
import NodeInspector from './NodeInspector';
import FlowChecklist from './FlowChecklist';
import PasteOverlay from './PasteOverlay';
import TemplatePicker from './TemplatePicker';
import {
  DEFAULT_GAME_DESIGN_PROJECT_ID,
  GAME_DESIGN_NODE_TYPE_LABELS,
  GAME_DESIGN_NODE_TYPES,
} from '../../platform/gameDesignDefaults';

var MISSION_TYPES = ['main', 'side', 'brandFantasy', 'companion', 'worldProblem', 'implicit'];
var MISSION_TYPE_LABELS = {
  main: 'Main',
  side: 'Side',
  brandFantasy: 'Brand Fantasy',
  companion: 'Companion',
  worldProblem: 'World Problem',
  implicit: 'Implicit',
};
function emptyMissionKernel() {
  return {
    missionId: '',
    headerName: '',
    missionType: 'side',
    team: '',
    npcs: [],
    locations: [],
    systems: [],
    synopsis: '',
    downstreamAffects: [],
    hasBranchingEndings: false,
    endings: [],
    hasDAS: false,
    das: [],
    affectsHousePoints: false,
    housePointsChars: [],
    hasChoiceImpacts: false,
    choiceImpacts: [],
    hasWorldStateChanges: false,
    worldStateChanges: [],
    hasMissionRumors: false,
    rumors: [],
    playtime: '',
    season: '',
    term: '',
    columnLabel: '',
    columnIndex: 0,
  };
}
function stageDefaults() {
  return {
    vision: false,
    coreLoop: false,
    systems: false,
    progressionEconomy: false,
    content: false,
    playtest: false,
  };
}
import {
  createDrawingStroke,
  createEdge,
  createEmptyBoard,
  createNode,
  inferWorkflow,
  isValidRelation,
  normalizeBoard,
  toSerializableBoard,
  validateBoard,
} from '../../platform/gameDesignSchema';
import {
  emptyBoardLock,
  hashCodeWithSalt,
  isBoardOwner,
  markCodeConsumed,
  matchAccessCode,
  normalizeBoardLock,
  randomAccessCode,
  randomSalt,
  readSessionUnlocked,
  writeSessionUnlocked,
} from '../../platform/gameDesignLock';

const LOCAL_FALLBACK_KEY = 'producerTrackerGameDesignBoards';
const CUSTOM_TEMPLATE_KEY = 'producerTrackerGameDesignCustomTemplates';

function getApi() {
  return window.electronAPI || window.appAPI || {};
}

function normalizeProjectId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || DEFAULT_GAME_DESIGN_PROJECT_ID;
}

function readFallbackBoards() {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFallbackBoards(next) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(next || {}));
}

function csvCell(value) {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function buildMissionCsv(rows = []) {
  const header = ['projectId', 'missionLabel', 'missionId', 'playtime', 'season', 'term', 'column'];
  const body = rows.map((row) => [
    row.projectId,
    row.label,
    row.missionId,
    row.playtime,
    row.season,
    row.term,
    row.columnLabel,
  ].map(csvCell).join(','));
  return [header.join(','), ...body].join('\n');
}

function normalizeTemplateGuides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const columns = Array.isArray(raw.columns)
    ? raw.columns.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 48)
    : [];
  const lanes = Array.isArray(raw.lanes)
    ? raw.lanes.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 64)
    : [];
  if (!columns.length || !lanes.length) return null;
  return {
    columns,
    lanes,
    originX: Number.isFinite(Number(raw.originX)) ? Number(raw.originX) : -520,
    originY: Number.isFinite(Number(raw.originY)) ? Number(raw.originY) : -40,
    cellWidth: Math.max(120, Number(raw.cellWidth) || 260),
    cellHeight: Math.max(84, Number(raw.cellHeight) || 130),
    leftRailWidth: Math.max(120, Number(raw.leftRailWidth) || 230),
    headerHeight: Math.max(54, Number(raw.headerHeight) || 190),
  };
}

function readCustomTemplates() {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tpl) => {
        const guides = normalizeTemplateGuides(tpl?.guides);
        if (!guides) return null;
        const id = String(tpl.id || '').trim();
        const label = String(tpl.label || '').trim();
        if (!id || !label) return null;
        return {
          id,
          label,
          createdAt: Number(tpl.createdAt) || Date.now(),
          guides,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeCustomTemplates(templates) {
  localStorage.setItem(CUSTOM_TEMPLATE_KEY, JSON.stringify(Array.isArray(templates) ? templates : []));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function triggerDownload(content, fileName, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    try { navigator.clipboard.writeText(content); } catch {}
  }
}

function safeExportName(raw) {
  return String(raw || 'export').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'export';
}

function nodeFieldsForExport(node) {
  var m = node.meta?.mission && typeof node.meta.mission === 'object' ? node.meta.mission : null;
  return {
    id: node.id,
    type: node.type || '',
    title: node.title || '',
    description: node.description || '',
    x: String(node.x ?? ''),
    y: String(node.y ?? ''),
    width: String(node.width ?? ''),
    height: String(node.height ?? ''),
    missionId: m ? String(m.missionId || '') : '',
    headerName: m ? String(m.headerName || '') : '',
    missionType: m ? String(m.missionType || '') : '',
    synopsis: m ? String(m.synopsis || '') : '',
    npcs: m && Array.isArray(m.npcs) ? m.npcs.join('; ') : '',
    locations: m && Array.isArray(m.locations) ? m.locations.join('; ') : '',
    systems: m && Array.isArray(m.systems) ? m.systems.join('; ') : '',
    playtime: m ? String(m.playtime || '') : '',
    season: m ? String(m.season || '') : '',
    term: m ? String(m.term || '') : '',
    team: m ? String(m.team || '') : '',
    linkUrl: node.link?.url || '',
  };
}

var BOARD_EXPORT_CSV_HEADER = ['id','type','title','description','x','y','width','height','missionId','headerName','missionType','synopsis','npcs','locations','systems','playtime','season','term','team','linkUrl'];

function nodeToTextBlock(node) {
  var f = nodeFieldsForExport(node);
  var typeLabel = GAME_DESIGN_NODE_TYPE_LABELS[node.type] || node.type || 'Node';
  var lines = ['=== ' + typeLabel + ': ' + (f.title || 'Untitled') + ' ==='];
  if (f.description) lines.push('Description: ' + f.description);
  if (f.missionId) lines.push('Mission ID: ' + f.missionId);
  if (f.headerName) lines.push('Header Name: ' + f.headerName);
  if (f.missionType) lines.push('Mission Type: ' + f.missionType);
  if (f.synopsis) lines.push('Synopsis: ' + f.synopsis);
  if (f.npcs) lines.push('NPCs: ' + f.npcs);
  if (f.locations) lines.push('Locations: ' + f.locations);
  if (f.systems) lines.push('Systems: ' + f.systems);
  if (f.playtime) lines.push('Playtime: ' + f.playtime);
  if (f.season) lines.push('Season: ' + f.season);
  if (f.term) lines.push('Term: ' + f.term);
  if (f.team) lines.push('Team: ' + f.team);
  if (f.linkUrl) lines.push('Link: ' + f.linkUrl);
  lines.push('Position: (' + f.x + ', ' + f.y + ')');
  return lines.join('\n');
}

function inferExtensionFromMime(mimeType = '') {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('quicktime')) return '.mov';
  return '.bin';
}

function safeAssetFileName(file) {
  const source = String(file?.name || 'asset').replace(/[^\w.-]+/g, '_');
  if (/\.[a-z0-9]+$/i.test(source)) return source;
  return `${source}${inferExtensionFromMime(file?.type || '')}`;
}

function BuilderTagInput({ values, onChange, placeholder }) {
  var [txt, setTxt] = React.useState('');
  var add = function () {
    var v = txt.trim();
    if (!v || (values || []).includes(v)) { setTxt(''); return; }
    onChange([...(values || []), v]);
    setTxt('');
  };
  return (
    <div className="space-y-1">
      {(values || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(values || []).map(function (v, i) {
            return (
              <span key={i} className="flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded bg-slate-700 text-[10px] text-slate-100">
                {v}
                <button type="button" onClick={function () { onChange((values || []).filter(function (_, j) { return j !== i; })); }} className="text-slate-500 hover:text-red-300 px-0.5">×</button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex gap-1">
        <input value={txt} onChange={function (e) { setTxt(e.target.value); }} onKeyDown={function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder || 'Add...'} className="flex-1 px-2 py-1 text-xs rounded border border-slate-600 bg-slate-800 text-slate-100" />
        <button type="button" onClick={add} className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-100 hover:bg-slate-600">Add</button>
      </div>
    </div>
  );
}

export default function GameDesignBoardView() {
  const [projectId, setProjectId] = useState(DEFAULT_GAME_DESIGN_PROJECT_ID);
  const [newProjectId, setNewProjectId] = useState('');
  const [projectOptions, setProjectOptions] = useState([DEFAULT_GAME_DESIGN_PROJECT_ID]);
  const [board, setBoard] = useState(createEmptyBoard({ projectId: DEFAULT_GAME_DESIGN_PROJECT_ID }));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [pendingEdgeSource, setPendingEdgeSource] = useState(null);
  const [defaultAddType, setDefaultAddType] = useState('mechanic');
  const [toolMode, setToolMode] = useState('select');
  const [placementType, setPlacementType] = useState('');
  const [rightTab, setRightTab] = useState('inspector');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [drawTool, setDrawTool] = useState('none');
  const [drawColor, setDrawColor] = useState('#60a5fa');
  const [drawWidth, setDrawWidth] = useState(3);
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [missionDraft, setMissionDraft] = useState(() => ({
    ...emptyMissionKernel(),
    label: 'New Mission',
    missionId: 'MXX_01',
    playtime: '5 minutes',
    season: 'Summer',
    term: 'Day One',
    summary: '',
  }));
  const [missionCodeStatus, setMissionCodeStatus] = useState('idle');
  const [aiMissionKernel, setAiMissionKernel] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState('blank');
  const [customTemplates, setCustomTemplates] = useState(readCustomTemplates);
  const [loading, setLoading] = useState(true);
  const [aiPatch, setAiPatch] = useState(null);
  const [saveState, setSaveState] = useState({
    dirty: false,
    saving: false,
    autosaving: false,
    lastSavedAt: null,
    error: '',
  });
  const [pasteState, setPasteState] = useState({ message: '', type: 'info' });
  const spawnRef = useRef({ x: -240, y: -120 });
  const pasteTimeoutRef = useRef(null);
  const boardRef = useRef(board);
  // Always-current refs so interop subscriptions (with [] deps) call the latest apply functions.
  const applyAiPatchRef = useRef(null);
  const applyAiMissionKernelRef = useRef(null);
  // Holds an AI patch/kernel that arrived while the board was still loading from disk.
  // Flushed as soon as loading finishes to avoid the race where loadProjectBoard wipes the new nodes.
  const pendingAiPatchRef = useRef(null);
  const pendingAiMissionKernelRef = useRef(null);
  // Mirror of loading state accessible to [] effects without stale-closure issues.
  const loadingRef = useRef(true);
  const projectIdRef = useRef(projectId);
  const mutationVersionRef = useRef(0);
  const saveRequestSeqRef = useRef(0);
  /** Next save must replace remote board entirely (clears/templates) — merge was re-adding deleted nodes. */
  const fullReplaceNextSaveRef = useRef(false);
  /** Mutex: true while a save round-trip is in flight. Autosaves skip; manual saves invalidate the in-flight one. */
  const saveInFlightRef = useRef(false);

  const selectedNode = useMemo(
    () => (board.nodes || []).find((node) => node.id === selectedNodeId) || null,
    [board.nodes, selectedNodeId],
  );
  const hasGuides = useMemo(
    () => Array.isArray(board?.guides?.columns) && board.guides.columns.length > 0
      && Array.isArray(board?.guides?.lanes) && board.guides.lanes.length > 0,
    [board],
  );
  const missionRows = useMemo(() => (
    (board?.nodes || [])
      .filter((node) => node?.type === 'missionCard')
      .map((node) => {
        const mission = node?.meta?.mission || {};
        return {
          nodeId: node.id,
          projectId: normalizeProjectId(projectId),
          label: String(node.title || '').trim(),
          missionId: String(mission.missionId || '').trim(),
          playtime: String(mission.playtime || '').trim(),
          season: String(mission.season || '').trim(),
          term: String(mission.term || '').trim(),
          columnLabel: String(mission.columnLabel || '').trim(),
        };
      })
      .sort((a, b) => String(a.columnLabel).localeCompare(String(b.columnLabel)) || String(a.label).localeCompare(String(b.label)))
  ), [board?.nodes, projectId]);

  const [username, setUsername] = useState('');
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const [lockCodeInput, setLockCodeInput] = useState('');
  const [accessCodeKind, setAccessCodeKind] = useState('oneTime');
  const [lastShownAccessCode, setLastShownAccessCode] = useState('');

  useEffect(() => {
    const api = getApi();
    const u = typeof api.getUsername === 'function' ? api.getUsername() : '';
    setUsername(String(u || '').trim());
  }, [projectId]);

  useEffect(() => {
    setSessionUnlocked(readSessionUnlocked(projectId));
    setLockCodeInput('');
  }, [projectId]);

  const isBoardOwnerUser = useMemo(
    () => isBoardOwner(board?.boardLock, username),
    [board?.boardLock, username],
  );

  const needsLockGate = useMemo(
    () => !!(board?.boardLock?.enabled && !isBoardOwnerUser && !sessionUnlocked),
    [board?.boardLock?.enabled, isBoardOwnerUser, sessionUnlocked],
  );

  const setPasteToast = useCallback((message, type = 'info') => {
    setPasteState({ message, type });
    if (pasteTimeoutRef.current) clearTimeout(pasteTimeoutRef.current);
    pasteTimeoutRef.current = setTimeout(() => {
      setPasteState({ message: '', type: 'info' });
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (pasteTimeoutRef.current) clearTimeout(pasteTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPlacementType('');
        setPendingEdgeSource(null);
        setDrawTool('none');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const api = getApi();
    if (typeof api?.interopSubscribe !== 'function') return;
    const dispatchPatch = (payload) => {
      if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) return;
      // If the board is still loading from disk, queue the patch — applying now would be wiped.
      if (loadingRef.current) {
        pendingAiPatchRef.current = payload;
      } else {
        if (applyAiPatchRef.current) applyAiPatchRef.current(payload);
      }
    };
    const unsub = api.interopSubscribe('gameDesign/ai/board-patch', (evt) => {
      dispatchPatch(evt?.payload);
    });
    // Replay any event that fired before this component mounted (navigateToView races ahead of mount).
    if (typeof api.interopGetRecent === 'function') {
      const recent = api.interopGetRecent('gameDesign/ai/board-patch');
      if (recent && recent.length > 0) {
        const last = recent[recent.length - 1];
        if (last && last.ts > Date.now() - 8000) {
          dispatchPatch(last.payload);
        }
      }
    }
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  useEffect(() => {
    const api = getApi();
    if (typeof api?.interopSubscribe !== 'function') return;
    const dispatchKernel = (payload) => {
      if (!payload || typeof payload !== 'object' || (!payload.missionId && !payload.headerName)) return;
      if (loadingRef.current) {
        pendingAiMissionKernelRef.current = payload;
      } else {
        if (applyAiMissionKernelRef.current) applyAiMissionKernelRef.current(payload);
      }
    };
    const unsub = api.interopSubscribe('gameDesign/ai/mission-kernel', (evt) => {
      dispatchKernel(evt?.payload);
    });
    // Replay any event that fired before this component mounted.
    if (typeof api.interopGetRecent === 'function') {
      const recent = api.interopGetRecent('gameDesign/ai/mission-kernel');
      if (recent && recent.length > 0) {
        const last = recent[recent.length - 1];
        if (last && last.ts > Date.now() - 8000) {
          dispatchKernel(last.payload);
        }
      }
    }
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  useEffect(() => {
    if (!hasGuides) return;
    const maxIdx = Math.max(0, (board?.guides?.columns?.length || 1) - 1);
    setMissionDraft((prev) => {
      const curr = Number(prev.columnIndex) || 0;
      const nextIdx = Math.max(0, Math.min(maxIdx, curr));
      return nextIdx === curr ? prev : { ...prev, columnIndex: nextIdx };
    });
  }, [board, hasGuides]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // When the board finishes loading, apply any AI content that arrived during the load.
  useEffect(() => {
    if (loading) return;
    if (pendingAiPatchRef.current) {
      const p = pendingAiPatchRef.current;
      pendingAiPatchRef.current = null;
      if (applyAiPatchRef.current) applyAiPatchRef.current(p);
    }
    if (pendingAiMissionKernelRef.current) {
      const m = pendingAiMissionKernelRef.current;
      pendingAiMissionKernelRef.current = null;
      if (applyAiMissionKernelRef.current) applyAiMissionKernelRef.current(m);
    }
  }, [loading]);

  const getNextSpawnPoint = () => {
    const curr = spawnRef.current;
    const next = { ...curr };
    spawnRef.current = {
      x: curr.x + 36 > 460 ? -240 : curr.x + 36,
      y: curr.y + 28 > 420 ? -120 : curr.y + 28,
    };
    return next;
  };

  const markDirty = useCallback(() => {
    setSaveState((prev) => ({ ...prev, dirty: true, error: '' }));
  }, []);

  const applyBoardMutation = useCallback((mutator) => {
    setBoard((prev) => {
      const next = mutator(prev);
      if (!next) return prev;
      const normalized = normalizeBoard(next, {
        projectId: prev.projectId || projectId,
        boardId: prev.boardId || 'primary',
      });
      normalized.workflow = inferWorkflow(normalized);
      mutationVersionRef.current += 1;
      return normalized;
    });
    markDirty();
  }, [markDirty, projectId]);

  const refreshProjectOptions = useCallback(async () => {
    const api = getApi();
    let options = [];
    if (typeof api.gameDesignListProjects === 'function') {
      try {
        const res = await api.gameDesignListProjects();
        if (res?.ok && Array.isArray(res.projects)) {
          options = res.projects
            .map((project) => normalizeProjectId(project.id || project.projectId || project))
            .filter(Boolean);
        }
      } catch {
        options = [];
      }
    }
    if (!options.length) {
      options = Object.keys(readFallbackBoards()).map((id) => normalizeProjectId(id));
    }
    if (!options.includes(projectId)) options.unshift(projectId);
    if (!options.includes(DEFAULT_GAME_DESIGN_PROJECT_ID)) options.unshift(DEFAULT_GAME_DESIGN_PROJECT_ID);
    setProjectOptions(Array.from(new Set(options)));
  }, [projectId]);

  const loadProjectBoard = useCallback(async (nextProjectId) => {
    // Invalidate in-flight save responses from a previous board context.
    saveRequestSeqRef.current += 1;
    mutationVersionRef.current = 0;
    fullReplaceNextSaveRef.current = false;
    setLoading(true);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setPendingEdgeSource(null);
    const normalizedProjectId = normalizeProjectId(nextProjectId);
    const api = getApi();
    try {
      let loaded = null;
      if (typeof api.gameDesignLoadProject === 'function') {
        const res = await api.gameDesignLoadProject(normalizedProjectId);
        if (res?.ok && res.board) loaded = res.board;
      }
      if (!loaded) {
        const fallback = readFallbackBoards();
        loaded = fallback[normalizedProjectId] || null;
      }
      const normalized = normalizeBoard(
        loaded || createEmptyBoard({ projectId: normalizedProjectId }),
        { projectId: normalizedProjectId, boardId: 'primary' },
      );
      normalized.workflow = inferWorkflow(normalized);
      setBoard(normalized);
      setSaveState({
        dirty: false,
        saving: false,
        autosaving: false,
        lastSavedAt: null,
        error: '',
      });
    } catch (err) {
      setBoard(createEmptyBoard({ projectId: normalizedProjectId }));
      setSaveState({
        dirty: false,
        saving: false,
        autosaving: false,
        lastSavedAt: null,
        error: err?.message || 'Failed to load project board.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjectOptions();
  }, [refreshProjectOptions]);

  useEffect(() => {
    loadProjectBoard(projectId);
  }, [projectId, loadProjectBoard]);

  const persistBoard = useCallback(async (reason = 'manual', boardOverride = null) => {
    const isManual = reason === 'manual';

    if (saveInFlightRef.current) {
      if (!isManual) return { ok: false, error: 'save_skipped' };
      saveRequestSeqRef.current += 1;
    }
    saveInFlightRef.current = true;

    const api = getApi();
    const username = (typeof api.getUsername === 'function' ? api.getUsername() : '') || '';
    const useFullReplace = fullReplaceNextSaveRef.current;
    const effectiveReason = useFullReplace ? 'fullReplace' : reason;
    const saveSeq = saveRequestSeqRef.current + 1;
    saveRequestSeqRef.current = saveSeq;
    const saveProjectId = normalizeProjectId(projectIdRef.current);
    const saveStartMutationVersion = mutationVersionRef.current;
    const boardSnapshot = boardOverride || boardRef.current;
    setSaveState((prev) => ({
      ...prev,
      saving: isManual,
      autosaving: !isManual,
      error: '',
    }));

    const serializable = toSerializableBoard(
      {
        ...boardSnapshot,
        projectId: saveProjectId,
        workflow: inferWorkflow(boardSnapshot),
        revision: (Number(boardSnapshot?.revision) || 0) + 1,
      },
      username,
    );
    const check = validateBoard(serializable);
    if (!check.ok) {
      saveInFlightRef.current = false;
      if (saveSeq !== saveRequestSeqRef.current) return;
      setSaveState((prev) => ({
        ...prev,
        saving: false,
        autosaving: false,
        error: `Validation failed: ${check.errors[0]}`,
      }));
      return { ok: false, error: check.errors[0] };
    }

    try {
      let persisted = serializable;
      if (typeof api.gameDesignSaveProject === 'function') {
        const res = await api.gameDesignSaveProject({
          projectId: saveProjectId,
          board: serializable,
          changeReason: effectiveReason,
        });
        if (res?.conflict) {
          saveInFlightRef.current = false;
          if (saveSeq !== saveRequestSeqRef.current) return;
          setSaveState((prev) => ({
            ...prev,
            saving: false,
            autosaving: false,
            error: 'Another user saved a newer version.',
          }));
          setPasteToast('Conflict: another user saved changes. Reload to get their version, or save again to overwrite.', 'info');
          return { ok: false, conflict: true };
        }
        if (!res?.ok) {
          throw new Error(res?.error || 'Failed to save board');
        }
        if (res.board) {
          persisted = normalizeBoard(res.board, { projectId: saveProjectId, boardId: 'primary' });
        }
      } else {
        const fallback = readFallbackBoards();
        fallback[saveProjectId] = serializable;
        writeFallbackBoards(fallback);
      }

      if (saveSeq !== saveRequestSeqRef.current) { saveInFlightRef.current = false; return; }
      if (saveProjectId !== normalizeProjectId(projectIdRef.current)) { saveInFlightRef.current = false; return; }

      if (useFullReplace) {
        fullReplaceNextSaveRef.current = false;
      }

      const hasNewerLocalEdits = mutationVersionRef.current !== saveStartMutationVersion;
      if (!hasNewerLocalEdits) {
        setBoard((prev) => ({
          ...prev,
          ...persisted,
          workflow: inferWorkflow(persisted),
        }));
      }
      setSaveState((prev) => ({
        ...prev,
        dirty: hasNewerLocalEdits,
        saving: false,
        autosaving: false,
        lastSavedAt: new Date().toISOString(),
        error: '',
      }));
      if (isManual) {
        setPasteToast(hasNewerLocalEdits ? 'Saved. New edits still pending autosave.' : 'Board saved', hasNewerLocalEdits ? 'info' : 'success');
      }
      refreshProjectOptions();
      saveInFlightRef.current = false;
      return { ok: true, board: persisted };
    } catch (err) {
      saveInFlightRef.current = false;
      if (saveSeq !== saveRequestSeqRef.current) return;
      setSaveState((prev) => ({
        ...prev,
        saving: false,
        autosaving: false,
        error: err?.message || 'Could not save board',
      }));
      if (isManual) setPasteToast(err?.message || 'Failed to save board', 'error');
      return { ok: false, error: err?.message || 'Could not save board' };
    }
  }, [refreshProjectOptions, setPasteToast]);

  useEffect(() => {
    if (!saveState.dirty || loading) return undefined;
    const timer = setTimeout(() => {
      persistBoard('autosave');
    }, 1600);
    return () => clearTimeout(timer);
  }, [saveState.dirty, loading, persistBoard, board]);

  const addDrawingStroke = useCallback((strokeInput) => {
    const stroke = createDrawingStroke(strokeInput);
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) return;
    applyBoardMutation((prev) => ({
      ...prev,
      drawings: [...(prev.drawings || []), stroke],
    }));
  }, [applyBoardMutation]);

  const eraseAtPoint = useCallback((point, radius = 16) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const radiusSq = radius * radius;
    applyBoardMutation((prev) => ({
      ...prev,
      drawings: (prev.drawings || []).filter((stroke) => {
        const points = Array.isArray(stroke.points) ? stroke.points : [];
        return !points.some((p) => {
          const dx = (Number(p.x) || 0) - point.x;
          const dy = (Number(p.y) || 0) - point.y;
          return (dx * dx + dy * dy) <= radiusSq;
        });
      }),
    }));
  }, [applyBoardMutation]);

  const addMissionPack = useCallback(() => {
    const guides = board?.guides;
    const columns = Array.isArray(guides?.columns) ? guides.columns : [];
    const hasGrid = hasGuides && guides && columns.length > 0;
    const colIndex = hasGrid ? Math.max(0, Math.min(columns.length - 1, Number(missionDraft.columnIndex) || 0)) : 0;
    const colLabel = hasGrid ? (columns[colIndex] || `Column ${colIndex + 1}`) : (missionDraft.headerName || missionDraft.label || '');
    const spawn = hasGrid ? null : getNextSpawnPoint();
    const colX = hasGrid ? (Number(guides.originX || 0) + colIndex * Number(guides.cellWidth || 260) + 14) : spawn.x;
    const titleY = hasGrid ? (Number(guides.originY || 0) + 12) : spawn.y;
    const missionNode = createNode({
      type: 'missionCard',
      x: colX,
      y: titleY,
      width: hasGrid ? Math.max(200, Number(guides.cellWidth || 260) - 26) : 260,
      height: 168,
      title: missionDraft.headerName || missionDraft.label || colLabel,
      description: missionDraft.summary || missionDraft.synopsis || '',
      meta: {
        mission: {
          ...emptyMissionKernel(),
          missionId: missionDraft.missionId || '',
          headerName: missionDraft.headerName || missionDraft.label || '',
          missionType: missionDraft.missionType || 'side',
          team: missionDraft.team || '',
          npcs: Array.isArray(missionDraft.npcs) ? missionDraft.npcs : [],
          locations: Array.isArray(missionDraft.locations) ? missionDraft.locations : [],
          systems: Array.isArray(missionDraft.systems) ? missionDraft.systems : [],
          synopsis: missionDraft.summary || missionDraft.synopsis || '',
          playtime: missionDraft.playtime || '',
          season: missionDraft.season || '',
          term: missionDraft.term || '',
          columnLabel: colLabel,
          columnIndex: colIndex,
        },
      },
    });
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: [...(prev.nodes || []), missionNode],
    }));
    setSelectedNodeId(missionNode.id);
    setFocusNodeId(missionNode.id);
    setRightTab('inspector');
    setPasteToast(`Mission "${missionDraft.missionId || missionDraft.label}" added`, 'success');
  }, [applyBoardMutation, board, hasGuides, missionDraft, setPasteToast]);

  const applyAiPatch = useCallback((patch) => {
    if (!patch || !Array.isArray(patch.nodes) || !patch.nodes.length) return;

    const nodeCount = patch.nodes.length;
    const patchEdges = patch.edges || [];
    const COL_W = 300;  // horizontal gap between dependency columns
    const ROW_H = 200;  // vertical gap between nodes in the same column

    // Build adjacency + in-degree from the patch edge list (uses integer indices)
    const outAdj = patch.nodes.map(() => []);
    const inDeg  = new Array(nodeCount).fill(0);
    patchEdges.forEach((e) => {
      const s = Number(e.sourceIndex), t = Number(e.targetIndex);
      if (s >= 0 && s < nodeCount && t >= 0 && t < nodeCount && s !== t) {
        outAdj[s].push(t);
        inDeg[t]++;
      }
    });

    // BFS topological levels — roots get depth 0, children get parent+1
    const depth = new Array(nodeCount).fill(-1);
    const bfsQueue = [];
    for (let i = 0; i < nodeCount; i++) {
      if (inDeg[i] === 0) { depth[i] = 0; bfsQueue.push(i); }
    }
    // Fallback when everything is in a cycle
    if (bfsQueue.length === 0) {
      for (let i = 0; i < nodeCount; i++) { depth[i] = 0; bfsQueue.push(i); }
    }
    for (let qi = 0; qi < bfsQueue.length; qi++) {
      const cur = bfsQueue[qi];
      outAdj[cur].forEach((nxt) => {
        if (depth[nxt] <= depth[cur]) {
          depth[nxt] = depth[cur] + 1;
          bfsQueue.push(nxt);
        }
      });
    }
    for (let i = 0; i < nodeCount; i++) { if (depth[i] < 0) depth[i] = 0; }

    // Group indices by column
    const maxDepth = depth.reduce((a, b) => Math.max(a, b), 0);
    const cols = Array.from({ length: maxDepth + 1 }, () => []);
    for (let i = 0; i < nodeCount; i++) cols[depth[i]].push(i);
    const maxColH = cols.reduce((a, c) => Math.max(a, c.length), 0);

    // One base point for the whole cluster
    const base = getNextSpawnPoint();
    const positions = new Array(nodeCount);
    cols.forEach((col, colIdx) => {
      col.forEach((nodeIdx, rowIdx) => {
        const colH = col.length * ROW_H;
        positions[nodeIdx] = {
          x: base.x + colIdx * COL_W,
          y: base.y - Math.floor((maxColH * ROW_H) / 2) + rowIdx * ROW_H,
        };
      });
    });

    const newNodes = patch.nodes.map((n, i) => {
      // Prefer pre-computed positions baked in by the AI extension; fall back to layout algo.
      const pos = (n.x != null && n.y != null)
        ? { x: n.x, y: n.y }
        : (positions[i] || { x: base.x + i * COL_W, y: base.y });
      const _created = createNode({
        type: n.type || 'mechanic',
        x: pos.x,
        y: pos.y,
        title: n.title || 'AI Node',
        description: n.description || '',
        meta: n.meta && typeof n.meta === 'object' ? n.meta : null,
      });
      // createNode runs cleanNodeType() which rejects any type not in the EXE-bundled
      // GAME_DESIGN_NODE_TYPES list (audioPlayer is an extension-defined type added after
      // the last EXE build). Restore the original type here so it survives to the renderer.
      if (n.type === 'audioPlayer') _created.type = 'audioPlayer';
      return _created;
    });
    const nodeIds = newNodes.map((n) => n.id);
    const newEdges = patchEdges
      .filter((e) => {
        const si = Number(e.sourceIndex);
        const ti = Number(e.targetIndex);
        return Number.isFinite(si) && Number.isFinite(ti) && si >= 0 && ti >= 0
          && si < nodeIds.length && ti < nodeIds.length && si !== ti;
      })
      .map((e) => createEdge({
        source: nodeIds[Number(e.sourceIndex)],
        target: nodeIds[Number(e.targetIndex)],
        relationType: e.relationType || 'supports',
      }));
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: [...prev.nodes, ...newNodes],
      edges: [...prev.edges, ...newEdges],
    }));
    const nodeWord = newNodes.length === 1 ? 'node' : 'nodes';
    const edgeWord = newEdges.length === 1 ? 'connection' : 'connections';
    const summary = newEdges.length > 0
      ? `AI added ${newNodes.length} ${nodeWord} + ${newEdges.length} ${edgeWord}`
      : `AI added ${newNodes.length} ${nodeWord}`;
    setPasteToast(summary, 'success');
    setAiPatch(null);
    const firstId = newNodes[0]?.id || null;
    setSelectedNodeId(firstId);
    setFocusNodeId(firstId);
  }, [applyBoardMutation, setPasteToast]);

  const checkMissionCode = useCallback((code) => {
    if (!code?.trim()) return;
    const exists = (board.nodes || []).some(
      (n) => n.type === 'missionCard' && n.meta?.mission?.missionId === code.trim(),
    );
    setMissionCodeStatus(exists ? 'exists' : 'new');
    if (exists) {
      const existing = (board.nodes || []).find(
        (n) => n.type === 'missionCard' && n.meta?.mission?.missionId === code.trim(),
      );
      if (existing) {
        setSelectedNodeId(existing.id);
        setFocusNodeId(existing.id);
        setRightTab('inspector');
        setPasteToast(`Mission ${code} found — selected for editing.`, 'info');
      }
    }
  }, [board.nodes, setPasteToast]);

  const applyAiMissionKernel = useCallback((kernel) => {
    if (!kernel || typeof kernel !== 'object') return;
    const spawn = getNextSpawnPoint();
    const node = createNode({
      type: 'missionCard',
      x: spawn.x,
      y: spawn.y,
      title: kernel.headerName || kernel.missionId || 'AI Mission',
      description: kernel.synopsis || '',
      meta: { mission: { ...emptyMissionKernel(), ...kernel } },
    });
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
    setFocusNodeId(node.id);
    setRightTab('inspector');
    setPasteToast(
      `Mission "${kernel.missionId || kernel.headerName || 'Untitled'}" added to board`,
      'success',
    );
    setAiMissionKernel(null);
  }, [applyBoardMutation, setPasteToast]);

  // Keep refs current so the interop subscriptions (captured at mount with [] deps)
  // always dispatch to the latest version of each apply function.
  applyAiPatchRef.current = applyAiPatch;
  applyAiMissionKernelRef.current = applyAiMissionKernel;

  const addNodeAt = useCallback((type, boardPoint = null, seed = {}) => {
    const spawn = boardPoint || getNextSpawnPoint();
    const node = createNode({
      type,
      x: spawn.x,
      y: spawn.y,
      title: seed.title || '',
      description: seed.description || '',
      media: seed.media || null,
      link: seed.link || null,
      meta: seed.meta || null,
    });
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
    setSelectedNodeIds(new Set([node.id]));
    return node;
  }, [applyBoardMutation]);

  const updateNode = useCallback((nodeId, patch) => {
    applyBoardMutation((prev) => {
      const nextNodes = prev.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, ...patch, updatedAt: Date.now() }
          : node
      ));
      const nodeById = new Map(nextNodes.map((node) => [node.id, node]));
      const nextEdges = prev.edges.filter((edge) => {
        const from = nodeById.get(edge.source);
        const to = nodeById.get(edge.target);
        if (!from || !to) return false;
        return isValidRelation(from.type, to.type);
      });
      return {
        ...prev,
        nodes: nextNodes,
        edges: nextEdges,
      };
    });
  }, [applyBoardMutation]);

  const selectSingleNode = useCallback((id) => {
    setSelectedNodeId(id);
    setSelectedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  const handleMultiSelect = useCallback((ids) => {
    const idSet = new Set(ids);
    setSelectedNodeIds(idSet);
    setSelectedNodeId(ids[0] || null);
  }, []);

  const deleteNode = useCallback((nodeId) => {
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((node) => node.id !== nodeId),
      edges: prev.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    }));
    if (selectedNodeId === nodeId) { setSelectedNodeId(null); setSelectedNodeIds(new Set()); }
    if (pendingEdgeSource === nodeId) setPendingEdgeSource(null);
  }, [applyBoardMutation, pendingEdgeSource, selectedNodeId]);

  const deleteNodes = useCallback((ids) => {
    const idSet = new Set(ids);
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((node) => !idSet.has(node.id)),
      edges: prev.edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target)),
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
  }, [applyBoardMutation]);

  const duplicateNode = useCallback((nodeId) => {
    const source = board.nodes.find((node) => node.id === nodeId);
    if (!source) return;
    addNodeAt(source.type, { x: source.x + 28, y: source.y + 28 }, {
      title: `${source.title || 'Node'} copy`,
      description: source.description || '',
      media: source.media || null,
      link: source.link || null,
      meta: source.meta ? JSON.parse(JSON.stringify(source.meta)) : null,
    });
  }, [addNodeAt, board.nodes]);

  const moveNode = useCallback((nodeId, position) => {
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, x: Number(position.x) || 0, y: Number(position.y) || 0, updatedAt: Date.now() }
          : node
      )),
    }));
  }, [applyBoardMutation]);

  const resizeNode = useCallback((nodeId, size) => {
    const width = Math.max(90, Number(size?.width) || 0);
    const height = Math.max(54, Number(size?.height) || 0);
    applyBoardMutation((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const patch = { width, height, updatedAt: Date.now() };
        if (size && Number.isFinite(size.x)) patch.x = size.x;
        if (size && Number.isFinite(size.y)) patch.y = size.y;
        return { ...node, ...patch };
      }),
    }));
  }, [applyBoardMutation]);

  const completeEdge = useCallback((targetNodeId) => {
    if (!pendingEdgeSource || pendingEdgeSource === targetNodeId) return;
    const source = board.nodes.find((node) => node.id === pendingEdgeSource);
    const target = board.nodes.find((node) => node.id === targetNodeId);
    if (!source || !target) {
      setPendingEdgeSource(null);
      return;
    }
    if (board.edges.some((edge) => edge.source === source.id && edge.target === target.id)) {
      setPasteToast('Nodes are already linked.', 'info');
      setPendingEdgeSource(null);
      return;
    }
    applyBoardMutation((prev) => ({
      ...prev,
      edges: [...prev.edges, createEdge({ source: source.id, target: target.id })],
    }));
    setPendingEdgeSource(null);
  }, [applyBoardMutation, board.edges, board.nodes, pendingEdgeSource, setPasteToast]);

  const openLink = useCallback(async (url) => {
    const api = getApi();
    if (typeof api.openExternal === 'function') {
      await api.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const saveMediaAsset = useCallback(async (file) => {
    const api = getApi();
    const fileName = safeAssetFileName(file);
    // Always capture dataUrl as inline fallback so the image survives reload even if disk path isn't accessible
    const dataUrl = await fileToDataUrl(file);
    if (typeof api.gameDesignSaveAsset === 'function') {
      const base64Data = await fileToBase64(file);
      const res = await api.gameDesignSaveAsset({
        projectId: normalizeProjectId(projectId),
        fileName,
        mimeType: file.type || '',
        base64Data,
      });
      if (!res?.ok) {
        throw new Error(res?.error || 'Failed to save media asset');
      }
      return {
        fileName,
        path: res.path || res.relativePath || `assets/${fileName}`,
        sourcePath: res.path || '',
        relativePath: res.relativePath || `assets/${fileName}`,
        mimeType: file.type || '',
        dataUrl,
      };
    }
    return {
      fileName,
      path: `inline/${fileName}`,
      mimeType: file.type || '',
      dataUrl,
    };
  }, [projectId]);

  const createMediaNodeFromFile = useCallback(async (file, point = null) => {
    const mime = String(file?.type || '');
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    if (!isImage && !isVideo) {
      setPasteToast(`Unsupported media type: ${mime || file?.name || 'unknown'}`, 'error');
      return;
    }
    try {
      const media = await saveMediaAsset(file);
      const node = addNodeAt(isVideo ? 'playtestFinding' : 'questContent', point, {
        title: `${isVideo ? 'Video' : 'Image'}: ${file.name || media.fileName}`,
        description: isVideo
          ? 'Pasted video reference for review/testing context.'
          : 'Pasted image reference for concept or UX context.',
        media,
      });
      if (node?.id) setFocusNodeId(node.id);
      setPasteToast(`${isVideo ? 'Video' : 'Image'} pasted into assets`, 'success');
    } catch (err) {
      setPasteToast(err?.message || 'Could not save media from paste', 'error');
    }
  }, [addNodeAt, saveMediaAsset, setPasteToast]);

  const handleDroppedFiles = useCallback(async (files, boardPoint) => {
    for (const file of files || []) {
      const mime = String(file?.type || '');
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) continue;
      // eslint-disable-next-line no-await-in-loop
      await createMediaNodeFromFile(file, boardPoint);
    }
  }, [createMediaNodeFromFile]);

  const attachMediaToNode = useCallback(async (nodeId, file) => {
    try {
      const media = await saveMediaAsset(file);
      updateNode(nodeId, { media });
      setPasteToast(`${String(file.type || '').startsWith('video/') ? 'Video' : 'Image'} attached`, 'success');
    } catch (err) {
      setPasteToast(err?.message || 'Could not attach media', 'error');
    }
  }, [saveMediaAsset, updateNode, setPasteToast]);

  const exportNodeAsText = useCallback((nodeId) => {
    const node = (boardRef.current?.nodes || []).find((n) => n.id === nodeId);
    if (!node) return;
    triggerDownload(nodeToTextBlock(node), `${safeExportName(node.title || nodeId)}.txt`, 'text/plain');
    setPasteToast('Node exported as text', 'success');
  }, [setPasteToast]);

  const exportNodeAsCsv = useCallback((nodeId) => {
    const node = (boardRef.current?.nodes || []).find((n) => n.id === nodeId);
    if (!node) return;
    const f = nodeFieldsForExport(node);
    const row = BOARD_EXPORT_CSV_HEADER.map((k) => csvCell(f[k] ?? ''));
    const csv = [BOARD_EXPORT_CSV_HEADER.join(','), row.join(',')].join('\n');
    triggerDownload(csv, `${safeExportName(node.title || nodeId)}.csv`, 'text/csv');
    setPasteToast('Node exported as CSV', 'success');
  }, [setPasteToast]);

  const exportSelectedAsText = useCallback((ids) => {
    const idSet = new Set(ids);
    const nodes = (boardRef.current?.nodes || []).filter((n) => idSet.has(n.id));
    if (!nodes.length) return;
    triggerDownload(nodes.map(nodeToTextBlock).join('\n\n'), 'selected-nodes.txt', 'text/plain');
    setPasteToast(`${nodes.length} node${nodes.length === 1 ? '' : 's'} exported as text`, 'success');
  }, [setPasteToast]);

  const exportSelectedAsCsv = useCallback((ids) => {
    const idSet = new Set(ids);
    const nodes = (boardRef.current?.nodes || []).filter((n) => idSet.has(n.id));
    if (!nodes.length) return;
    const rows = nodes.map((node) => {
      const f = nodeFieldsForExport(node);
      return BOARD_EXPORT_CSV_HEADER.map((k) => csvCell(f[k] ?? ''));
    });
    const csv = [BOARD_EXPORT_CSV_HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(csv, 'selected-nodes.csv', 'text/csv');
    setPasteToast(`${nodes.length} node${nodes.length === 1 ? '' : 's'} exported as CSV`, 'success');
  }, [setPasteToast]);

  const exportBoardAsText = useCallback(() => {
    const b = boardRef.current;
    if (!b) return;
    const pid = normalizeProjectId(projectIdRef.current);
    const nodeMap = new Map((b.nodes || []).map((n) => [n.id, n]));
    const lines = [`Board: ${pid}`, `Nodes: ${(b.nodes || []).length}  Edges: ${(b.edges || []).length}`, ''];
    for (const node of (b.nodes || [])) {
      lines.push(nodeToTextBlock(node));
      lines.push('');
    }
    if ((b.edges || []).length > 0) {
      lines.push('--- Connections ---');
      for (const edge of (b.edges || [])) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        lines.push(`${src?.title || edge.source} \u2192 ${tgt?.title || edge.target} (${edge.relationType || 'supports'})`);
      }
    }
    triggerDownload(lines.join('\n'), `${safeExportName(pid)}-board.txt`, 'text/plain');
    setPasteToast('Board exported as text', 'success');
  }, [setPasteToast]);

  const exportBoardAsCsv = useCallback(() => {
    const b = boardRef.current;
    if (!b) return;
    const pid = normalizeProjectId(projectIdRef.current);
    const rows = (b.nodes || []).map((node) => {
      const f = nodeFieldsForExport(node);
      return BOARD_EXPORT_CSV_HEADER.map((k) => csvCell(f[k] ?? ''));
    });
    const csv = [BOARD_EXPORT_CSV_HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(csv, `${safeExportName(pid)}-board.csv`, 'text/csv');
    setPasteToast('Board exported as CSV', 'success');
  }, [setPasteToast]);

  useEffect(() => {
    const onPaste = async (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const clipboard = event.clipboardData;
      if (!clipboard) return;

      const items = Array.from(clipboard.items || []);
      const mediaItem = items.find((item) => item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/')));
      if (mediaItem) {
        const file = mediaItem.getAsFile();
        if (file) {
          event.preventDefault();
          await createMediaNodeFromFile(file);
          return;
        }
      }

      const text = String(clipboard.getData('text/plain') || '').trim();
      if (!text) return;

      // Board-patch JSON detection — supports code-fenced ```board-patch blocks and raw JSON
      let boardPatchPayload = null;
      const fenceMatch = text.match(/```board-patch\s*([\s\S]*?)(?:```|$)/i);
      if (fenceMatch) {
        try { boardPatchPayload = JSON.parse(fenceMatch[1].trim()); } catch {}
      }
      if (!boardPatchPayload) {
        try {
          const candidate = JSON.parse(text);
          if (candidate && Array.isArray(candidate.nodes) && candidate.nodes.length > 0) {
            boardPatchPayload = candidate;
          }
        } catch {}
      }
      if (boardPatchPayload) {
        event.preventDefault();
        applyAiPatch(boardPatchPayload);
        return;
      }

      if (/^https?:\/\//i.test(text)) {
        event.preventDefault();
        addNodeAt('questContent', null, {
          title: 'Reference Link',
          description: 'Pasted external reference link.',
          link: { url: text },
        });
        setPasteToast('Link pasted as a board node', 'success');
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addNodeAt, createMediaNodeFromFile, setPasteToast]);

  const saveCustomTemplate = useCallback((payload) => {
    const label = String(payload?.name || '').trim();
    if (!label) {
      setPasteToast('Custom template needs a name.', 'error');
      return null;
    }
    const guides = normalizeTemplateGuides(payload?.guides);
    if (!guides) {
      setPasteToast('Add at least one column and one lane for a custom template.', 'error');
      return null;
    }
    let created = null;
    setCustomTemplates((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = list.find((tpl) => tpl.label.toLowerCase() === label.toLowerCase());
      const nextItem = {
        id: existing?.id || `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        label,
        createdAt: existing?.createdAt || Date.now(),
        guides,
      };
      created = nextItem;
      const next = existing
        ? list.map((tpl) => (tpl.id === existing.id ? nextItem : tpl))
        : [nextItem, ...list];
      writeCustomTemplates(next);
      return next;
    });
    setPasteToast(`Saved template: ${label}`, 'success');
    return created;
  }, [setPasteToast]);

  const deleteCustomTemplate = useCallback((id) => {
    const targetId = String(id || '').trim();
    if (!targetId) return;
    setCustomTemplates((prev) => {
      const next = (Array.isArray(prev) ? prev : []).filter((tpl) => tpl.id !== targetId);
      writeCustomTemplates(next);
      return next;
    });
    if (activeTemplate === `custom:${targetId}`) {
      setActiveTemplate('blank');
    }
    setPasteToast('Custom template removed', 'info');
  }, [activeTemplate, setPasteToast]);

  const applyTemplate = useCallback((templateId) => {
    fullReplaceNextSaveRef.current = true;
    setActiveTemplate(templateId);
    if (typeof templateId === 'string' && templateId.startsWith('custom:')) {
      const customId = templateId.slice('custom:'.length);
      const custom = customTemplates.find((tpl) => tpl.id === customId);
      if (!custom?.guides) {
        setPasteToast('Custom template not found.', 'error');
        return;
      }
      applyBoardMutation((prev) => ({
        ...prev,
        nodes: [],
        edges: [],
        drawings: [],
        guides: custom.guides,
      }));
      setSnapToGuides(true);
      setDefaultAddType('sticky');
      setPlacementType('');
      setDrawTool('none');
      setSelectedNodeId(null);
      return;
    }
    if (templateId === 'blank') {
      applyBoardMutation((prev) => ({ ...prev, nodes: [], edges: [], drawings: [], guides: null }));
      setSelectedNodeId(null);
      return;
    }
    if (templateId === 'coreLoopSprint') {
      const nodes = [
        createNode({ type: 'pillar', x: -360, y: -120, title: 'Design Pillar 1' }),
        createNode({ type: 'pillar', x: -360, y: 60, title: 'Design Pillar 2' }),
        createNode({ type: 'coreLoop', x: -40, y: -40, title: 'Core Loop' }),
        createNode({ type: 'mechanic', x: 260, y: -150, title: 'Primary Mechanic' }),
        createNode({ type: 'system', x: 260, y: 80, title: 'Supporting System' }),
      ];
      const byType = {
        pillarTop: nodes[0],
        pillarBottom: nodes[1],
        loop: nodes[2],
        mechanic: nodes[3],
        system: nodes[4],
      };
      const edges = [
        createEdge({ source: byType.pillarTop.id, target: byType.loop.id }),
        createEdge({ source: byType.pillarBottom.id, target: byType.loop.id }),
        createEdge({ source: byType.loop.id, target: byType.mechanic.id }),
        createEdge({ source: byType.loop.id, target: byType.system.id }),
      ];
      applyBoardMutation((prev) => ({ ...prev, nodes, edges, drawings: [], guides: null }));
      setSelectedNodeId(byType.loop.id);
      return;
    }
    if (templateId === 'narrativeFlowBoard') {
      const guides = {
        columns: ['Intro', 'VS 0A', 'VS 0B', 'VS 0C', 'VS 0D', 'VS 0E', 'Day One'],
        lanes: ['World', 'Avatar & Companions', 'Dawlish & Ministry', 'Poppy (and Gran)', 'Ophelia, Wraith & Acolytes'],
        originX: -520,
        originY: -40,
        cellWidth: 260,
        cellHeight: 130,
        leftRailWidth: 230,
        headerHeight: 190,
      };
      const sticky = (col, row, title, fill, description = '') => createNode({
        type: 'sticky',
        x: guides.originX + col * guides.cellWidth + 24,
        y: guides.originY + row * guides.cellHeight + 20,
        title,
        description,
        width: 156,
        height: 104,
        style: {
          fill,
          text: '#0f172a',
          border: '#93c5fd',
        },
      });
      const seeded = [
        sticky(0, 0, 'World setup', '#bfdbfe'),
        sticky(1, 0, 'Conflict enters Hogwarts', '#bfdbfe'),
        sticky(2, 1, 'Companion tension', '#ffffff'),
        sticky(3, 2, 'Ministry pressure rises', '#93c5fd'),
        sticky(4, 3, 'Poppy trust beat', '#86efac'),
        sticky(5, 4, 'Wrath/Acolyte reveal', '#f9a8d4'),
      ];
      applyBoardMutation((prev) => ({
        ...prev,
        nodes: seeded,
        edges: [],
        drawings: [],
        guides,
      }));
      setSnapToGuides(true);
      setDefaultAddType('sticky');
      setPlacementType('');
      setDrawTool('none');
      setSelectedNodeId(seeded[0]?.id || null);
      return;
    }
    if (templateId === 'playtestReview') {
      const nodes = [
        createNode({ type: 'playtestFinding', x: -220, y: -120, title: 'Finding: Early churn' }),
        createNode({ type: 'risk', x: 80, y: -120, title: 'Risk: Onboarding confusion' }),
        createNode({ type: 'system', x: 320, y: 60, title: 'System to Iterate' }),
        createNode({ type: 'questContent', x: -220, y: 120, title: 'Content Slice' }),
      ];
      const edges = [
        createEdge({ source: nodes[0].id, target: nodes[2].id }),
        createEdge({ source: nodes[1].id, target: nodes[2].id }),
      ];
      applyBoardMutation((prev) => ({ ...prev, nodes, edges, drawings: [], guides: null }));
      setSelectedNodeId(nodes[0].id);
    }
  }, [applyBoardMutation, customTemplates, setPasteToast]);

  const createProject = useCallback(async () => {
    const rawId = String(newProjectId || '').trim();
    if (!rawId) {
      const activeProjectId = normalizeProjectId(projectIdRef.current);
      const api = getApi();
      const localUser = typeof api.getUsername === 'function' ? String(api.getUsername() || '').trim() : '';
      const cleared = normalizeBoard({
        ...boardRef.current,
        projectId: activeProjectId,
        nodes: [],
        edges: [],
        drawings: [],
        guides: null,
        workflow: stageDefaults(),
        updatedBy: localUser,
        updatedAt: new Date().toISOString(),
      }, { projectId: activeProjectId, boardId: 'primary' });
      fullReplaceNextSaveRef.current = true;
      setActiveTemplate('blank');
      mutationVersionRef.current += 1;
      setBoard(cleared);
      setSelectedNodeId(null);
      setPendingEdgeSource(null);
      setSaveState((prev) => ({ ...prev, dirty: true, error: '' }));
      const clearRes = await persistBoard('manual', cleared);
      if (clearRes?.ok) setPasteToast('Board cleared and saved.', 'success');
      else setPasteToast('Board cleared locally. Save failed.', 'error');
      return;
    }
    const baseId = normalizeProjectId(rawId);
    if (!baseId) return;
    let id = baseId;
    const taken = new Set((projectOptions || []).map((v) => normalizeProjectId(v)).filter(Boolean));
    if (taken.has(id)) {
      let idx = 2;
      while (taken.has(`${baseId}-${idx}`)) idx += 1;
      id = `${baseId}-${idx}`;
    }
    const api = getApi();
    const localUser = typeof api.getUsername === 'function' ? String(api.getUsername() || '').trim() : '';
    const emptyBoard = createEmptyBoard({ projectId: id, updatedBy: localUser });
    const serializable = toSerializableBoard({
      ...emptyBoard,
      workflow: inferWorkflow(emptyBoard),
    }, localUser);

    try {
      if (typeof api.gameDesignSaveProject === 'function') {
        const res = await api.gameDesignSaveProject({
          projectId: id,
          board: serializable,
          changeReason: 'fullReplace',
        });
        if (!res?.ok) throw new Error(res?.error || 'Failed to create project');
      } else {
        const fallback = readFallbackBoards();
        fallback[id] = serializable;
        writeFallbackBoards(fallback);
      }
      fullReplaceNextSaveRef.current = false;
      setProjectId(id);
      setNewProjectId('');
      setProjectOptions((prev) => Array.from(new Set([id, ...prev])));
      setBoard(serializable);
      setSelectedNodeId(null);
      setPendingEdgeSource(null);
      setSaveState({
        dirty: false,
        saving: false,
        autosaving: false,
        lastSavedAt: new Date().toISOString(),
        error: '',
      });
      if (id !== baseId) {
        setPasteToast(`Project already existed. Created ${id} instead.`, 'info');
      } else {
        setPasteToast(`Project ${id} created`, 'success');
      }
      refreshProjectOptions();
    } catch (err) {
      setPasteToast(err?.message || 'Could not create project', 'error');
    }
  }, [newProjectId, projectOptions, refreshProjectOptions, setPasteToast, persistBoard]);

  const clearBoardEntirely = useCallback(async () => {
    const activeProjectId = normalizeProjectId(projectIdRef.current);
    const api = getApi();
    const localUser = typeof api.getUsername === 'function' ? String(api.getUsername() || '').trim() : '';
    const cleared = normalizeBoard({
      ...boardRef.current,
      projectId: activeProjectId,
      nodes: [],
      edges: [],
      drawings: [],
      guides: null,
      workflow: stageDefaults(),
      updatedBy: localUser,
      updatedAt: new Date().toISOString(),
    }, { projectId: activeProjectId, boardId: 'primary' });

    fullReplaceNextSaveRef.current = true;
    setActiveTemplate('blank');
    mutationVersionRef.current += 1;
    setBoard(cleared);
    setSelectedNodeId(null);
    setPendingEdgeSource(null);
    setSaveState((prev) => ({ ...prev, dirty: true, error: '' }));
    const res = await persistBoard('manual', cleared);
    if (res?.ok) {
      setPasteToast('Board cleared and saved.', 'success');
    } else {
      setPasteToast('Board cleared locally. Save failed.', 'error');
    }
  }, [persistBoard, setPasteToast]);

  const exportMissionCsv = useCallback(async () => {
    if (!missionRows.length) {
      setPasteToast('No mission cards to export yet.', 'info');
      return;
    }
    const csv = buildMissionCsv(missionRows);
    const fileName = `${normalizeProjectId(projectId)}-missions.csv`;
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPasteToast(`Exported ${fileName}`, 'success');
    } catch {
      try {
        await navigator.clipboard.writeText(csv);
        setPasteToast('CSV copied to clipboard (download failed).', 'info');
      } catch {
        setPasteToast('Could not export CSV.', 'error');
      }
    }
  }, [missionRows, projectId, setPasteToast]);

  const tryUnlockWithCode = useCallback(async () => {
    const code = lockCodeInput.trim();
    if (!code) {
      setPasteToast('Enter a code', 'info');
      return;
    }
    const match = await matchAccessCode(board.boardLock, code);
    if (!match.ok) {
      setPasteToast('Invalid code', 'error');
      return;
    }
    writeSessionUnlocked(projectId, true);
    setSessionUnlocked(true);
    if (match.consume && match.entryId) {
      applyBoardMutation((prev) => ({
        ...prev,
        boardLock: markCodeConsumed(prev.boardLock, match.entryId),
      }));
    }
    setLockCodeInput('');
    setPasteToast('Board unlocked for this session', 'success');
  }, [applyBoardMutation, board.boardLock, lockCodeInput, projectId, setPasteToast]);

  const generateAccessCode = useCallback(async () => {
    const api = getApi();
    const u = typeof api.getUsername === 'function' ? api.getUsername() : '';
    const owner = String(u || '').trim();
    if (!owner) {
      setPasteToast('Set a marketplace username (Extensions → Marketplace) to own locked boards.', 'error');
      return;
    }
    const code = randomAccessCode();
    const salt = randomSalt();
    const hash = await hashCodeWithSalt(code, salt);
    const id = `code_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const kind = accessCodeKind === 'reusable' ? 'reusable' : 'oneTime';
    applyBoardMutation((prev) => {
      const base = normalizeBoardLock(prev.boardLock) || emptyBoardLock();
      return {
        ...prev,
        boardLock: {
          ...base,
          enabled: true,
          ownerUsername: base.ownerUsername || owner,
          codes: [...(base.codes || []), { id, salt, hash, kind, consumedAt: null }],
        },
      };
    });
    setLastShownAccessCode(code);
    markDirty();
    setPasteToast(`New ${kind === 'oneTime' ? 'one-time' : 'reusable'} code generated (shown below once).`, 'success');
  }, [accessCodeKind, applyBoardMutation, markDirty, setPasteToast]);

  const setBoardLockEnabled = useCallback((enabled) => {
    const api = getApi();
    const u = typeof api.getUsername === 'function' ? api.getUsername() : '';
    const owner = String(u || '').trim();
    if (enabled && !owner) {
      setPasteToast('Set a marketplace username before locking a board.', 'error');
      return;
    }
    applyBoardMutation((prev) => ({
      ...prev,
      boardLock: enabled
        ? {
            ...(normalizeBoardLock(prev.boardLock) || emptyBoardLock()),
            enabled: true,
            ownerUsername: (normalizeBoardLock(prev.boardLock) || emptyBoardLock()).ownerUsername || owner,
            codes: (normalizeBoardLock(prev.boardLock) || emptyBoardLock()).codes || [],
          }
        : emptyBoardLock(),
    }));
    if (!enabled) {
      writeSessionUnlocked(projectId, false);
      setSessionUnlocked(false);
    }
    markDirty();
  }, [applyBoardMutation, markDirty, projectId, setPasteToast]);

  return (
    <div className="h-full w-full">
      <div className="relative h-full w-full border border-slate-700/70 bg-slate-950 overflow-hidden">
        <BoardCanvas
          nodes={board.nodes || []}
          edges={board.edges || []}
          drawings={board.drawings || []}
          guides={board.guides || null}
          snapToGuides={hasGuides && snapToGuides}
          selectedNodeId={selectedNodeId}
          pendingEdgeSource={pendingEdgeSource}
          focusNodeId={focusNodeId}
          defaultAddType={defaultAddType}
          toolMode={toolMode}
          placementType={placementType}
          drawTool={drawTool}
          drawColor={drawColor}
          drawWidth={drawWidth}
          onAddDrawingStroke={addDrawingStroke}
          onEraseAtPoint={eraseAtPoint}
          onPlacementConsumed={() => setPlacementType('')}
          onAddNodeAt={addNodeAt}
          onMoveNode={moveNode}
          onResizeNode={resizeNode}
          onUpdateNode={updateNode}
          onSelectNode={selectSingleNode}
          onStartEdge={setPendingEdgeSource}
          onCompleteEdge={completeEdge}
          onCancelEdge={() => setPendingEdgeSource(null)}
          onOpenLink={openLink}
          onDeleteNode={deleteNode}
          onDuplicateNode={duplicateNode}
          onFilesDropped={handleDroppedFiles}
          selectedNodeIds={selectedNodeIds}
          onMultiSelect={handleMultiSelect}
          onDeleteNodes={deleteNodes}
          onExportNode={exportNodeAsText}
          onExportNodeCsv={exportNodeAsCsv}
          onExportSelected={exportSelectedAsText}
          onExportSelectedCsv={exportSelectedAsCsv}
          onExportBoard={exportBoardAsText}
          onExportBoardCsv={exportBoardAsCsv}
        />
        {loading && (
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/95 px-2 py-1 text-[11px] text-slate-200">
            <span className="w-3 h-3 border-2 border-slate-500 border-t-slate-100 rounded-full animate-spin" />
            Loading project...
          </div>
        )}


        {needsLockGate && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 px-4 text-center">
            <p className="text-sm font-semibold text-slate-100 mb-1">This board is locked</p>
            <p className="text-[11px] text-slate-400 mb-4 max-w-sm">
              Enter a code from the board owner (one-time or reusable). Or switch to another project below.
            </p>
            <div className="w-full max-w-xs space-y-2 mb-4">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(normalizeProjectId(e.target.value))}
                className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
              >
                {projectOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
            <div className="flex w-full max-w-xs gap-2">
              <input
                type="password"
                autoComplete="off"
                value={lockCodeInput}
                onChange={(e) => setLockCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tryUnlockWithCode()}
                placeholder="Access code"
                className="flex-1 px-2 py-2 rounded text-sm border border-slate-600 bg-slate-800 text-slate-100"
              />
              <button
                type="button"
                onClick={() => tryUnlockWithCode()}
                className="px-3 py-2 rounded text-xs font-semibold bg-indigo-600 text-white"
              >
                Unlock
              </button>
            </div>
          </div>
        )}

        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl ${needsLockGate ? 'pointer-events-none opacity-40' : ''}`}>
          <span className="text-[11px] font-semibold text-slate-100 uppercase tracking-wide">Game Design Studio</span>
          <div className="w-px h-5 bg-slate-700" />
          <button
            type="button"
            onClick={() => {
              setToolMode('select');
              setDrawTool('none');
            }}
            className={`px-2 py-1 text-[11px] rounded ${toolMode === 'select' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Select
          </button>
          <button
            type="button"
            onClick={() => {
              setToolMode('pan');
              setDrawTool('none');
            }}
            className={`px-2 py-1 text-[11px] rounded ${toolMode === 'pan' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Hand
          </button>
          <button
            type="button"
            onClick={() => {
              setToolMode('select');
              setPlacementType('sticky');
              setDefaultAddType('sticky');
              setDrawTool('none');
              setPendingEdgeSource(null);
              setSelectedNodeId(null);
            }}
            className={`px-2 py-1 text-[11px] rounded ${placementType === 'sticky' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Sticky
          </button>
          <button
            type="button"
            onClick={() => setSnapToGuides((prev) => !prev)}
            disabled={!hasGuides}
            className={`px-2 py-1 text-[11px] rounded disabled:opacity-40 ${
              hasGuides && snapToGuides ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'
            }`}
            title={hasGuides ? 'Snap nodes to matrix cells' : 'Apply Narrative Flow template to enable snapping guides'}
          >
            {hasGuides && snapToGuides ? 'Snap On' : 'Snap Off'}
          </button>
          <button
            type="button"
            onClick={() => {
              setToolMode('select');
              setPlacementType('');
              setDrawTool('pen');
            }}
            className={`px-2 py-1 text-[11px] rounded ${drawTool === 'pen' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Pen
          </button>
          <button
            type="button"
            onClick={() => {
              setToolMode('select');
              setPlacementType('');
              setDrawTool('highlighter');
            }}
            className={`px-2 py-1 text-[11px] rounded ${drawTool === 'highlighter' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Highlight
          </button>
          <button
            type="button"
            onClick={() => {
              setToolMode('select');
              setPlacementType('');
              setDrawTool('eraser');
            }}
            className={`px-2 py-1 text-[11px] rounded ${drawTool === 'eraser' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Eraser
          </button>
          <button
            type="button"
            onClick={() => setDrawTool('none')}
            className={`px-2 py-1 text-[11px] rounded ${drawTool === 'none' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Pointer
          </button>
          <div className="flex items-center gap-1 px-1">
            {['#60a5fa', '#f97316', '#34d399', '#f43f5e', '#facc15'].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDrawColor(color)}
                className={`w-4 h-4 rounded-full border ${drawColor === color ? 'border-white' : 'border-black/40'}`}
                style={{ backgroundColor: color }}
                title={`Draw color ${color}`}
              />
            ))}
          </div>
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            value={drawWidth}
            onChange={(e) => setDrawWidth(Number(e.target.value) || 3)}
            className="w-16"
            title="Brush size"
          />
          <button
            type="button"
            onClick={() => applyBoardMutation((prev) => ({ ...prev, drawings: [] }))}
            className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-200"
          >
            Clear Ink
          </button>
          <button
            type="button"
            onClick={() => addNodeAt(defaultAddType)}
            className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-100"
          >
            Quick Add
          </button>
          <button
            type="button"
            onClick={() => persistBoard('manual')}
            disabled={saveState.saving || loading}
            className="px-2.5 py-1 text-[11px] rounded bg-amber-600 text-white disabled:opacity-60"
          >
            {saveState.saving ? 'Saving...' : 'Save'}
          </button>
          <span className="text-[10px] text-slate-300">
            {saveState.autosaving
              ? 'Auto-saving...'
              : saveState.dirty
                ? 'Unsaved'
                : saveState.lastSavedAt
                  ? `Saved ${new Date(saveState.lastSavedAt).toLocaleTimeString()}`
                  : 'Ready'}
          </span>
        </div>

        <div className={`absolute left-3 top-14 z-30 w-[180px] rounded-xl border border-slate-700 bg-slate-900/90 p-2 space-y-2 ${needsLockGate ? 'pointer-events-none opacity-40' : ''}`}>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 px-1">Tools</div>
          <div className="grid grid-cols-2 gap-1">
            {GAME_DESIGN_NODE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setDefaultAddType(type);
                  setPlacementType(type);
                  setToolMode('select');
                  setDrawTool('none');
                }}
                className={`px-1.5 py-1 rounded text-[10px] text-left ${
                  placementType === type
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {GAME_DESIGN_NODE_TYPE_LABELS[type] || type}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 px-1">
            {placementType ? `Click canvas to place: ${GAME_DESIGN_NODE_TYPE_LABELS[placementType]}` : 'Tip: Double-click canvas to create a node'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRightPanel((v) => !v)}
          className={`absolute right-3 top-3 z-30 px-2 py-1 rounded bg-slate-900/95 border border-slate-600 text-[11px] text-slate-100 ${needsLockGate ? 'pointer-events-none opacity-40' : ''}`}
        >
          {showRightPanel ? 'Hide Panel' : 'Show Panel'}
        </button>

        {showRightPanel && (
          <aside className={`absolute right-3 top-12 bottom-3 z-30 w-[310px] rounded-xl border border-slate-700 bg-slate-900/95 p-3 overflow-y-auto ${needsLockGate ? 'pointer-events-none opacity-40' : ''}`}>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Project</div>
              <p className="text-[9px] text-slate-500 leading-snug px-0.5">
                Each project is its own subfolder under the Game Design Data path (Admin). That path must not be the marketplace extensions root—use a dedicated folder so you only see real projects here.
              </p>
              <select
                value={projectId}
                onChange={(e) => setProjectId(normalizeProjectId(e.target.value))}
                className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
              >
                {projectOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <div className="flex gap-1">
                <input
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  placeholder="new-project-id"
                  className="flex-1 px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                />
                <button
                  type="button"
                  onClick={createProject}
                  className="px-2 py-1.5 rounded text-xs bg-slate-700 text-slate-100"
                  title="Create a unique project folder. If blank, clears current board."
                >
                  New / Clear
                </button>
              </div>
              <button
                type="button"
                onClick={clearBoardEntirely}
                className="w-full px-2 py-1.5 rounded text-[11px] bg-slate-800 text-amber-200 border border-slate-600 hover:bg-slate-700"
              >
                Clear board (nodes, ink, guides)
              </button>
            </div>

            {!needsLockGate && (
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-2 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Board access</div>
                <p className="text-[9px] text-slate-500 leading-snug">
                  Locking hides the canvas until a code is entered. Set your Marketplace username first. Owners bypass the lock; visitors need a code.
                </p>
                {isBoardOwnerUser && (
                  <>
                    <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!board?.boardLock?.enabled}
                        onChange={(e) => setBoardLockEnabled(e.target.checked)}
                      />
                      Lock this board
                    </label>
                    {board?.boardLock?.enabled && (
                      <>
                        <div className="flex gap-1 text-[10px]">
                          <label className="flex items-center gap-1 text-slate-300">
                            <input
                              type="radio"
                              name="codeKind"
                              checked={accessCodeKind === 'oneTime'}
                              onChange={() => setAccessCodeKind('oneTime')}
                            />
                            One-time
                          </label>
                          <label className="flex items-center gap-1 text-slate-300">
                            <input
                              type="radio"
                              name="codeKind"
                              checked={accessCodeKind === 'reusable'}
                              onChange={() => setAccessCodeKind('reusable')}
                            />
                            Reusable
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => generateAccessCode()}
                          className="w-full px-2 py-1.5 rounded text-[11px] bg-indigo-700 text-white hover:bg-indigo-600"
                        >
                          Generate access code
                        </button>
                        {lastShownAccessCode ? (
                          <div className="text-[11px] text-amber-200 font-mono break-all border border-amber-700/50 rounded px-2 py-1 bg-slate-900">
                            Copy now: {lastShownAccessCode}
                          </div>
                        ) : null}
                        <ul className="text-[9px] text-slate-500 space-y-0.5 max-h-20 overflow-y-auto">
                          {(normalizeBoardLock(board?.boardLock)?.codes || []).map((c) => (
                            <li key={c.id}>
                              {c.kind === 'oneTime' ? 'One-time' : 'Reusable'}
                              {c.consumedAt ? ' · used' : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-3 flex gap-1">
              {[
                { id: 'inspector', label: 'Inspector' },
                { id: 'template', label: 'Templates' },
                { id: 'flow', label: 'Flow' },
                { id: 'mission', label: 'Mission' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRightTab(tab.id)}
                  className={`px-2 py-1 text-[11px] rounded ${
                    rightTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {rightTab === 'inspector' && (
                <NodeInspector
                  node={selectedNode}
                  onUpdateNode={updateNode}
                  onDeleteNode={deleteNode}
                  onDuplicateNode={duplicateNode}
                  onCenterNode={() => {
                    if (!selectedNodeId) return;
                    setFocusNodeId(null);
                    setTimeout(() => setFocusNodeId(selectedNodeId), 0);
                  }}
                  onAttachMedia={selectedNodeId ? (file) => attachMediaToNode(selectedNodeId, file) : null}
                />
              )}
              {rightTab === 'template' && (
                <TemplatePicker
                  activeTemplate={activeTemplate}
                  onApplyTemplate={applyTemplate}
                  customTemplates={customTemplates}
                  onSaveCustomTemplate={saveCustomTemplate}
                  onDeleteCustomTemplate={deleteCustomTemplate}
                  boardGuides={board?.guides || null}
                />
              )}
              {rightTab === 'flow' && (
                <FlowChecklist workflow={board.workflow || {}} />
              )}
              {rightTab === 'mission' && (
                <section className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">Mission Builder</h3>
                    <div className="flex gap-1">
                      <button type="button" onClick={exportMissionCsv} className="px-2 py-1 rounded text-[10px] border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">Export CSV</button>
                      <span className="px-2 py-1 rounded text-[10px] bg-slate-900 text-slate-400 border border-slate-700">{missionRows.length} cards</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">Mission Code</label>
                    <div className="flex gap-1">
                      <input
                        value={missionDraft.missionId}
                        onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, missionId: e.target.value }; }); setMissionCodeStatus('idle'); }}
                        className="flex-1 px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100 font-mono"
                        placeholder="M_SKB_01"
                      />
                      <button type="button" onClick={function () { checkMissionCode(missionDraft.missionId); }} className="px-2 py-1.5 rounded text-xs bg-slate-700 text-slate-100 hover:bg-slate-600">Check</button>
                    </div>
                    {missionCodeStatus === 'exists' && <p className="text-[10px] text-amber-400">Found on board — selected for editing.</p>}
                    {missionCodeStatus === 'new' && <p className="text-[10px] text-emerald-400">New mission — fill in details below.</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">Header Name</label>
                    <input
                      value={missionDraft.headerName || missionDraft.label}
                      onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, headerName: e.target.value, label: e.target.value }; }); }}
                      className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                      placeholder="Mission Display Name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Type</label>
                      <select
                        value={missionDraft.missionType || 'side'}
                        onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, missionType: e.target.value }; }); }}
                        className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                      >
                        {MISSION_TYPES.map(function (t) { return <option key={t} value={t}>{MISSION_TYPE_LABELS[t] || t}</option>; })}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Team</label>
                      <input
                        value={missionDraft.team || ''}
                        onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, team: e.target.value }; }); }}
                        className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                        placeholder="Montreal 1"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">NPCs</label>
                    <BuilderTagInput values={missionDraft.npcs || []} onChange={function (v) { setMissionDraft(function (prev) { return { ...prev, npcs: v }; }); }} placeholder="Add NPC..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">Locations</label>
                    <BuilderTagInput values={missionDraft.locations || []} onChange={function (v) { setMissionDraft(function (prev) { return { ...prev, locations: v }; }); }} placeholder="Add location..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">Systems</label>
                    <BuilderTagInput values={missionDraft.systems || []} onChange={function (v) { setMissionDraft(function (prev) { return { ...prev, systems: v }; }); }} placeholder="e.g. Conversation, Music..." />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-slate-400">Synopsis</label>
                    <textarea
                      value={missionDraft.summary}
                      onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, summary: e.target.value }; }); }}
                      className="w-full min-h-[64px] px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                      placeholder="Mission synopsis..."
                    />
                  </div>

                  {hasGuides && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Column</label>
                      <select
                        value={missionDraft.columnIndex}
                        onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, columnIndex: Number(e.target.value) || 0 }; }); }}
                        className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
                      >
                        {(board?.guides?.columns || []).map(function (label, idx) { return <option key={label} value={idx}>{label}</option>; })}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Playtime</label>
                      <input value={missionDraft.playtime} onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, playtime: e.target.value }; }); }} className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100" placeholder="15 min" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Season</label>
                      <input value={missionDraft.season} onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, season: e.target.value }; }); }} className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100" placeholder="Summer" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-slate-400">Term</label>
                      <input value={missionDraft.term} onChange={function (e) { setMissionDraft(function (prev) { return { ...prev, term: e.target.value }; }); }} className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100" placeholder="Day One" />
                    </div>
                  </div>

                  <p className="text-[9px] text-slate-500 leading-snug">
                    After creating, click the card and use the Inspector to edit DAS, Endings, Choice Impacts, and more.
                    Use <span className="font-mono text-teal-400">/mission [description]</span> in AI Chat to auto-generate a kernel from project data.
                  </p>
                  <button
                    type="button"
                    onClick={addMissionPack}
                    className="w-full px-3 py-2 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    Add Mission Card
                  </button>
                  {missionRows.length > 0 && (
                    <div className="mt-2 rounded-lg border border-slate-700 overflow-hidden">
                      <div className="grid grid-cols-3 gap-1 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                        <span>Mission</span>
                        <span>ID</span>
                        <span>Column</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-800">
                        {missionRows.map((row) => (
                          <button
                            key={row.nodeId}
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(row.nodeId);
                              setFocusNodeId(row.nodeId);
                              setRightTab('inspector');
                            }}
                            className="grid w-full grid-cols-3 gap-1 px-2 py-1.5 text-[11px] text-left text-slate-200 hover:bg-slate-800/70"
                          >
                            <span className="truncate">{row.label || 'Untitled'}</span>
                            <span className="truncate text-slate-300">{row.missionId || '-'}</span>
                            <span className="truncate text-slate-300">{row.columnLabel || '-'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            {saveState.error && (
              <div className="mt-3 text-[11px] text-red-300">{saveState.error}</div>
            )}
          </aside>
        )}

        <PasteOverlay state={pasteState} />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
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

function FL({ children }) {
  return (
    <label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {children}
    </label>
  );
}

function inputCls() {
  return 'w-full px-2 py-1 text-xs rounded border border-slate-600 bg-slate-800 text-slate-100';
}

function TagInput({ values, onChange, placeholder }) {
  const [txt, setTxt] = useState('');
  const add = () => {
    const v = txt.trim();
    if (!v || (values || []).includes(v)) { setTxt(''); return; }
    onChange([...(values || []), v]);
    setTxt('');
  };
  return (
    <div className="space-y-1">
      {(values || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(values || []).map((v, i) => (
            <span
              key={i}
              className="flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded bg-slate-700 text-[10px] text-slate-100"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange((values || []).filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-red-300 ml-0.5 px-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Add...'}
          className="flex-1 px-2 py-1 text-xs rounded border border-slate-600 bg-slate-800 text-slate-100"
        />
        <button
          type="button"
          onClick={add}
          className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-100 hover:bg-slate-600"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Accordion({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen !== false);
  return (
    <div className="rounded border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
      >
        <span>{title}</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-2 space-y-2 bg-slate-950/50">{children}</div>}
    </div>
  );
}

function MissionKernelPanel({ node, onUpdateNode }) {
  const mk = (node.meta && node.meta.mission && typeof node.meta.mission === 'object')
    ? node.meta.mission
    : emptyMissionKernel();

  const update = (field, value) => {
    onUpdateNode(node.id, {
      meta: {
        ...(node.meta || {}),
        mission: { ...emptyMissionKernel(), ...mk, [field]: value },
      },
    });
  };

  const isSide = mk.missionType === 'side';

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400 px-0.5 pb-0.5 border-b border-violet-700/40">
        Mission Kernel
      </div>

      {/* Identity */}
      <Accordion title="Identity" defaultOpen>
        <div className="space-y-1">
          <FL>Mission Code</FL>
          <input
            value={mk.missionId || ''}
            onChange={(e) => update('missionId', e.target.value)}
            placeholder="M_SKB_01"
            className={inputCls()}
          />
        </div>
        <div className="space-y-1">
          <FL>Header Name</FL>
          <input
            value={mk.headerName || ''}
            onChange={(e) => update('headerName', e.target.value)}
            placeholder="Mission Display Name"
            className={inputCls()}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <FL>Type</FL>
            <select
              value={mk.missionType || 'side'}
              onChange={(e) => update('missionType', e.target.value)}
              className={inputCls()}
            >
              {MISSION_TYPES.map((t) => (
                <option key={t} value={t}>{MISSION_TYPE_LABELS[t] || t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <FL>Team</FL>
            <input
              value={mk.team || ''}
              onChange={(e) => update('team', e.target.value)}
              placeholder="Montreal 1"
              className={inputCls()}
            />
          </div>
        </div>
      </Accordion>

      {/* Context */}
      <Accordion title="NPCs / Locations / Systems" defaultOpen>
        <div className="space-y-1">
          <FL>NPCs</FL>
          <TagInput
            values={mk.npcs || []}
            onChange={(v) => update('npcs', v)}
            placeholder="Add NPC..."
          />
        </div>
        <div className="space-y-1">
          <FL>Locations</FL>
          <TagInput
            values={mk.locations || []}
            onChange={(v) => update('locations', v)}
            placeholder="Add location..."
          />
        </div>
        <div className="space-y-1">
          <FL>Systems</FL>
          <TagInput
            values={mk.systems || []}
            onChange={(v) => update('systems', v)}
            placeholder="e.g. Conversation, Music..."
          />
        </div>
      </Accordion>

      {/* Narrative */}
      <Accordion title="Narrative" defaultOpen>
        <div className="space-y-1">
          <FL>Synopsis</FL>
          <textarea
            value={mk.synopsis || ''}
            onChange={(e) => update('synopsis', e.target.value)}
            className="w-full min-h-[72px] px-2 py-1 text-xs rounded border border-slate-600 bg-slate-800 text-slate-100"
            placeholder="Mission synopsis..."
          />
        </div>
        <div className="space-y-1">
          <FL>Downstream Affects</FL>
          <p className="text-[9px] text-slate-500 leading-snug">Missions whose events or choices affected this mission.</p>
          {(mk.downstreamAffects || []).map((entry, i) => (
            <div key={i} className="flex gap-1 items-start">
              <div className="flex-1 space-y-0.5">
                <input
                  value={entry.missionId || ''}
                  onChange={(e) => {
                    const next = [...(mk.downstreamAffects || [])];
                    next[i] = { ...entry, missionId: e.target.value };
                    update('downstreamAffects', next);
                  }}
                  placeholder="Source mission code"
                  className="w-full px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                />
                <input
                  value={entry.context || ''}
                  onChange={(e) => {
                    const next = [...(mk.downstreamAffects || [])];
                    next[i] = { ...entry, context: e.target.value };
                    update('downstreamAffects', next);
                  }}
                  placeholder="How that mission affects this one..."
                  className="w-full px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => update('downstreamAffects', (mk.downstreamAffects || []).filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-red-300 mt-0.5 shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update('downstreamAffects', [...(mk.downstreamAffects || []), { missionId: '', context: '' }])}
            className="text-[10px] text-indigo-400 hover:text-indigo-200"
          >
            + Add Downstream Link
          </button>
        </div>
      </Accordion>

      {/* Structure */}
      <Accordion title="Structure" defaultOpen={false}>
        <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!mk.hasBranchingEndings}
            onChange={(e) => update('hasBranchingEndings', e.target.checked)}
          />
          Has Branching Endings
        </label>
        {mk.hasBranchingEndings && (
          <div className="ml-4 space-y-1.5">
            {(mk.endings || []).map((ending, i) => (
              <div key={i} className="space-y-0.5 border border-slate-700 rounded p-1.5">
                <div className="flex gap-1 items-center">
                  <input
                    value={ending.title || ''}
                    onChange={(e) => {
                      const next = [...(mk.endings || [])];
                      next[i] = { ...ending, title: e.target.value };
                      update('endings', next);
                    }}
                    placeholder="Ending title"
                    className="flex-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => update('endings', (mk.endings || []).filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-300 shrink-0"
                  >
                    ×
                  </button>
                </div>
                <input
                  value={ending.variableCode || ''}
                  onChange={(e) => {
                    const next = [...(mk.endings || [])];
                    next[i] = { ...ending, variableCode: e.target.value };
                    update('endings', next);
                  }}
                  placeholder="M_XXX_01.Ending == 1"
                  className="w-full px-1.5 py-0.5 text-[11px] font-mono rounded border border-slate-600 bg-slate-800 text-slate-300"
                />
                <textarea
                  value={ending.description || ''}
                  onChange={(e) => {
                    const next = [...(mk.endings || [])];
                    next[i] = { ...ending, description: e.target.value };
                    update('endings', next);
                  }}
                  placeholder="What happens in this ending..."
                  className="w-full px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100 min-h-[40px]"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => update('endings', [...(mk.endings || []), { title: '', variableCode: '', description: '' }])}
              className="text-[10px] text-indigo-400 hover:text-indigo-200"
            >
              + Add Ending
            </button>
          </div>
        )}
        <div className="space-y-1 mt-1">
          <FL>Complete State Variable</FL>
          <div className="px-2 py-1 text-[11px] font-mono text-slate-300 bg-slate-900 rounded border border-slate-700 select-all">
            {mk.missionId ? `${mk.missionId}.Complete == 1` : '(set Mission Code above)'}
          </div>
        </div>
      </Accordion>

      {/* Outcomes */}
      <Accordion title="Outcomes" defaultOpen={false}>
        {/* DAS */}
        <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!mk.hasDAS}
            onChange={(e) => update('hasDAS', e.target.checked)}
          />
          Has DAS (Dialogue Action System)
        </label>
        {mk.hasDAS && (
          <div className="ml-4 space-y-1">
            {(mk.das || []).map((entry, i) => (
              <div key={i} className="flex gap-1">
                <input
                  value={entry.characterName || ''}
                  onChange={(e) => {
                    const next = [...(mk.das || [])];
                    next[i] = { ...entry, characterName: e.target.value };
                    update('das', next);
                  }}
                  placeholder="Character name"
                  className="flex-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                />
                <input
                  value={entry.dasType || ''}
                  onChange={(e) => {
                    const next = [...(mk.das || [])];
                    next[i] = { ...entry, dasType: e.target.value };
                    update('das', next);
                  }}
                  placeholder="What type of DAS"
                  className="flex-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => update('das', (mk.das || []).filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-red-300 shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => update('das', [...(mk.das || []), { characterName: '', dasType: '' }])}
              className="text-[10px] text-indigo-400 hover:text-indigo-200"
            >
              + Add DAS
            </button>
          </div>
        )}

        {/* House Points */}
        <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={!!mk.affectsHousePoints}
            onChange={(e) => update('affectsHousePoints', e.target.checked)}
          />
          Affects House Points
        </label>
        {mk.affectsHousePoints && (
          <div className="ml-4 space-y-1">
            <FL>Professor / Character Giving Points</FL>
            <TagInput
              values={mk.housePointsChars || []}
              onChange={(v) => update('housePointsChars', v)}
              placeholder="Professor name..."
            />
          </div>
        )}

        {/* Choice Impacts */}
        <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={!!mk.hasChoiceImpacts}
            onChange={(e) => update('hasChoiceImpacts', e.target.checked)}
          />
          Has Choice Impacts
        </label>
        {mk.hasChoiceImpacts && (
          <div className="ml-4 space-y-1">
            <p className="text-[9px] text-slate-500 leading-snug">Choices in this mission affect other missions.</p>
            {(mk.choiceImpacts || []).map((entry, i) => (
              <div key={i} className="space-y-0.5 border border-slate-700 rounded p-1.5">
                <div className="flex gap-1 items-center">
                  <input
                    value={entry.missionId || ''}
                    onChange={(e) => {
                      const next = [...(mk.choiceImpacts || [])];
                      next[i] = { ...entry, missionId: e.target.value };
                      update('choiceImpacts', next);
                    }}
                    placeholder="Affected mission code"
                    className="flex-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => update('choiceImpacts', (mk.choiceImpacts || []).filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-300 shrink-0"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  value={entry.description || ''}
                  onChange={(e) => {
                    const next = [...(mk.choiceImpacts || [])];
                    next[i] = { ...entry, description: e.target.value };
                    update('choiceImpacts', next);
                  }}
                  placeholder="How this mission's choice affects that mission..."
                  className="w-full px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100 min-h-[36px]"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => update('choiceImpacts', [...(mk.choiceImpacts || []), { missionId: '', description: '' }])}
              className="text-[10px] text-indigo-400 hover:text-indigo-200"
            >
              + Add Choice Impact
            </button>
          </div>
        )}

        {/* World State Changes */}
        <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={!!mk.hasWorldStateChanges}
            onChange={(e) => update('hasWorldStateChanges', e.target.checked)}
          />
          World State Changes
        </label>
        {mk.hasWorldStateChanges && (
          <div className="ml-4 space-y-1">
            <TagInput
              values={mk.worldStateChanges || []}
              onChange={(v) => update('worldStateChanges', v)}
              placeholder="What changes in the world..."
            />
          </div>
        )}
      </Accordion>

      {/* Timing */}
      <Accordion title="Timing & Placement" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <FL>Playtime</FL>
            <input
              value={mk.playtime || ''}
              onChange={(e) => update('playtime', e.target.value)}
              className={inputCls()}
              placeholder="15 minutes"
            />
          </div>
          <div className="space-y-1">
            <FL>Season</FL>
            <input
              value={mk.season || ''}
              onChange={(e) => update('season', e.target.value)}
              className={inputCls()}
              placeholder="Summer"
            />
          </div>
          <div className="space-y-1">
            <FL>Term</FL>
            <input
              value={mk.term || ''}
              onChange={(e) => update('term', e.target.value)}
              className={inputCls()}
              placeholder="Day One"
            />
          </div>
          <div className="space-y-1">
            <FL>Column</FL>
            <input
              value={mk.columnLabel || ''}
              onChange={(e) => update('columnLabel', e.target.value)}
              className={inputCls()}
              placeholder="VS 0A"
            />
          </div>
        </div>
      </Accordion>

      {/* Rumors — side missions only */}
      {isSide && (
        <Accordion title="Mission Rumors" defaultOpen={false}>
          <p className="text-[9px] text-slate-500 leading-snug">
            Locations where players can hear about this side mission.
          </p>
          {(mk.rumors || []).map((rumor, i) => (
            <div key={i} className="space-y-0.5 border border-slate-700 rounded p-1.5">
              <div className="flex gap-1 items-center">
                <input
                  value={rumor.source || ''}
                  onChange={(e) => {
                    const next = [...(mk.rumors || [])];
                    next[i] = { ...rumor, source: e.target.value };
                    update('rumors', next);
                  }}
                  placeholder="Source location (e.g. Three Broomsticks)"
                  className="flex-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => update('rumors', (mk.rumors || []).filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-red-300 shrink-0"
                >
                  ×
                </button>
              </div>
              <textarea
                value={rumor.rumorText || ''}
                onChange={(e) => {
                  const next = [...(mk.rumors || [])];
                  next[i] = { ...rumor, rumorText: e.target.value };
                  update('rumors', next);
                }}
                placeholder="What is heard here..."
                className="w-full px-1.5 py-0.5 text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100 min-h-[36px]"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => update('rumors', [...(mk.rumors || []), { source: '', rumorText: '' }])}
            className="text-[10px] text-indigo-400 hover:text-indigo-200"
          >
            + Add Rumor
          </button>
        </Accordion>
      )}
    </div>
  );
}

var SR_ONLY_STYLE = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 };

function resolveNodeMediaSrc(media) {
  if (!media || typeof media !== 'object') return '';
  var dataUrl = String(media.dataUrl || '');
  if (dataUrl.startsWith('data:')) return dataUrl;
  var path = String(media.path || media.sourcePath || '');
  if (!path) return '';
  // Absolute Windows or UNC path — convert via Tauri if available
  if (/^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path)) {
    var convert = window.__TAURI__?.core?.convertFileSrc || window.__TAURI__?.convertFileSrc;
    if (typeof convert === 'function') return convert(path);
  }
  return '';
}

function isImageNodeMedia(media) {
  var mime = String(media?.mimeType || '').toLowerCase();
  var ref = String(media?.path || media?.relativePath || '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ref);
}

function isVideoNodeMedia(media) {
  var mime = String(media?.mimeType || '').toLowerCase();
  var ref = String(media?.path || media?.relativePath || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/.test(ref);
}

export default function NodeInspector({
  node,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onCenterNode,
  onAttachMedia,
}) {
  if (!node) {
    return (
      <section className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Node Inspector</h3>
        <p className="mt-2 text-xs text-hp-muted dark:text-hp-muted-dark">
          Select a node on the canvas to edit its details, links, and design notes.
        </p>
      </section>
    );
  }

  const isMission = node.type === 'missionCard';

  return (
    <section className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Node Inspector</h3>
        <button
          type="button"
          onClick={onCenterNode}
          className="text-[11px] px-2 py-1 rounded border border-hp-border dark:border-hp-border-dark text-hp-muted dark:text-hp-muted-dark hover:text-hp-text dark:hover:text-hp-text-dark"
        >
          Center
        </button>
      </div>

      <div className="space-y-1">
        <FL>Type</FL>
        <select
          value={node.type}
          onChange={(e) => onUpdateNode(node.id, { type: e.target.value })}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
        >
          {GAME_DESIGN_NODE_TYPES.map((type) => (
            <option key={type} value={type}>{GAME_DESIGN_NODE_TYPE_LABELS[type] || type}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <FL>Title</FL>
        <input
          value={node.title || ''}
          onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          placeholder="Node title"
        />
      </div>

      <div className="space-y-1">
        <FL>Description</FL>
        <textarea
          value={node.description || ''}
          onChange={(e) => onUpdateNode(node.id, { description: e.target.value })}
          className="w-full min-h-[72px] px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          placeholder="Design intent, player behavior, constraints..."
        />
      </div>

      {isMission && (
        <MissionKernelPanel node={node} onUpdateNode={onUpdateNode} />
      )}

      {node.link?.url && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-700/50 bg-blue-50/70 dark:bg-blue-900/20 px-2 py-1.5">
          <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Link</p>
          <p className="text-xs text-blue-700 dark:text-blue-200 break-all">{node.link.url}</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-2 py-2 space-y-2">
        <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Media</p>
        {node.media && (
          <div className="space-y-1.5">
            {(() => {
              var mediaSrc = resolveNodeMediaSrc(node.media) || String(node.media.dataUrl || '');
              var isImg = isImageNodeMedia(node.media);
              var isVid = isVideoNodeMedia(node.media);
              return (
                <>
                  {mediaSrc && isImg && (
                    <img
                      src={mediaSrc}
                      alt={node.title || 'media'}
                      className="w-full max-h-36 object-cover rounded border border-slate-300 dark:border-slate-600"
                      draggable={false}
                    />
                  )}
                  {mediaSrc && isVid && (
                    <video
                      src={mediaSrc}
                      controls
                      preload="metadata"
                      className="w-full max-h-36 rounded border border-slate-300 dark:border-slate-600 bg-black"
                    />
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 break-all">
                    {node.media.relativePath || node.media.path || node.media.fileName || 'Media attached'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onUpdateNode(node.id, { media: null })}
                    className="text-[10px] px-2 py-0.5 rounded border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                  >
                    Remove media
                  </button>
                </>
              );
            })()}
          </div>
        )}
        {onAttachMedia && (
          <label
            className="flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded border border-dashed border-slate-300 dark:border-slate-600 text-[11px] text-slate-500 dark:text-slate-400 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-500 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
            </svg>
            {node.media ? 'Replace image / video' : 'Attach image or video'}
            <input
              type="file"
              accept="image/*,video/*"
              style={SR_ONLY_STYLE}
              onChange={(e) => {
                var f = e.target.files && e.target.files[0];
                if (f) onAttachMedia(f);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {!node.media && !onAttachMedia && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No media attached. Drag an image or video onto the canvas to create a media node.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <FL>Width</FL>
          <input
            type="number"
            min={90}
            value={Number(node.width) || 0}
            onChange={(e) => onUpdateNode(node.id, { width: Math.max(90, Number(e.target.value) || 90) })}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          />
        </div>
        <div className="space-y-1">
          <FL>Height</FL>
          <input
            type="number"
            min={54}
            value={Number(node.height) || 0}
            onChange={(e) => onUpdateNode(node.id, { height: Math.max(54, Number(e.target.value) || 54) })}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark bg-white dark:bg-gray-950 text-hp-text dark:text-hp-text-dark"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onDuplicateNode(node.id)}
          className="px-2 py-1.5 text-xs rounded-lg border border-hp-border dark:border-hp-border-dark text-hp-text dark:text-hp-text-dark hover:bg-white/60 dark:hover:bg-gray-800"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => onDeleteNode(node.id)}
          className="px-2 py-1.5 text-xs rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Delete
        </button>
      </div>
    </section>
  );
}

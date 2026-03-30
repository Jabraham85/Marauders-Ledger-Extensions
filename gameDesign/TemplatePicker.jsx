import React, { useMemo, useState } from 'react';

const TEMPLATES = [
  { id: 'blank', label: 'Blank', description: 'Start from an empty board.' },
  { id: 'coreLoopSprint', label: 'Core Loop Sprint', description: 'Seed pillars, loop, and key mechanics.' },
  { id: 'playtestReview', label: 'Playtest Review', description: 'Seed findings, risks, and system follow-up.' },
  { id: 'narrativeFlowBoard', label: 'Narrative Flow Board', description: 'Miro-style chapter columns + lane rows with sticky notes.' },
];

function guidesToDraft(guides) {
  return {
    columns: Array.isArray(guides?.columns) ? guides.columns.join('\n') : 'Intro\nVS 0A\nVS 0B\nVS 0C\nVS 0D\nVS 0E\nDay One',
    lanes: Array.isArray(guides?.lanes) ? guides.lanes.join('\n') : 'World\nAvatar & Companions\nDawlish & Ministry\nPoppy (and Gran)\nOphelia, Wraith & Acolytes',
    cellWidth: Number(guides?.cellWidth) || 260,
    cellHeight: Number(guides?.cellHeight) || 130,
    leftRailWidth: Number(guides?.leftRailWidth) || 230,
    headerHeight: Number(guides?.headerHeight) || 190,
    originX: Number(guides?.originX) || -520,
    originY: Number(guides?.originY) || -40,
  };
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function TemplatePicker({
  activeTemplate = 'blank',
  onApplyTemplate,
  customTemplates = [],
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
  boardGuides = null,
}) {
  const [name, setName] = useState('');
  const [draft, setDraft] = useState(() => guidesToDraft(boardGuides));
  const customCount = useMemo(() => (Array.isArray(customTemplates) ? customTemplates.length : 0), [customTemplates]);

  const handleSave = () => {
    const payload = {
      name,
      guides: {
        columns: splitLines(draft.columns),
        lanes: splitLines(draft.lanes),
        cellWidth: Number(draft.cellWidth) || 260,
        cellHeight: Number(draft.cellHeight) || 130,
        leftRailWidth: Number(draft.leftRailWidth) || 230,
        headerHeight: Number(draft.headerHeight) || 190,
        originX: Number(draft.originX) || -520,
        originY: Number(draft.originY) || -40,
      },
    };
    const saved = onSaveCustomTemplate?.(payload);
    if (saved?.id) {
      setName('');
      onApplyTemplate?.(`custom:${saved.id}`);
    }
  };

  return (
    <section className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
      <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Template</h3>
      <div className="mt-2 space-y-1.5">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onApplyTemplate?.(tpl.id)}
            className={`w-full text-left rounded-lg border px-2 py-2 transition-colors ${
              activeTemplate === tpl.id
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/25'
                : 'border-hp-border dark:border-hp-border-dark hover:bg-white/60 dark:hover:bg-gray-800'
            }`}
          >
            <p className="text-xs font-semibold text-hp-text dark:text-hp-text-dark">{tpl.label}</p>
            <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark">{tpl.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-100">Custom Templates ({customCount})</p>
          <button
            type="button"
            onClick={() => setDraft(guidesToDraft(boardGuides))}
            className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-200"
          >
            Use Current Guides
          </button>
        </div>

        {!!customCount && (
          <div className="space-y-1">
            {customTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onApplyTemplate?.(`custom:${tpl.id}`)}
                  className={`flex-1 text-left rounded border px-2 py-1 text-[11px] ${
                    activeTemplate === `custom:${tpl.id}`
                      ? 'border-indigo-400 bg-indigo-900/25 text-indigo-200'
                      : 'border-slate-600 bg-slate-800 text-slate-100'
                  }`}
                >
                  {tpl.label}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCustomTemplate?.(tpl.id)}
                  className="px-2 py-1 text-[10px] rounded border border-red-700 text-red-300"
                  title="Delete template"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-xs border border-slate-600 bg-slate-800 text-slate-100"
          placeholder="Template name (e.g., Mission Arc - Episode 2)"
        />
        <div className="grid grid-cols-2 gap-2">
          <textarea
            value={draft.columns}
            onChange={(e) => setDraft((prev) => ({ ...prev, columns: e.target.value }))}
            className="min-h-[72px] px-2 py-1.5 rounded text-[11px] border border-slate-600 bg-slate-800 text-slate-100"
            placeholder="Columns (one per line)"
          />
          <textarea
            value={draft.lanes}
            onChange={(e) => setDraft((prev) => ({ ...prev, lanes: e.target.value }))}
            className="min-h-[72px] px-2 py-1.5 rounded text-[11px] border border-slate-600 bg-slate-800 text-slate-100"
            placeholder="Lanes (one per line)"
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {[
            ['cellWidth', 'Cell W'],
            ['cellHeight', 'Cell H'],
            ['leftRailWidth', 'Rail W'],
            ['headerHeight', 'Header H'],
            ['originX', 'Origin X'],
            ['originY', 'Origin Y'],
          ].map(([key, label]) => (
            <label key={key} className="text-[10px] text-slate-300">
              {label}
              <input
                type="number"
                value={draft[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                className="mt-1 w-full px-2 py-1 rounded text-[11px] border border-slate-600 bg-slate-800 text-slate-100"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="w-full px-2 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Save Custom Template
        </button>
      </div>
    </section>
  );
}

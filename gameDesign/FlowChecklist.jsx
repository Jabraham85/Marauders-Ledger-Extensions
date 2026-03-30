import React from 'react';
import { GAME_DESIGN_STAGE_LABELS, GAME_DESIGN_STAGE_ORDER } from './gameDesignDefaults';

export default function FlowChecklist({ workflow = {} }) {
  return (
    <section className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-3">
      <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Designer Flow</h3>
      <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark mt-0.5">
        Keep this progression green as your design matures.
      </p>
      <ul className="mt-3 space-y-1.5">
        {GAME_DESIGN_STAGE_ORDER.map((stageId, idx) => {
          const done = !!workflow[stageId];
          return (
            <li
              key={stageId}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${
                done
                  ? 'border-emerald-200/70 bg-emerald-50/70 dark:bg-emerald-900/20 dark:border-emerald-700/50'
                  : 'border-hp-border dark:border-hp-border-dark'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done ? 'bg-emerald-600 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                }`}
              >
                {done ? '✓' : idx + 1}
              </span>
              <span className="text-xs text-hp-text dark:text-hp-text-dark">{GAME_DESIGN_STAGE_LABELS[stageId] || stageId}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

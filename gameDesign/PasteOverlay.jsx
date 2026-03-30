import React from 'react';

export default function PasteOverlay({ state }) {
  if (!state?.message) return null;
  const tone = state.type === 'error'
    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
    : state.type === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300';

  return (
    <div className={`absolute top-3 right-3 z-30 rounded-lg border px-3 py-2 text-xs shadow-sm ${tone}`}>
      {state.message}
    </div>
  );
}

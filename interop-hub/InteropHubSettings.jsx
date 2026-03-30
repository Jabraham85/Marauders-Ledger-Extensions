import React from 'react';

const SNIPPET = `const api = window.electronAPI || window.appAPI;

// Subscribe to channel
const unsubscribe = api.interopSubscribe('my-extension/tasks/updated', (evt) => {
  console.log('Received', evt);
});

// Publish update
api.interopPublish({
  channel: 'my-extension/tasks/updated',
  source: 'my-extension',
  payload: { taskId: 'abc', status: 'done', ts: Date.now() },
});

// Cleanup
unsubscribe();`;

export default function InteropHubSettings() {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4">
        <h3 className="text-sm font-semibold text-hp-text dark:text-hp-text-dark">Interop Contract</h3>
        <ul className="mt-2 space-y-1 text-xs text-hp-muted dark:text-hp-muted-dark">
          <li>- Read app context via <code className="font-mono">getSharedContext()</code></li>
          <li>- Subscribe via <code className="font-mono">interopSubscribe(channel, handler)</code></li>
          <li>- Publish via <code className="font-mono">interopPublish({'{'} channel, payload, source, target {'}'})</code></li>
          <li>- Channel convention: <code className="font-mono">&lt;extension-id&gt;/&lt;topic&gt;/&lt;event&gt;</code></li>
          <li>- Keep payloads JSON-serializable and lightweight</li>
          <li>- Usage analytics trace is viewable in Interop Hub and can be toggled/exported from the view.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-hp-border dark:border-hp-border-dark bg-hp-card dark:bg-hp-card-dark p-4">
        <h4 className="text-xs font-semibold text-hp-text dark:text-hp-text-dark mb-2">Starter Snippet</h4>
        <pre className="text-[11px] leading-relaxed text-hp-text dark:text-hp-text-dark whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900/40 border border-hp-border dark:border-hp-border-dark rounded-lg p-3">
          {SNIPPET}
        </pre>
      </div>
    </div>
  );
}

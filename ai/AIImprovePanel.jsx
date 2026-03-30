import React, { useState, useEffect } from 'react';
import { W } from '../../theme/ThemeProvider';

function getApi() {
  return window.appAPI || window.electronAPI || null;
}

function parseAiLines(text) {
  return String(text || '').split('\n').map((line, i) => {
    const raw = line;
    const stripped = line.trim();
    const isEmpty = stripped.length === 0;
    const isHeading = /^#{1,6}\s/.test(stripped);
    const headingLevel = isHeading ? stripped.match(/^(#+)/)[1].length : 0;
    const isBullet = /^[\-\*•]\s/.test(stripped) || /^\d+[.)]\s/.test(stripped);
    const indent = (line.match(/^(\s+)/) || ['', ''])[1].length;
    const cleanText = stripped
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[\-\*•]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\*\*/g, '')
      .trim();
    const isActionable = !isEmpty && !isHeading && cleanText.length > 5 &&
      !/^\[no\s/i.test(cleanText) && !/^---/.test(stripped);

    return { id: i, raw, stripped, cleanText, isEmpty, isHeading, headingLevel, isBullet, indent, isActionable };
  });
}

function groupIntoSections(lines) {
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (line.isHeading) {
      current = { heading: line, items: [] };
      sections.push(current);
    } else if (current) {
      current.items.push(line);
    } else {
      current = { heading: null, items: [line] };
      sections.push(current);
    }
  }
  return sections;
}

function renderInlineBold(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderFormattedLine(line) {
  let text = line.stripped;

  if (line.isHeading) {
    const content = text.replace(/^#+\s+/, '');
    const cls = line.headingLevel === 1
      ? 'text-sm font-bold text-gray-900 dark:text-gray-100'
      : line.headingLevel === 2
      ? 'text-[13px] font-semibold text-gray-800 dark:text-gray-200'
      : 'text-xs font-semibold text-gray-700 dark:text-gray-300';
    return <p className={`${cls} mt-1`}>{renderInlineBold(content)}</p>;
  }

  if (line.isBullet) {
    const content = text.replace(/^[\-\*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
    const ml = line.indent > 2 ? 'ml-4' : 'ml-1';
    return (
      <p className={`text-xs text-gray-700 dark:text-gray-300 leading-relaxed ${ml} flex gap-1.5`}>
        <span className="text-gray-400 dark:text-gray-500 shrink-0">&bull;</span>
        <span>{renderInlineBold(content)}</span>
      </p>
    );
  }

  return <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{renderInlineBold(text)}</p>;
}

async function bridgeAiCheck() {
  const api = getApi();
  if (typeof api?.aiCheck === 'function') return api.aiCheck();
  return { ok: false, error: 'AI bridge unavailable' };
}

async function bridgeAiGenerate(prompt) {
  const api = getApi();
  if (typeof api?.aiGenerate === 'function') return api.aiGenerate({ prompt });
  return { ok: false, error: 'AI bridge unavailable' };
}

export default function AIImprovePanel({
  notes,
  department,
  onApplyResult,
  onOpenTaskDialog, // (lines, sectionHeading, sectionIdx, model) => void
  addedTaskIds,
  addedSections,
  showImproveButton,
}) {
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    bridgeAiCheck().then((result) => {
      setOllamaStatus(result.ok ? 'connected' : 'disconnected');
      if (result.ok && result.models?.length) {
        setModels(result.models);
        setSelectedModel(result.models[0]);
      }
    });
  }, []);

  async function handleImprove() {
    if (!notes.trim()) return;
    setIsGenerating(true);
    setError('');
    setAiResult('');

    const prompt = `You are a senior production assistant embedded in a department tracking app for a film/media/game producer. You are smart, opinionated, and proactive.

Department: "${department.name}"

Your job is to take the raw notes below and produce a polished, actionable document. Follow these rules:

FORMATTING:
1. Use ## headings to group related topics
5. Do NOT add information that isn't in the original notes
6. Do NOT add placeholder text like "[No details provided]" — if a section has no extra details, just list what's there
7. Make each bullet point a clear, actionable or informational statement
8. Output ONLY the formatted notes — no intro text, no summary, no sign-off
5. Do NOT add information that isn't in the original notes
6. Do NOT add placeholder text like "[No details provided]" — if a section has no extra details, just list what's there
7. Make each bullet point a clear, actionable or informational statement
8. Output ONLY the formatted notes — no intro text, no summary, no sign-off
2. Use bullet points (- ) for individual items under each heading
3. Use **bold** for names, dates, deadlines, and key details
4. Preserve every piece of information from the original — do not drop anything

CRITICAL — ENGAGE WITH THE CONTENT:
5. If the notes contain questions, decision points, or someone asking for input — ADDRESS THEM. Open with a clear ## Decision / Recommendation section at the top. State your recommended answer and brief reasoning. Do not just repeat the question back.
6. If there are blockers, dependencies, or risks — call them out under a ## Blockers / Risks heading with specific recommended next steps
7. If tasks or action items are buried in the text — extract them under a ## Action Items heading with clear owners if mentioned
8. If the notes reference a conversation, email, or message from someone — summarize the key ask and your recommended response
9. If something is ambiguous or missing critical info — flag it under ## Needs Clarification with what specifically is missing and who should provide it

BOUNDARIES:
10. Do NOT fabricate facts that aren't in the original notes — but DO provide recommendations and reasoning based on what's there
11. Do NOT add filler text or pleasantries
12. Output ONLY the formatted document — no intro, no summary, no sign-off

Raw notes:
${notes}`;

    const result = await bridgeAiGenerate(prompt);

    if (result.ok) {
      setAiResult(result.response);
    } else {
      setError(result.error || 'Failed to generate. Is Ollama running?');
    }
    setIsGenerating(false);
  }

  function handleApplyResult() {
    onApplyResult(aiResult);
    setAiResult('');
  }

  function handleRetryConnection() {
    setOllamaStatus(null);
    bridgeAiCheck().then((result) => {
      setOllamaStatus(result.ok ? 'connected' : 'disconnected');
      if (result.ok && result.models?.length) {
        setModels(result.models);
        if (!selectedModel) setSelectedModel(result.models[0]);
      }
    });
  }

  const sections = aiResult ? groupIntoSections(parseAiLines(aiResult)) : [];

  return (
    <div className="w-80 flex flex-col min-h-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Assistant
          </h3>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                ollamaStatus === 'connected' ? 'bg-green-500' :
                ollamaStatus === 'disconnected' ? 'bg-red-400' : 'bg-gray-300 animate-pulse'
              }`}
            />
            <span className="text-[11px] text-gray-500">
              {ollamaStatus === 'connected' ? <W k="ollamaConnected" /> :
               ollamaStatus === 'disconnected' ? <W k="ollamaNotConnected" /> : <W k="ollamaChecking" />}
            </span>
          </div>
        </div>

        {ollamaStatus === 'connected' && models.length > 0 && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="mt-2 w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {ollamaStatus === 'disconnected' && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 mb-3">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Ollama not detected</p>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Install Ollama from ollama.com, then run:<br />
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">ollama pull llama3.2</code>
            </p>
            <button
              onClick={handleRetryConnection}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium"
            >
              Retry Connection
            </button>
          </div>
        )}

        {ollamaStatus === 'connected' && !aiResult && !isGenerating && !error && (
          <div className="text-center py-6">
            <p className="text-xs text-gray-500 leading-relaxed">
              Write your rough notes on the left, then click the button below to have AI organize and clean them up.
            </p>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-6">
            <div className="w-6 h-6 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500">Improving your notes...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {aiResult && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">Improved Notes</span>
              <button
                onClick={handleApplyResult}
                className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg transition-colors"
              >
                <W k="applyToNotes" />
              </button>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 max-h-[60vh] overflow-auto space-y-1">
              {sections.map((section, sIdx) => {
                const actionableItems = section.items.filter((l) => l.isActionable);
                const allItemsAdded = actionableItems.length > 0 &&
                  actionableItems.every((l) => addedTaskIds.has(l.id));
                const sectionAdded = addedSections.has(sIdx);

                return (
                  <div key={sIdx} className="group/section">
                    {/* Section heading */}
                    {section.heading && (
                      <div className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-purple-100/60 transition-colors">
                        <div className="flex-1 min-w-0">{renderFormattedLine(section.heading)}</div>
                        {actionableItems.length > 1 && (
                          (sectionAdded || allItemsAdded) ? (
                            <span className="shrink-0 text-[10px] text-green-600 font-medium px-1.5 py-0.5 bg-green-50 rounded">
                              Added
                            </span>
                          ) : (
                            <button
                              onClick={() => onOpenTaskDialog(actionableItems, section.heading.cleanText, sIdx, selectedModel)}
                              title="Create task from entire section"
                              className="shrink-0 text-[10px] font-medium text-purple-600 bg-purple-100 hover:bg-purple-200 px-1.5 py-0.5 rounded opacity-0 group-hover/section:opacity-100 transition-opacity whitespace-nowrap"
                            >
                              + Section as Task
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* Section items */}
                    {section.items.map((line) => {
                      if (line.isEmpty) return <div key={line.id} className="h-2" />;
                      return (
                        <div
                          key={line.id}
                          className="flex items-start gap-1.5 group rounded-md px-1.5 py-0.5 hover:bg-purple-100/60 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            {renderFormattedLine(line)}
                          </div>
                          {line.isActionable && (
                            addedTaskIds.has(line.id) ? (
                              <span className="shrink-0 mt-0.5 text-[10px] text-green-600 font-medium px-1.5 py-0.5 bg-green-50 rounded">
                                Added
                              </span>
                            ) : (
                              <button
                                onClick={() => onOpenTaskDialog([line], null, undefined, selectedModel)}
                                title="Create task from this item"
                                className="shrink-0 mt-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                + Task
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showImproveButton && ollamaStatus === 'connected' && (
        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleImprove}
            disabled={isGenerating || !notes.trim()}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <W k="improveWithAi" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function truncate(text, len = 120, t) {
  if (!text) return t ? t('emptyPage') : 'Empty page';
  return text.length > len ? text.slice(0, len) + '...' : text;
}

const TEMPLATES = {
  blank: { labelKey: 'templateBlank', label: 'Blank Parchment', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', content: '' },
  meeting: {
    labelKey: 'templateMeeting',
    label: 'Council Notes',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    content: `## Meeting Notes\n\n**Date:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n**Attendees:** \n**Location/Call:** \n\n---\n\n## Agenda\n\n1. \n2. \n3. \n\n## Discussion\n\n- \n\n## Decisions Made\n\n- \n\n## Action Items\n\n- [ ] \n- [ ] \n\n## Next Steps\n\n- Next meeting: \n`,
  },
  standup: {
    labelKey: 'templateStandup',
    label: 'Morning Assembly',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    content: `## Daily Standup - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\n### What I did yesterday\n\n- \n\n### What I'm doing today\n\n- \n\n### Blockers\n\n- \n`,
  },
  retro: {
    labelKey: 'templateRetro',
    label: 'Pensieve Review',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    content: `## Retrospective - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\n### What went well\n\n- \n\n### What could be improved\n\n- \n\n### Action items for next sprint\n\n- [ ] \n- [ ] \n\n### Shoutouts\n\n- \n`,
  },
};

export default function NotesLanding({ department, onSelectPage, useOnenote }) {
  const { t } = useTheme();
  const { addNotePage, deleteNotePage } = useStore();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [newTitle, setNewTitle] = useState('');

  const [onenotePages, setOnenotePages] = useState([]);
  const [onenoteLoading, setOnenoteLoading] = useState(false);
  const [onenoteMapping, setOnenoteMapping] = useState(null);
  const [onenoteNotebooks, setOnenoteNotebooks] = useState([]);
  const [onenoteSections, setOnenoteSections] = useState([]);
  const [showOnenoteLink, setShowOnenoteLink] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  const loadOnenoteMapping = useCallback(async () => {
    if (!useOnenote || !window.electronAPI?.onenoteGetMapping) return;
    try {
      const mapping = await window.electronAPI.onenoteGetMapping();
      const deptMapping = mapping[department.id];
      setOnenoteMapping(deptMapping || null);
      if (deptMapping?.sectionId) {
        setOnenoteLoading(true);
        const res = await window.electronAPI.onenoteListPages(deptMapping.sectionId);
        if (res.ok) {
          setOnenotePages((res.pages || []).map(p => ({
            id: p.id, title: p.name, createdAt: p.dateTime, updatedAt: p.lastModifiedTime,
          })));
        }
        setOnenoteLoading(false);
      }
    } catch {}
  }, [useOnenote, department.id]);

  useEffect(() => { loadOnenoteMapping(); }, [loadOnenoteMapping]);

  const loadNotebooks = useCallback(async () => {
    if (!window.electronAPI?.onenoteDetect) return;
    const res = await window.electronAPI.onenoteDetect();
    if (res.ok) {
      const nbs = Array.isArray(res.notebooks) ? res.notebooks : [res.notebooks].filter(Boolean);
      setOnenoteNotebooks(nbs);
    }
  }, []);

  async function handleSelectNotebook(nbId) {
    setSelectedNotebook(nbId);
    setSelectedSection('');
    if (!nbId || !window.electronAPI?.onenoteListSections) return;
    const res = await window.electronAPI.onenoteListSections(nbId);
    if (res.ok) setOnenoteSections(res.sections || []);
  }

  async function handleLinkSection() {
    if (!selectedSection || !window.electronAPI?.onenoteSetMapping) return;
    const nb = onenoteNotebooks.find(n => n.id === selectedNotebook);
    const sec = onenoteSections.find(s => s.id === selectedSection);
    await window.electronAPI.onenoteSetMapping({ [department.id]: {
      notebookId: selectedNotebook, notebookName: nb?.name || '', sectionId: selectedSection, sectionName: sec?.name || '',
    }});
    setShowOnenoteLink(false);
    loadOnenoteMapping();
  }

  const pages = useOnenote
    ? onenotePages.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    : (department.notePages || []).slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  async function handleCreatePage(e) {
    e?.preventDefault();
    const tmpl = TEMPLATES[selectedTemplate] || TEMPLATES.blank;
    const defaultTitle = selectedTemplate === 'blank'
      ? `Notes - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `${tmpl.label} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const title = newTitle.trim() || defaultTitle;

    if (useOnenote && onenoteMapping?.sectionId && window.electronAPI?.onenoteCreatePage) {
      await window.electronAPI.onenoteCreatePage({ sectionId: onenoteMapping.sectionId, title, content: tmpl.content });
      loadOnenoteMapping();
    } else {
      addNotePage(department.id, title, tmpl.content, selectedTemplate !== 'blank' ? selectedTemplate : null);
    }
    setNewTitle('');
    setShowNewInput(false);
    setShowTemplates(false);
    setSelectedTemplate('blank');
  }

  function handleDelete(e, pageId) {
    e.stopPropagation();
    if (confirm('Delete this note page?')) {
      deleteNotePage(department.id, pageId);
    }
  }

  const templateBadge = {
    meeting: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    standup: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    retro: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100"><W k="notePages" /></h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{pages.length} page{pages.length !== 1 ? 's' : ''} in {department.name}</p>
        </div>
        {!showNewInput ? (
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <W k="newPage" />
          </button>
        ) : (
          <form onSubmit={handleCreatePage} className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Parchment title (or leave blank)"
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-56 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewInput(false); setShowTemplates(false); } }}
            />
            <button type="submit"
              className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
              Create
            </button>
            <button type="button" onClick={() => { setShowNewInput(false); setShowTemplates(false); }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 py-1.5 text-sm">
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* Template picker */}
      {showTemplates && !showNewInput && (
        <div className="mb-5 bg-hp-card dark:bg-hp-card-dark rounded-xl border border-hp-border dark:border-hp-border-dark p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3"><W k="chooseTemplate" /></p>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                onClick={() => { setSelectedTemplate(key); setShowNewInput(true); }}
                className={`p-4 rounded-xl border-2 text-center transition-all hover:shadow-md ${
                  selectedTemplate === key
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tmpl.icon} />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><W k={tmpl.labelKey} /></p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OneNote section linking */}
      {useOnenote && !onenoteMapping && !showOnenoteLink && (
        <div className="mb-5 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 p-4 text-center">
          <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">This department is not linked to a OneNote section yet.</p>
          <button
            onClick={() => { setShowOnenoteLink(true); loadNotebooks(); }}
            className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            Link to OneNote Section
          </button>
        </div>
      )}
      {useOnenote && showOnenoteLink && (
        <div className="mb-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Select a OneNote section for "{department.name}"</p>
          <select value={selectedNotebook} onChange={(e) => handleSelectNotebook(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100">
            <option value="">Choose notebook...</option>
            {onenoteNotebooks.map((nb, i) => <option key={i} value={nb.id}>{nb.name}</option>)}
          </select>
          {selectedNotebook && (
            <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100">
              <option value="">Choose section...</option>
              {onenoteSections.map((s, i) => <option key={i} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowOnenoteLink(false)} className="flex-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={handleLinkSection} disabled={!selectedSection} className="flex-1 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">Link Section</button>
          </div>
        </div>
      )}
      {useOnenote && onenoteMapping && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-purple-600 dark:text-purple-400">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          OneNote: {onenoteMapping.notebookName} / {onenoteMapping.sectionName}
          {onenoteLoading && <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-purple-50 dark:bg-purple-900/30 mb-4">
            <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h4 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1"><W k="noNotePages" /></h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create your first page or use Ctrl+Alt+Space for a quick note.</p>
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create First Page
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-purple-700 dark:group-hover:text-purple-400 truncate">
                    {page.title}
                  </h4>
                  {page.template && templateBadge[page.template] && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${templateBadge[page.template]}`}>
                      {TEMPLATES[page.template]?.label}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(e, page.id)}
                  className="p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3 mb-3">
                {truncate(page.content)}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">
                  {formatDate(page.updatedAt || page.createdAt)}
                </span>
                {(page.images?.length > 0) && (
                  <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {page.images.length}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';
import { isExtEnabled } from '../extensions/registry';
import { marked } from 'marked';
import AIImprovePanel from './notes/AIImprovePanel';
import NotesEditor from './notes/NotesEditor';
import TaskCreationDialog from './notes/TaskCreationDialog';

export default function DeptNotes({ department, pageId, onBack, onScheduleMeeting, useOnenote }) {
  const { t } = useTheme();
  const { state, updateNotePage } = useStore();

  const page = useOnenote ? null : (department.notePages || []).find((p) => p.id === pageId);
  const [notes, setNotes] = useState(page?.content || '');
  const [title, setTitle] = useState(page?.title || '');
  const [editorMode, setEditorMode] = useState('write');
  const [expandedImage, setExpandedImage] = useState(null);
  const [addedTaskIds, setAddedTaskIds] = useState(new Set());
  const [addedSections, setAddedSections] = useState(new Set());
  const [taskDialog, setTaskDialog] = useState(null);
  const saveTimerRef = useRef(null);
  const [onenoteRawXml, setOnenoteRawXml] = useState(null);
  const onenoteRawXmlRef = useRef(null);
  const [onenoteLoading, setOnenoteLoading] = useState(false);
  const [onenoteSaveStatus, setOnenoteSaveStatus] = useState(null);
  const notesRef = useRef('');

  const renderedMarkdown = useMemo(() => {
    if (!notes) return '';
    try { return marked(notes, { breaks: true, gfm: true }); }
    catch { return notes; }
  }, [notes]);

  useEffect(() => {
    if (useOnenote && pageId && window.electronAPI?.onenoteGetPageContent) {
      setOnenoteLoading(true);
      window.electronAPI.onenoteGetPageContent(pageId).then(res => {
        if (res.ok) {
          setNotes(res.markdown || '');
          notesRef.current = res.markdown || '';
          setOnenoteRawXml(res.rawXml || null);
          onenoteRawXmlRef.current = res.rawXml || null;
          const titleMatch = (res.markdown || '').match(/^#\s+(.+)/);
          setTitle(titleMatch ? titleMatch[1] : 'OneNote Page');
        }
        setOnenoteLoading(false);
      }).catch(() => setOnenoteLoading(false));
    } else {
      const p = (department.notePages || []).find((pg) => pg.id === pageId);
      setNotes(p?.content || '');
      notesRef.current = p?.content || '';
      setTitle(p?.title || '');
    }
    setAddedTaskIds(new Set());
    setAddedSections(new Set());
  }, [department.id, pageId, useOnenote]);

  const savePage = useCallback(
    (updates) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (useOnenote) setOnenoteSaveStatus('pending');
      saveTimerRef.current = setTimeout(async () => {
        const xml = onenoteRawXmlRef.current;
        if (useOnenote && window.electronAPI?.onenoteUpdatePage) {
          if (!xml) {
            console.warn('OneNote save skipped: no raw XML template yet');
            setOnenoteSaveStatus('error');
            return;
          }
          setOnenoteSaveStatus('saving');
          const md = updates.content !== undefined ? updates.content : notesRef.current;
          try {
            const res = await window.electronAPI.onenoteUpdatePage({ pageId, markdown: md ?? '', rawXml: xml });
            setOnenoteSaveStatus(res?.ok !== false ? 'saved' : 'error');
            setTimeout(() => setOnenoteSaveStatus(null), 2000);
          } catch (err) {
            console.error('OneNote save failed:', err);
            setOnenoteSaveStatus('error');
          }
        } else if (!useOnenote) {
          updateNotePage(department.id, pageId, updates);
        }
      }, 1200);
    },
    [department.id, pageId, updateNotePage, useOnenote]
  );

  function handleOnenoteSaveNow() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const xml = onenoteRawXmlRef.current;
    if (!xml || !window.electronAPI?.onenoteUpdatePage) {
      setOnenoteSaveStatus('error');
      return;
    }
    setOnenoteSaveStatus('saving');
    window.electronAPI.onenoteUpdatePage({ pageId, markdown: notesRef.current ?? '', rawXml: xml }).then(res => {
      setOnenoteSaveStatus(res?.ok !== false ? 'saved' : 'error');
      setTimeout(() => setOnenoteSaveStatus(null), 2000);
    }).catch(() => setOnenoteSaveStatus('error'));
  }

  useEffect(() => {
    if (!useOnenote) return;
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleOnenoteSaveNow();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [useOnenote, pageId]);

  function handleNotesChange(e) {
    const text = e.target.value;
    setNotes(text);
    notesRef.current = text;
    savePage({ content: text });
  }

  function handleTitleChange(e) {
    const t = e.target.value;
    setTitle(t);
    if (!useOnenote) savePage({ title: t });
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const currentPage = (department.notePages || []).find((p) => p.id === pageId);
          const currentImages = currentPage?.images || [];
          const newImage = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            data: ev.target.result,
            addedAt: new Date().toISOString().split('T')[0],
          };
          updateNotePage(department.id, pageId, { images: [...currentImages, newImage] });
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  function handleDeleteImage(imageId) {
    const currentPage = (department.notePages || []).find((p) => p.id === pageId);
    const filtered = (currentPage?.images || []).filter((img) => img.id !== imageId);
    updateNotePage(department.id, pageId, { images: filtered });
    if (expandedImage === imageId) setExpandedImage(null);
  }

  function handleApplyResult(newContent) {
    setNotes(newContent);
    notesRef.current = newContent;
    const xml = onenoteRawXmlRef.current;
    if (useOnenote && xml && window.electronAPI?.onenoteUpdatePage) {
      setOnenoteSaveStatus('saving');
      window.electronAPI.onenoteUpdatePage({ pageId, markdown: newContent, rawXml: xml }).then(res => {
        setOnenoteSaveStatus(res?.ok !== false ? 'saved' : 'error');
        setTimeout(() => setOnenoteSaveStatus(null), 2000);
      }).catch(err => {
        console.error('OneNote save failed:', err);
        setOnenoteSaveStatus('error');
      });
    } else if (!useOnenote) {
      updateNotePage(department.id, pageId, { content: newContent });
    }
    setAddedTaskIds(new Set());
    setAddedSections(new Set());
  }

  function openTaskDialog(lines, sectionHeading, sectionIdx, model) {
    setTaskDialog({ lines, sectionHeading, sectionIdx, model });
  }

  function handleTaskCreated(lineIds, sectionIdx) {
    if (lineIds) {
      setAddedTaskIds((prev) => {
        const next = new Set(prev);
        lineIds.forEach((id) => next.add(id));
        return next;
      });
    }
    if (sectionIdx !== undefined) {
      setAddedSections((prev) => new Set(prev).add(sectionIdx));
    }
    setTaskDialog(null);
  }

  const pageImages = page?.images || [];

  if (!page && !useOnenote) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">Page not found.</p>
      </div>
    );
  }

  if (useOnenote && onenoteLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 border-3 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">Loading from OneNote...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex gap-5 min-h-0">
      {/* Notes editor + images */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title={t('backToPages')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            value={title}
            onChange={handleTitleChange}
            className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200 bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-400"
            placeholder={t('pageTitle')}
          />
          {useOnenote && (
            <div className="flex items-center gap-2 shrink-0">
              {onenoteSaveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-xs text-purple-500">
                  <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              )}
              {onenoteSaveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Saved
                </span>
              )}
              {onenoteSaveStatus === 'error' && (
                <span className="text-xs text-red-500 font-medium">Save failed</span>
              )}
              {onenoteSaveStatus === 'pending' && (
                <span className="text-xs text-amber-500 dark:text-amber-400">Unsaved</span>
              )}
              <button
                onClick={handleOnenoteSaveNow}
                className="flex items-center gap-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                title="Save to OneNote now (Ctrl+S)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save
              </button>
            </div>
          )}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setEditorMode('write')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${editorMode === 'write' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Write
            </button>
            <button
              onClick={() => setEditorMode('preview')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${editorMode === 'preview' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Preview
            </button>
            <button
              onClick={() => setEditorMode('split')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${editorMode === 'split' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Split
            </button>
          </div>
          {onScheduleMeeting && (
            <button
              onClick={() => onScheduleMeeting({
                subject: title || 'Follow-up',
                body: notes || '',
              })}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0"
              title="Schedule an Outlook follow-up meeting from these notes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <W k="scheduleMeeting" />
            </button>
          )}
          <span className="text-xs text-gray-400 shrink-0"><W k="autoSaves" /></span>
        </div>

        <NotesEditor
          notes={notes}
          onNotesChange={handleNotesChange}
          editorMode={editorMode}
          renderedMarkdown={renderedMarkdown}
          onToolbarInsert={(insert) => {
            const next = notes + insert;
            setNotes(next);
            notesRef.current = next;
            savePage({ content: next });
          }}
          pageImages={pageImages}
          expandedImage={expandedImage}
          onExpandedImageChange={setExpandedImage}
          onPaste={handlePaste}
          onDeleteImage={handleDeleteImage}
        />
      </div>

      <AIImprovePanel
        notes={notes}
        department={department}
        onApplyResult={handleApplyResult}
        onOpenTaskDialog={openTaskDialog}
        addedTaskIds={addedTaskIds}
        addedSections={addedSections}
        showImproveButton={isExtEnabled(state.settings?.enabledExtensions, 'ai')}
      />

      {/* Task creation dialog */}
      {taskDialog && (
        <TaskCreationDialog
          lines={taskDialog.lines}
          sectionHeading={taskDialog.sectionHeading}
          model={taskDialog.model ?? null}
          department={department}
          onCreated={() => {
            const lineIds = taskDialog.lines.map((l) => l.id);
            handleTaskCreated(lineIds, taskDialog.sectionIdx);
          }}
          onClose={() => setTaskDialog(null)}
        />
      )}
    </div>
  );
}

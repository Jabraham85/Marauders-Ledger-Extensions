import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';
import { isExtEnabled } from '../extensions/registry';
import DeptModal from './DeptModal';
import NotificationsPopover from './sidebar/NotificationsPopover';

const DYNAMIC_ICONS = {
  puzzle: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />,
  sparkles: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />,
  activity: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  table: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />,
  chat: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
  book: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
  mail: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
};

export default function Sidebar({ selectedDeptId, activeView, onSelectDept, onNavChange, notifications, showNotifications, onToggleNotifications, dynamicViewNavItems = [] }) {
  const { state, deleteDepartment, updateSettings, importData } = useStore();
  const { t } = useTheme();
  const { settings } = state;
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [appVersion, setAppVersion] = useState('');
  const [updateCheckStatus, setUpdateCheckStatus] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  useEffect(() => {
    window.electronAPI?.updaterGetVersion?.().then(v => setAppVersion(v || ''));
  }, []);

  async function handleCheckForUpdates() {
    setUpdateCheckStatus('checking');
    const res = await window.electronAPI?.updaterCheck?.();
    if (res?.error) {
      setUpdateCheckStatus('unavailable');
      setTimeout(() => setUpdateCheckStatus(null), 3000);
      return;
    }
    if (res?.ok && res.version) {
      setUpdateCheckStatus('available');
    } else {
      setUpdateCheckStatus('up-to-date');
      setTimeout(() => setUpdateCheckStatus(null), 3000);
    }
  }

  function handleContextMenu(e, dept) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, dept });
  }

  function handleDeleteDept(dept) {
    if (confirm(`Delete "${dept.name}" and all its tasks?`)) {
      deleteDepartment(dept.id);
      if (selectedDeptId === dept.id) onSelectDept(null);
    }
    setContextMenu(null);
  }

  function toggleDarkMode() {
    updateSettings({ darkMode: !settings.darkMode });
  }

  async function handleExport() {
    if (window.electronAPI?.backupExport) {
      await window.electronAPI.backupExport();
    } else {
      const data = { departments: state.departments, activityLog: state.activityLog, settings: state.settings, exportedAt: new Date().toISOString(), version: '1.0' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `producer-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function handleImport() {
    if (window.electronAPI?.backupImport) {
      const result = await window.electronAPI.backupImport();
      if (result.ok && result.data) {
        if (confirm('This will replace all current data. Continue?')) {
          importData(result.data);
        }
      } else if (result.error) {
        alert('Import failed: ' + result.error);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!data.departments || !Array.isArray(data.departments)) throw new Error('Invalid');
            if (confirm('This will replace all current data. Continue?')) {
              importData(data);
            }
          } catch { alert('Invalid backup file'); }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  }

  async function handleExportCsv() {
    if (window.electronAPI?.backupExportCsv) {
      await window.electronAPI.backupExportCsv();
    } else {
      const rows = ['Department,Title,Status,Priority,Assignee,Deadline,Created'];
      for (const dept of state.departments) {
        for (const task of dept.tasks || []) {
          const row = [dept.name, task.title, task.status === 'todo' ? 'To Do' : task.status === 'inprogress' ? 'In Progress' : 'Done', task.priority, task.assignee || '', task.deadline || '', task.createdAt || ''].map(v => `"${String(v).replace(/"/g, '""')}"`);
          rows.push(row.join(','));
        }
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `producer-tracker-tasks-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const ext = (id) => isExtEnabled(settings?.enabledExtensions, id);

  const staticNavItems = [
    { key: 'dashboard', termKey: 'dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /> },
    { key: 'calendar', termKey: 'calendar', extKey: 'calendar', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    { key: 'allTasks', termKey: 'allTasks', extKey: 'allTasks', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
    { key: 'activity', termKey: 'activity', extKey: 'activity', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
    { key: 'slack', termKey: 'slack', extKey: 'slack', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
    { key: 'confluence', termKey: 'confluence', extKey: 'confluence', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
    { key: 'miro', termKey: 'miro', extKey: 'miro', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /> },
    { key: 'extensions', termKey: 'extensions', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /> },
  ];

  const dynamicNavItems = (dynamicViewNavItems || [])
    .filter((item) => !!item?.key && !staticNavItems.some((base) => base.key === item.key))
    .map((item) => ({
      key: item.key,
      label: item.label || item.key,
      icon: DYNAMIC_ICONS[item.icon] || DYNAMIC_ICONS.puzzle,
    }));

  const allNavItems = [
    ...staticNavItems.slice(0, -1),
    ...dynamicNavItems,
    staticNavItems[staticNavItems.length - 1],
  ];

  const visibleItems = allNavItems.filter(item => !item.extKey || ext(item.extKey));

  const savedOrder = settings?.navOrder;
  const navItems = savedOrder?.length
    ? [...visibleItems].sort((a, b) => {
        const ai = savedOrder.indexOf(a.key);
        const bi = savedOrder.indexOf(b.key);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : visibleItems;

  function handleNavDragStart(idx) {
    setDragIdx(idx);
  }
  function handleNavDragOver(e, idx) {
    e.preventDefault();
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  }
  function handleNavDrop(idx) {
    if (dragIdx == null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...navItems];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    updateSettings({ navOrder: reordered.map(i => i.key) });
    setDragIdx(null);
    setDragOverIdx(null);
  }
  function handleNavDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <>
      <aside className="w-64 bg-sidebar text-white flex flex-col h-full shrink-0 sidebar-glow sidebar-stars">
        <div className="p-5 pb-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight"><W k="appTitle" /></h1>
            <p className="text-xs text-gray-400 mt-0.5"><W k="appSubtitle" /></p>
          </div>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
              {/* Notification bell */}
              {ext('notifications') && (
                <NotificationsPopover
                  notifications={notifications}
                  showNotifications={showNotifications}
                  onToggleNotifications={onToggleNotifications}
                />
              )}

              {/* Dark mode toggle */}
              {ext('darkMode') && (
              <button
                onClick={toggleDarkMode}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors"
                title={settings.darkMode ? t('lightMode') : t('darkMode')}
              >
                {settings.darkMode ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              )}
          </div>
        </div>

        <div className="px-3 mb-2 space-y-0.5">
          {navItems.map((item, idx) => (
            <button
              key={item.key}
              draggable
              onDragStart={() => handleNavDragStart(idx)}
              onDragOver={(e) => handleNavDragOver(e, idx)}
              onDrop={() => handleNavDrop(idx)}
              onDragEnd={handleNavDragEnd}
              onClick={() => onNavChange(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === item.key && !selectedDeptId
                  ? 'bg-sidebar-active text-white'
                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
              } ${dragOverIdx === idx && dragIdx !== idx ? 'ring-1 ring-hp-accent ring-inset' : ''} ${dragIdx === idx ? 'opacity-40' : ''}`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {item.icon}
              </svg>
              {item.termKey ? <W k={item.termKey} /> : <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </div>

        <div className="px-3 mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-3">
            <W k="departments" />
          </span>
          <button
            onClick={() => { setEditingDept(null); setShowDeptModal(true); }}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-sidebar-hover"
            title={t('addDepartment')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-auto px-3 space-y-0.5">
          {state.departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => onSelectDept(dept.id)}
              onContextMenu={(e) => handleContextMenu(e, dept)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedDeptId === dept.id
                  ? 'bg-sidebar-active text-white'
                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: dept.color }}
              />
              <span className="truncate">{dept.name}</span>
              <span className="ml-auto text-xs text-gray-500">{dept.tasks.length}</span>
            </button>
          ))}
          {state.departments.length === 0 && (
            <p className="text-xs text-gray-500 px-3 py-4 text-center">
              <W k="noDepartments" />
            </p>
          )}
        </nav>

        <div className="p-3 border-t border-gray-700/50 space-y-1">
          {ext('dataBackup') && (
          <div className="flex gap-1">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors"
              title={t('exportDataTitle')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <W k="exportData" />
            </button>
            <button
              onClick={handleImport}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors"
              title={t('importDataTitle')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <W k="importData" />
            </button>
            <button
              onClick={handleExportCsv}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors"
              title={t('csvExportTitle')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <W k="csvExport" />
            </button>
          </div>
          )}
          <button
            onClick={() => { setEditingDept(null); setShowDeptModal(true); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <W k="newDepartment" />
          </button>
          {/* Wizard terms toggle — clear switch */}
          <button
            onClick={() => updateSettings({ wizardTerms: settings.wizardTerms === false ? true : false })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white hover:bg-sidebar-hover transition-colors mt-1"
          >
            <div className={`relative w-8 h-4 rounded-full transition-colors ${settings.wizardTerms !== false ? 'bg-hp-accent' : 'bg-gray-600'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${settings.wizardTerms !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span>{settings.wizardTerms !== false ? 'Wizarding Terms' : 'Normal Terms'}</span>
          </button>

          <button
            onClick={() => updateSettings({ house: null })}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium text-hp-accent hover:text-white hover:bg-hp-accent hover:bg-opacity-20 transition-all border border-hp-accent border-opacity-30 hover:border-opacity-60 mt-1"
            title={t('changeHouse')}
          >
            <svg viewBox="0 0 64 48" className="w-4 h-3.5" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 44c2-8 6-20 12-28C30 8 34 4 32 2c-4-2-10 4-14 12S8 36 12 44z"/>
              <path d="M52 44c-2-8-6-20-12-28C34 8 30 4 32 2c4-2 10 4 14 12s10 22 6 30z"/>
              <path d="M12 44h40" strokeLinecap="round"/>
            </svg>
            <W k="changeHouse" />
          </button>

          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">v{appVersion || '...'}</span>
              <button
                onClick={handleCheckForUpdates}
                disabled={updateCheckStatus === 'checking'}
                className="text-[10px] text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {updateCheckStatus === 'checking' ? 'Checking...' :
                 updateCheckStatus === 'unavailable' ? 'Unavailable in this build' :
                 updateCheckStatus === 'up-to-date' ? 'Up to date' :
                 updateCheckStatus === 'available' ? 'Update ready!' :
                 'Check for updates'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute bg-hp-card dark:bg-hp-card-dark rounded-lg shadow-xl border border-hp-border dark:border-hp-border-dark py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                setEditingDept(contextMenu.dept);
                setShowDeptModal(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Rename
            </button>
            <button
              onClick={() => handleDeleteDept(contextMenu.dept)}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {showDeptModal && (
        <DeptModal
          dept={editingDept}
          onClose={() => { setShowDeptModal(false); setEditingDept(null); }}
        />
      )}
    </>
  );
}

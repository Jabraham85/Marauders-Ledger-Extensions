import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';

function isOverdue(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date(new Date().toISOString().split('T')[0]);
}

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};


export default function AllTasksView({ onSelectDept }) {
  const { t } = useTheme();
  const { state, updateTask } = useStore();
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [sortBy, setSortBy] = useState('deadline');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');

  const allTasks = useMemo(() => {
    let tasks = [];
    state.departments.forEach(dept => {
      (dept.tasks || []).forEach(task => {
        tasks.push({ ...task, deptId: dept.id, deptName: dept.name, deptColor: dept.color });
      });
    });

    if (filterDept !== 'all') tasks = tasks.filter(task => task.deptId === filterDept);
    if (filterStatus !== 'all') tasks = tasks.filter(task => task.status === filterStatus);
    if (filterPriority !== 'all') tasks = tasks.filter(task => task.priority === filterPriority);

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'deadline') {
        if (!a.deadline && !b.deadline) cmp = 0;
        else if (!a.deadline) cmp = 1;
        else if (!b.deadline) cmp = -1;
        else cmp = new Date(a.deadline) - new Date(b.deadline);
      } else if (sortBy === 'priority') {
        cmp = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'department') {
        cmp = a.deptName.localeCompare(b.deptName);
      } else if (sortBy === 'status') {
        const statusOrder = { todo: 0, inprogress: 1, done: 2 };
        cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return tasks;
  }, [state.departments, filterDept, filterStatus, filterPriority, sortBy, sortDir]);

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === allTasks.length) setSelected(new Set());
    else setSelected(new Set(allTasks.map(task => task.id)));
  }

  function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    const [type, value] = bulkAction.split(':');
    selected.forEach(taskId => {
      const task = allTasks.find(tk => tk.id === taskId);
      if (!task) return;
      if (type === 'status') updateTask(task.deptId, taskId, { status: value });
      if (type === 'priority') updateTask(task.deptId, taskId, { priority: value });
    });
    setSelected(new Set());
    setBulkAction('');
  }

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return null;
    return <span className="ml-1 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-1">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-hp-text dark:text-hp-text-dark"><W k="allTasks" /></h2>
        <p className="text-hp-muted dark:text-hp-muted-dark mt-1"><W k="allTasksSubtitle" /></p>
      </div>
      <div className="magic-divider mb-6" />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
          className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-1.5 text-hp-muted dark:text-hp-muted-dark bg-hp-card dark:bg-hp-card-dark focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{t('allDepartments')}</option>
          {state.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-1.5 text-hp-muted dark:text-hp-muted-dark bg-hp-card dark:bg-hp-card-dark focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{t('allStatuses')}</option>
          <option value="todo">{t('todo')}</option>
          <option value="inprogress">{t('inProgress')}</option>
          <option value="done">{t('done')}</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-1.5 text-hp-muted dark:text-hp-muted-dark bg-hp-card dark:bg-hp-card-dark focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{t('allPriorities')}</option>
          <option value="urgent">{t('urgent')}</option>
          <option value="high">{t('high')}</option>
          <option value="medium">{t('medium')}</option>
          <option value="low">{t('low')}</option>
        </select>
        <span className="text-sm text-hp-muted dark:text-hp-muted-dark">{allTasks.length} tasks</span>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{selected.size} selected</span>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
              className="text-sm border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-1.5 bg-hp-card dark:bg-hp-card-dark text-hp-muted dark:text-hp-muted-dark">
              <option value="">{t('bulkAction')}</option>
              <option value="status:todo">{t('setTodo')}</option>
              <option value="status:inprogress">{t('setInProgress')}</option>
              <option value="status:done">{t('setDone')}</option>
              <option value="priority:urgent">{t('setUrgent')}</option>
              <option value="priority:high">{t('setHigh')}</option>
              <option value="priority:medium">{t('setMedium')}</option>
              <option value="priority:low">{t('setLow')}</option>
            </select>
            <button onClick={applyBulk} disabled={!bulkAction}
              className="text-sm font-medium text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <W k="apply" />
            </button>
          </div>
        )}
      </div>

      <div className="bg-hp-card dark:bg-hp-card-dark rounded-xl border border-hp-border dark:border-hp-border-dark overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hp-border dark:border-hp-border-dark bg-gray-50 dark:bg-gray-800/80">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={selected.size === allTasks.length && allTasks.length > 0}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                </th>
                {[
                  { key: 'title', labelKey: 'title' },
                  { key: 'department', labelKey: 'department' },
                  { key: 'priority', labelKey: 'priority' },
                  { key: 'status', labelKey: 'status' },
                  { key: 'deadline', labelKey: 'deadline' },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                    <W k={col.labelKey} /><SortIcon col={col.key} />
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider"><W k="assignee" /></th>
              </tr>
            </thead>
            <tbody>
              {allTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    <W k="noTasksMatch" />
                  </td>
                </tr>
              ) : (
                allTasks.map(task => {
                  const overdue = task.status !== 'done' && isOverdue(task.deadline);
                  return (
                    <tr key={task.id} className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${selected.has(task.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleSelect(task.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => onSelectDept(task.deptId)} className="text-sm font-medium text-hp-text dark:text-hp-text-dark hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[250px] block text-left">
                          {task.title}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-xs text-hp-muted dark:text-hp-muted-dark">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.deptColor }} />
                          {task.deptName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_STYLES[task.priority]}`}>
                          {task.priority === 'urgent' ? <W k="urgent" /> : task.priority === 'high' ? <W k="high" /> : task.priority === 'medium' ? <W k="medium" /> : <W k="low" />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          task.status === 'done' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                          task.status === 'inprogress' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          {task.status === 'todo' ? <W k="todo" /> : task.status === 'inprogress' ? <W k="inProgress" /> : <W k="done" />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {task.deadline ? (
                          <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-hp-muted dark:text-hp-muted-dark'}`}>
                            {new Date(task.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {overdue && <> (<W k="overdue" />)</>}
                          </span>
                        ) : (
                          <span className="text-xs text-hp-muted dark:text-hp-muted-dark">--</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-hp-muted dark:text-hp-muted-dark">
                        {task.assignee || <span className="text-gray-400">--</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useTheme, W } from '../theme/ThemeProvider';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 rounded px-0.5">{part}</mark> : part
  );
}

export default function SlackDigestView() {
  const { t } = useTheme();
  const { state } = useStore();
  const slack = state.slack || {};
  const messages = slack.messages || [];
  const channels = slack.channels || [];

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [showChatter, setShowChatter] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (!window.electronAPI?.slackSync) return;
    setSyncing(true);
    await window.electronAPI.slackSync();
    setSyncing(false);
  }

  const filtered = useMemo(() => {
    let msgs = [...messages];

    if (!showChatter) {
      msgs = msgs.filter(m => m.classification !== 'chatter');
    }

    if (channelFilter !== 'all') {
      msgs = msgs.filter(m => m.channel === channelFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      msgs = msgs.filter(m =>
        m.text.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        m.channel.toLowerCase().includes(q)
      );
    }

    msgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return msgs;
  }, [messages, search, channelFilter, showChatter]);

  const grouped = useMemo(() => {
    const groups = [];
    let currentDate = null;
    let currentGroup = null;

    for (const msg of filtered) {
      const dateKey = new Date(msg.timestamp).toDateString();
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        currentGroup = { date: msg.timestamp, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(msg);
    }
    return groups;
  }, [filtered]);

  const uniqueChannels = useMemo(() => {
    const set = new Set(messages.map(m => m.channel));
    return Array.from(set).sort();
  }, [messages]);

  const workCount = messages.filter(m => m.classification !== 'chatter').length;
  const chatterCount = messages.filter(m => m.classification === 'chatter').length;

  return (
    <div className="p-8 h-full flex flex-col relative z-1">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-hp-text dark:text-hp-text-dark"><W k="slackDigest" /></h2>
          <p className="text-sm text-hp-muted dark:text-hp-muted-dark mt-0.5">
            {workCount} work messages{chatterCount > 0 && `, ${chatterCount} filtered as chatter`}
            {slack.lastSync && (
              <span className="ml-2 text-gray-400">
                — Last sync: {timeAgo(slack.lastSync)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {syncing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </>
          )}
        </button>
      </div>
      <div className="magic-divider mb-6" />

      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-hp-card dark:bg-hp-card-dark flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-hp-text dark:text-hp-text-dark mb-1">No owl post yet</p>
            <p className="text-xs text-hp-muted dark:text-hp-muted-dark leading-relaxed max-w-xs">
              Connect your Owl Post using the owl icon in the sidebar, then click Sync Now to fetch messages.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search owls, authors, channels..."
                className="w-full pl-9 pr-3 py-2 border border-hp-border dark:border-hp-border-dark rounded-lg text-sm bg-hp-card dark:bg-hp-card-dark dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="border border-hp-border dark:border-hp-border-dark rounded-lg px-3 py-2 text-sm bg-hp-card dark:bg-hp-card-dark dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All channels ({uniqueChannels.length})</option>
              {uniqueChannels.map(ch => (
                <option key={ch} value={ch}>#{ch}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-hp-muted dark:text-hp-muted-dark cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showChatter}
                onChange={(e) => setShowChatter(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              Show chatter
            </label>
          </div>

          <div className="flex-1 overflow-auto space-y-6">
            {grouped.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-hp-muted dark:text-hp-muted-dark">No owls match your filters</p>
              </div>
            ) : (
              grouped.map((group, gIdx) => (
                <div key={gIdx}>
                  <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 py-1 mb-2">
                    <span className="text-xs font-semibold text-hp-muted dark:text-hp-muted-dark uppercase tracking-wider">
                      {formatDate(group.date)}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                      ({group.messages.length} message{group.messages.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          msg.classification === 'chatter'
                            ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30'
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            {msg.author.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                              {msg.author}
                            </span>
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded font-medium">
                              #{msg.channel}
                            </span>
                            {msg.classification === 'chatter' && (
                              <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
                                chatter
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                              {timeAgo(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed break-words">
                            {highlightText(msg.text, search)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
            <p className="text-[11px] text-hp-muted dark:text-hp-muted-dark text-center">
              Showing {filtered.length} of {messages.length} messages
              {slack.lastSync && ` — Last synced ${new Date(slack.lastSync).toLocaleString()}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

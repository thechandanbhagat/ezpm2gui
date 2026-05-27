import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowPathIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { io } from 'socket.io-client';
import PageHeader from './PageHeader';
import { useTranslation } from 'react-i18next';

// @group Constants : Backend API URL — must match App.tsx
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3101';

interface LogStreamEnhancedProps {
  processId?: number | string;
  logType?: 'out' | 'err';
}

// @group Utilities : Classify a log line for coloring
const lineColor = (logType: 'out' | 'err', line: string): string => {
  if (logType === 'err') return 'text-red-400';
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('err ') || l.includes('exception')) return 'text-red-400';
  if (l.includes('warn')) return 'text-amber-400';
  return 'text-neutral-300';
};

// @group LogStreamEnhanced : Full-page log viewer — process selection lives in the app sidebar
const LogStreamEnhanced: React.FC<LogStreamEnhancedProps> = ({
  processId: propProcessId,
  logType: propLogType = 'out',
}) => {
  const { t } = useTranslation();
  // Support routes: /logs/:id  and  /logs/remote/:serverId/:processId
  const params   = useParams<{ id?: string; serverId?: string; processId?: string }>();

  const isRemoteRoute = Boolean(params.serverId);
  const serverId      = isRemoteRoute ? params.serverId! : 'local';
  const initPid       = isRemoteRoute
    ? (params.processId ? Number(params.processId) : null)
    : (params.id ? Number(params.id) : propProcessId !== undefined ? Number(propProcessId) : null);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const socketRef       = useRef<any>(null);
  // Tracks whether a date-range filter is active — readable inside stale interval/socket closures
  const dateFilterActiveRef = useRef(false);

  const [logs,            setLogs]            = useState<string[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [followLogs,      setFollowLogs]      = useState(true);
  const [filter,          setFilter]          = useState('');
  const [isStreaming,     setIsStreaming]      = useState(false);
  const [selectedLogType, setSelectedLogType] = useState<'out' | 'err'>(propLogType as 'out' | 'err');
  const [processName,     setProcessName]     = useState('');

  // Date-range filter state — staged (input) vs applied (active filter)
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo,   setAppliedTo]   = useState('');

  const [filterLoading, setFilterLoading] = useState(false);

  const dateRangePending = dateFrom !== appliedFrom || dateTo !== appliedTo;

  const applyDateRange = async () => {
    if (initPid === null) return;
    dateFilterActiveRef.current = true;   // pause live updates immediately
    setFilterLoading(true);
    setError('');
    try {
      let logsData: string[] = [];
      if (serverId === 'local') {
        const res = await axios.get(`/api/logs/${initPid}/${selectedLogType}`);
        logsData = res.data.logs || [];
      } else {
        const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}/${selectedLogType}`);
        logsData = res.data.logs || [];
      }
      setLogs(logsData);
      setAppliedFrom(dateFrom);
      setAppliedTo(dateTo);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch logs');
    } finally {
      setFilterLoading(false);
    }
  };

  const clearDateRange = () => {
    dateFilterActiveRef.current = false; // resume live updates
    setDateFrom('');
    setDateTo('');
    setAppliedFrom('');
    setAppliedTo('');
  };

  // @group Utilities : Strip ANSI escape codes so the regex reliably matches timestamps
  // even when log lines are prefixed with terminal colour codes.
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[mGKHFABCDsuJK]/g, '');

  // @group Utilities : Try to extract a Date from the start of a log line
  const parseLineTimestamp = (line: string): Date | null => {
    const clean = stripAnsi(line);
    const iso = clean.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
    if (iso) { const d = new Date(iso[1].replace(' ', 'T')); if (!isNaN(d.getTime())) return d; }
    return null;
  };

  // @group DataFetch : Resolve process name for the header label
  useEffect(() => {
    if (initPid === null) return;
    const fetchName = async () => {
      try {
        if (serverId === 'local') {
          const res = await axios.get('/api/processes');
          const p = res.data.find((x: any) => x.pm_id === initPid);
          if (p) setProcessName(p.name);
        } else {
          const res = await axios.get(`/api/remote/${serverId}/processes`);
          const p = res.data.find((x: any) => x.pm_id === initPid);
          if (p) setProcessName(p.name);
        }
      } catch { /* name is cosmetic — ignore */ }
    };
    fetchName();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initPid, serverId]);

  // @group Streaming : Fetch initial logs + open socket when process/type changes
  useEffect(() => {
    if (initPid === null) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsStreaming(false);
    setLogs([]);

    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError('');
        let logsData: string[] = [];

        if (serverId === 'local') {
          const res = await axios.get(`/api/logs/${initPid}/${selectedLogType}`);
          logsData = res.data.logs || [];
        } else {
          const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}/${selectedLogType}`);
          logsData = res.data.logs || [];
        }

        setLogs(logsData);
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch logs');
        setLoading(false);
      }
    };
    fetchLogs();

    // Live streaming for local; polling for remote
    if (serverId === 'local') {
      const socket = io(API_URL, { transports: ['websocket', 'polling'], reconnection: true });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('subscribe-logs', { processId: initPid, logType: selectedLogType });
        setIsStreaming(true);
      });

      socket.on('log-line', (data) => {
        // Don't append new lines when a date-range filter is active
        if (dateFilterActiveRef.current) return;
        if (data.processId === initPid && data.logType === selectedLogType) {
          setLogs(prev => [...prev, data.line]);
        }
      });

      return () => {
        socket.emit('unsubscribe-logs', { processId: initPid, logType: selectedLogType });
        socket.disconnect();
      };
    } else {
      // Poll remote logs every 5 s so restarts/new log lines are picked up automatically
      setIsStreaming(true);
      const intervalId = setInterval(async () => {
        // Don't overwrite logs while a date-range filter is active — the user is
        // looking at a historical snapshot and polling would break the filter.
        if (dateFilterActiveRef.current) return;
        try {
          const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}/${selectedLogType}`);
          const fresh: string[] = res.data.logs || [];
          setLogs(prev => {
            // Only update if there are actually new lines to avoid needless re-renders
            if (fresh.length !== prev.length || (fresh.length > 0 && fresh[fresh.length - 1] !== prev[prev.length - 1])) {
              return fresh;
            }
            return prev;
          });
        } catch { /* ignore poll errors — user can hit refresh manually */ }
      }, 5000);
      return () => {
        clearInterval(intervalId);
        setIsStreaming(false);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initPid, serverId, selectedLogType]);

  // @group AutoScroll
  useEffect(() => {
    if (followLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, followLogs]);

  const toggleStreaming = () => {
    if (initPid === null || serverId !== 'local') return;
    const ev = isStreaming ? 'unsubscribe-logs' : 'subscribe-logs';
    socketRef.current?.emit(ev, { processId: initPid, logType: selectedLogType });
    setIsStreaming(p => !p);
  };

  const refreshLogs = async () => {
    if (initPid === null) return;
    try {
      setLoading(true);
      setError('');
      let logsData: string[] = [];
      if (serverId === 'local') {
        const res = await axios.get(`/api/logs/${initPid}/${selectedLogType}`);
        logsData = res.data.logs || [];
      } else {
        const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}/${selectedLogType}`);
        logsData = res.data.logs || [];
      }
      setLogs(logsData);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch logs');
      setLoading(false);
    }
  };

  const downloadLogs = () => {
    if (initPid === null) return;
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${processName || initPid}-${selectedLogType}.log`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // @group Filtering : Apply text + date-range filters.
  // Continuation lines (no timestamp of their own) inherit the last seen timestamp
  // so multi-line JSON bodies are included/excluded with their parent line.
  const filteredLogs = (() => {
    const textOk = (l: string) => !filter || l.toLowerCase().includes(filter.toLowerCase());

    if (!appliedFrom && !appliedTo) {
      return filter ? logs.filter(textOk) : logs;
    }

    const fromDate = appliedFrom ? new Date(appliedFrom) : null;
    // toDate: extend to end-of-minute so e.g. "15:12" includes lines up to 15:12:59
    const toDate = appliedTo
      ? new Date(new Date(appliedTo).getTime() + 59 * 1000)
      : null;
    let lastTs: Date | null = null;

    return logs.filter(l => {
      const ts = parseLineTimestamp(l);
      if (ts) lastTs = ts;
      const effectiveTs = ts ?? lastTs;

      if (effectiveTs) {
        if (fromDate && effectiveTs < fromDate) return false;
        if (toDate   && effectiveTs > toDate)   return false;
      }

      return textOk(l);
    });
  })();

  // Highlight matched search term within a line
  const highlightLine = (line: string): React.ReactNode => {
    if (!filter) return line;
    const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = line.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>
        {parts.map((part, idx) =>
          part.toLowerCase() === filter.toLowerCase()
            ? <mark key={idx} style={{ backgroundColor: '#fef08a', color: '#1a1a1a', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
            : part
        )}
      </>
    );
  };

  // @group Render
  return (
    <div>
      <PageHeader
        title="Log Streaming"
        subtitle={
          processName
            ? `${isRemoteRoute ? `Remote · ${serverId}` : 'Local'} — ${processName}`
            : 'Select a process from the sidebar'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedLogType}
              onChange={e => setSelectedLogType(e.target.value as 'out' | 'err')}
              className="h-8 px-2 pr-7 text-xs rounded border
                         bg-white dark:bg-neutral-800
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-900 dark:text-neutral-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="out">{t('logs.standardOut')}</option>
              <option value="err">{t('logs.standardErr')}</option>
            </select>

            {serverId === 'local' && (
              <button
                onClick={toggleStreaming}
                disabled={initPid === null}
                className={`h-7 px-3 text-xs font-medium rounded border transition-colors
                            disabled:opacity-50
                            ${isStreaming
                              ? 'border-red-500 text-red-500 hover:bg-red-500/10'
                              : 'border-primary-500 text-primary-500 hover:bg-primary-500/10'}`}
              >
                {isStreaming ? t('logs.stopStream') : t('logs.liveStream')}
              </button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Row 1: text filter + action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t('logs.filterLogs')}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded border
                         bg-white dark:bg-neutral-800
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-900 dark:text-neutral-100
                         placeholder-neutral-400 dark:placeholder-neutral-500
                         focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setFollowLogs(p => !p)}
              className={`h-8 px-2.5 text-xs font-medium rounded border transition-colors
                          ${followLogs
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              {t('logs.autoScroll')}
            </button>

            {isStreaming && (
              <span className="flex items-center gap-1 px-2 text-xs text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}

            <button onClick={refreshLogs} title="Refresh"
              className="h-8 w-8 flex items-center justify-center rounded border
                         border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              <ArrowPathIcon className="h-3.5 w-3.5" />
            </button>

            <button onClick={() => setLogs([])} title={t('logs.clearLogs')}
              className="h-8 w-8 flex items-center justify-center rounded border
                         border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>

            <button onClick={downloadLogs} disabled={initPid === null || logs.length === 0} title="Download"
              className="h-8 w-8 flex items-center justify-center rounded border
                         border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: date-time range filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider shrink-0">Date range</span>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">From</label>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-7 px-2 text-xs rounded border
                         bg-white dark:bg-neutral-800
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-900 dark:text-neutral-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">To</label>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-7 px-2 text-xs rounded border
                         bg-white dark:bg-neutral-800
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-900 dark:text-neutral-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={applyDateRange}
            disabled={(!dateFrom && !dateTo) || filterLoading}
            className={`h-7 px-3 text-xs font-medium rounded border transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        flex items-center gap-1.5
                        ${dateRangePending
                          ? 'bg-primary-600 border-primary-600 text-white hover:bg-primary-700'
                          : 'border-primary-500 text-primary-500 hover:bg-primary-500/10'}`}
          >
            {filterLoading ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Loading…
              </>
            ) : dateRangePending ? 'Apply ●' : 'Apply'}
          </button>
          {(appliedFrom || appliedTo) && (
            <button
              onClick={clearDateRange}
              className="h-7 px-2 text-[10px] font-medium rounded border
                         border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Clear
            </button>
          )}
          {(appliedFrom || appliedTo) && !dateRangePending && (
            <span className="text-[10px] text-emerald-500 font-medium">Filter active</span>
          )}
        </div>
      </div>

      {/* Log viewport */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {loading || filterLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <svg className="h-4 w-4 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              {filterLoading ? t('logs.applyingFilter') : t('logs.loadingLogs')}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10">
            <span className="font-medium">Error:</span> {error}
          </div>
        ) : initPid === null ? (
          <div className="flex items-center justify-center h-64 text-xs text-neutral-400 dark:text-neutral-500">
            {t('logs.selectProcessHint')}
          </div>
        ) : (
          <div
            ref={logContainerRef}
            className="h-[calc(100vh-16rem)] overflow-y-auto bg-neutral-950 p-3 font-mono text-xs leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <span className="text-neutral-600 italic">
                {(appliedFrom || appliedTo) ? t('logs.noLogsInRange') : t('logs.noLogsAvailable')}
              </span>
            ) : (
              filteredLogs.map((line, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap break-all ${lineColor(selectedLogType, line)}`}
                >
                  {highlightLine(line)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogStreamEnhanced;

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
            {/* @group Controls : Log type selector */}
            <select
              value={selectedLogType}
              onChange={e => setSelectedLogType(e.target.value as 'out' | 'err')}
              className="h-7 px-2 pr-7 text-xs font-mono rounded-sm border
                         bg-[#111] border-[#1e1e1e] text-[#e8e8e8]
                         focus:outline-none focus:border-[#22c55e]"
            >
              <option value="out">{t('logs.standardOut')}</option>
              <option value="err">{t('logs.standardErr')}</option>
            </select>

            {serverId === 'local' && (
              <button
                onClick={toggleStreaming}
                disabled={initPid === null}
                className={`h-7 px-3 text-[10px] font-mono rounded-sm border transition-colors
                            disabled:opacity-40
                            ${isStreaming
                              ? 'border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/10'
                              : 'border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10'}`}
              >
                {isStreaming ? t('logs.stopStream') : t('logs.liveStream')}
              </button>
            )}
          </div>
        }
      />

      {/* @group Toolbar : Filter controls row */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Row 1: text filter + action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555] pointer-events-none" />
            <input
              type="text"
              placeholder={t('logs.filterLogs')}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full h-7 pl-7 pr-3 text-xs font-mono rounded-sm border
                         bg-[#111] border-[#1e1e1e] text-[#e8e8e8]
                         placeholder-[#555]
                         focus:outline-none focus:border-[#22c55e]"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setFollowLogs(p => !p)}
              className={`h-7 px-2.5 text-[10px] font-mono rounded-sm border transition-colors
                          ${followLogs
                            ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
                            : 'border-[#1e1e1e] text-[#555] hover:text-[#888]'}`}
            >
              {t('logs.autoScroll')}
            </button>

            {/* Live indicator */}
            {isStreaming && (
              <span className="flex items-center gap-1 px-2 text-[10px] font-mono text-[#22c55e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                live
              </span>
            )}

            {/* Refresh */}
            <button onClick={refreshLogs} title="Refresh"
              className="h-7 w-7 flex items-center justify-center rounded-sm border
                         border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors">
              <ArrowPathIcon className="h-3 w-3" />
            </button>

            {/* Clear */}
            <button onClick={() => setLogs([])} title={t('logs.clearLogs')}
              className="h-7 w-7 flex items-center justify-center rounded-sm border
                         border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors">
              <XMarkIcon className="h-3 w-3" />
            </button>

            {/* Download */}
            <button onClick={downloadLogs} disabled={initPid === null || logs.length === 0} title="Download"
              className="h-7 w-7 flex items-center justify-center rounded-sm border
                         border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowDownTrayIcon className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* @group DateRangeFilter : Date-time range filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] shrink-0">Date range</span>

          <div className="flex items-center gap-1">
            <label className="text-[9px] font-mono text-[#555] shrink-0">from</label>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-7 px-2 text-[10px] font-mono rounded-sm border
                         bg-[#111] border-[#1e1e1e] text-[#e8e8e8]
                         focus:outline-none focus:border-[#22c55e]"
            />
          </div>

          <div className="flex items-center gap-1">
            <label className="text-[9px] font-mono text-[#555] shrink-0">to</label>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-7 px-2 text-[10px] font-mono rounded-sm border
                         bg-[#111] border-[#1e1e1e] text-[#e8e8e8]
                         focus:outline-none focus:border-[#22c55e]"
            />
          </div>

          <button
            onClick={applyDateRange}
            disabled={(!dateFrom && !dateTo) || filterLoading}
            className={`h-7 px-3 text-[10px] font-mono rounded-sm border transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        flex items-center gap-1.5
                        ${dateRangePending
                          ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/30'
                          : 'border-[#1e1e1e] text-[#555] hover:text-[#888]'}`}
          >
            {filterLoading ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                loading...
              </>
            ) : dateRangePending ? 'apply *' : 'apply'}
          </button>

          {(appliedFrom || appliedTo) && (
            <button
              onClick={clearDateRange}
              className="h-7 px-2 text-[10px] font-mono rounded-sm border
                         border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors"
            >
              clear
            </button>
          )}

          {(appliedFrom || appliedTo) && !dateRangePending && (
            <span className="text-[9px] font-mono text-[#22c55e] border border-[#22c55e]/30 rounded-sm px-1.5 py-0.5">
              filter active
            </span>
          )}
        </div>
      </div>

      {/* @group LogViewport : Scrollable log output area */}
      <div className="rounded-sm border border-[#1e1e1e] overflow-hidden">
        {loading || filterLoading ? (
          <div className="flex items-center justify-center h-64 bg-[#0a0a0a]">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#555]">
              <svg className="h-3.5 w-3.5 animate-spin text-[#22c55e]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              {filterLoading ? t('logs.applyingFilter') : t('logs.loadingLogs')}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-[10px] font-mono text-[#ef4444] bg-[#ef4444]/5 border-b border-[#1e1e1e]">
            <span className="text-[#555]">err:</span> {error}
          </div>
        ) : initPid === null ? (
          <div className="flex items-center justify-center h-64 bg-[#0a0a0a] text-[10px] font-mono text-[#555]">
            {t('logs.selectProcessHint')}
          </div>
        ) : (
          <div
            ref={logContainerRef}
            className="h-[calc(100vh-16rem)] overflow-y-auto bg-[#0a0a0a] p-3 font-mono text-[10px] leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <span className="text-[#555] italic">
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

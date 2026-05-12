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
  // Support routes: /logs/:id  and  /logs/remote/:serverId/:processId
  const params   = useParams<{ id?: string; serverId?: string; processId?: string }>();

  const isRemoteRoute = Boolean(params.serverId);
  const serverId      = isRemoteRoute ? params.serverId! : 'local';
  const initPid       = isRemoteRoute
    ? (params.processId ? Number(params.processId) : null)
    : (params.id ? Number(params.id) : propProcessId !== undefined ? Number(propProcessId) : null);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const socketRef       = useRef<any>(null);

  const [logs,            setLogs]            = useState<string[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [followLogs,      setFollowLogs]      = useState(true);
  const [filter,          setFilter]          = useState('');
  const [isStreaming,     setIsStreaming]      = useState(false);
  const [selectedLogType, setSelectedLogType] = useState<'out' | 'err'>(propLogType as 'out' | 'err');
  const [processName,     setProcessName]     = useState('');

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
          const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}`);
          logsData = selectedLogType === 'out' ? (res.data.stdout || []) : (res.data.stderr || []);
        }

        setLogs(logsData);
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch logs');
        setLoading(false);
      }
    };
    fetchLogs();

    // Live streaming only for local processes
    if (serverId === 'local') {
      const socket = io(API_URL, { transports: ['websocket', 'polling'], reconnection: true });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('subscribe-logs', { processId: initPid, logType: selectedLogType });
        setIsStreaming(true);
      });

      socket.on('log-line', (data) => {
        if (data.processId === initPid && data.logType === selectedLogType) {
          setLogs(prev => [...prev, data.line]);
        }
      });

      return () => {
        socket.emit('unsubscribe-logs', { processId: initPid, logType: selectedLogType });
        socket.disconnect();
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
        const res = await axios.get(`/api/remote/${serverId}/logs/${initPid}`);
        logsData = selectedLogType === 'out' ? (res.data.stdout || []) : (res.data.stderr || []);
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

  const filteredLogs = filter
    ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : logs;

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
              className="h-7 px-2 pr-7 text-xs rounded border
                         bg-white dark:bg-neutral-800
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-900 dark:text-neutral-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="out">Standard out</option>
              <option value="err">Standard err</option>
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
                {isStreaming ? 'Stop Stream' : 'Live Stream'}
              </button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter logs..."
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
            Auto-scroll
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

          <button onClick={() => setLogs([])} title="Clear"
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

      {/* Log viewport */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <svg className="h-4 w-4 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading logs...
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10">
            <span className="font-medium">Error:</span> {error}
          </div>
        ) : initPid === null ? (
          <div className="flex items-center justify-center h-64 text-xs text-neutral-400 dark:text-neutral-500">
            Select a process from the sidebar to view logs
          </div>
        ) : (
          <div
            ref={logContainerRef}
            className="h-[calc(100vh-16rem)] overflow-y-auto bg-neutral-950 p-3 font-mono text-xs leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <span className="text-neutral-600 italic">No logs available</span>
            ) : (
              filteredLogs.map((line, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${lineColor(selectedLogType, line)}`}>
                  {line}
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

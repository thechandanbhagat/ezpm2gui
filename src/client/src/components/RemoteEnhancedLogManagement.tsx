/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { PM2Process } from '../types/pm2';
import { RemoteConnection } from '../types/remote';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

// @group Types : Component-local data shapes

interface RemoteLogEntry {
  id: string;
  serverId: string;
  serverName: string;
  processId: number;
  processName: string;
  type: 'out' | 'err';
  level: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
  content: string;
  timestamp: Date;
  raw: string;
  isRemote: boolean;
}

interface RemoteLogFilter {
  serverIds: string[];
  processIds: string[];
  logTypes: ('out' | 'err')[];
  logLevels: ('error' | 'warn' | 'info' | 'debug' | 'unknown')[];
  searchTerm: string;
  timeRange: '1h' | '6h' | '24h' | 'all';
}

interface ServerProcessGroup {
  serverId: string;
  serverName: string;
  isRemote: boolean;
  processes: PM2Process[];
}

interface ProcessLogStats {
  serverId: string;
  serverName: string;
  processId: string;
  processName: string;
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastLogTime: Date | null;
}

// @group Utilities : Log level parsing

const parseLogLevel = (content: string): 'error' | 'warn' | 'info' | 'debug' | 'unknown' => {
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('error') || lowerContent.includes('err:')) return 'error';
  if (lowerContent.includes('warn') || lowerContent.includes('warning')) return 'warn';
  if (lowerContent.includes('info') || lowerContent.includes('log:')) return 'info';
  if (lowerContent.includes('debug') || lowerContent.includes('dbg:')) return 'debug';
  return 'unknown';
};

// @group Utilities : CLI color helpers

const levelColor = (level: string): string => {
  switch (level) {
    case 'error':   return 'text-[#ef4444]';
    case 'warn':    return 'text-[#f59e0b]';
    case 'info':    return 'text-[#22d3ee]';
    case 'debug':   return 'text-[#a78bfa]';
    default:        return 'text-[#555]';
  }
};

const levelBadge = (level: string): string => {
  switch (level) {
    case 'error':   return 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10';
    case 'warn':    return 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10';
    case 'info':    return 'text-[#22d3ee] border-[#22d3ee]/30 bg-[#22d3ee]/10';
    case 'debug':   return 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/10';
    default:        return 'text-[#555] border-[#1e1e1e] bg-transparent';
  }
};

const levelPrefix = (level: string): string => {
  switch (level) {
    case 'error': return '[ERR]';
    case 'warn':  return '[WRN]';
    case 'info':  return '[INF]';
    case 'debug': return '[DBG]';
    default:      return '[---]';
  }
};

// @group Render : Reusable CLI toggle button

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  activeClass?: string;
  children: React.ReactNode;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({ active, onClick, activeClass = 'text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10', children }) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 rounded-sm border font-mono text-[10px] transition-colors ${
      active
        ? activeClass
        : 'text-[#555] border-[#1e1e1e] bg-transparent hover:text-[#888] hover:border-[#333]'
    }`}
  >
    {children}
  </button>
);

// @group Render : CLI icon button

interface IconBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

const IconBtn: React.FC<IconBtnProps> = ({ onClick, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="p-1 rounded-sm text-[#555] hover:text-[#888] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
  >
    {children}
  </button>
);

// @group Main : RemoteEnhancedLogManagement component

const RemoteEnhancedLogManagement: React.FC = () => {
  const { t } = useTranslation();
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [serverGroups, setServerGroups]   = useState<ServerProcessGroup[]>([]);
  const [logs, setLogs]                   = useState<RemoteLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs]   = useState<RemoteLogEntry[]>([]);
  const [logStats, setLogStats]           = useState<ProcessLogStats[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [isStreaming, setIsStreaming]      = useState(false);
  const [autoScroll, setAutoScroll]       = useState(true);
  const [selectedTab, setSelectedTab]     = useState(0);
  const [expandedServers, setExpandedServers] = useState<string[]>(['local']);

  const [filters, setFilters] = useState<RemoteLogFilter>({
    serverIds: [],
    processIds: [],
    logTypes: ['out', 'err'],
    logLevels: ['error', 'warn', 'info', 'debug', 'unknown'],
    searchTerm: '',
    timeRange: '1h'
  });

  // @group BusinessLogic : Fetch servers and processes on mount

  useEffect(() => {
    const fetchServersAndProcesses = async () => {
      try {
        setLoading(true);

        const localProcessesResponse = await axios.get('/api/processes');
        const localProcesses = localProcessesResponse.data;

        const remoteConnectionsResponse = await axios.get('/api/remote/connections');
        const connections: RemoteConnection[] = remoteConnectionsResponse.data;

        const groups: ServerProcessGroup[] = [];

        groups.push({ serverId: 'local', serverName: 'Local Server', isRemote: false, processes: localProcesses });

        for (const connection of connections) {
          try {
            if (connection.connected) {
              const remoteProcessesResponse = await axios.get(`/api/remote/${connection.id}/processes`);
              groups.push({ serverId: connection.id, serverName: connection.name, isRemote: true, processes: remoteProcessesResponse.data });
            }
          } catch {
            groups.push({ serverId: connection.id, serverName: connection.name, isRemote: true, processes: [] });
          }
        }

        setServerGroups(groups);
        setFilters(prev => ({ ...prev, serverIds: groups.map(g => g.serverId) }));
        setLoading(false);
      } catch {
        setError('Failed to fetch servers and processes');
        setLoading(false);
      }
    };

    fetchServersAndProcesses();
  }, []);

  // @group BusinessLogic : Fetch logs for selected servers

  const fetchLogs = async () => {
    if (filters.serverIds.length === 0) return;
    try {
      setLoading(true);
      const allLogs: RemoteLogEntry[] = [];

      for (const serverId of filters.serverIds) {
        const serverGroup = serverGroups.find(g => g.serverId === serverId);
        if (!serverGroup) continue;

        const relevantProcesses = filters.processIds.length > 0
          ? serverGroup.processes.filter(p => filters.processIds.includes(`${serverId}-${p.pm_id}`))
          : serverGroup.processes;

        for (const process of relevantProcesses) {
          try {
            let logResponse;

            if (serverGroup.isRemote) {
              logResponse = await axios.get(`/api/remote/${serverId}/logs/${process.pm_id}`);
            } else {
              const [outResponse, errResponse] = await Promise.all([
                axios.get(`/api/logs/${process.pm_id}/out`),
                axios.get(`/api/logs/${process.pm_id}/err`)
              ]);
              logResponse = { data: { stdout: outResponse.data.logs || [], stderr: errResponse.data.logs || [] } };
            }

            logResponse.data.stdout?.forEach((log: string, index: number) => {
              if (log.trim()) {
                allLogs.push({
                  id: `${serverId}-${process.pm_id}-out-${index}-${Date.now()}`,
                  serverId, serverName: serverGroup.serverName, processId: process.pm_id,
                  processName: process.name, type: 'out', level: parseLogLevel(log), content: log,
                  timestamp: new Date(Date.now() - (logResponse.data.stdout.length - index) * 1000),
                  raw: log, isRemote: serverGroup.isRemote
                });
              }
            });

            logResponse.data.stderr?.forEach((log: string, index: number) => {
              if (log.trim()) {
                allLogs.push({
                  id: `${serverId}-${process.pm_id}-err-${index}-${Date.now()}`,
                  serverId, serverName: serverGroup.serverName, processId: process.pm_id,
                  processName: process.name, type: 'err', level: parseLogLevel(log), content: log,
                  timestamp: new Date(Date.now() - (logResponse.data.stderr.length - index) * 1000),
                  raw: log, isRemote: serverGroup.isRemote
                });
              }
            });
          } catch {
            // skip unavailable processes
          }
        }
      }

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      generateLogStats(allLogs);
      setLoading(false);
    } catch {
      setError('Failed to fetch logs');
      setLoading(false);
    }
  };

  // @group BusinessLogic : Generate per-process log statistics

  const generateLogStats = (allLogs: RemoteLogEntry[]) => {
    const stats: ProcessLogStats[] = [];
    serverGroups.forEach(serverGroup => {
      serverGroup.processes.forEach(process => {
        const processLogs = allLogs.filter(log => log.serverId === serverGroup.serverId && log.processId === process.pm_id);
        if (processLogs.length > 0) {
          stats.push({
            serverId: serverGroup.serverId, serverName: serverGroup.serverName,
            processId: `${serverGroup.serverId}-${process.pm_id}`, processName: process.name,
            totalLogs: processLogs.length,
            errorCount: processLogs.filter(log => log.level === 'error').length,
            warningCount: processLogs.filter(log => log.level === 'warn').length,
            infoCount: processLogs.filter(log => log.level === 'info').length,
            lastLogTime: processLogs.length > 0 ? processLogs[0].timestamp : null
          });
        }
      });
    });
    setLogStats(stats);
  };

  // @group BusinessLogic : Apply filters reactively

  useEffect(() => {
    let filtered = logs;
    if (filters.serverIds.length > 0) filtered = filtered.filter(log => filters.serverIds.includes(log.serverId));
    if (filters.processIds.length > 0) filtered = filtered.filter(log => filters.processIds.includes(`${log.serverId}-${log.processId}`));
    if (filters.logTypes.length > 0) filtered = filtered.filter(log => filters.logTypes.includes(log.type));
    if (filters.logLevels.length > 0) filtered = filtered.filter(log => filters.logLevels.includes(log.level));
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(log => log.content.toLowerCase().includes(term) || log.processName.toLowerCase().includes(term) || log.serverName.toLowerCase().includes(term));
    }
    if (filters.timeRange !== 'all') {
      const now = new Date();
      const ms = ({ '1h': 3600000, '6h': 21600000, '24h': 86400000 } as Record<string, number>)[filters.timeRange];
      filtered = filtered.filter(log => now.getTime() - log.timestamp.getTime() <= ms);
    }
    setFilteredLogs(filtered);
  }, [logs, filters]);

  // @group BusinessLogic : Auto-scroll log pane

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // @group BusinessLogic : Download logs as .log file

  const downloadLogs = () => {
    const content = filteredLogs.map(log =>
      `[${log.timestamp.toISOString()}] [${log.serverName}] [${log.processName}] [${log.type.toUpperCase()}] [${log.level.toUpperCase()}] ${log.content}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ezpm2gui-remote-logs-${new Date().toISOString().split('T')[0]}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // @group Utilities : All process options for multi-select

  const getAllProcessOptions = () => {
    const options: { value: string; label: string }[] = [];
    serverGroups.forEach(serverGroup => {
      serverGroup.processes.forEach(process => {
        options.push({ value: `${serverGroup.serverId}-${process.pm_id}`, label: `${process.name} (${serverGroup.serverName})` });
      });
    });
    return options;
  };

  // @group Render : Tab definitions

  const tabs = [
    t('remoteEnhancedLogs.tabLogViewer'),
    t('remoteEnhancedLogs.tabStatistics'),
    t('remoteEnhancedLogs.tabServerTree')
  ];

  // @group Render : Component output

  return (
    <div className="flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1e1e1e]">
        <div>
          <h1 className="text-[11px] font-mono font-semibold text-[#e8e8e8] leading-tight uppercase tracking-[0.1em]">
            {t('remoteEnhancedLogs.title')}
          </h1>
          <p className="text-[10px] font-mono text-[#555] mt-0.5">{t('remoteEnhancedLogs.subtitle')}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsStreaming(s => !s)}
            disabled={filters.serverIds.length === 0}
            className={`px-2.5 py-1 rounded-sm border font-mono text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              isStreaming
                ? 'text-[#ef4444] border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20'
                : 'text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10 hover:bg-[#22c55e]/20'
            }`}
          >
            {isStreaming ? '⏸ ' + t('logs.stopStream') : '▶ ' + t('logs.liveStream')}
          </button>

          <IconBtn onClick={fetchLogs} disabled={loading} title="Refresh">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </IconBtn>

          <IconBtn onClick={() => { setLogs([]); setFilteredLogs([]); }} title="Clear">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconBtn>

          <IconBtn onClick={downloadLogs} disabled={filteredLogs.length === 0} title="Download">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-sm">
          <span className="text-[#ef4444] text-[10px] font-mono">[ERR]</span>
          <span className="text-[#ef4444] text-[10px] font-mono">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-[#555] hover:text-[#888]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-[#1e1e1e]">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setSelectedTab(i)}
            className={`px-3 py-1.5 font-mono text-[10px] border-b-2 transition-colors ${
              selectedTab === i
                ? 'text-[#e8e8e8] border-[#22c55e]'
                : 'text-[#555] border-transparent hover:text-[#888]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Log Viewer ── */}
      {selectedTab === 0 && (
        <>
          {/* Filter toolbar */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3 flex flex-col gap-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {/* Search */}
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder={t('logs.searchLogs')}
                  value={filters.searchTerm}
                  onChange={e => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full pl-6 pr-2 py-1 bg-[#0a0a0a] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-[10px] rounded-sm placeholder-[#555] focus:outline-none focus:border-[#333]"
                />
              </div>

              {/* Server selector */}
              <select
                multiple
                value={filters.serverIds}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, o => o.value);
                  setFilters(prev => ({ ...prev, serverIds: selected }));
                }}
                className="bg-[#0a0a0a] border border-[#1e1e1e] text-[#888] font-mono text-[10px] rounded-sm px-2 py-1 focus:outline-none focus:border-[#333] h-14"
              >
                {serverGroups.map(sg => (
                  <option key={sg.serverId} value={sg.serverId} className="py-0.5">
                    {sg.isRemote ? '☁ ' : '⬛ '}{sg.serverName} ({sg.processes.length})
                  </option>
                ))}
              </select>

              {/* Process selector */}
              <select
                multiple
                value={filters.processIds}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, o => o.value);
                  setFilters(prev => ({ ...prev, processIds: selected }));
                }}
                className="bg-[#0a0a0a] border border-[#1e1e1e] text-[#888] font-mono text-[10px] rounded-sm px-2 py-1 focus:outline-none focus:border-[#333] h-14"
              >
                {getAllProcessOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Time range */}
              <select
                value={filters.timeRange}
                onChange={e => setFilters(prev => ({ ...prev, timeRange: e.target.value as RemoteLogFilter['timeRange'] }))}
                className="bg-[#0a0a0a] border border-[#1e1e1e] text-[#888] font-mono text-[10px] rounded-sm px-2 py-1 focus:outline-none focus:border-[#333]"
              >
                <option value="1h">{t('remoteEnhancedLogs.lastHour')}</option>
                <option value="6h">{t('remoteEnhancedLogs.last6Hours')}</option>
                <option value="24h">{t('remoteEnhancedLogs.last24Hours')}</option>
                <option value="all">{t('remoteEnhancedLogs.allTime')}</option>
              </select>
            </div>

            {/* Type / level toggles + auto-scroll */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('remoteEnhancedLogs.logTypes')}</span>
              <ToggleButton active={filters.logTypes.includes('out')} onClick={() => setFilters(prev => ({ ...prev, logTypes: prev.logTypes.includes('out') ? prev.logTypes.filter(t => t !== 'out') : [...prev.logTypes, 'out'] }))}>
                {t('remoteEnhancedLogs.stdout')}
              </ToggleButton>
              <ToggleButton active={filters.logTypes.includes('err')} activeClass="text-[#ef4444] border-[#ef4444]/40 bg-[#ef4444]/10" onClick={() => setFilters(prev => ({ ...prev, logTypes: prev.logTypes.includes('err') ? prev.logTypes.filter(t => t !== 'err') : [...prev.logTypes, 'err'] }))}>
                {t('remoteEnhancedLogs.stderr')}
              </ToggleButton>

              <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em] ml-2">{t('remoteEnhancedLogs.levels')}</span>
              {(['error', 'warn', 'info', 'debug'] as const).map(level => (
                <ToggleButton
                  key={level}
                  active={filters.logLevels.includes(level)}
                  activeClass={levelBadge(level)}
                  onClick={() => setFilters(prev => ({ ...prev, logLevels: prev.logLevels.includes(level) ? prev.logLevels.filter(l => l !== level) : [...prev.logLevels, level] }))}
                >
                  {level}
                </ToggleButton>
              ))}

              <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setAutoScroll(a => !a)}
                  className={`w-6 h-3 rounded-sm flex items-center transition-colors cursor-pointer ${autoScroll ? 'bg-[#22c55e]/30 border border-[#22c55e]/40' : 'bg-[#1a1a1a] border border-[#1e1e1e]'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-sm transition-transform ${autoScroll ? 'translate-x-3 bg-[#22c55e]' : 'translate-x-0.5 bg-[#555]'}`} />
                </div>
                <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('logs.autoScroll')}</span>
              </label>
            </div>
          </div>

          {/* Log output pane */}
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm flex flex-col" style={{ height: 'calc(100vh - 400px)', minHeight: 280 }}>
            {/* Pane header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e1e1e]">
              <span className="font-mono text-[10px] text-[#555]">
                {t('remoteEnhancedLogs.logsCount', { count: filteredLogs.length })}
              </span>
              {isStreaming && (
                <span className="px-1.5 py-0.5 rounded-sm border font-mono text-[9px] text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10 animate-pulse">
                  {t('remoteEnhancedLogs.streaming')}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center gap-2">
                <div className="w-3 h-3 border border-[#22c55e] border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-[10px] text-[#555]">{t('logs.loadingLogs')}</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="font-mono text-[10px] text-[#555]">{t('remoteEnhancedLogs.noLogsFound')}</span>
              </div>
            ) : (
              <div ref={logContainerRef} className="flex-1 overflow-auto bg-[#0a0a0a] px-2 py-1">
                {filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className="flex items-baseline gap-2 py-px border-b border-[#0f0f0f] hover:bg-[#111] group"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-[#555] whitespace-nowrap">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[#555] whitespace-nowrap">
                      {log.serverName}/{log.processName}
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] whitespace-nowrap ${levelColor(log.level)}`}>
                      {levelPrefix(log.level)}
                    </span>
                    <span className={`font-mono text-[10px] whitespace-pre-wrap break-all ${log.type === 'err' ? 'text-[#ef4444]' : 'text-[#e8e8e8]'}`}>
                      {log.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab 1: Statistics ── */}
      {selectedTab === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {logStats.map(stat => (
            <div key={stat.processId} className="bg-[#111] border border-[#1e1e1e] rounded-sm px-3 py-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-mono ${stat.serverId !== 'local' ? 'text-[#22d3ee]' : 'text-[#a78bfa]'}`}>
                  {stat.serverId !== 'local' ? '☁' : '⬛'}
                </span>
                <span className="text-[11px] font-mono font-bold text-[#e8e8e8] truncate">{stat.processName}</span>
              </div>
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">
                {t('remoteEnhancedLogs.server', { name: stat.serverName })}
              </p>
              <p className="text-[10px] font-mono text-[#888]">
                {t('remoteEnhancedLogs.totalLogs', { count: stat.totalLogs })}
              </p>
              <div className="flex gap-1 flex-wrap">
                {stat.errorCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-sm border font-mono text-[9px] text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10">
                    {t('remoteEnhancedLogs.errors', { count: stat.errorCount })}
                  </span>
                )}
                {stat.warningCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-sm border font-mono text-[9px] text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10">
                    {t('remoteEnhancedLogs.warnings', { count: stat.warningCount })}
                  </span>
                )}
                {stat.infoCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-sm border font-mono text-[9px] text-[#22d3ee] border-[#22d3ee]/30 bg-[#22d3ee]/10">
                    {t('remoteEnhancedLogs.info', { count: stat.infoCount })}
                  </span>
                )}
              </div>
              {stat.lastLogTime && (
                <p className="text-[9px] font-mono text-[#555]">
                  {t('remoteEnhancedLogs.lastLog', { time: stat.lastLogTime.toLocaleString() })}
                </p>
              )}
            </div>
          ))}
          {logStats.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-8">
              <span className="font-mono text-[10px] text-[#555]">{t('remoteEnhancedLogs.noLogsFound')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Server Tree ── */}
      {selectedTab === 2 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-mono font-semibold text-[#888] uppercase tracking-[0.12em] pb-2 border-b border-[#1e1e1e]">
            {t('remoteEnhancedLogs.serverAndAppTree')}
          </p>

          {serverGroups.map(serverGroup => {
            const isExpanded = expandedServers.includes(serverGroup.serverId);
            return (
              <div key={serverGroup.serverId} className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
                {/* Server row */}
                <button
                  onClick={() => setExpandedServers(prev =>
                    prev.includes(serverGroup.serverId)
                      ? prev.filter(id => id !== serverGroup.serverId)
                      : [...prev, serverGroup.serverId]
                  )}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#141414] transition-colors"
                >
                  <span className={`text-[10px] font-mono ${isExpanded ? 'text-[#888]' : 'text-[#555]'}`}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <span className={`text-[10px] font-mono ${serverGroup.isRemote ? 'text-[#22d3ee]' : 'text-[#a78bfa]'}`}>
                    {serverGroup.isRemote ? '☁' : '⬛'}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#e8e8e8]">{serverGroup.serverName}</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded-sm border font-mono text-[9px] text-[#555] border-[#1e1e1e]">
                    {serverGroup.processes.length}
                  </span>
                </button>

                {/* Process list */}
                {isExpanded && (
                  <div className="border-t border-[#1e1e1e] bg-[#0d0d0d]">
                    {serverGroup.processes.length === 0 ? (
                      <div className="px-6 py-2">
                        <p className="font-mono text-[10px] text-[#555]">{t('remoteEnhancedLogs.noApplicationsFound')}</p>
                        <p className="font-mono text-[9px] text-[#444] mt-0.5">
                          {serverGroup.isRemote ? t('remoteEnhancedLogs.checkRemoteConnection') : t('remoteEnhancedLogs.noPm2Running')}
                        </p>
                      </div>
                    ) : (
                      serverGroup.processes.map(process => {
                        const processLogs = logStats.find(s =>
                          s.serverId === serverGroup.serverId && s.processId === `${serverGroup.serverId}-${process.pm_id}`
                        );
                        return (
                          <div key={process.pm_id} className="flex items-center gap-2 px-6 py-1.5 border-b border-[#1e1e1e] last:border-0 hover:bg-[#111]">
                            <span className="text-[10px] font-mono text-[#555]">├</span>
                            <span className="text-[10px] font-mono text-[#e8e8e8] font-medium">{process.name}</span>
                            <span className="text-[9px] font-mono text-[#555]">#{process.pm_id}</span>
                            <div className="ml-auto flex gap-1">
                              {processLogs ? (
                                <>
                                  <span className="font-mono text-[9px] text-[#555]">{processLogs.totalLogs} total</span>
                                  {processLogs.errorCount > 0 && (
                                    <span className="px-1 py-px rounded-sm border font-mono text-[9px] text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10">
                                      {processLogs.errorCount} err
                                    </span>
                                  )}
                                  {processLogs.warningCount > 0 && (
                                    <span className="px-1 py-px rounded-sm border font-mono text-[9px] text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10">
                                      {processLogs.warningCount} wrn
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="font-mono text-[9px] text-[#555]">{t('logs.noLogsAvailable')}</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RemoteEnhancedLogManagement;

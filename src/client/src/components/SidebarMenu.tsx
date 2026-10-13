import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChartBarIcon,
  PlusIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
  ServerStackIcon,
  ScaleIcon,
  CloudIcon,
  ClockIcon,
  ServerIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CpuChipIcon,
  PlayIcon,
  ArrowPathIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { RemoteConnection } from '../types/remote';
import { AUTH_CONFIG_CHANGED_EVENT, AUTH_REQUIRED_EVENT, AUTH_SESSION_CHANGED_EVENT, getToken } from '../auth';
import { REMOTE_CONNECTIONS_CHANGED_EVENT, RemoteConnectionsChangedDetail } from '../utils/server-selection';

const TREE_REFRESH_MS = 5000;

interface SidebarMenuProps {
  onItemClick?: () => void;
  collapsed?: boolean;
}

// @group Types : Process entry for log sidebar tree
interface SidebarProcess {
  id: number;
  name: string;
  status: string;
}

interface SidebarProcessResponse {
  pm_id: number;
  name: string;
  status?: string;
  pm2_env?: { status?: string };
}

// @group Types : Server group for log sidebar tree
interface SidebarServerGroup {
  serverId: string;
  serverName: string;
  isRemote: boolean;
  connected: boolean;
  processes: SidebarProcess[];
  loading: boolean;
}

interface SidebarConnectionState {
  pending: boolean;
  error?: string;
}

// @group SidebarMenu : Navigation menu for the application sidebar
const SidebarMenu: React.FC<SidebarMenuProps> = ({ onItemClick, collapsed = false }) => {
  const location = useLocation();
  const { t } = useTranslation();
  const translation = useRef(t);
  translation.current = t;
  const navigate  = useNavigate();
  const currentPath = location.pathname;

  const handleItemClick = () => onItemClick?.();

  const isActive = (path: string) => {
    if (path === '/' && (currentPath === '/' || currentPath === '/processes')) return true;
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  // @group LogTree : Server/process tree state
  const [serverGroups,    setServerGroups]    = useState<SidebarServerGroup[]>([]);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set(['local']));
  const [treeLoading,     setTreeLoading]     = useState(false);
  const [actionLoading,   setActionLoading]   = useState<{ [key: string]: boolean }>({});
  const [connectionStates, setConnectionStates] = useState<Record<string, SidebarConnectionState>>({});
  const connectionRequests = useRef(new Map<string, AbortController>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const requests = connectionRequests.current;
    let active = true;
    let fetching = false;
    let refreshPending = false;
    let suspended = false;
    let version = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const reportedErrors = new Set<string>();

    const reportError = (scope: string, error: unknown) => {
      if (reportedErrors.has(scope)) return;
      reportedErrors.add(scope);
      console.error(`Failed to refresh sidebar ${scope}:`, error);
    };

    const mapProcesses = (processes: SidebarProcessResponse[]): SidebarProcess[] => processes.map(process => ({
      id: process.pm_id,
      name: process.name,
      status: process.pm2_env?.status ?? process.status ?? 'unknown',
    }));

    const load = async (): Promise<void> => {
      if (!active || suspended || fetching) return;
      fetching = true;
      refreshPending = false;
      if (timer) clearTimeout(timer);
      const requestVersion = version;
      const requestToken = getToken();
      const requestController = new AbortController();
      controller = requestController;
      const current = () => active && !suspended && version === requestVersion && getToken() === requestToken;
      setTreeLoading(true);
      try {
        const [localResult, connectionsResult] = await Promise.allSettled([
          axios.get<SidebarProcessResponse[]>('/api/processes', { signal: requestController.signal }),
          axios.get<RemoteConnection[]>('/api/remote/connections', { signal: requestController.signal }),
        ]);
        if (!current()) return;
        if (localResult.status === 'rejected') reportError('local processes', localResult.reason);
        else reportedErrors.delete('local processes');
        if (connectionsResult.status === 'rejected') {
          reportError('connections', connectionsResult.reason);
          return;
        }
        reportedErrors.delete('connections');
        const connections = connectionsResult.value.data;
        const connectionIds = new Set(connections.map(connection => connection.id));
        requests.forEach((request, connectionId) => {
          if (!connectionIds.has(connectionId)) {
            request.abort();
            requests.delete(connectionId);
          }
        });
        setConnectionStates(previous => Object.fromEntries(Object.entries(previous).filter(([connectionId]) => connectionIds.has(connectionId))));
        const localProcesses = localResult.status === 'fulfilled' ? mapProcesses(localResult.value.data) : undefined;
        setServerGroups(previous => [
          { serverId: 'local', serverName: translation.current('nav.localServer'), isRemote: false, connected: true,
            processes: localProcesses ?? previous.find(group => group.serverId === 'local')?.processes ?? [], loading: false },
          ...connections.map(connection => {
            const previousGroup = previous.find(group => group.serverId === connection.id);
            const processes = connection.connected && previousGroup?.connected ? previousGroup.processes : [];
            return { serverId: connection.id, serverName: connection.name, isRemote: true, connected: connection.connected,
              processes, loading: connection.connected && processes.length === 0 };
          }),
        ]);

        const connected = connections.filter(connection => connection.connected);
        const results = await Promise.allSettled(connected.map(async connection => {
          const response = await axios.get<SidebarProcessResponse[]>(`/api/remote/${connection.id}/processes`, { signal: requestController.signal });
          return { id: connection.id, processes: mapProcesses(response.data) };
        }));
        if (!current()) return;
        results.forEach((result, index) => {
          const scope = `remote ${connected[index].id}`;
          if (result.status === 'rejected') reportError(scope, result.reason);
          else reportedErrors.delete(scope);
        });
        setServerGroups(previous => previous.map(group => {
          const result = results.find(response => response.status === 'fulfilled' && response.value.id === group.serverId);
          return { ...group, processes: result?.status === 'fulfilled' ? result.value.processes : group.processes, loading: false };
        }));
      } catch (error) {
        if (current()) reportError('data', error);
      } finally {
        fetching = false;
        if (current()) setTreeLoading(false);
        if (active && !suspended) {
          if (refreshPending) void load();
          else timer = setTimeout(() => { void load(); }, TREE_REFRESH_MS);
        }
      }
    };

    const refresh = () => {
      version += 1;
      refreshPending = true;
      controller?.abort();
      if (!fetching) void load();
    };
    const connectionsChanged = (event: Event) => {
      const detail = (event as CustomEvent<RemoteConnectionsChangedDetail>).detail;
      if (detail?.deletedConnectionId || detail?.connected === false) {
        const connectionId = detail.deletedConnectionId ?? detail.connectionId;
        if (connectionId) {
          requests.get(connectionId)?.abort();
          requests.delete(connectionId);
          setConnectionStates(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== connectionId)));
        }
        setServerGroups(previous => previous
          .filter(group => group.serverId !== detail.deletedConnectionId)
          .map(group => group.serverId === detail.connectionId ? { ...group, connected: false, processes: [], loading: false } : group));
      }
      refresh();
    };
    const resetSession = (shouldSuspend: boolean) => {
      requests.forEach(request => request.abort());
      requests.clear();
      setConnectionStates({});
      suspended = shouldSuspend;
      if (suspended) {
        setServerGroups([]);
        setTreeLoading(false);
        if (timer) clearTimeout(timer);
      }
      refresh();
    };
    const sessionChanged = () => resetSession(getToken() === null);
    const authRequired = () => resetSession(true);
    const authConfigChanged = (event: Event) => {
      const config = (event as CustomEvent<{ passwordSet: boolean }>).detail;
      if (config?.passwordSet === false) {
        suspended = false;
        refresh();
      } else if (config?.passwordSet === true && getToken() === null) {
        resetSession(true);
      }
    };
    window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, connectionsChanged);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, sessionChanged);
    window.addEventListener(AUTH_REQUIRED_EVENT, authRequired);
    window.addEventListener(AUTH_CONFIG_CHANGED_EVENT, authConfigChanged);
    void load();
    return () => {
      mounted.current = false;
      requests.forEach(request => request.abort());
      requests.clear();
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, connectionsChanged);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, sessionChanged);
      window.removeEventListener(AUTH_REQUIRED_EVENT, authRequired);
      window.removeEventListener(AUTH_CONFIG_CHANGED_EVENT, authConfigChanged);
    };
  }, []);

  const toggleServer = (id: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const connectServer = async (serverId: string): Promise<void> => {
    if (connectionRequests.current.has(serverId)) return;
    const requestController = new AbortController();
    const requestToken = getToken();
    connectionRequests.current.set(serverId, requestController);
    setConnectionStates(previous => ({ ...previous, [serverId]: { pending: true } }));
    const current = () => mounted.current && !requestController.signal.aborted &&
      connectionRequests.current.get(serverId) === requestController && getToken() === requestToken;
    try {
      const response = await axios.post<unknown>(`/api/remote/${encodeURIComponent(serverId)}/connect`, undefined, {
        signal: requestController.signal,
      });
      if (!current()) return;
      if (!response.data || typeof response.data !== 'object' || !('success' in response.data) || response.data.success !== true) {
        throw new Error(translation.current('sidebar.connectFailed'));
      }
      setExpandedServers(previous => new Set([...previous, serverId]));
      window.dispatchEvent(new CustomEvent<RemoteConnectionsChangedDetail>(REMOTE_CONNECTIONS_CHANGED_EVENT, {
        detail: { connectionId: serverId, connected: true },
      }));
    } catch (error) {
      if (!current()) return;
      const responseError = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      const message = typeof responseError === 'string' && responseError.trim()
        ? responseError : error instanceof Error && error.message ? error.message : translation.current('sidebar.connectFailed');
      setConnectionStates(previous => ({ ...previous, [serverId]: { pending: false, error: message } }));
    } finally {
      if (connectionRequests.current.get(serverId) === requestController) {
        connectionRequests.current.delete(serverId);
        if (mounted.current && !requestController.signal.aborted) {
          setConnectionStates(previous => ({ ...previous, [serverId]: { ...previous[serverId], pending: false } }));
        }
      }
    }
  };

  const handleProcessAction = async (e: React.MouseEvent, serverId: string, proc: SidebarProcess, action: 'start' | 'stop' | 'restart') => {
    e.stopPropagation();
    const key = `${serverId}-${proc.id}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      if (serverId === 'local') {
        await axios.post(`/api/process/${proc.id}/${action}`);
      } else {
        await axios.post(`/api/remote/${serverId}/processes/${proc.name}/${action}`);
      }
      setServerGroups(prev => prev.map(g =>
        g.serverId !== serverId ? g : {
          ...g,
          processes: g.processes.map(p =>
            p.id === proc.id ? { ...p, status: action === 'start' || action === 'restart' ? 'online' : 'stopped' } : p
          )
        }
      ));
    } catch (err) {
      console.error(`Failed to ${action} process:`, err);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const selectProcess = (serverId: string, proc: SidebarProcess) => {
    handleItemClick();
    if (serverId === 'local') {
      navigate(`/logs/${proc.id}`);
    } else {
      navigate(`/logs/remote/${serverId}/${proc.id}`);
    }
  };

  // @group Navigation : Menu items configuration
  const menuItems = [
    { label: t('nav.processes'),        path: '/processes',          icon: ChartBarIcon },
    { label: t('nav.remoteServers'),    path: '/remote',             icon: CloudIcon },
    { label: t('nav.metrics'),          path: '/metrics',            icon: CpuChipIcon },
    { label: t('nav.deployApp'),        path: '/deploy',             icon: PlusIcon },
    { label: t('nav.pm2Modules'),       path: '/modules',            icon: PuzzlePieceIcon },
    { label: t('nav.ecosystemConfig'),  path: '/ecosystem',          icon: DocumentTextIcon },
    { label: t('nav.cluster'),          path: '/cluster',            icon: ServerStackIcon },
    { label: t('nav.cronJobs'),         path: '/cron-jobs',          icon: ClockIcon },
    { label: t('nav.loadBalancing'),    path: '/load-balancing-guide', icon: ScaleIcon },
    { label: t('nav.help'),             path: '/help',               icon: QuestionMarkCircleIcon },
  ];

  // @group Render : Sidebar layout with sections
  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] overflow-hidden">

      {/* ── Process Management ── */}
      <nav className="px-1.5 py-2 overflow-x-hidden shrink-0">
        {!collapsed && (
          <p className="px-2 mb-1 font-mono font-bold text-[9px] text-[#333] uppercase tracking-[0.2em] whitespace-nowrap">
            {t('nav.management')}
          </p>
        )}

        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleItemClick}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={`
                  flex items-center gap-2 font-mono text-[11px]
                  transition-colors duration-100
                  ${collapsed ? 'px-0 py-1.5 justify-center w-full' : 'px-2 py-1.5'}
                  ${
                    active
                      ? 'text-[#e8e8e8] bg-[#1a1a1a] border-l-2 border-[#22c55e]'
                      : 'text-[#555] hover:text-[#888] hover:bg-[#111]'
                  }
                `}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#e8e8e8]' : 'text-[#444]'}`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Section divider ── */}
      {!collapsed && <div className="border-t border-[#111] shrink-0" />}

      {/* ── Process Tree ── */}
      {!collapsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="px-3 pt-2 pb-1 font-mono text-[9px] text-[#333] uppercase tracking-[0.2em] shrink-0">
            {t('sidebar.processes')}
          </p>
          <div className="flex-1 overflow-y-auto">
            {treeLoading && serverGroups.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <svg className="h-3.5 w-3.5 animate-spin text-[#333]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            ) : (
              serverGroups.map(group => {
                const expanded = expandedServers.has(group.serverId);
                const connectionState = connectionStates[group.serverId];
                return (
                  <div key={group.serverId}>
                    {/* Server header row */}
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleServer(group.serverId)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[#555] hover:text-[#888] hover:bg-[#111] transition-colors"
                    >
                      {expanded
                        ? <ChevronDownIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                        : <ChevronRightIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                      }
                      {group.isRemote
                        ? <CloudIcon aria-hidden="true" className="h-3.5 w-3.5 text-[#22d3ee] shrink-0" />
                        : <ServerIcon aria-hidden="true" className="h-3.5 w-3.5 text-[#22c55e] shrink-0" />
                      }
                      <span className="flex-1 font-mono text-[11px] text-[#888] truncate">
                        {group.serverName}
                      </span>
                      {group.isRemote && (
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${group.connected ? 'bg-[#22c55e]' : 'bg-[#555]'}`} />
                      )}
                    </button>

                    {group.isRemote && !group.connected && (
                      <div className="pl-8 pr-2 pb-1 font-mono text-[10px]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[color:var(--ez-text-subtle)]">{t('sidebar.notConnected')}</span>
                          <button
                            type="button"
                            onClick={() => { void connectServer(group.serverId); }}
                            disabled={connectionState?.pending}
                            aria-label={t(connectionState?.pending ? 'sidebar.connectingTo' : 'sidebar.connectTo', { name: group.serverName })}
                            className="inline-flex items-center gap-1 rounded border border-[color:var(--ez-border)] px-2 py-1 text-[color:var(--ez-accent)] hover:bg-[color:var(--ez-accent-soft)] hover:text-[color:var(--ez-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ez-accent)] disabled:cursor-wait disabled:opacity-70"
                          >
                            {connectionState?.pending && <ArrowPathIcon aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />}
                            {t(connectionState?.pending ? 'sidebar.connecting' : 'sidebar.connect')}
                          </button>
                        </div>
                        {connectionState?.error && <p role="alert" className="mt-1 break-words text-[color:var(--ez-danger-text)]">{connectionState.error}</p>}
                      </div>
                    )}

                    {/* Process list */}
                    {expanded && group.connected && (
                      <div className="pb-0.5">
                        {group.loading ? (
                          <p className="pl-8 pr-2 py-1 font-mono text-[10px] text-[#444] animate-pulse">{t('sidebar.loading')}</p>
                        ) : group.processes.length === 0 ? (
                          <p className="pl-8 pr-2 py-1 font-mono text-[10px] text-[#444] italic">{t('sidebar.noProcesses')}</p>
                        ) : (
                          group.processes.map(proc => {
                            const remoteMatch = currentPath.startsWith('/logs/remote/');
                            const localMatch  = !remoteMatch && currentPath.startsWith('/logs/');
                            const active =
                              (group.serverId === 'local' && localMatch && currentPath === `/logs/${proc.id}`) ||
                              (group.serverId !== 'local' && remoteMatch && currentPath === `/logs/remote/${group.serverId}/${proc.id}`);
                            const actionKey = `${group.serverId}-${proc.id}`;

                            return (
                              <div
                                key={proc.id}
                                className={`group/proc w-full flex items-center gap-1.5 pl-7 pr-1.5 py-1 transition-colors
                                            ${active ? 'bg-[#111]' : 'hover:bg-[#111]'}`}
                              >
                                {/* Nav area */}
                                <button
                                  onClick={() => selectProcess(group.serverId, proc)}
                                  className={`flex-1 flex items-center gap-1.5 text-left min-w-0
                                              ${active ? 'text-[#e8e8e8]' : 'text-[#666]'}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    proc.status === 'online'
                                      ? 'bg-[#22c55e]'
                                      : (proc.status === 'stopping' || proc.status === 'launching')
                                        ? 'bg-[#f59e0b]'
                                        : 'bg-[#555]'
                                  }`} />
                                  <CpuChipIcon className="h-3 w-3 shrink-0 opacity-40" />
                                  <span className={`font-mono text-[10px] truncate ${active ? 'text-[#e8e8e8]' : 'text-[#666]'}`}>
                                    {proc.name}
                                  </span>
                                </button>

                                {/* Restart / Start + Logs buttons — visible on row hover */}
                                <div className="shrink-0 opacity-0 group-hover/proc:opacity-100 transition-opacity flex items-center gap-0.5">
                                  {actionLoading[actionKey] ? (
                                    <svg className="h-3 w-3 animate-spin text-[#444]" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                  ) : proc.status === 'online' ? (
                                    <button
                                      onClick={(e) => handleProcessAction(e, group.serverId, proc, 'restart')}
                                      title={t('actions.restart')}
                                      className="h-4 w-4 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors"
                                    >
                                      <ArrowPathIcon className="h-2.5 w-2.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => handleProcessAction(e, group.serverId, proc, 'start')}
                                      title={t('actions.start')}
                                      className="h-4 w-4 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors"
                                    >
                                      <PlayIcon className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); selectProcess(group.serverId, proc); }}
                                    title={t('actions.viewLogs')}
                                    className="h-4 w-4 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors"
                                  >
                                    <DocumentTextIcon className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}


    </div>
  );
};

export default SidebarMenu;

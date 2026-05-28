import React, { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

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

// @group Types : Server group for log sidebar tree
interface SidebarServerGroup {
  serverId: string;
  serverName: string;
  isRemote: boolean;
  connected: boolean;
  processes: SidebarProcess[];
  loading: boolean;
}

// @group SidebarMenu : Navigation menu for the application sidebar
const SidebarMenu: React.FC<SidebarMenuProps> = ({ onItemClick, collapsed = false }) => {
  const location = useLocation();
  const { t } = useTranslation();
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setTreeLoading(true);
      try {
        const [localRes, remoteRes] = await Promise.all([
          axios.get('/api/processes'),
          axios.get('/api/remote/connections').catch(() => ({ data: [] })),
        ]);

        const localProcesses: SidebarProcess[] = localRes.data.map((p: any) => ({
          id: p.pm_id,
          name: p.name,
          status: p.pm2_env?.status ?? p.status ?? 'unknown',
        }));

        const groups: SidebarServerGroup[] = [
          { serverId: 'local', serverName: t('nav.localServer'), isRemote: false, connected: true, processes: localProcesses, loading: false },
        ];

        const connections: any[] = remoteRes.data;
        for (const conn of connections) {
          groups.push({ serverId: conn.id, serverName: conn.name, isRemote: true, connected: conn.connected, processes: [], loading: conn.connected });
        }

        if (!cancelled) setServerGroups(groups);

        // Fetch remote processes in parallel
        const remoteConnected = connections.filter((c: any) => c.connected);
        if (remoteConnected.length > 0) {
          const results = await Promise.allSettled(
            remoteConnected.map((conn: any) =>
              axios.get(`/api/remote/${conn.id}/processes`).then(r => ({ id: conn.id, data: r.data }))
            )
          );
          if (!cancelled) {
            setServerGroups(prev => prev.map(g => {
              const r = results.find(res => res.status === 'fulfilled' && (res.value as any).id === g.serverId);
              if (!r || r.status !== 'fulfilled') return { ...g, loading: false };
              const processes: SidebarProcess[] = (r.value as any).data.map((p: any) => ({
                id: p.pm_id, name: p.name, status: p.pm2_env?.status ?? p.status ?? 'unknown',
              }));
              return { ...g, processes, loading: false };
            }));
          }
        }
      } catch {
        // fail silently — tree is non-critical
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleServer = (id: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
                return (
                  <div key={group.serverId}>
                    {/* Server header row */}
                    <button
                      onClick={() => toggleServer(group.serverId)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[#555] hover:text-[#888] hover:bg-[#111] transition-colors"
                    >
                      {expanded
                        ? <ChevronDownIcon className="h-3 w-3 shrink-0" />
                        : <ChevronRightIcon className="h-3 w-3 shrink-0" />
                      }
                      {group.isRemote
                        ? <CloudIcon className="h-3.5 w-3.5 text-[#22d3ee] shrink-0" />
                        : <ServerIcon className="h-3.5 w-3.5 text-[#22c55e] shrink-0" />
                      }
                      <span className="flex-1 font-mono text-[11px] text-[#888] truncate">
                        {group.serverName}
                      </span>
                      {group.isRemote && (
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${group.connected ? 'bg-[#22c55e]' : 'bg-[#555]'}`} />
                      )}
                    </button>

                    {/* Process list */}
                    {expanded && (
                      <div className="pb-0.5">
                        {!group.connected ? (
                          <p className="pl-8 pr-2 py-1 font-mono text-[10px] text-[#444] italic">{t('sidebar.notConnected')}</p>
                        ) : group.loading ? (
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

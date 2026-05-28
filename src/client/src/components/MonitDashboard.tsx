import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PM2Process } from '../types/pm2';
import { useNavigate } from 'react-router-dom';

// @group MonitDashboard : Real-time process monitor page
interface MonitDashboardProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

const MonitDashboard: React.FC<MonitDashboardProps> = ({ processes, onRefresh }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<'id' | 'name' | 'status' | 'cpu' | 'memory' | 'uptime' | 'restarts'>('cpu');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // @group Utilities : Format helpers
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (uptime: number): string => {
    const seconds = Math.floor((Date.now() - uptime) / 1000);
    const days    = Math.floor(seconds / 86400);
    const hours   = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0)  return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  // @group Sorting : Sort process list
  const sortedProcesses = [...processes].sort((a, b) => {
    let vA: number | string;
    let vB: number | string;
    switch (sortField) {
      case 'id':       vA = a.pm_id;              vB = b.pm_id;              break;
      case 'name':     vA = a.name.toLowerCase();  vB = b.name.toLowerCase(); break;
      case 'status':   vA = a.pm2_env.status;      vB = b.pm2_env.status;     break;
      case 'cpu':      vA = a.monit.cpu;           vB = b.monit.cpu;          break;
      case 'memory':   vA = a.monit.memory;        vB = b.monit.memory;       break;
      case 'uptime':   vA = a.pm2_env.status === 'online' ? a.pm2_env.pm_uptime : 0;
                       vB = b.pm2_env.status === 'online' ? b.pm2_env.pm_uptime : 0; break;
      case 'restarts': vA = a.pm2_env.restart_time; vB = b.pm2_env.restart_time; break;
      default:         return 0;
    }
    if (typeof vA === 'string' && typeof vB === 'string') {
      return sortDirection === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return sortDirection === 'asc' ? (vA as number) - (vB as number) : (vB as number) - (vA as number);
  });

  const handleSort = (field: typeof sortField) => {
    if (field === sortField) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  // @group Utilities : CPU bar color thresholds
  const cpuBarColor = (v: number) =>
    v < 60 ? 'bg-[#22c55e]' : v < 80 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]';

  const maxMem = sortedProcesses.length > 0
    ? Math.max(...sortedProcesses.map(p => p.monit.memory))
    : 1;

  // @group Render : Stat card helper
  const statCard = (label: string, value: string | number, sub: string) => (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-sm px-3 py-2">
      <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em]">{label}</p>
      <p className="text-[11px] font-mono font-bold text-[#e8e8e8] leading-tight mt-0.5">{value}</p>
      <p className="text-[9px] font-mono text-[#555] mt-0.5">{sub}</p>
    </div>
  );

  // @group Render : Sort direction indicator
  const sortArrow = (field: typeof sortField) => {
    if (field !== sortField) return null;
    return (
      <span className="ml-0.5 text-[#555]">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // @group Render : Status badge
  const statusBadge = (status: string) => {
    const dot =
      status === 'online'  ? 'bg-[#22c55e]' :
      status === 'stopped' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]';
    const text =
      status === 'online'  ? 'text-[#22c55e]' :
      status === 'stopped' ? 'text-[#ef4444]' : 'text-[#f59e0b]';
    return (
      <span className={`inline-flex items-center gap-1 font-mono text-[10px] ${text}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xs font-semibold text-[#e8e8e8] tracking-[0.15em] uppercase">
            ▸ {t('monitDashboard.title')}
          </h1>
          <p className="font-mono text-[10px] text-[#555] mt-0.5">
            {t('monitDashboard.subtitle')}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="font-mono text-[10px] text-[#555] hover:text-[#888] border border-[#1e1e1e] hover:border-[#333] px-2.5 py-1 rounded-sm transition-colors"
        >
          ↺ refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statCard(
          t('monitDashboard.total'),
          processes.length,
          `${processes.filter(p => p.pm2_env.status === 'online').length} ${t('monitDashboard.online')}`
        )}
        {statCard(
          t('monitDashboard.online'),
          processes.filter(p => p.pm2_env.status === 'online').length,
          `${processes.filter(p => p.pm2_env.status !== 'online').length} ${t('monitDashboard.stopped')}`
        )}
        {statCard(
          t('monitDashboard.cpuPeak'),
          sortedProcesses.length > 0 ? `${Math.max(...sortedProcesses.map(p => p.monit.cpu)).toFixed(1)}%` : '0%',
          t('monitDashboard.highestProcess')
        )}
        {statCard(
          t('monitDashboard.memPeak'),
          sortedProcesses.length > 0 ? formatMemory(Math.max(...sortedProcesses.map(p => p.monit.memory))) : '0 B',
          t('monitDashboard.highestProcess')
        )}
      </div>

      {/* Process Table */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0d0d0d]">
              <tr>
                {[
                  { key: 'id'       as const, label: t('common.id') },
                  { key: 'name'     as const, label: t('common.name') },
                  { key: 'status'   as const, label: t('common.status') },
                  { key: 'cpu'      as const, label: t('common.cpu') },
                  { key: 'memory'   as const, label: t('common.memory') },
                  { key: 'uptime'   as const, label: t('common.uptime') },
                  { key: 'restarts' as const, label: t('common.restarts') },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-3 py-2 text-left text-[9px] font-mono text-[#444] uppercase tracking-[0.15em] select-none cursor-pointer hover:text-[#666] transition-colors"
                  >
                    {label}{sortArrow(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#111]">
              {sortedProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[10px] font-mono text-[#555]">
                    {t('monitDashboard.noProcesses')}
                  </td>
                </tr>
              ) : sortedProcesses.map((proc) => (
                <tr
                  key={proc.pm_id}
                  onClick={() => navigate(`/process/${proc.pm_id}`)}
                  className="cursor-pointer hover:bg-[#141414] transition-colors border-b border-[#1a1a1a]"
                >
                  <td className="px-3 py-2 text-[10px] font-mono text-[#555]">{proc.pm_id}</td>
                  <td className="px-3 py-2 text-[10px] font-mono text-[#e8e8e8]">{proc.name}</td>
                  <td className="px-3 py-2">{statusBadge(proc.pm2_env.status)}</td>

                  {/* CPU bar */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-[#1a1a1a] rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${cpuBarColor(proc.monit.cpu)} transition-all`}
                          style={{ width: `${Math.min(proc.monit.cpu, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#888] min-w-[36px]">
                        {proc.monit.cpu.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Memory bar */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-[#1a1a1a] rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-[#22d3ee] transition-all"
                          style={{ width: `${maxMem > 0 ? (proc.monit.memory / maxMem) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#888] min-w-[56px]">
                        {formatMemory(proc.monit.memory)}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 text-[10px] font-mono text-[#888]">
                    {proc.pm2_env.status === 'online' ? formatUptime(proc.pm2_env.pm_uptime) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[10px] font-mono text-[#888]">
                    {proc.pm2_env.restart_time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default MonitDashboard;

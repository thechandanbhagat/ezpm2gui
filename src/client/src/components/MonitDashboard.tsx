import React, { useState } from 'react';
import { PM2Process } from '../types/pm2';
import { useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { Refresh as RefreshIcon, ArrowUpward, ArrowDownward } from '@mui/icons-material';
import PageHeader from './PageHeader';

// @group MonitDashboard : Real-time process monitor page
interface MonitDashboardProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

const MonitDashboard: React.FC<MonitDashboardProps> = ({ processes, onRefresh }) => {
  const navigate = useNavigate();
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

  const cpuBarColor  = (v: number) => v < 60 ? 'bg-emerald-500' : v < 80 ? 'bg-amber-500' : 'bg-rose-500';
  const maxMem = sortedProcesses.length > 0 ? Math.max(...sortedProcesses.map(p => p.monit.memory)) : 1;

  // @group Render : Stat cards + process table
  const statCard = (label: string, value: string | number, sub: string) => (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-tight">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Process Monitor"
        subtitle="Real-time CPU, memory and uptime by process"
        actions={
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={onRefresh}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCard('Total', processes.length,
          `${processes.filter(p => p.pm2_env.status === 'online').length} online`)}
        {statCard('Online', processes.filter(p => p.pm2_env.status === 'online').length,
          `${processes.filter(p => p.pm2_env.status !== 'online').length} stopped`)}
        {statCard('CPU Peak',
          sortedProcesses.length > 0 ? `${Math.max(...sortedProcesses.map(p => p.monit.cpu)).toFixed(1)}%` : '0%',
          'highest process')}
        {statCard('Mem Peak',
          sortedProcesses.length > 0 ? formatMemory(Math.max(...sortedProcesses.map(p => p.monit.memory))) : '0 B',
          'highest process')}
      </div>

      {/* Process Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                {[
                  { key: 'id' as const,       label: 'ID' },
                  { key: 'name' as const,     label: 'Name' },
                  { key: 'status' as const,   label: 'Status' },
                  { key: 'cpu' as const,      label: 'CPU' },
                  { key: 'memory' as const,   label: 'Memory' },
                  { key: 'uptime' as const,   label: 'Uptime' },
                  { key: 'restarts' as const, label: 'Restarts' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => handleSort(key)}
                    className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide select-none cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {key === sortField && (
                        sortDirection === 'asc'
                          ? <ArrowUpward sx={{ fontSize: 10 }} />
                          : <ArrowDownward sx={{ fontSize: 10 }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {sortedProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                    No processes running
                  </td>
                </tr>
              ) : sortedProcesses.map((proc) => (
                <tr
                  key={proc.pm_id}
                  onClick={() => navigate(`/process/${proc.pm_id}`)}
                  className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{proc.pm_id}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900 dark:text-neutral-100">{proc.name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      proc.pm2_env.status === 'online'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-400'
                        : proc.pm2_env.status === 'stopped'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/25 dark:text-rose-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-400'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${
                        proc.pm2_env.status === 'online' ? 'bg-emerald-500' :
                        proc.pm2_env.status === 'stopped' ? 'bg-rose-500' : 'bg-amber-500'
                      }`} />
                      {proc.pm2_env.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div className={`h-full ${cpuBarColor(proc.monit.cpu)} transition-all`}
                          style={{ width: `${Math.min(proc.monit.cpu, 100)}%` }} />
                      </div>
                      <span className="text-xs text-neutral-700 dark:text-neutral-300 min-w-[36px]">
                        {proc.monit.cpu.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 transition-all"
                          style={{ width: `${maxMem > 0 ? (proc.monit.memory / maxMem) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-neutral-700 dark:text-neutral-300 min-w-[56px]">
                        {formatMemory(proc.monit.memory)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {proc.pm2_env.status === 'online' ? formatUptime(proc.pm2_env.pm_uptime) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
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

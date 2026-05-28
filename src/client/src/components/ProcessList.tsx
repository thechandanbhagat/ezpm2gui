import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PM2Process } from '../types/pm2';
import {
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

// @group Types : ProcessList component props
interface ProcessListProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

// @group Types : ProcessTable sub-component props
interface ProcessTableProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

// @group Utilities : Stable dark color palette per namespace string (hash-based)
const nsColor = (ns: string): string => {
  if (!ns || ns === 'default') return 'border-[#222] text-[#555]';
  let h = 0;
  for (let i = 0; i < ns.length; i++) h = (h * 31 + ns.charCodeAt(i)) >>> 0;
  const NS_DARK_COLORS = [
    'border-[#4c1d95]/50 text-[#a78bfa]',
    'border-[#075985]/50 text-[#38bdf8]',
    'border-[#065f46]/50 text-[#34d399]',
    'border-[#78350f]/50 text-[#fbbf24]',
    'border-[#881337]/50 text-[#fb7185]',
    'border-[#164e63]/50 text-[#22d3ee]',
  ];
  return NS_DARK_COLORS[h % NS_DARK_COLORS.length];
};

// @group Utilities : Formatting helpers
const formatMemory = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatUptime = (startMs: number): string => {
  if (!startMs) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const days  = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins  = Math.floor((secs % 3600) / 60);
  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// @group Utilities : Detect whether a process is a PM2 module (name starts with 'pm2-')
const isPm2Module = (p: PM2Process): boolean => p.name.startsWith('pm2-');

// @group ProcessTable : Reusable CLI-style table for a set of processes, grouped by namespace
const ProcessTable: React.FC<ProcessTableProps> = ({ processes, onAction }) => {
  const { t } = useTranslation();

  const grouped = processes.reduce<Record<string, PM2Process[]>>((acc, p) => {
    const ns = p.pm2_env?.namespace || 'default';
    if (!acc[ns]) acc[ns] = [];
    acc[ns].push(p);
    return acc;
  }, {});

  const namespaces = Object.keys(grouped).sort((a, b) =>
    a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)
  );

  const multipleNS = namespaces.length > 1;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-[#0d0d0d]">
          <tr>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-8">#</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em]">{t('common.name')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-24">{t('common.status')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-16">{t('common.pid')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-32">{t('common.cpu')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-24">{t('common.memory')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-20">{t('common.uptime')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-16">{t('common.restarts')}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-16">{t('common.mode')}</th>
            <th className="px-3 py-1.5 text-right text-[9px] font-mono font-bold text-[#444] uppercase tracking-[0.15em] w-32">{t('common.actions')}</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#111]">
          {namespaces.map(ns => (
            <React.Fragment key={ns}>

              {/* Namespace section header */}
              {multipleNS && (
                <tr className="bg-[#0d0d0d]">
                  <td colSpan={10} className="px-3 py-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono border rounded-sm ${nsColor(ns)}`}>
                      <span className="opacity-50">#</span>
                      {ns}
                      <span className="opacity-40 font-normal ml-1">
                        {`${grouped[ns].length} ${t(grouped[ns].length !== 1 ? 'processList.processes' : 'processList.process')}`}
                      </span>
                    </span>
                  </td>
                </tr>
              )}

              {grouped[ns].map((process) => {
                const isOnline  = process.pm2_env.status === 'online';
                const isStopped = process.pm2_env.status === 'stopped';
                const cpu = process.monit?.cpu ?? 0;
                const execMode = process.pm2_env.exec_mode?.replace('_mode', '') ?? 'fork';

                // @group Derived : CPU bar fill color based on usage threshold
                const cpuBarColor = cpu > 80 ? 'bg-[#ef4444]' : cpu > 50 ? 'bg-[#f59e0b]' : 'bg-[#22c55e]';

                return (
                  <tr key={process.pm_id} className="hover:bg-[#111] transition-colors">

                    {/* ID */}
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-[#555]">{process.pm_id}</span>
                    </td>

                    {/* Name + namespace inline badge */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-semibold text-[#e8e8e8]">{process.name}</span>
                        {!multipleNS && ns !== 'default' && (
                          <span className={`inline-flex items-center px-1.5 py-0 text-[9px] font-mono border rounded-sm ${nsColor(ns)}`}>{ns}</span>
                        )}
                      </div>
                      <p className="text-[9px] font-mono text-[#444] truncate max-w-xs mt-0.5">
                        {process.pm2_env.pm_exec_path?.split(/[\\/]/).slice(-2).join('/')}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono font-bold border rounded-sm ${
                        isOnline  ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#022c00]' :
                        isStopped ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#1a0000]'
                                  : 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#1a0e00]'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                          isOnline ? 'bg-[#22c55e] animate-pulse' : isStopped ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'
                        }`} />
                        {process.pm2_env.status}
                      </span>
                    </td>

                    {/* PID */}
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-[#555]">
                        {process.pid > 0 ? process.pid : '—'}
                      </span>
                    </td>

                    {/* CPU with mini bar */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-[#1a1a1a] overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${cpuBarColor}`}
                            style={{ width: `${Math.min(cpu, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-[#888] tabular-nums w-7">
                          {process.monit ? `${cpu}%` : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Memory */}
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-[#888]">
                        {process.monit ? formatMemory(process.monit.memory) : '—'}
                      </span>
                    </td>

                    {/* Uptime */}
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-[#555]">
                        {isOnline ? formatUptime(process.pm2_env.pm_uptime) : '—'}
                      </span>
                    </td>

                    {/* Restarts */}
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-mono tabular-nums ${
                        process.pm2_env.restart_time > 10
                          ? 'text-[#ef4444]'
                          : process.pm2_env.restart_time > 3
                          ? 'text-[#f59e0b]'
                          : 'text-[#555]'
                      }`}>
                        {process.pm2_env.restart_time ?? 0}
                      </span>
                    </td>

                    {/* Exec mode */}
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0 text-[9px] font-mono border rounded-sm ${
                        execMode === 'cluster'
                          ? 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#16003a]'
                          : 'text-[#555] border-[#222]'
                      }`}>
                        {execMode}
                      </span>
                    </td>

                    {/* Actions — always visible */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          to={`/process/${process.pm_id}`}
                          className="w-5 h-5 rounded-sm flex items-center justify-center text-[#22d3ee] hover:text-[#67e8f9] hover:bg-[#1a1a1a] transition-colors"
                          title={t('common.details')}
                        >
                          <InformationCircleIcon className="h-3 w-3" />
                        </Link>
                        {isOnline ? (
                          <>
                            <button
                              onClick={() => onAction(process.pm_id, 'restart')}
                              className="w-5 h-5 rounded-sm flex items-center justify-center text-[#f59e0b] hover:text-[#fbbf24] hover:bg-[#1a1a1a] transition-colors"
                              title={t('common.restart')}
                            >
                              <ArrowPathIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onAction(process.pm_id, 'stop')}
                              className="w-5 h-5 rounded-sm flex items-center justify-center text-[#ef4444] hover:text-[#f87171] hover:bg-[#1a1a1a] transition-colors"
                              title={t('common.stop')}
                            >
                              <StopIcon className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onAction(process.pm_id, 'start')}
                            className="w-5 h-5 rounded-sm flex items-center justify-center text-[#22c55e] hover:text-[#4ade80] hover:bg-[#1a1a1a] transition-colors"
                            title={t('common.start')}
                          >
                            <PlayIcon className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => onAction(process.pm_id, 'delete')}
                          className="w-5 h-5 rounded-sm flex items-center justify-center text-[#ef4444] hover:text-[#f87171] hover:bg-[#1a1a1a] transition-colors"
                          title={t('common.delete')}
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                        <Link
                          to={`/logs/${process.pm_id}`}
                          className="w-5 h-5 rounded-sm flex items-center justify-center text-[#555] hover:text-[#888] hover:bg-[#1a1a1a] transition-colors"
                          title={t('common.logs')}
                        >
                          <DocumentTextIcon className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// @group ProcessList : Full-width CLI-style PM2 process table — app processes and module processes in separate cards
const ProcessList: React.FC<ProcessListProps> = ({ processes, onAction }) => {
  const { t } = useTranslation();

  const appProcesses    = processes.filter(p => !isPm2Module(p));
  const moduleProcesses = processes.filter(p =>  isPm2Module(p));

  // @group Render : Empty state when no processes are running
  if (processes.length === 0) {
    return (
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-16 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 mb-6">
          <InformationCircleIcon className="h-8 w-8 text-[#333]" />
        </div>
        <h3 className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em] mb-2">
          {t('processList.noProcessesTitle')}
        </h3>
        <p className="text-[10px] font-mono text-[#555] max-w-sm mx-auto">
          {t('processList.noProcessesDesc')}
        </p>
      </div>
    );
  }

  // @group Render : Two separate cards — one for app processes, one for PM2 modules
  return (
    <div className="space-y-3">

      {/* ── Application Processes ── */}
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm">
        <div className="px-4 py-2 border-b border-[#1e1e1e] flex items-center justify-between">
          <h2 className="text-[9px] font-mono font-bold text-[#555] uppercase tracking-[0.15em]">
            {t('processList.appProcesses')}
          </h2>
          <span className="text-[10px] font-mono text-[#555] bg-[#111] border border-[#1e1e1e] px-2 py-0.5 rounded-sm">
            {appProcesses.length}
          </span>
        </div>
        {appProcesses.length === 0 ? (
          <div className="px-4 py-8 text-center text-[10px] font-mono text-[#444]">
            {t('processList.noAppProcesses')}
          </div>
        ) : (
          <ProcessTable processes={appProcesses} onAction={onAction} />
        )}
      </div>

      {/* ── PM2 Module Processes — only shown when at least one module is running ── */}
      {moduleProcesses.length > 0 && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm">
          <div className="px-4 py-2 border-b border-[#1e1e1e] flex items-center justify-between">
            <h2 className="text-[9px] font-mono font-bold text-[#555] uppercase tracking-[0.15em]">PM2 Modules</h2>
            <span className="text-[10px] font-mono text-[#a78bfa] bg-[#16003a] border border-[#a78bfa]/30 px-2 py-0.5 rounded-sm">
              {moduleProcesses.length}
            </span>
          </div>
          <ProcessTable processes={moduleProcesses} onAction={onAction} />
        </div>
      )}
    </div>
  );
};

export default ProcessList;

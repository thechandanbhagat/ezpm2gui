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

interface ProcessListProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

// @group Utilities : Stable color palette per namespace string (hash-based)
const NS_COLORS = [
  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  'bg-sky-100    dark:bg-sky-900/30    text-sky-700    dark:text-sky-300',
  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'bg-amber-100  dark:bg-amber-900/30  text-amber-700  dark:text-amber-300',
  'bg-rose-100   dark:bg-rose-900/30   text-rose-700   dark:text-rose-300',
  'bg-cyan-100   dark:bg-cyan-900/30   text-cyan-700   dark:text-cyan-300',
];

const nsColor = (ns: string): string => {
  if (!ns || ns === 'default')
    return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400';
  let h = 0;
  for (let i = 0; i < ns.length; i++) h = (h * 31 + ns.charCodeAt(i)) >>> 0;
  return NS_COLORS[h % NS_COLORS.length];
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

// @group ProcessTable : Reusable table for a set of processes, grouped by namespace
interface ProcessTableProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

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
        <thead className="bg-neutral-50 dark:bg-neutral-800/50">
          <tr>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-8">#</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t('common.name')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-24">{t('common.status')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-16">{t('common.pid')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-32">{t('common.cpu')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-24">{t('common.memory')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-20">{t('common.uptime')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-16">{t('common.restarts')}</th>
            <th className="px-4 py-1.5 text-left text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-16">{t('common.mode')}</th>
            <th className="px-4 py-1.5 text-right text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider w-32">{t('common.actions')}</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {namespaces.map(ns => (
            <React.Fragment key={ns}>

              {/* Namespace section header */}
              {multipleNS && (
                <tr className="bg-neutral-50/80 dark:bg-neutral-800/40">
                  <td colSpan={10} className="px-4 py-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${nsColor(ns)}`}>
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

                return (
                  <tr key={process.pm_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 group transition-colors">

                    {/* ID */}
                    <td className="px-4 py-2">
                      <div className="w-5 h-5 bg-primary-50 dark:bg-primary-900/20 rounded flex items-center justify-center">
                        <span className="text-primary-600 dark:text-primary-400 font-semibold text-[9px]">{process.pm_id}</span>
                      </div>
                    </td>

                    {/* Name + namespace inline badge */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100">{process.name}</span>
                        {!multipleNS && ns !== 'default' && (
                          <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium ${nsColor(ns)}`}>{ns}</span>
                        )}
                      </div>
                      <p className="text-[9px] text-neutral-400 dark:text-neutral-500 mt-0.5 font-mono truncate max-w-xs">
                        {process.pm2_env.pm_exec_path?.split(/[\\/]/).slice(-2).join('/')}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${
                        isOnline  ? 'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-400' :
                        isStopped ? 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-400'
                                  : 'bg-yellow-100 dark:bg-yellow-900/25 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${
                          isOnline ? 'bg-green-500 animate-pulse' : isStopped ? 'bg-red-400' : 'bg-yellow-400'
                        }`} />
                        {process.pm2_env.status}
                      </span>
                    </td>

                    {/* PID */}
                    <td className="px-4 py-2">
                      <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                        {process.pid > 0 ? process.pid : '—'}
                      </span>
                    </td>

                    {/* CPU with mini bar */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              cpu > 80 ? 'bg-red-500' : cpu > 50 ? 'bg-yellow-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(cpu, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300 tabular-nums w-7">
                          {process.monit ? `${cpu}%` : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Memory */}
                    <td className="px-4 py-2">
                      <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300">
                        {process.monit ? formatMemory(process.monit.memory) : '—'}
                      </span>
                    </td>

                    {/* Uptime */}
                    <td className="px-4 py-2">
                      <span className="text-[10px] text-neutral-600 dark:text-neutral-400">
                        {isOnline ? formatUptime(process.pm2_env.pm_uptime) : '—'}
                      </span>
                    </td>

                    {/* Restarts */}
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-medium tabular-nums ${
                        process.pm2_env.restart_time > 10
                          ? 'text-red-500 dark:text-red-400'
                          : process.pm2_env.restart_time > 3
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-neutral-600 dark:text-neutral-400'
                      }`}>
                        {process.pm2_env.restart_time ?? 0}
                      </span>
                    </td>

                    {/* Exec mode */}
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        execMode === 'cluster'
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                      }`}>
                        {execMode}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          to={`/process/${process.pm_id}`}
                          className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-400 transition-colors"
                          title={t('common.details')}
                        >
                          <InformationCircleIcon className="h-3 w-3" />
                        </Link>
                        {isOnline ? (
                          <>
                            <button
                              onClick={() => onAction(process.pm_id, 'restart')}
                              className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-800/50 text-yellow-600 dark:text-yellow-400 transition-colors"
                              title={t('common.restart')}
                            >
                              <ArrowPathIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onAction(process.pm_id, 'stop')}
                              className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-600 dark:text-red-400 transition-colors"
                              title={t('common.stop')}
                            >
                              <StopIcon className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onAction(process.pm_id, 'start')}
                            className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/50 text-green-600 dark:text-green-400 transition-colors"
                            title={t('common.start')}
                          >
                            <PlayIcon className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => onAction(process.pm_id, 'delete')}
                          className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-600 dark:text-red-400 transition-colors"
                          title={t('common.delete')}
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                        <Link
                          to={`/logs/${process.pm_id}`}
                          className="inline-flex items-center justify-center w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 transition-colors"
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

// @group ProcessList : Full-width PM2 process table — app processes and module processes in separate sections
const ProcessList: React.FC<ProcessListProps> = ({ processes, onAction }) => {
  const { t } = useTranslation();

  const appProcesses    = processes.filter(p => !isPm2Module(p));
  const moduleProcesses = processes.filter(p =>  isPm2Module(p));

  if (processes.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-16 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-neutral-100 dark:bg-neutral-800 mb-6">
          <InformationCircleIcon className="h-8 w-8 text-neutral-400 dark:text-neutral-500" />
        </div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-2">{t('processList.noProcessesTitle')}</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
          {t('processList.noProcessesDesc')}
        </p>
      </div>
    );
  }

  // @group Render : Two separate cards — one for app processes, one for PM2 modules
  return (
    <div className="space-y-3">

      {/* ── Application Processes ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{t('processList.appProcesses')}</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {appProcesses.length}
          </span>
        </div>
        {appProcesses.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
            {t('processList.noAppProcesses')}
          </div>
        ) : (
          <ProcessTable processes={appProcesses} onAction={onAction} />
        )}
      </div>

      {/* ── PM2 Module Processes — only shown when at least one module is running ── */}
      {moduleProcesses.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">PM2 Modules</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
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

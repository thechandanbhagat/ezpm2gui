import React from 'react';
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

// @group ProcessList : PM2 process table grouped by namespace
const ProcessList: React.FC<ProcessListProps> = ({ processes, onAction }) => {

  // @group Utilities : Memory formatter
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (processes.length === 0) {
    return (
      <div className="card-premium p-16 text-center animate-fade-in">
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700 mb-8 shadow-lg">
          <InformationCircleIcon className="h-10 w-10 text-neutral-600 dark:text-neutral-400" />
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4 tracking-tight">
          No PM2 Processes Found
        </h3>
        <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
          Make sure PM2 is running and has active processes to display them here.
        </p>
      </div>
    );
  }

  // @group Grouping : Bucket processes by namespace — 'default' always first
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

  // @group Render : Table with namespace section headers
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">

      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">PM2 Processes</h2>
          <div className="flex items-center gap-1.5">
            {multipleNS && namespaces.map(ns => (
              <span key={ns} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${nsColor(ns)}`}>
                {ns}
              </span>
            ))}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-300">
              {processes.length}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Process</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Performance</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-800">
            {namespaces.map(ns => (
              <React.Fragment key={ns}>

                {/* Namespace section header — only when multiple namespaces exist */}
                {multipleNS && (
                  <tr className="bg-neutral-50/80 dark:bg-neutral-800/40">
                    <td colSpan={4} className="px-3 py-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${nsColor(ns)}`}>
                        <span className="opacity-50">#</span>
                        {ns}
                        <span className="opacity-40 font-normal ml-1">
                          {grouped[ns].length} process{grouped[ns].length !== 1 ? 'es' : ''}
                        </span>
                      </span>
                    </td>
                  </tr>
                )}

                {grouped[ns].map((process) => (
                  <tr key={process.pm_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 group">

                    {/* Process name + ID */}
                    <td className="px-3 py-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-md flex items-center justify-center shrink-0">
                          <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">{process.pm_id}</span>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{process.name}</div>
                          {/* Show namespace badge inline when all processes share one namespace and it's not 'default' */}
                          {!multipleNS && ns !== 'default' && (
                            <span className={`inline-flex items-center px-1 py-0 rounded text-xs ${nsColor(ns)}`}>{ns}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        process.pm2_env.status === 'online'
                          ? 'bg-green-100 dark:bg-green-900/25 text-green-800 dark:text-green-400'
                          : process.pm2_env.status === 'stopped'
                          ? 'bg-red-100 dark:bg-red-900/25 text-red-800 dark:text-red-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/25 text-yellow-800 dark:text-yellow-400'
                      }`}>
                        <div className={`w-1 h-1 rounded-full mr-1 ${
                          process.pm2_env.status === 'online' ? 'bg-green-500' :
                          process.pm2_env.status === 'stopped' ? 'bg-red-500' : 'bg-yellow-500'
                        }`} />
                        {process.pm2_env.status}
                      </span>
                    </td>

                    {/* CPU + RAM */}
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">CPU:</span>
                          <div className="flex items-center space-x-1">
                            <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                style={{ width: `${process.monit ? Math.min(process.monit.cpu, 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 min-w-[2rem]">
                              {process.monit ? `${process.monit.cpu}%` : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">RAM:</span>
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                            {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action buttons */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <Link
                          to={`/process/${process.pm_id}`}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-all duration-150"
                          title="Details"
                        >
                          <InformationCircleIcon className="h-3 w-3" />
                        </Link>
                        {process.pm2_env.status === 'online' ? (
                          <>
                            <button
                              onClick={() => onAction(process.pm_id, 'restart')}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400 transition-all duration-150"
                              title="Restart"
                            >
                              <ArrowPathIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onAction(process.pm_id, 'stop')}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-all duration-150"
                              title="Stop"
                            >
                              <StopIcon className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onAction(process.pm_id, 'start')}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 transition-all duration-150"
                            title="Start"
                          >
                            <PlayIcon className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => onAction(process.pm_id, 'delete')}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-all duration-150"
                          title="Delete"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                        <Link
                          to={`/logs/${process.pm_id}`}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-all duration-150"
                          title="Logs"
                        >
                          <DocumentTextIcon className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProcessList;

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Tooltip } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { IconButton } from '@mui/material';
import PageHeader from './PageHeader';
import { useTranslation } from 'react-i18next';

// @group Types : Mirror of the server-side MetricPoint
interface MetricPoint {
  timestamp: number;
  cpu: number;
  memory: number;
  memoryMB: number;
  memoryPercent: number;
}

// @group Types : Mirror of the server-side ProcessHistory
interface ProcessHistory {
  pm_id: number;
  name: string;
  status: string;
  history: MetricPoint[];
}

// @group Utilities : Compute min / max / avg over a series of numbers
function stats(values: number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  let min = values[0], max = values[0], sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / values.length };
}

// @group Utilities : Format a Unix-ms timestamp to HH:MM:SS
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// @group Utilities : Format a Unix-ms timestamp to HH:MM:SS with date prefix if not today
function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// @group Sparkline : Tiny inline SVG sparkline with no external dependency
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color: string;
  max?: number;  // if provided, scale against this fixed max rather than series max
}

const Sparkline: React.FC<SparklineProps> = ({ values, width = 80, height = 22, color, max }) => {
  if (values.length < 2) {
    return <svg width={width} height={height} />;
  }
  const seriesMax = max ?? Math.max(...values);
  const effectiveMax = seriesMax === 0 ? 1 : seriesMax;
  const pad = 1;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - (v / effectiveMax) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

// @group StatusBadge : Compact inline status indicator
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cls =
    status === 'online'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-400'
      : status === 'stopped'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/25 dark:text-rose-400'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-400';
  const dot =
    status === 'online'
      ? 'bg-emerald-500'
      : status === 'stopped'
      ? 'bg-rose-500'
      : 'bg-amber-500';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <span className={`w-1 h-1 rounded-full ${dot}`} />
      {status}
    </span>
  );
};

// @group MetricsHistoryPage : Main page component
const MetricsHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<ProcessHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<'id' | 'name' | 'cpu' | 'memory'>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // @group DataFetch : Load history from the backend
  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get<ProcessHistory[]>('/api/metrics/history');
      setData(res.data);
      setLastUpdated(new Date());
    } catch {
      // silent — keep stale data visible
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchHistory, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchHistory]);

  // @group Sorting : Sort the process list
  const sorted = [...data].sort((a, b) => {
    let vA: number | string;
    let vB: number | string;
    const last = (ph: ProcessHistory) => ph.history[ph.history.length - 1];
    switch (sortField) {
      case 'id':     vA = a.pm_id;               vB = b.pm_id;               break;
      case 'name':   vA = a.name.toLowerCase();   vB = b.name.toLowerCase();  break;
      case 'cpu':    vA = last(a)?.cpu ?? 0;      vB = last(b)?.cpu ?? 0;     break;
      case 'memory': vA = last(a)?.memory ?? 0;   vB = last(b)?.memory ?? 0;  break;
      default:       return 0;
    }
    if (typeof vA === 'string' && typeof vB === 'string') {
      return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return sortDir === 'asc' ? (vA as number) - (vB as number) : (vB as number) - (vA as number);
  });

  const handleSort = (field: typeof sortField) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const cpuColor = (v: number) => v < 60 ? '#10b981' : v < 80 ? '#f59e0b' : '#ef4444';
  const memColor = '#6366f1';

  // @group Render : Sort arrow helper
  const SortArrow = ({ field }: { field: string }) =>
    sortField === field ? (
      <span className="ml-0.5 text-neutral-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
    ) : null;

  // @group Render : Summary row per process
  const renderRow = (ph: ProcessHistory) => {
    const latest = ph.history[ph.history.length - 1];
    const cpuSeries   = ph.history.map(p => p.cpu);
    const memSeries   = ph.history.map(p => p.memoryMB);
    const memPctSeries = ph.history.map(p => p.memoryPercent);

    const cpuStats  = stats(cpuSeries);
    const memStats  = stats(memSeries);
    const memPctStats = stats(memPctSeries);

    const isExpanded = expandedId === ph.pm_id;

    return (
      <React.Fragment key={ph.pm_id}>
        <tr
          className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors border-b border-neutral-100 dark:border-neutral-800"
          onClick={() => setExpandedId(isExpanded ? null : ph.pm_id)}
        >
          {/* ID */}
          <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 w-10">{ph.pm_id}</td>

          {/* Name + status */}
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[120px]">
                {ph.name}
              </span>
              <StatusBadge status={ph.status} />
            </div>
          </td>

          {/* CPU: sparkline + current + stats */}
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkline values={cpuSeries} color={cpuColor(latest?.cpu ?? 0)} max={100} />
              <div className="text-xs min-w-[80px]">
                <span className={`font-semibold ${latest?.cpu >= 80 ? 'text-rose-500' : latest?.cpu >= 60 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {latest ? `${latest.cpu.toFixed(1)}%` : '—'}
                </span>
                <div className="text-neutral-400 dark:text-neutral-500 text-[10px] leading-tight">
                  min {cpuStats.min.toFixed(1)}% / max {cpuStats.max.toFixed(1)}%
                </div>
                <div className="text-neutral-400 dark:text-neutral-500 text-[10px]">
                  avg {cpuStats.avg.toFixed(1)}%
                </div>
              </div>
            </div>
          </td>

          {/* Memory: sparkline + current + stats */}
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkline values={memPctSeries} color={memColor} max={100} />
              <div className="text-xs min-w-[100px]">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {latest ? `${latest.memoryMB.toFixed(1)} MB` : '—'}
                </span>
                <span className="ml-1 text-neutral-400 dark:text-neutral-500 text-[10px]">
                  ({latest ? `${latest.memoryPercent.toFixed(1)}%` : '—'})
                </span>
                <div className="text-neutral-400 dark:text-neutral-500 text-[10px] leading-tight">
                  min {memStats.min.toFixed(1)} / max {memStats.max.toFixed(1)} MB
                </div>
                <div className="text-neutral-400 dark:text-neutral-500 text-[10px]">
                  avg {memStats.avg.toFixed(1)} MB · {memPctStats.avg.toFixed(1)}%
                </div>
              </div>
            </div>
          </td>

          {/* Data points count */}
          <td className="px-3 py-2 text-[10px] text-neutral-400 dark:text-neutral-500 text-center">
            {ph.history.length} pts<br />
            {ph.history.length > 0 && (
              <span>{fmtTime(ph.history[0].timestamp)} – {fmtTime(ph.history[ph.history.length - 1].timestamp)}</span>
            )}
          </td>

          {/* Expand toggle */}
          <td className="px-3 py-2 text-center text-neutral-400 dark:text-neutral-500">
            <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
          </td>
        </tr>

        {/* Expanded detail: full history table */}
        {isExpanded && (
          <tr>
            <td colSpan={6} className="bg-neutral-50 dark:bg-neutral-800/30 px-4 py-3">
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
                {ph.name} — last {ph.history.length} recordings (newest first)
              </p>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-neutral-500 dark:text-neutral-400 font-semibold">#</th>
                      <th className="px-3 py-1.5 text-left text-neutral-500 dark:text-neutral-400 font-semibold">Time</th>
                      <th className="px-3 py-1.5 text-right text-neutral-500 dark:text-neutral-400 font-semibold">CPU %</th>
                      <th className="px-3 py-1.5 text-right text-neutral-500 dark:text-neutral-400 font-semibold">Memory (MB)</th>
                      <th className="px-3 py-1.5 text-right text-neutral-500 dark:text-neutral-400 font-semibold">Memory %</th>
                      <th className="px-3 py-1.5 text-right text-neutral-500 dark:text-neutral-400 font-semibold">Memory (bytes)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {[...ph.history].reverse().map((pt, idx) => (
                      <tr key={pt.timestamp} className="hover:bg-neutral-100 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="px-3 py-1 text-neutral-400 dark:text-neutral-500">{ph.history.length - idx}</td>
                        <td className="px-3 py-1 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{fmtDateTime(pt.timestamp)}</td>
                        <td className="px-3 py-1 text-right">
                          <span className={`font-medium ${pt.cpu >= 80 ? 'text-rose-500' : pt.cpu >= 60 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {pt.cpu.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-1 text-right font-medium text-indigo-600 dark:text-indigo-400">
                          {pt.memoryMB.toFixed(2)}
                        </td>
                        <td className="px-3 py-1 text-right text-neutral-600 dark:text-neutral-300">
                          {pt.memoryPercent.toFixed(2)}%
                        </td>
                        <td className="px-3 py-1 text-right text-neutral-400 dark:text-neutral-500">
                          {pt.memory.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  // @group Render : Main layout
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('metricsHistory.title')}
        subtitle={t('metricsHistory.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Updated {fmtTime(lastUpdated.getTime())}
              </span>
            )}
            <Tooltip title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}>
              <button
                onClick={() => setAutoRefresh(r => !r)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  autoRefresh
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {autoRefresh ? t('metricsHistory.live') : t('metricsHistory.paused')}
              </button>
            </Tooltip>
            <Tooltip title="Refresh now">
              <IconButton size="small" onClick={fetchHistory}><RefreshIcon fontSize="small" /></IconButton>
            </Tooltip>
          </div>
        }
      />

      {loading ? (
        <div className="text-xs text-neutral-400 dark:text-neutral-500 py-12 text-center">
          {t('metricsHistory.loading')}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('metricsHistory.noHistory')}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  {[
                    { key: 'id' as const,     label: t('common.id') },
                    { key: 'name' as const,   label: t('common.name') },
                    { key: 'cpu' as const,    label: t('common.cpu') },
                    { key: 'memory' as const, label: t('common.memory') },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide select-none cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      {label}<SortArrow field={key} />
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    {t('metricsHistory.window')}
                  </th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(renderRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        {t('metricsHistory.sparklineHint')}
      </p>
    </div>
  );
};

export default MetricsHistoryPage;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ArrowPathIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import PageHeader from './PageHeader';
import { useTranslation } from 'react-i18next';

// @group ChartJS : Register required chart.js components
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend, Filler);

// @group Types : API response shapes
interface ConnectionInfo { id: string; name: string; }
interface MetricPoint {
  id: number;
  connection_id: string;
  connection_name: string;
  process_name: string;
  pm_id: number;
  timestamp: number;
  cpu: number;
  memory_bytes: number;
  memory_mb: number;
}

// @group Constants : Preset time ranges
const TIME_RANGES: { label: string; ms: number }[] = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 hr',  ms: 60 * 60_000 },
  { label: '6 hr',  ms: 6  * 60 * 60_000 },
  { label: '12 hr', ms: 12 * 60 * 60_000 },
  { label: '24 hr', ms: 24 * 60 * 60_000 },
  { label: '7 days',ms: 7  * 24 * 60 * 60_000 },
];

// @group Utilities : Compute min / max / avg over an array of numbers
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

// @group Utilities : Format Unix-ms to a short time/date string
function fmtTs(ts: number, rangeMs: number): string {
  const d = new Date(ts);
  if (rangeMs <= 60 * 60_000) {
    // ≤ 1h → show HH:MM:SS
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (rangeMs <= 24 * 60 * 60_000) {
    // ≤ 1d → show HH:MM
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // > 1d → show MMM D HH:MM
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// @group RemoteMetricsPage : Main analysis page component
const RemoteMetricsPage: React.FC = () => {
  const { t } = useTranslation();
  const [connections,    setConnections]= useState<ConnectionInfo[]>([]);
  const [selectedConn,   setSelectedConn]   = useState<string>('');
  const [processes,      setProcesses]      = useState<string[]>([]);
  const [selectedProc,   setSelectedProc]   = useState<string>('');
  const [rangeIdx,       setRangeIdx]       = useState<number>(1);  // default: 1 hr
  const [metrics,        setMetrics]        = useState<MetricPoint[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [autoRefresh,    setAutoRefresh]    = useState(false);
  const autoRefreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // @group DataFetching : Load connections that have recorded data
  const loadConnections = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; connections: ConnectionInfo[] }>(
        '/api/remote-metrics/connections'
      );
      if (res.data.success) setConnections(res.data.connections);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // @group DataFetching : Load process names whenever connection changes
  useEffect(() => {
    if (!selectedConn) return;
    setProcesses([]);
    setSelectedProc('');
    setMetrics([]);
    axios.get<{ success: boolean; processes: string[] }>(
      `/api/remote-metrics/${encodeURIComponent(selectedConn)}/processes`
    ).then(res => {
      if (res.data.success) {
        setProcesses(res.data.processes);
        if (res.data.processes.length > 0) setSelectedProc(res.data.processes[0]);
      }
    }).catch(() => {/* silent */});
  }, [selectedConn]);

  // @group DataFetching : Fetch time-series data
  const fetchMetrics = useCallback(async () => {
    if (!selectedConn || !selectedProc) return;
    setLoading(true);
    try {
      const rangeMs = TIME_RANGES[rangeIdx].ms;
      const now     = Date.now();
      const from    = now - rangeMs;
      const res     = await axios.get<{ success: boolean; metrics: MetricPoint[] }>(
        `/api/remote-metrics/${encodeURIComponent(selectedConn)}/${encodeURIComponent(selectedProc)}`,
        { params: { from, to: now } }
      );
      if (res.data.success) setMetrics(res.data.metrics);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [selectedConn, selectedProc, rangeIdx]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  // @group AutoRefresh : Start / stop interval
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchMetrics, 30_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, fetchMetrics]);

  // @group Chart : Derive labels and dataset values from fetched metrics
  const rangeMs  = TIME_RANGES[rangeIdx].ms;
  const labels   = metrics.map(m => fmtTs(m.timestamp, rangeMs));
  const cpuData  = metrics.map(m => m.cpu);
  const memData  = metrics.map(m => m.memory_mb);

  const cpuStats = stats(cpuData);
  const memStats = stats(memData);

  const baseChartOptions = (yLabel: string, yMax?: number) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (ctx: any) => ` ${ctx.parsed.y.toFixed(2)} ${yLabel}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 10 },
          maxTicksLimit: 8,
          maxRotation: 0,
          color: '#9ca3af',
        },
        grid: { color: 'rgba(156,163,175,0.1)' },
      },
      y: {
        min: 0,
        ...(yMax !== undefined ? { max: yMax } : {}),
        ticks: { font: { size: 10 }, color: '#9ca3af' },
        grid: { color: 'rgba(156,163,175,0.1)' },
        title: { display: true, text: yLabel, font: { size: 10 }, color: '#9ca3af' },
      },
    },
  });

  const cpuChartData = {
    labels,
    datasets: [{
      data:            cpuData,
      borderColor:     '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      borderWidth:     1.5,
      pointRadius:     metrics.length > 60 ? 0 : 2,
      tension:         0.3,
      fill:            true,
    }],
  };

  const memChartData = {
    labels,
    datasets: [{
      data:            memData,
      borderColor:     '#22d3ee',
      backgroundColor: 'rgba(34,211,238,0.08)',
      borderWidth:     1.5,
      pointRadius:     metrics.length > 60 ? 0 : 2,
      tension:         0.3,
      fill:            true,
    }],
  };

  // @group StatCard : Small stat display helper
  const StatCard = ({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value.toFixed(2)}<span className="text-xs font-normal text-neutral-400 ml-0.5">{unit}</span></span>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('remoteMetrics.title')}
        subtitle={t('remoteMetrics.subtitle')}
        actions={
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
              bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50`}
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        }
      />

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">

        {/* Connection selector */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">{t('remoteMetrics.connection')}</label>
          <select
            value={selectedConn}
            onChange={e => setSelectedConn(e.target.value)}
            className="text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700
              bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
              focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">-- select connection --</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Process selector */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">{t('remoteMetrics.process')}</label>
          <select
            value={selectedProc}
            onChange={e => setSelectedProc(e.target.value)}
            disabled={processes.length === 0}
            className="text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700
              bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
              focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
          >
            {processes.length === 0
              ? <option value="">-- select connection first --</option>
              : processes.map(p => <option key={p} value={p}>{p}</option>)
            }
          </select>
        </div>

        {/* Time range pills */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">{t('remoteMetrics.range')}</label>
          <div className="flex gap-1">
            {TIME_RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  rangeIdx === i
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-refresh toggle */}
        <div className="flex flex-col gap-0.5 ml-auto">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">{t('remoteMetrics.autoRefresh')}</label>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`self-start text-xs px-3 py-1.5 rounded border transition-colors ${
              autoRefresh
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
            }`}
          >
            {autoRefresh ? t('remoteMetrics.on') : t('remoteMetrics.off')}
          </button>
        </div>
      </div>

      {/* ── Empty / no-selection states ── */}
      {!selectedConn && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ChartBarIcon className="h-10 w-10 text-neutral-300 dark:text-neutral-700 mb-3" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('remoteMetrics.selectConnection')}
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1">
            {t('remoteMetrics.metricsRecorded')}
          </p>
          {connections.length === 0 && (
            <p className="text-xs text-amber-500 mt-3">
              {t('remoteMetrics.noData')}
            </p>
          )}
        </div>
      )}

      {selectedConn && !selectedProc && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('remoteMetrics.noProcesses')}</p>
        </div>
      )}

      {/* ── Charts ── */}
      {selectedConn && selectedProc && (
        <div className="space-y-4">

          {/* ── CPU Chart ── */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('remoteMetrics.cpuUsage')}</p>
                <p className="text-xs text-neutral-400">{metrics.length} data points</p>
              </div>
              <div className="flex items-center gap-4">
                <StatCard label={t('metricsPage.min')}  value={cpuStats.min} unit="%" color="text-emerald-500" />
                <StatCard label={t('metricsPage.avg')}  value={cpuStats.avg} unit="%" color="text-primary-400" />
                <StatCard label={t('metricsPage.max')}  value={cpuStats.max} unit="%" color="text-rose-400" />
              </div>
            </div>
            <div className="h-40">
              {metrics.length > 0
                ? <Line data={cpuChartData} options={baseChartOptions('%', 100)} />
                : <div className="h-full flex items-center justify-center text-xs text-neutral-400">{t('remoteMetrics.noDataRange')}</div>
              }
            </div>
          </div>

          {/* ── Memory Chart ── */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('remoteMetrics.memoryUsage')}</p>
                <p className="text-xs text-neutral-400">{metrics.length} data points</p>
              </div>
              <div className="flex items-center gap-4">
                <StatCard label={t('metricsPage.min')}  value={memStats.min} unit="MB" color="text-emerald-500" />
                <StatCard label={t('metricsPage.avg')}  value={memStats.avg} unit="MB" color="text-cyan-400" />
                <StatCard label={t('metricsPage.max')}  value={memStats.max} unit="MB" color="text-rose-400" />
              </div>
            </div>
            <div className="h-40">
              {metrics.length > 0
                ? <Line data={memChartData} options={baseChartOptions('MB')} />
                : <div className="h-full flex items-center justify-center text-xs text-neutral-400">{t('remoteMetrics.noDataRange')}</div>
              }
            </div>
          </div>

          {/* ── Raw data table (last 20 rows) ── */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('remoteMetrics.recentSamples')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                    <th className="px-4 py-2 font-medium">{t('remoteMetrics.time')}</th>
                    <th className="px-4 py-2 font-medium">{t('common.cpu')}</th>
                    <th className="px-4 py-2 font-medium">{t('common.memory')}</th>
                    <th className="px-4 py-2 font-medium">Memory (bytes)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {[...metrics].reverse().slice(0, 20).map(m => (
                    <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                      <td className="px-4 py-1.5 text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {new Date(m.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums">
                        <span className={m.cpu > 80 ? 'text-rose-500' : m.cpu > 50 ? 'text-amber-500' : 'text-emerald-500'}>
                          {m.cpu.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-cyan-600 dark:text-cyan-400 tabular-nums">
                        {m.memory_mb.toFixed(2)} MB
                      </td>
                      <td className="px-4 py-1.5 text-neutral-500 dark:text-neutral-500 tabular-nums">
                        {m.memory_bytes.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default RemoteMetricsPage;

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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (rangeMs <= 24 * 60 * 60_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
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

  // @group ChartConfig : CLI-themed chart options factory
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
          font: { size: 10, family: 'monospace' },
          maxTicksLimit: 8,
          maxRotation: 0,
          color: '#555',
        },
        grid: { color: '#1e1e1e' },
      },
      y: {
        min: 0,
        ...(yMax !== undefined ? { max: yMax } : {}),
        ticks: { font: { size: 10, family: 'monospace' }, color: '#555' },
        grid: { color: '#1e1e1e' },
        title: { display: true, text: yLabel, font: { size: 10, family: 'monospace' }, color: '#555' },
      },
    },
  });

  const cpuChartData = {
    labels,
    datasets: [{
      data:            cpuData,
      borderColor:     '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.08)',
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
    <div className="bg-[#111] border border-[#1e1e1e] rounded-sm px-2.5 py-1.5 flex flex-col gap-0.5">
      <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em]">{label}</span>
      <span className={`text-[11px] font-mono font-bold ${color}`}>
        {value.toFixed(2)}
        <span className="text-[9px] font-normal text-[#555] ml-0.5">{unit}</span>
      </span>
    </div>
  );

  // @group SelectStyles : CLI-styled select element class
  const selectCls = `font-mono text-[10px] px-2 py-1.5 rounded-sm border border-[#1e1e1e]
    bg-[#111] text-[#e8e8e8]
    focus:outline-none focus:ring-1 focus:ring-[#22c55e] disabled:opacity-40`;

  return (
    <div>
      <PageHeader
        title={t('remoteMetrics.title')}
        subtitle={t('remoteMetrics.subtitle')}
        actions={
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px]
              bg-[#111] border border-[#1e1e1e] text-[#888] hover:text-[#e8e8e8] hover:border-[#333]
              disabled:opacity-40 transition-colors"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        }
      />

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-end gap-3 mb-4">

        {/* Connection selector */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('remoteMetrics.connection')}</label>
          <select
            value={selectedConn}
            onChange={e => setSelectedConn(e.target.value)}
            className={selectCls}
          >
            <option value="">-- select connection --</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Process selector */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('remoteMetrics.process')}</label>
          <select
            value={selectedProc}
            onChange={e => setSelectedProc(e.target.value)}
            disabled={processes.length === 0}
            className={selectCls}
          >
            {processes.length === 0
              ? <option value="">-- select connection first --</option>
              : processes.map(p => <option key={p} value={p}>{p}</option>)
            }
          </select>
        </div>

        {/* Time range pills */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('remoteMetrics.range')}</label>
          <div className="flex gap-1">
            {TIME_RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={`font-mono text-[10px] px-2 py-1 rounded-sm transition-colors ${
                  rangeIdx === i
                    ? 'bg-[#1a2e1a] border border-[#22c55e]/40 text-[#22c55e]'
                    : 'bg-[#111] border border-[#1e1e1e] text-[#555] hover:text-[#888] hover:border-[#333]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-refresh toggle */}
        <div className="flex flex-col gap-0.5 ml-auto">
          <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.12em]">{t('remoteMetrics.autoRefresh')}</label>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`self-start font-mono text-[10px] px-3 py-1.5 rounded-sm border transition-colors ${
              autoRefresh
                ? 'bg-[#0d1f0d] border-[#22c55e]/40 text-[#22c55e]'
                : 'border-[#1e1e1e] text-[#555] hover:text-[#888] hover:border-[#333]'
            }`}
          >
            {autoRefresh ? t('remoteMetrics.on') : t('remoteMetrics.off')}
          </button>
        </div>
      </div>

      {/* ── Empty / no-selection states ── */}
      {!selectedConn && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ChartBarIcon className="h-10 w-10 text-[#333] mb-3" />
          <p className="text-[10px] font-mono text-[#555]">
            {t('remoteMetrics.selectConnection')}
          </p>
          <p className="text-[10px] font-mono text-[#444] mt-1">
            {t('remoteMetrics.metricsRecorded')}
          </p>
          {connections.length === 0 && (
            <p className="text-[10px] font-mono text-[#f59e0b] mt-3">
              {t('remoteMetrics.noData')}
            </p>
          )}
        </div>
      )}

      {selectedConn && !selectedProc && (
        <div className="flex items-center justify-center py-12">
          <p className="text-[10px] font-mono text-[#555]">{t('remoteMetrics.noProcesses')}</p>
        </div>
      )}

      {/* ── Charts ── */}
      {selectedConn && selectedProc && (
        <div className="space-y-4">

          {/* ── CPU Chart ── */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-mono text-[#888]">{t('remoteMetrics.cpuUsage')}</p>
                <p className="text-[9px] font-mono text-[#444]">{metrics.length} data points</p>
              </div>
              <div className="flex items-center gap-2">
                <StatCard label={t('metricsPage.min')}  value={cpuStats.min} unit="%" color="text-[#22c55e]" />
                <StatCard label={t('metricsPage.avg')}  value={cpuStats.avg} unit="%" color="text-[#e8e8e8]" />
                <StatCard label={t('metricsPage.max')}  value={cpuStats.max} unit="%" color="text-[#ef4444]" />
              </div>
            </div>
            <div className="h-40">
              {metrics.length > 0
                ? <Line data={cpuChartData} options={baseChartOptions('%', 100)} />
                : <div className="h-full flex items-center justify-center text-[10px] font-mono text-[#555]">{t('remoteMetrics.noDataRange')}</div>
              }
            </div>
          </div>

          {/* ── Memory Chart ── */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-mono text-[#888]">{t('remoteMetrics.memoryUsage')}</p>
                <p className="text-[9px] font-mono text-[#444]">{metrics.length} data points</p>
              </div>
              <div className="flex items-center gap-2">
                <StatCard label={t('metricsPage.min')}  value={memStats.min} unit="MB" color="text-[#22c55e]" />
                <StatCard label={t('metricsPage.avg')}  value={memStats.avg} unit="MB" color="text-[#22d3ee]" />
                <StatCard label={t('metricsPage.max')}  value={memStats.max} unit="MB" color="text-[#ef4444]" />
              </div>
            </div>
            <div className="h-40">
              {metrics.length > 0
                ? <Line data={memChartData} options={baseChartOptions('MB')} />
                : <div className="h-full flex items-center justify-center text-[10px] font-mono text-[#555]">{t('remoteMetrics.noDataRange')}</div>
              }
            </div>
          </div>

          {/* ── Raw data table (last 20 rows) ── */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-[#1e1e1e]">
              <p className="text-[10px] font-mono text-[#888]">{t('remoteMetrics.recentSamples')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-[#1e1e1e]">
                    <th className="px-3 py-2 font-mono text-[9px] text-[#555] uppercase tracking-[0.12em] font-normal">{t('remoteMetrics.time')}</th>
                    <th className="px-3 py-2 font-mono text-[9px] text-[#555] uppercase tracking-[0.12em] font-normal">{t('common.cpu')}</th>
                    <th className="px-3 py-2 font-mono text-[9px] text-[#555] uppercase tracking-[0.12em] font-normal">{t('common.memory')}</th>
                    <th className="px-3 py-2 font-mono text-[9px] text-[#555] uppercase tracking-[0.12em] font-normal">Memory (bytes)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {[...metrics].reverse().slice(0, 20).map(m => (
                    <tr key={m.id} className="hover:bg-[#141414] transition-colors">
                      <td className="px-3 py-1.5 font-mono text-[10px] text-[#555] tabular-nums">
                        {new Date(m.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px] tabular-nums">
                        <span className={m.cpu >= 80 ? 'text-[#ef4444]' : m.cpu >= 50 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}>
                          {m.cpu.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-[#22d3ee] tabular-nums">
                        {m.memory_mb.toFixed(2)} MB
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-[#444] tabular-nums">
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

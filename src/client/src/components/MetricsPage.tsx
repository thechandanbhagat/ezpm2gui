import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  ArrowPathIcon,
  ChartBarIcon,
  SignalIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import PageHeader from './PageHeader';
import { PM2Process, SystemMetricsData } from '../types/pm2';

// @group ChartJS : Register required chart.js components
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

// @group Types : API response shapes
interface ConnectionInfo { id: string; name: string; }
interface HistMetricPoint {
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
interface LivePoint { ts: number; cpu: number; memMb: number; }

// @group Constants
const MAX_LIVE_POINTS = 1200; // 1 hour at 3s
const TIME_RANGES: { label: string; ms: number }[] = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 hr',   ms: 60 * 60_000 },
  { label: '6 hr',   ms: 6  * 60 * 60_000 },
  { label: '12 hr',  ms: 12 * 60 * 60_000 },
  { label: '24 hr',  ms: 24 * 60 * 60_000 },
  { label: '7 days', ms: 7  * 24 * 60 * 60_000 },
];

// @group Utilities
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

function fmtTs(ts: number, rangeMs: number): string {
  const d = new Date(ts);
  if (rangeMs <= 60 * 60_000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (rangeMs <= 24 * 60 * 60_000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// @group Sparkline : Lightweight SVG micro-chart for inline use in tables
const Sparkline = ({
  values,
  color,
  width = 120,
  height = 30,
  max,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  max?: number;
}) => {
  if (values.length < 2) {
    return (
      <span
        style={{ display: 'inline-block', width, height, lineHeight: `${height}px` }}
        className="text-center text-neutral-300 dark:text-neutral-700 text-xs"
      >
        —
      </span>
    );
  }
  const pad  = 2;
  const W    = width - pad * 2;
  const H    = height - pad * 2;
  const yMax = max ?? Math.max(...values, 0.01);
  const norm = (v: number) => pad + H - (v / yMax) * H;

  const pts = values
    .map((v, i) => `${pad + (i / (values.length - 1)) * W},${norm(v)}`)
    .join(' ');

  const fillPts = [
    `${pad},${norm(values[0])}`,
    ...values.slice(1).map((v, i) => `${pad + ((i + 1) / (values.length - 1)) * W},${norm(v)}`),
    `${pad + W},${pad + H}`,
    `${pad},${pad + H}`,
  ].join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polygon points={fillPts} fill={color} fillOpacity={0.12} stroke="none" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

function fmtMem(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

// @group MetricsPage : Props
interface MetricsPageProps {
  processes: PM2Process[];
  metrics: SystemMetricsData;
}

// @group MetricsPage : Main component
const MetricsPage: React.FC<MetricsPageProps> = ({ processes }) => {
  const [tab, setTab] = useState<'live' | 'history'>('live');

  // @group LiveState
  const [selectedLiveProc, setSelectedLiveProc] = useState<string>('');
  const liveBufferRef = useRef<Map<string, LivePoint[]>>(new Map());
  const [, setLiveRender] = useState(0); // bump to force re-render on buffer update

  // @group HistoryState
  const [connections,       setConnections]       = useState<ConnectionInfo[]>([]);
  const [selectedConn,      setSelectedConn]      = useState<string>('');
  const [histProcs,         setHistProcs]         = useState<string[]>([]);
  const [selectedHistProc,  setSelectedHistProc]  = useState<string>('');
  const [rangeIdx,          setRangeIdx]          = useState<number>(1);
  const [histMetrics,       setHistMetrics]       = useState<HistMetricPoint[]>([]);
  const [histLoading,       setHistLoading]       = useState(false);
  const [autoRefresh,       setAutoRefresh]       = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // @group LiveBuffer : Accumulate live readings into per-process rolling buffer
  useEffect(() => {
    const now = Date.now();
    const map = liveBufferRef.current;

    for (const proc of processes) {
      const key = proc.name;
      const existing = map.get(key) ?? [];
      existing.push({
        ts:    now,
        cpu:   proc.monit.cpu,
        memMb: proc.monit.memory / (1024 * 1024),
      });
      if (existing.length > MAX_LIVE_POINTS) existing.shift();
      map.set(key, existing);
    }

    // Remove processes no longer in the list
    for (const key of map.keys()) {
      if (!processes.find(p => p.name === key)) map.delete(key);
    }

    setLiveRender(n => n + 1);
  }, [processes]);

  // Auto-select first live process when list loads
  useEffect(() => {
    if (!selectedLiveProc && processes.length > 0) {
      setSelectedLiveProc(processes[0].name);
    }
  }, [processes, selectedLiveProc]);

  // @group HistoryData : Load connections that have data
  const loadConnections = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; connections: ConnectionInfo[] }>(
        '/api/remote-metrics/connections'
      );
      if (res.data.success) setConnections(res.data.connections);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadConnections();
  }, [tab, loadConnections]);

  // @group HistoryData : Load process names when connection changes
  useEffect(() => {
    if (!selectedConn) return;
    setHistProcs([]);
    setSelectedHistProc('');
    setHistMetrics([]);
    axios.get<{ success: boolean; processes: string[] }>(
      `/api/remote-metrics/${encodeURIComponent(selectedConn)}/processes`
    ).then(res => {
      if (res.data.success) {
        setHistProcs(res.data.processes);
        if (res.data.processes.length > 0) setSelectedHistProc(res.data.processes[0]);
      }
    }).catch(() => {});
  }, [selectedConn]);

  // @group HistoryData : Fetch time-series
  const fetchHistory = useCallback(async () => {
    if (!selectedConn || !selectedHistProc) return;
    setHistLoading(true);
    try {
      const rangeMs = TIME_RANGES[rangeIdx].ms;
      const now = Date.now();
      const res = await axios.get<{ success: boolean; metrics: HistMetricPoint[] }>(
        `/api/remote-metrics/${encodeURIComponent(selectedConn)}/${encodeURIComponent(selectedHistProc)}`,
        { params: { from: now - rangeMs, to: now } }
      );
      if (res.data.success) setHistMetrics(res.data.metrics);
    } catch { /* silent */ } finally {
      setHistLoading(false);
    }
  }, [selectedConn, selectedHistProc, rangeIdx]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // @group AutoRefresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchHistory, 30_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, fetchHistory]);

  // @group ChartConfig : Shared chart options factory
  const chartOptions = (yLabel: string, yMax?: number) => ({
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
        ticks: { font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0, color: '#9ca3af' },
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

  // @group LiveChartData : Build chart data from rolling buffer
  const livePoints  = liveBufferRef.current.get(selectedLiveProc) ?? [];
  const liveLabels  = livePoints.map(p =>
    new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const liveCpuData = livePoints.map(p => p.cpu);
  const liveMemData = livePoints.map(p => p.memMb);
  const liveCpuStats = stats(liveCpuData);
  const liveMemStats = stats(liveMemData);

  const liveCpuChart = {
    labels: liveLabels,
    datasets: [{
      data: liveCpuData,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      borderWidth: 1.5,
      pointRadius: livePoints.length > 60 ? 0 : 2,
      tension: 0.3,
      fill: true,
    }],
  };
  const liveMemChart = {
    labels: liveLabels,
    datasets: [{
      data: liveMemData,
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34,211,238,0.08)',
      borderWidth: 1.5,
      pointRadius: livePoints.length > 60 ? 0 : 2,
      tension: 0.3,
      fill: true,
    }],
  };

  // @group HistChartData : Build chart data from SQLite history
  const histRangeMs  = TIME_RANGES[rangeIdx].ms;
  const histLabels   = histMetrics.map(m => fmtTs(m.timestamp, histRangeMs));
  const histCpuData  = histMetrics.map(m => m.cpu);
  const histMemData  = histMetrics.map(m => m.memory_mb);
  const histCpuStats = stats(histCpuData);
  const histMemStats = stats(histMemData);

  const histCpuChart = {
    labels: histLabels,
    datasets: [{
      data: histCpuData,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      borderWidth: 1.5,
      pointRadius: histMetrics.length > 60 ? 0 : 2,
      tension: 0.3,
      fill: true,
    }],
  };
  const histMemChart = {
    labels: histLabels,
    datasets: [{
      data: histMemData,
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34,211,238,0.08)',
      borderWidth: 1.5,
      pointRadius: histMetrics.length > 60 ? 0 : 2,
      tension: 0.3,
      fill: true,
    }],
  };

  // @group StatCard : Small stat display helper
  const StatCard = ({
    label, value, unit, color,
  }: { label: string; value: number; unit: string; color: string }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>
        {value.toFixed(2)}
        <span className="text-xs font-normal text-neutral-400 ml-0.5">{unit}</span>
      </span>
    </div>
  );

  // @group TabButton
  const TabButton = ({ id, label, icon: Icon }: { id: 'live' | 'history'; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        tab === id
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  const selectCls = `text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700
    bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
    focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50`;

  // @group LiveCurrentProcess : current live process being viewed
  const currentProc = processes.find(p => p.name === selectedLiveProc);

  return (
    <div>
      <PageHeader
        title="Metrics"
        subtitle="Real-time and historical process metrics"
        actions={
          tab === 'history' ? (
            <button
              onClick={fetchHistory}
              disabled={histLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-colors"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${histLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          ) : undefined
        }
      />

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-neutral-200 dark:border-neutral-800 mb-4">
        <TabButton id="live"    label="Live"    icon={SignalIcon} />
        <TabButton id="history" label="History" icon={ClockIcon} />
      </div>

      {/* ════════════════════ LIVE TAB ════════════════════ */}
      {tab === 'live' && (
        <div className="space-y-4">
          {/* Process selector + current status bar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">Process</label>
              <select
                value={selectedLiveProc}
                onChange={e => setSelectedLiveProc(e.target.value)}
                className={selectCls}
              >
                {processes.length === 0
                  ? <option value="">No processes running</option>
                  : processes.map(p => (
                      <option key={p.pm_id} value={p.name}>{p.name}</option>
                    ))
                }
              </select>
            </div>

            {currentProc && (
              <div className="flex items-center gap-3 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  currentProc.pm2_env.status === 'online'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                }`}>
                  {currentProc.pm2_env.status}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  CPU: <span className="font-semibold text-indigo-500">{currentProc.monit.cpu.toFixed(1)}%</span>
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Mem: <span className="font-semibold text-cyan-500">{fmtMem(currentProc.monit.memory)}</span>
                </span>
                <span className="text-neutral-400 dark:text-neutral-600">
                  {livePoints.length} pts · updates every 3s
                </span>
              </div>
            )}
          </div>

          {processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ChartBarIcon className="h-10 w-10 text-neutral-300 dark:text-neutral-700 mb-3" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No processes found</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1">
                Make sure PM2 is running and connected
              </p>
            </div>
          ) : (
            <>
              {/* ── Live CPU Chart ── */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">CPU Usage</p>
                    <p className="text-xs text-neutral-400">rolling {livePoints.length} pts</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatCard label="Min" value={liveCpuStats.min} unit="%" color="text-emerald-500" />
                    <StatCard label="Avg" value={liveCpuStats.avg} unit="%" color="text-primary-400" />
                    <StatCard label="Max" value={liveCpuStats.max} unit="%" color="text-rose-400" />
                  </div>
                </div>
                <div className="h-40">
                  {livePoints.length > 0
                    ? <Line data={liveCpuChart} options={chartOptions('%', 100)} />
                    : <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                        Waiting for data...
                      </div>
                  }
                </div>
              </div>

              {/* ── Live Memory Chart ── */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Memory Usage</p>
                    <p className="text-xs text-neutral-400">rolling {livePoints.length} pts</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatCard label="Min" value={liveMemStats.min} unit="MB" color="text-emerald-500" />
                    <StatCard label="Avg" value={liveMemStats.avg} unit="MB" color="text-cyan-400" />
                    <StatCard label="Max" value={liveMemStats.max} unit="MB" color="text-rose-400" />
                  </div>
                </div>
                <div className="h-40">
                  {livePoints.length > 0
                    ? <Line data={liveMemChart} options={chartOptions('MB')} />
                    : <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                        Waiting for data...
                      </div>
                  }
                </div>
              </div>

              {/* ── All processes snapshot table ── */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                  <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    All Processes — Live Snapshot
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">CPU</th>
                        <th className="px-4 py-2 font-medium">CPU (1h)</th>
                        <th className="px-4 py-2 font-medium">Memory</th>
                        <th className="px-4 py-2 font-medium">Mem (1h)</th>
                        <th className="px-4 py-2 font-medium">Restarts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {processes.map(proc => (
                        <tr
                          key={proc.pm_id}
                          onClick={() => setSelectedLiveProc(proc.name)}
                          className={`cursor-pointer transition-colors ${
                            proc.name === selectedLiveProc
                              ? 'bg-primary-50 dark:bg-primary-900/20'
                              : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                          }`}
                        >
                          <td className="px-4 py-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                            {proc.name}
                          </td>
                          <td className="px-4 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                              proc.pm2_env.status === 'online'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : proc.pm2_env.status === 'errored'
                                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                            }`}>
                              {proc.pm2_env.status}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 tabular-nums">
                            <span className={
                              proc.monit.cpu > 80 ? 'text-rose-500' :
                              proc.monit.cpu > 50 ? 'text-amber-500' : 'text-emerald-500'
                            }>
                              {proc.monit.cpu.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <Sparkline
                              values={(liveBufferRef.current.get(proc.name) ?? []).map(p => p.cpu)}
                              color="#6366f1"
                              max={100}
                            />
                          </td>
                          <td className="px-4 py-1.5 text-cyan-600 dark:text-cyan-400 tabular-nums">
                            {fmtMem(proc.monit.memory)}
                          </td>
                          <td className="px-2 py-1">
                            <Sparkline
                              values={(liveBufferRef.current.get(proc.name) ?? []).map(p => p.memMb)}
                              color="#22d3ee"
                            />
                          </td>
                          <td className="px-4 py-1.5 text-neutral-500 dark:text-neutral-400 tabular-nums">
                            {proc.pm2_env.restart_time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════ HISTORY TAB ════════════════════ */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">Connection</label>
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

            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">Process</label>
              <select
                value={selectedHistProc}
                onChange={e => setSelectedHistProc(e.target.value)}
                disabled={histProcs.length === 0}
                className={selectCls}
              >
                {histProcs.length === 0
                  ? <option value="">-- select connection first --</option>
                  : histProcs.map(p => <option key={p} value={p}>{p}</option>)
                }
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">Range</label>
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

            <div className="flex flex-col gap-0.5 ml-auto">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">Auto-refresh (30s)</label>
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className={`self-start text-xs px-3 py-1.5 rounded border transition-colors ${
                  autoRefresh
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                }`}
              >
                {autoRefresh ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Empty states */}
          {!selectedConn && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ChartBarIcon className="h-10 w-10 text-neutral-300 dark:text-neutral-700 mb-3" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Select a connection to view recorded history
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1">
                Metrics are recorded every 30 seconds while a remote server is connected
              </p>
              {connections.length === 0 && (
                <p className="text-xs text-amber-500 mt-3">
                  No data yet — connect a remote server and wait for the first poll cycle
                </p>
              )}
            </div>
          )}

          {selectedConn && !selectedHistProc && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No processes recorded for this connection yet
              </p>
            </div>
          )}

          {/* Charts */}
          {selectedConn && selectedHistProc && (
            <>
              {/* History CPU Chart */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">CPU Usage</p>
                    <p className="text-xs text-neutral-400">{histMetrics.length} data points</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatCard label="Min" value={histCpuStats.min} unit="%" color="text-emerald-500" />
                    <StatCard label="Avg" value={histCpuStats.avg} unit="%" color="text-primary-400" />
                    <StatCard label="Max" value={histCpuStats.max} unit="%" color="text-rose-400" />
                  </div>
                </div>
                <div className="h-40">
                  {histMetrics.length > 0
                    ? <Line data={histCpuChart} options={chartOptions('%', 100)} />
                    : <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                        No data for selected range
                      </div>
                  }
                </div>
              </div>

              {/* History Memory Chart */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Memory Usage</p>
                    <p className="text-xs text-neutral-400">{histMetrics.length} data points</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatCard label="Min" value={histMemStats.min} unit="MB" color="text-emerald-500" />
                    <StatCard label="Avg" value={histMemStats.avg} unit="MB" color="text-cyan-400" />
                    <StatCard label="Max" value={histMemStats.max} unit="MB" color="text-rose-400" />
                  </div>
                </div>
                <div className="h-40">
                  {histMetrics.length > 0
                    ? <Line data={histMemChart} options={chartOptions('MB')} />
                    : <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                        No data for selected range
                      </div>
                  }
                </div>
              </div>

              {/* Raw table */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                  <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Recent Samples (last 20)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                        <th className="px-4 py-2 font-medium">Time</th>
                        <th className="px-4 py-2 font-medium">CPU</th>
                        <th className="px-4 py-2 font-medium">Memory</th>
                        <th className="px-4 py-2 font-medium">Memory (bytes)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {[...histMetrics].reverse().slice(0, 20).map(m => (
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MetricsPage;

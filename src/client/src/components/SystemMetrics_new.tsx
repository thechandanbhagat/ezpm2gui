import React from 'react';
import { useTranslation } from 'react-i18next';
import { SystemMetricsData } from '../types/pm2';
import {
  ClockIcon,
  CpuChipIcon,
  ServerStackIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';

// @group Utilities : Formatting helpers

const formatMemory = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatUptime = (seconds: number): string => {
  const days  = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins  = Math.floor((seconds % 3600) / 60);
  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// @group Utilities : Progress bar fill color based on percentage

const progressColor = (pct: number): string => {
  if (pct >= 80) return 'bg-[#ef4444]';
  if (pct >= 50) return 'bg-[#f59e0b]';
  return 'bg-[#22c55e]';
};

// @group Types : Single stat card props

interface StatCardProps {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: string;
  sub?: React.ReactNode;
}

// @group Render : Compact CLI metric card

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, iconColor, label, value, sub }) => (
  <div className="flex items-center gap-2.5 bg-[#111] border border-[#1e1e1e] rounded-sm px-3 py-2 min-w-0">
    <Icon className={`shrink-0 h-3.5 w-3.5 ${iconColor}`} />
    <div className="min-w-0">
      <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] leading-none mb-0.5">{label}</p>
      <p className="text-[11px] font-mono font-bold text-[#e8e8e8] leading-tight truncate">{value}</p>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  </div>
);

// @group SystemMetrics : Horizontal row of system stat cards

const SystemMetricsNew: React.FC<{ metrics: SystemMetricsData }> = ({ metrics }) => {
  const { t } = useTranslation();
  const memPct = Math.round((metrics.memory.used / metrics.memory.total) * 100);

  return (
    <>
      <StatCard
        icon={ClockIcon}
        iconColor="text-[#22d3ee]"
        label={t('systemMetrics.systemUptime')}
        value={formatUptime(metrics.uptime)}
      />
      <StatCard
        icon={CpuChipIcon}
        iconColor="text-[#a78bfa]"
        label={t('systemMetrics.loadAvg')}
        value={metrics.loadAvg[0].toFixed(2)}
        sub={
          <p className="text-[10px] font-mono text-[#555] leading-none">
            {metrics.loadAvg[1].toFixed(2)} · {metrics.loadAvg[2].toFixed(2)}
          </p>
        }
      />
      <StatCard
        icon={CircleStackIcon}
        iconColor={memPct >= 80 ? 'text-[#ef4444]' : memPct >= 50 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}
        label={t('systemMetrics.memory')}
        value={`${formatMemory(metrics.memory.used)} / ${formatMemory(metrics.memory.total)}`}
        sub={
          <div className="w-full bg-[#1a1a1a] rounded-sm h-1 mt-1">
            <div
              className={`h-1 rounded-sm transition-all duration-300 ${progressColor(memPct)}`}
              style={{ width: `${memPct}%` }}
            />
          </div>
        }
      />
      <StatCard
        icon={ServerStackIcon}
        iconColor="text-[#888]"
        label={t('systemMetrics.cpuCores')}
        value={String(metrics.cpus)}
      />
    </>
  );
};

export default SystemMetricsNew;

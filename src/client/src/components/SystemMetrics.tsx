import React from 'react';
import { useTranslation } from 'react-i18next';
import { SystemMetricsData } from '../types/pm2';
import {
  ClockIcon,
  CpuChipIcon,
  ServerStackIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';

interface SystemMetricsProps {
  metrics: SystemMetricsData;
}

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

// @group Types : Single stat card props
interface StatCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub?: React.ReactNode;
}

// @group Render : Compact metric card
const StatCard: React.FC<StatCardProps> = ({ icon: Icon, iconColor, iconBg, label, value, sub }) => (
  <div className="flex items-center gap-2.5 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 min-w-0">
    <div className={`shrink-0 w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
      <p className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 leading-tight truncate">{value}</p>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  </div>
);

// @group SystemMetrics : Horizontal row of system stat cards
const SystemMetrics: React.FC<SystemMetricsProps> = ({ metrics }) => {
  const { t } = useTranslation();
  const memPct = Math.round((metrics.memory.used / metrics.memory.total) * 100);
  const memColor = memPct > 80 ? 'bg-red-500' : memPct > 60 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <>
      <StatCard
        icon={ClockIcon}
        iconColor="text-blue-500"
        iconBg="bg-blue-500/10"
        label={t('systemMetrics.systemUptime')}
        value={formatUptime(metrics.uptime)}
      />
      <StatCard
        icon={CpuChipIcon}
        iconColor="text-violet-500"
        iconBg="bg-violet-500/10"
        label={t('systemMetrics.loadAvg')}
        value={metrics.loadAvg[0].toFixed(2)}
        sub={
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 leading-none">
            {metrics.loadAvg[1].toFixed(2)} · {metrics.loadAvg[2].toFixed(2)}
          </p>
        }
      />
      <StatCard
        icon={CircleStackIcon}
        iconColor={memPct > 80 ? 'text-red-500' : memPct > 60 ? 'text-yellow-500' : 'text-green-500'}
        iconBg={memPct > 80 ? 'bg-red-500/10' : memPct > 60 ? 'bg-yellow-500/10' : 'bg-green-500/10'}
        label={t('systemMetrics.memory')}
        value={`${formatMemory(metrics.memory.used)} / ${formatMemory(metrics.memory.total)}`}
        sub={
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1 mt-1">
            <div className={`h-1 rounded-full transition-all duration-300 ${memColor}`} style={{ width: `${memPct}%` }} />
          </div>
        }
      />
      <StatCard
        icon={ServerStackIcon}
        iconColor="text-neutral-500"
        iconBg="bg-neutral-100 dark:bg-neutral-800"
        label={t('systemMetrics.cpuCores')}
        value={String(metrics.cpus)}
      />
    </>
  );
};

export default SystemMetrics;

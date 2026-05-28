import React from 'react';
import { useTranslation } from 'react-i18next';
import { PM2Process, SystemMetricsData } from '../types/pm2';
import SystemMetrics from './SystemMetrics';
import ProcessList from './ProcessList';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  RectangleStackIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

// @group Types : Process stat card props
interface ProcessStatCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: number;
  total?: number;
}

// @group Types : Main dashboard props
interface MainDashboardProps {
  processes: PM2Process[];
  metrics: SystemMetricsData;
  searchTerm: string;
  statusFilter: string;
  namespaceFilter: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStatusFilterChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onNamespaceFilterChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onProcessAction: (id: number, action: string) => void;
}

// @group Render : Compact CLI-style process stat card
const ProcessStatCard: React.FC<ProcessStatCardProps> = ({ icon: Icon, iconColor, iconBg, label, value, total }) => (
  <div className="flex items-center gap-2.5 bg-[#111] border border-[#1e1e1e] rounded-sm px-3 py-2 min-w-0">
    <div className={`shrink-0 w-7 h-7 flex items-center justify-center ${iconBg}`}>
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] leading-none mb-0.5">{label}</p>
      <p className="text-[11px] font-mono font-bold text-[#e8e8e8] leading-tight">
        {value}
        {total !== undefined && (
          <span className="text-[10px] font-mono font-normal text-[#444] ml-1">/ {total}</span>
        )}
      </p>
    </div>
  </div>
);

// @group MainDashboard : Process dashboard — analytics on top, full-width process list below
const MainDashboard: React.FC<MainDashboardProps> = ({
  processes,
  metrics,
  searchTerm,
  statusFilter,
  namespaceFilter,
  onSearchChange,
  onStatusFilterChange,
  onNamespaceFilterChange,
  onProcessAction,
}) => {
  const { t } = useTranslation();

  // @group Derived : Process counts per status
  const online  = processes.filter(p => p.pm2_env?.status === 'online').length;
  const stopped = processes.filter(p => p.pm2_env?.status === 'stopped').length;
  const errored = processes.filter(p => !['online', 'stopped'].includes(p.pm2_env?.status)).length;

  // @group Derived : Unique sorted namespace list
  const namespaces = Array.from(
    new Set(processes.map(p => p.pm2_env?.namespace || 'default'))
  ).sort((a, b) => a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b));

  return (
    <div className="space-y-3">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em]">
            ▸ {t('mainDashboard.title')}
          </h1>
          <p className="text-[10px] font-mono text-[#555] mt-0.5">
            {t('mainDashboard.subtitle')}
          </p>
        </div>
      </div>

      {/* ── Analytics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">

        {/* Process stat cards */}
        <ProcessStatCard
          icon={CheckCircleIcon}
          iconColor="text-[#22c55e]"
          iconBg="bg-green-950"
          label={t('common.online')}
          value={online}
          total={processes.length}
        />
        <ProcessStatCard
          icon={XCircleIcon}
          iconColor="text-[#ef4444]"
          iconBg="bg-red-950"
          label={t('common.stopped')}
          value={stopped}
        />
        <ProcessStatCard
          icon={ExclamationCircleIcon}
          iconColor="text-[#f59e0b]"
          iconBg="bg-amber-950"
          label={t('common.errored')}
          value={errored}
        />
        <ProcessStatCard
          icon={Squares2X2Icon}
          iconColor="text-[#888]"
          iconBg="bg-[#1a1a1a]"
          label={t('common.total')}
          value={processes.length}
        />

        {/* System metric cards */}
        <SystemMetrics metrics={metrics} />
      </div>

      {/* ── Search + filter bar ── */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-2">
        <div className="flex flex-col sm:flex-row gap-2">

          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#444] pointer-events-none" />
            <input
              type="text"
              placeholder={t('mainDashboard.searchPlaceholder')}
              value={searchTerm}
              onChange={onSearchChange}
              className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm text-xs font-mono text-[#e8e8e8] placeholder-[#333] focus:border-[#555] focus:outline-none pl-8 pr-3 py-1.5 w-full"
            />
          </div>

          {/* Namespace filter */}
          {namespaces.length > 1 && (
            <div className="sm:w-40 relative">
              <RectangleStackIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#444] pointer-events-none" />
              <select
                value={namespaceFilter}
                onChange={onNamespaceFilterChange}
                className="w-full pl-8 pr-6 py-1.5 bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm text-xs font-mono text-[#888] focus:border-[#555] focus:outline-none cursor-pointer"
              >
                <option value="all">{t('mainDashboard.allNamespaces')}</option>
                {namespaces.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter */}
          <div className="sm:w-40 relative">
            <FunnelIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#444] pointer-events-none" />
            <select
              value={statusFilter}
              onChange={onStatusFilterChange}
              className="w-full pl-8 pr-6 py-1.5 bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm text-xs font-mono text-[#888] focus:border-[#555] focus:outline-none cursor-pointer"
            >
              <option value="all">{t('mainDashboard.allProcesses')}</option>
              <option value="online">{t('mainDashboard.onlineOnly')}</option>
              <option value="stopped">{t('mainDashboard.stoppedOnly')}</option>
              <option value="errored">{t('mainDashboard.erroredOnly')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Full-width process list ── */}
      <ProcessList processes={processes} onAction={onProcessAction} />

    </div>
  );
};

export default MainDashboard;

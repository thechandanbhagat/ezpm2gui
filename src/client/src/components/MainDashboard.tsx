import React from 'react';
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

// @group Types : Process stat card props
interface ProcessStatCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: number;
  total?: number;
}

// @group Render : Compact process stat card
const ProcessStatCard: React.FC<ProcessStatCardProps> = ({ icon: Icon, iconColor, iconBg, label, value, total }) => (
  <div className="flex items-center gap-2.5 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 min-w-0">
    <div className={`shrink-0 w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
      <p className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
        {value}
        {total !== undefined && (
          <span className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500 ml-1">/ {total}</span>
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
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Process Dashboard</h1>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Monitor and manage your PM2 processes in real-time
          </p>
        </div>
      </div>

      {/* ── Analytics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">

        {/* Process stat cards */}
        <ProcessStatCard
          icon={CheckCircleIcon}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
          label="Online"
          value={online}
          total={processes.length}
        />
        <ProcessStatCard
          icon={XCircleIcon}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
          label="Stopped"
          value={stopped}
        />
        <ProcessStatCard
          icon={ExclamationCircleIcon}
          iconColor="text-yellow-500"
          iconBg="bg-yellow-500/10"
          label="Errored"
          value={errored}
        />
        <ProcessStatCard
          icon={Squares2X2Icon}
          iconColor="text-primary-500"
          iconBg="bg-primary-500/10"
          label="Total"
          value={processes.length}
        />

        {/* System metric cards */}
        <SystemMetrics metrics={metrics} />
      </div>

      {/* ── Search + filter bar ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-2.5">
        <div className="flex flex-col sm:flex-row gap-2">

          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search processes by name or ID..."
              value={searchTerm}
              onChange={onSearchChange}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs
                         bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
                         placeholder-neutral-400 dark:placeholder-neutral-500
                         focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                         transition-colors"
            />
          </div>

          {/* Namespace filter */}
          {namespaces.length > 1 && (
            <div className="sm:w-40 relative">
              <RectangleStackIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
              <select
                value={namespaceFilter}
                onChange={onNamespaceFilterChange}
                className="w-full pl-8 pr-6 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs
                           bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
                           focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                           cursor-pointer transition-colors"
              >
                <option value="all">All Namespaces</option>
                {namespaces.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter */}
          <div className="sm:w-40 relative">
            <FunnelIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={onStatusFilterChange}
              className="w-full pl-8 pr-6 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs
                         bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                         cursor-pointer transition-colors"
            >
              <option value="all">All Processes</option>
              <option value="online">Online Only</option>
              <option value="stopped">Stopped Only</option>
              <option value="errored">Errored Only</option>
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

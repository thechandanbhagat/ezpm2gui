import React from 'react';
import { PM2Process, SystemMetricsData } from '../types/pm2';
import SystemMetrics from './SystemMetrics';
import ProcessList from './ProcessList';
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface MainDashboardProps {
  processes: PM2Process[];
  metrics: SystemMetricsData;
  searchTerm: string;
  statusFilter: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStatusFilterChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onProcessAction: (id: number, action: string) => void;
}

// @group MainDashboard : Process dashboard page with metrics and process list
const MainDashboard: React.FC<MainDashboardProps> = ({
  processes,
  metrics,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onProcessAction
}) => {
  const onlineCount = processes.filter(p => p.pm2_env?.status === 'online').length;

  return (
    <div className="space-y-4">

      {/* Dashboard Header */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Process Dashboard
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-0.5 text-xs">
              Monitor and manage your PM2 processes in real-time
            </p>
          </div>
          <div className="mt-2 sm:mt-0">
            <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/25 text-primary-800 dark:text-primary-400">
              {onlineCount} active / {processes.length} total
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <input
                type="text"
                placeholder="Search processes by name or ID..."
                value={searchTerm}
                onChange={onSearchChange}
                className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs
                           bg-white dark:bg-neutral-800
                           text-neutral-900 dark:text-neutral-100
                           placeholder-neutral-400 dark:placeholder-neutral-500
                           focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                           transition-colors duration-150"
              />
            </div>
          </div>

          <div className="sm:w-40">
            <div className="relative">
              <FunnelIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={onStatusFilterChange}
                className="w-full pl-8 pr-6 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs
                           bg-white dark:bg-neutral-800
                           text-neutral-900 dark:text-neutral-100
                           focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                           cursor-pointer transition-colors duration-150"
              >
                <option value="all">All Processes</option>
                <option value="online">Online Only</option>
                <option value="stopped">Stopped Only</option>
                <option value="errored">Errored Only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Metrics */}
        <div className="lg:col-span-1">
          <SystemMetrics metrics={metrics} />
        </div>

        {/* Process List */}
        <div className="lg:col-span-2">
          <ProcessList
            processes={processes}
            onAction={onProcessAction}
          />
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;

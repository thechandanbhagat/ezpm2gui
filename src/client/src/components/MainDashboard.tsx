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

const MainDashboard: React.FC<MainDashboardProps> = ({
  processes,
  metrics,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onProcessAction
}) => {
  return (
    <div className="space-y-4">
      {/* Dashboard Header - Compact */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Process Dashboard
            </h1>
            <p className="text-gray-600 mt-0.5 text-xs">
              Monitor and manage your PM2 processes in real-time
            </p>
          </div>
          <div className="mt-2 sm:mt-0">
            <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {processes.filter(p => p.pm2_env?.status === 'online').length} active / {processes.length} total
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar - Compact */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search processes by name or ID..."
                value={searchTerm}
                onChange={onSearchChange}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="sm:w-40">
            <div className="relative">
              <FunnelIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={onStatusFilterChange}
                className="w-full pl-8 pr-6 py-1.5 border border-gray-300 rounded-md text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent cursor-pointer"
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

      {/* Main Content Grid - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Metrics - Compact */}
        <div className="lg:col-span-1">
          <SystemMetrics metrics={metrics} />
        </div>
        
        {/* Process List - Compact */}
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
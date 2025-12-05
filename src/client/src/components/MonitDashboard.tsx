import React, { useState } from 'react';
import { useTheme } from '@mui/material';
import { PM2Process } from '../types/pm2';
import { useNavigate } from 'react-router-dom';

/**
 * Namespace: /monit
 * Route: /monit
 * Description: Real-time process monitoring dashboard with CPU, memory metrics and process management
 */

interface MonitDashboardProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

const MonitDashboard: React.FC<MonitDashboardProps> = ({ processes, onRefresh }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<'cpu' | 'memory'>('cpu');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const isDark = theme.palette.mode === 'dark';

  // Helper functions for formatting
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (uptime: number): string => {
    const seconds = Math.floor((Date.now() - uptime) / 1000);
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  // Sort processes
  const sortedProcesses = [...processes].sort((a, b) => {
    let valueA, valueB;
    
    if (sortField === 'cpu') {
      valueA = a.monit.cpu;
      valueB = b.monit.cpu;
    } else {
      valueA = a.monit.memory;
      valueB = b.monit.memory;
    }

    return sortDirection === 'asc' 
      ? valueA - valueB 
      : valueB - valueA;
  });

  const handleSort = (field: 'cpu' | 'memory') => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const handleRowClick = (pmId: number) => {
    navigate(`/process/${pmId}`);
  };

  const getProgressBarColor = (value: number) => {
    if (value < 60) return isDark ? 'bg-emerald-500' : 'bg-emerald-600';
    if (value < 80) return isDark ? 'bg-amber-500' : 'bg-amber-600';
    return isDark ? 'bg-rose-500' : 'bg-rose-600';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Process Monitor
          </h2>
          <button
            onClick={onRefresh}
            className={`p-2 rounded-lg transition-colors ${
              isDark 
                ? 'hover:bg-gray-700 text-gray-300 hover:text-gray-100' 
                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
            title="Refresh Data"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Total Processes */}
        <div className={`rounded-lg ${isDark ? 'bg-gradient-to-br from-blue-900 to-blue-800' : 'bg-gradient-to-br from-blue-500 to-blue-600'} shadow-sm p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-100 uppercase tracking-wide">Processes</span>
            <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{processes.length}</div>
          <div className="flex items-center gap-3 text-xs text-blue-100">
            <span>{processes.filter(p => p.pm2_env.status === 'online').length} online</span>
            <span>•</span>
            <span>{processes.filter(p => p.pm2_env.status !== 'online').length} stopped</span>
          </div>
        </div>

        {/* CPU Usage */}
        <div className={`rounded-lg ${isDark ? 'bg-gradient-to-br from-purple-900 to-purple-800' : 'bg-gradient-to-br from-purple-500 to-purple-600'} shadow-sm p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-100 uppercase tracking-wide">CPU Peak</span>
            <svg className="w-5 h-5 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {sortedProcesses.length > 0 
              ? `${Math.max(...sortedProcesses.map(p => p.monit.cpu)).toFixed(1)}%` 
              : '0%'
            }
          </div>
          <div className="text-xs text-purple-100">Highest process usage</div>
        </div>

        {/* Memory Usage */}
        <div className={`rounded-lg ${isDark ? 'bg-gradient-to-br from-cyan-900 to-cyan-800' : 'bg-gradient-to-br from-cyan-500 to-cyan-600'} shadow-sm p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-cyan-100 uppercase tracking-wide">Memory Peak</span>
            <svg className="w-5 h-5 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {sortedProcesses.length > 0 
              ? formatMemory(Math.max(...sortedProcesses.map(p => p.monit.memory))) 
              : '0 MB'
            }
          </div>
          <div className="text-xs text-cyan-100">Highest process usage</div>
        </div>
      </div>

      {/* Process Table */}
      <div className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <tr>
                <th className={`px-4 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                  App Name
                </th>
                <th className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                  ID
                </th>
                <th className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                  Status
                </th>
                <th 
                  className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider cursor-pointer hover:${isDark ? 'text-gray-100' : 'text-gray-900'} transition-colors`}
                  onClick={() => handleSort('cpu')}
                >
                  CPU {sortField === 'cpu' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider cursor-pointer hover:${isDark ? 'text-gray-100' : 'text-gray-900'} transition-colors`}
                  onClick={() => handleSort('memory')}
                >
                  Memory {sortField === 'memory' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                  Uptime
                </th>
                <th className={`px-3 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                  Restarts
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {sortedProcesses.map((process) => (
                <tr 
                  key={process.pm_id}
                  onClick={() => handleRowClick(process.pm_id)}
                  className={`cursor-pointer transition-colors ${
                    isDark 
                      ? 'hover:bg-gray-750 hover:bg-opacity-50' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className={`px-4 py-2.5 text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    {process.name}
                  </td>
                  <td className={`px-3 py-2.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {process.pm_id}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      process.pm2_env.status === 'online' 
                        ? isDark ? 'bg-emerald-900 text-emerald-200' : 'bg-emerald-100 text-emerald-800'
                        : process.pm2_env.status === 'stopped'
                        ? isDark ? 'bg-rose-900 text-rose-200' : 'bg-rose-100 text-rose-800'
                        : isDark ? 'bg-amber-900 text-amber-200' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {process.pm2_env.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[100px]">
                        <div className={`h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                          <div 
                            className={`h-full ${getProgressBarColor(process.monit.cpu)} transition-all duration-300`}
                            style={{ width: `${Math.min(process.monit.cpu, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} min-w-[40px]`}>
                        {process.monit.cpu.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[100px]">
                        <div className={`h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                          <div 
                            className={`h-full ${isDark ? 'bg-cyan-500' : 'bg-cyan-600'} transition-all duration-300`}
                            style={{ 
                              width: `${sortedProcesses.length > 0 
                                ? (process.monit.memory / Math.max(...sortedProcesses.map(p => p.monit.memory))) * 100
                                : 0
                              }%` 
                            }}
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} min-w-[60px]`}>
                        {formatMemory(process.monit.memory)}
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {process.pm2_env.status === 'online' 
                      ? formatUptime(process.pm2_env.pm_uptime) 
                      : '-'
                    }
                  </td>
                  <td className={`px-3 py-2.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {process.pm2_env.restart_time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MonitDashboard;

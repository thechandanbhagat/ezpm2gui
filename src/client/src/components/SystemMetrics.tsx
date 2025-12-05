import React from 'react';
import { SystemMetricsData } from '../types/pm2';

interface SystemMetricsProps {
  metrics: SystemMetricsData;
}

const SystemMetrics: React.FC<SystemMetricsProps> = ({ metrics }) => {
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result;
  };

  const memoryUsagePercent = Math.round((metrics.memory.used / metrics.memory.total) * 100);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-3 py-2 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">System Metrics</h2>
      </div>
      
      <div className="p-3 space-y-2">
        {/* System Uptime */}
        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700">Uptime</p>
            <p className="text-sm font-bold text-gray-900">{formatUptime(metrics.uptime)}</p>
          </div>
        </div>

        {/* Load Average */}
        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700">Load Avg</p>
            <p className="text-sm font-bold text-gray-900">{metrics.loadAvg[0].toFixed(2)}</p>
            <p className="text-xs text-gray-500">{metrics.loadAvg[1].toFixed(2)} • {metrics.loadAvg[2].toFixed(2)}</p>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="p-2 bg-gray-50 rounded-md">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-700">Memory</p>
            <p className="text-xs text-gray-500">{memoryUsagePercent}%</p>
          </div>
          <p className="text-sm font-bold text-gray-900 mb-1">
            {formatMemory(metrics.memory.used)}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${memoryUsagePercent > 80 ? 'bg-red-500' : memoryUsagePercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${memoryUsagePercent}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">of {formatMemory(metrics.memory.total)}</p>
        </div>

        {/* CPU Cores */}
        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700">CPU Cores</p>
            <p className="text-sm font-bold text-gray-900">{metrics.cpus}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemMetrics;
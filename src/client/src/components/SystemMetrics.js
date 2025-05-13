import React from 'react';

const SystemMetrics = ({ metrics }) => {
  // Helper function to format memory usage
  const formatMemory = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to format uptime
  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result;
  };

  // Calculate memory usage percentage
  const memoryUsagePercent = Math.round((metrics.memory.used / metrics.memory.total) * 100);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">System Metrics</h2>
      </div>
      
      <div className="system-metrics">
        <div className="metric-card">
          <div className="metric-label">CPU Cores</div>
          <div className="metric-value">{metrics.cpus}</div>
        </div>
        
        <div className="metric-card">
          <div className="metric-label">Load Average (1m)</div>
          <div className="metric-value">{metrics.loadAvg[0].toFixed(2)}</div>
        </div>
        
        <div className="metric-card">
          <div className="metric-label">Memory Usage</div>
          <div className="metric-value">{memoryUsagePercent}%</div>
          <div className="memory-details">
            {formatMemory(metrics.memory.used)} / {formatMemory(metrics.memory.total)}
          </div>
          <div className="memory-bar">
            <div 
              className="memory-used" 
              style={{ width: `${memoryUsagePercent}%` }}
            ></div>
          </div>
        </div>
        
        <div className="metric-card">
          <div className="metric-label">System Uptime</div>
          <div className="metric-value">{formatUptime(metrics.uptime)}</div>
        </div>
      </div>
    </div>
  );
};

export default SystemMetrics;

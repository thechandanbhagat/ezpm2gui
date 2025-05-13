import React, { useState } from 'react';
import ProcessLogs from './ProcessLogs';
import MetricsChart from './MetricsChart';

const ProcessDetail = ({ process, onClose }) => {
  const [activeTab, setActiveTab] = useState('info');

  if (!process) return null;

  // Helper function to format dates
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Helper function to format memory usage
  const formatMemory = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="process-detail-overlay">
      <div className="process-detail-container">
        <div className="process-detail-header">
          <h2>{process.name} (ID: {process.pm_id})</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="process-detail-tabs">
          <button 
            className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Information
          </button>
          <button 
            className={`tab-btn ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            Metrics
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Logs
          </button>
          <button 
            className={`tab-btn ${activeTab === 'env' ? 'active' : ''}`}
            onClick={() => setActiveTab('env')}
          >
            Environment
          </button>
        </div>

        <div className="process-detail-content">
          {activeTab === 'info' && (
            <div className="process-info">
              <div className="info-grid">
                <div className="info-item">
                  <div className="info-label">Status</div>
                  <div className={`info-value status-${process.pm2_env.status}`}>
                    {process.pm2_env.status}
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-label">Restarts</div>
                  <div className="info-value">{process.pm2_env.restart_time}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">Uptime</div>
                  <div className="info-value">
                    {process.pm2_env.status === 'online' 
                      ? formatDate(process.pm2_env.pm_uptime) 
                      : 'Not running'}
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-label">Created</div>
                  <div className="info-value">{formatDate(process.pm2_env.created_at)}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">Script</div>
                  <div className="info-value code">{process.pm2_env.pm_exec_path}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">Working Directory</div>
                  <div className="info-value code">{process.pm2_env.pm_cwd}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">Interpreter</div>
                  <div className="info-value">{process.pm2_env.exec_interpreter}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">Watching</div>
                  <div className="info-value">{process.pm2_env.watch ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="process-metrics">
              <div className="current-metrics">
                <div className="metric-item">
                  <div className="metric-label">CPU Usage</div>
                  <div className="metric-value">{process.monit ? `${process.monit.cpu}%` : 'N/A'}</div>
                </div>
                <div className="metric-item">
                  <div className="metric-label">Memory Usage</div>
                  <div className="metric-value">
                    {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
                  </div>
                </div>
              </div>
              <MetricsChart processId={process.pm_id} initialData={process} />
            </div>
          )}

          {activeTab === 'logs' && (
            <ProcessLogs processId={process.pm_id} processName={process.name} />
          )}

          {activeTab === 'env' && (
            <div className="process-env">
              <h3>Environment Variables</h3>
              {process.pm2_env.env ? (
                <div className="env-list">
                  {Object.entries(process.pm2_env.env)
                    .filter(([key]) => !key.startsWith('_') && key !== 'PATH')
                    .map(([key, value]) => (
                      <div key={key} className="env-item">
                        <div className="env-key">{key}</div>
                        <div className="env-value">{String(value)}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="no-env">No environment variables found.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcessDetail;

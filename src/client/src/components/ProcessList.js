import React, { useState } from 'react';
import ProcessDetail from './ProcessDetail';

const ProcessList = ({ processes, onAction }) => {
  const [selectedProcess, setSelectedProcess] = useState(null);

  // Helper function to format memory usage
  const formatMemory = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to determine status class
  const getStatusClass = (status) => {
    if (status === 'online') return 'status-online';
    if (status === 'stopped') return 'status-stopped';
    return 'status-errored';
  };
  
  const showProcessDetail = (process) => {
    setSelectedProcess(process);
  };

  const closeProcessDetail = () => {
    setSelectedProcess(null);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">PM2 Processes</h2>
      </div>
      
      {processes.length === 0 ? (
        <div className="no-processes">
          <p>No PM2 processes found.</p>
          <p>Make sure PM2 is running and has active processes.</p>
        </div>
      ) : (
        <div className="process-list">
          <div className="process-item header" style={{ fontWeight: 'bold' }}>
            <div>Name</div>
            <div>ID</div>
            <div>Status</div>
            <div>CPU</div>
            <div>Memory</div>
            <div>Actions</div>
          </div>
            {processes.map((process) => (
            <div key={process.pm_id} className="process-item">
              <div className="process-name">{process.name}</div>
              <div>{process.pm_id}</div>
              <div className={`process-status ${getStatusClass(process.pm2_env.status)}`}>
                {process.pm2_env.status}
              </div>
              <div className="process-cpu">{process.monit ? `${process.monit.cpu}%` : 'N/A'}</div>
              <div className="process-memory">
                {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
              </div>
              <div className="process-actions">
                <button
                  className="btn btn-info"
                  onClick={() => showProcessDetail(process)}
                >
                  Details
                </button>
                {process.pm2_env.status === 'online' && (
                  <>
                    <button
                      className="btn btn-warning"
                      onClick={() => onAction(process.pm_id, 'restart')}
                    >
                      Restart
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => onAction(process.pm_id, 'stop')}
                    >
                      Stop
                    </button>
                  </>
                )}
                {process.pm2_env.status !== 'online' && (
                  <button
                    className="btn btn-success"
                    onClick={() => onAction(process.pm_id, 'start')}
                  >
                    Start
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  onClick={() => onAction(process.pm_id, 'delete')}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>      )}
      {selectedProcess && (
        <ProcessDetail 
          process={selectedProcess} 
          onClose={closeProcessDetail} 
        />
      )}
    </div>
  );
};

export default ProcessList;

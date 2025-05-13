import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ProcessLogs = ({ processId, processName }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logType, setLogType] = useState('out'); // 'out' or 'err'

  useEffect(() => {
    let intervalId;

    const fetchLogs = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/logs/${processId}/${logType}`);
        setLogs(response.data.logs);
        setError('');
      } catch (err) {
        console.error('Error fetching logs:', err);
        setError(`Failed to fetch logs: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchLogs();

    // Set up interval for auto-refresh
    if (autoRefresh) {
      intervalId = setInterval(fetchLogs, 5000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [processId, autoRefresh, logType]);

  const handleLogTypeChange = (newType) => {
    setLogType(newType);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className="logs-container">
      <div className="logs-header">
        <h3>Process Logs: {processName}</h3>
        <div className="logs-controls">
          <div className="log-type-selector">
            <button 
              className={`log-type-btn ${logType === 'out' ? 'active' : ''}`}
              onClick={() => handleLogTypeChange('out')}
            >
              Standard Output
            </button>
            <button 
              className={`log-type-btn ${logType === 'err' ? 'active' : ''}`}
              onClick={() => handleLogTypeChange('err')}
            >
              Error Output
            </button>
          </div>
          <button 
            className={`auto-refresh-btn ${autoRefresh ? 'active' : ''}`}
            onClick={toggleAutoRefresh}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
        </div>
      </div>

      {error && <div className="logs-error">{error}</div>}
      
      {loading ? (
        <div className="logs-loading">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="logs-empty">No logs available for this process.</div>
      ) : (
        <div className="logs-content">
          <pre>{logs.join('\n')}</pre>
        </div>
      )}
    </div>
  );
};

export default ProcessLogs;

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import ProcessList from './components/ProcessList';
import SystemMetrics from './components/SystemMetrics';
import './App.css';

const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');

function App() {
  const [processes, setProcesses] = useState([]);
  const [filteredProcesses, setFilteredProcesses] = useState([]);
  const [metrics, setMetrics] = useState({
    loadAvg: [0, 0, 0],
    memory: { total: 0, free: 0, used: 0 },
    uptime: 0,
    cpus: 0
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    // Initial data fetch
    const fetchInitialData = async () => {
      try {
        const [processesRes, metricsRes] = await Promise.all([
          axios.get('/api/processes'),
          axios.get('/api/metrics')
        ]);
        
        setProcesses(processesRes.data);
        setMetrics(metricsRes.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to connect to the server. Is PM2 running?');
        setLoading(false);
      }
    };

    fetchInitialData();

    // Set up socket listeners for real-time updates
    socket.on('processes', (data) => {
      setProcesses(data);
    });

    socket.on('metrics', (data) => {
      setMetrics(data);
    });

    socket.on('connect_error', () => {
      setError('Connection to server lost. Trying to reconnect...');
    });

    socket.on('connect', () => {
      setError('');
    });

    return () => {
      socket.off('processes');
      socket.off('metrics');
      socket.off('connect_error');
      socket.off('connect');
    };
  }, []);

  // Filter processes when search term, status filter, or processes change
  useEffect(() => {
    let result = [...processes];
    
    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(process => process.pm2_env.status === statusFilter);
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(process => 
        process.name.toLowerCase().includes(searchLower) ||
        String(process.pm_id).includes(searchLower)
      );
    }
    
    setFilteredProcesses(result);
  }, [processes, searchTerm, statusFilter]);

  // Process control functions
  const handleProcessAction = async (id, action) => {
    try {
      await axios.post(`/api/process/${id}/${action}`);
      // The socket will update the process list
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(`Failed to ${action} process. ${err.message}`);
    }
  };

  const toggleAbout = () => {
    setShowAbout(!showAbout);
  };

  if (loading) {
    return <div className="loading">Loading PM2 data...</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div>
            <h1>ezPM2GUI</h1>
            <p>A modern PM2 process manager interface</p>
          </div>
          <button className="about-button" onClick={toggleAbout}>
            {showAbout ? 'Hide About' : 'About'}
          </button>
        </div>
      </header>

      {showAbout && (
        <div className="about-section">
          <h2>About ezPM2GUI</h2>
          <p>ezPM2GUI is a modern web-based interface for the PM2 process manager.</p>
          <h3>Features:</h3>
          <ul>
            <li>Real-time monitoring of PM2 processes</li>
            <li>System resource usage metrics</li>
            <li>Process management (start, stop, restart, delete)</li>
            <li>Process logs and detailed metrics</li>
          </ul>
          <p>Version: 1.0.0</p>
          <p><a href="https://github.com/yourusername/ezpm2gui" target="_blank" rel="noopener noreferrer">GitHub Repository</a></p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search processes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="status-filter">
          <label>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="online">Online</option>
            <option value="stopped">Stopped</option>
            <option value="errored">Errored</option>
          </select>
        </div>
      </div>

      <div className="dashboard">
        <div className="metrics-panel">
          <SystemMetrics metrics={metrics} />
        </div>
        <div className="processes-panel">
          <ProcessList 
            processes={filteredProcesses} 
            onAction={handleProcessAction} 
          />        </div>
      </div>
    </div>
  );
}

export default App;

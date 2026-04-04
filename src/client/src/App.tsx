import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import ProcessDetailPage from './components/ProcessDetailPage';
import MainDashboard from './components/MainDashboard';
import ConfirmationDialog from './components/ConfirmationDialog';
import MonitDashboard from './components/MonitDashboard';
import DeployApplication from './components/DeployApplication';
import ModuleManagement from './components/ModuleManagement';
import EcosystemGenerator from './components/EcosystemGenerator';
import ProcessConfiguration from './components/ProcessConfiguration';
import ClusterManagement from './components/ClusterManagement';
import LogStreamEnhanced from './components/LogStreamEnhanced';
import AdvancedMonitoringDashboard from './components/AdvancedMonitoringDashboard';
import SidebarMenu from './components/SidebarMenu';
import Settings from './components/Settings';
import LoadBalancingGuide from './components/LoadBalancingGuide';
import RemoteConnections from './components/RemoteConnections';
import CronJobsPage from './components/CronJobsPage';
import { PM2Process, SystemMetricsData, ConfirmationDialogData } from './types/pm2';
import {
  MoonIcon,
  SunIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';

// Initialize socket connection with improved settings
const API_URL = typeof window !== 'undefined' && (window as any).REACT_APP_API_URL 
  ? (window as any).REACT_APP_API_URL 
  : 'http://localhost:3001';

const socket = io(API_URL, {
  // Reconnection settings
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  // Connection timeout settings
  timeout: 10000,
  // Transport configuration
  transports: ['websocket', 'polling'],
  // Upgrade timeout
  upgrade: true,
  // Force new connection
  forceNew: false
});

const App: React.FC = () => {
  // State for process data
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [filteredProcesses, setFilteredProcesses] = useState<PM2Process[]>([]);
  
  // State for metrics data
  const [metrics, setMetrics] = useState<SystemMetricsData>({
    loadAvg: [0, 0, 0],
    memory: { total: 0, free: 0, used: 0 },
    uptime: 0,
    cpus: 0
  });
  
  // UI state
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  
  // Theme state — default dark, respect system preference
  const [darkMode, setDarkMode] = useState<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  
  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogData>({
    isOpen: false,
    title: '',
    message: '',
    action: '',
    processId: null
  });
  useEffect(() => {
    // Track last data update timestamp to detect if data is actually flowing
    let lastDataUpdate = Date.now();
    let connectionErrorTimeout: ReturnType<typeof setTimeout> | null = null;
    let socketConnected = socket.connected;
    let hasReconnectError = false; // Track if current error is a reconnect error

    // Initial data fetch
    const fetchInitialData = async (): Promise<void> => {
      try {
        const [processesRes, metricsRes] = await Promise.all([
          axios.get<PM2Process[]>('/api/processes'),
          axios.get<SystemMetricsData>('/api/metrics')
        ]);
        
        setProcesses(processesRes.data);
        setMetrics(metricsRes.data);
        setLoading(false);
        lastDataUpdate = Date.now();
      } catch (err: any) {
        console.error('Error fetching initial data:', err);
        
        // Check if it's a PM2 not installed error
        if (err.response?.data?.pmNotInstalled) {
          setError(err.response.data.error || 'PM2 is not installed. Please install PM2 globally: npm install -g pm2');
        } else {
          setError('Failed to connect to the server. Is PM2 running?');
        }
        
        setLoading(false);
      }
    };

    fetchInitialData();

    // Set up socket listeners for real-time updates
    socket.on('processes', (data: PM2Process[]) => {
      setProcesses(data);
      lastDataUpdate = Date.now();
      
      // Clear any error if we're receiving data
      if (hasReconnectError) {
        setError('');
        hasReconnectError = false;
      }
    });

    socket.on('metrics', (data: SystemMetricsData) => {
      setMetrics(data);
      lastDataUpdate = Date.now();
      
      // Clear any error if we're receiving data
      if (hasReconnectError) {
        setError('');
        hasReconnectError = false;
      }
    });

    // Handle connection errors with debouncing
    socket.on('connect_error', () => {
      console.warn('Socket connect_error event detected');
      
      // Only show error if we haven't received data recently (within last 5 seconds)
      // This prevents false positives during transient network issues
      const timeSinceLastUpdate = Date.now() - lastDataUpdate;
      
      if (timeSinceLastUpdate > 5000) {
        // Debounce: wait 3 seconds before showing error
        if (connectionErrorTimeout) {
          clearTimeout(connectionErrorTimeout);
        }
        
        connectionErrorTimeout = setTimeout(() => {
          // Double-check if we're still not receiving data
          if (Date.now() - lastDataUpdate > 5000 && !socketConnected) {
            setError('Connection to server lost. Trying to reconnect...');
            hasReconnectError = true;
          }
        }, 3000);
      }
    });

    // Handle successful connection
    socket.on('connect', () => {
      console.log('Socket connected successfully');
      socketConnected = true;
      lastDataUpdate = Date.now();
      
      // Clear any pending error timeout
      if (connectionErrorTimeout) {
        clearTimeout(connectionErrorTimeout);
        connectionErrorTimeout = null;
      }
      
      // Clear error message
      if (hasReconnectError) {
        setError('');
        hasReconnectError = false;
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      socketConnected = false;
      
      // Only show error for unexpected disconnections, not for client-initiated ones
      if (reason === 'io server disconnect' || reason === 'transport close') {
        // The server disconnected us or transport failed
        // Wait before showing error to allow auto-reconnect
        if (connectionErrorTimeout) {
          clearTimeout(connectionErrorTimeout);
        }
        
        connectionErrorTimeout = setTimeout(() => {
          if (!socketConnected && Date.now() - lastDataUpdate > 5000) {
            setError('Connection to server lost. Trying to reconnect...');
            hasReconnectError = true;
          }
        }, 5000);
      }
    });

    return () => {
      // Cleanup
      if (connectionErrorTimeout) {
        clearTimeout(connectionErrorTimeout);
      }
      
      socket.off('processes');
      socket.off('metrics');
      socket.off('connect_error');
      socket.off('connect');
      socket.off('disconnect');
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

  // Effect to handle dark mode class on document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Process control functions
  const handleProcessAction = (id: number, action: string): void => {
    // For destructive actions, show confirmation dialog
    if (['stop', 'delete', 'restart'].includes(action)) {
      const processName = processes.find(p => p.pm_id === id)?.name || `Process ${id}`;
      let title: string, message: string;
      
      switch (action) {
        case 'stop':
          title = 'Stop Process?';
          message = `Are you sure you want to stop ${processName}?`;
          break;
        case 'delete':
          title = 'Delete Process?';
          message = `Are you sure you want to delete ${processName} from PM2?`;
          break;
        case 'restart':
          title = 'Restart Process?';
          message = `Are you sure you want to restart ${processName}?`;
          break;
        default:
          title = 'Confirm Action';
          message = `Are you sure you want to ${action} ${processName}?`;
          break;
      }
      
      setConfirmationDialog({
        isOpen: true,
        title,
        message,
        action,
        processId: id
      });
    } else {
      // For non-destructive actions, proceed immediately
      executeAction(id, action);
    }
  };
  
  // Execute the actual API call
  const executeAction = async (id: number, action: string): Promise<void> => {
    try {
      await axios.post(`/api/process/${id}/${action}`);
      // The socket will update the process list
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(`Failed to ${action} process. ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  const toggleAbout = (): void => {
    setShowAbout(!showAbout);
  };
  
  const toggleDarkMode = (): void => {
    setDarkMode(!darkMode);
  };
  
  const toggleMenu = (): void => {
    setMenuOpen(!menuOpen);
  };
  
  const handleConfirmAction = (): void => {
    if (confirmationDialog.processId !== null) {
      executeAction(confirmationDialog.processId, confirmationDialog.action);
    }
    setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
  };
  
  const handleCancelAction = (): void => {
    setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
  };
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(e.target.value);
  };
  
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setStatusFilter(e.target.value);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-neutral-950' : 'bg-neutral-100'}`}>
        <div className="flex items-center gap-2.5">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent"></div>
          <span className={`text-sm font-medium ${darkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
            Loading PM2 data…
          </span>
        </div>
      </div>
    );
  }

  // @group Theme : MUI theme wired to darkMode state — normalises typography and component sizes globally
  const muiTheme = createTheme({
    palette: { mode: darkMode ? 'dark' : 'light' },
    typography: {
      fontFamily: 'inherit',          // use the Tailwind / CSS font stack
      h4: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.3 },  // 17px — page titles
      h5: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 },  // 15px — section headers
      h6: { fontSize: '0.875rem',  fontWeight: 600, lineHeight: 1.3 },  // 14px — subsections
      subtitle1: { fontSize: '0.8125rem', lineHeight: 1.4 },            // 13px
      subtitle2: { fontSize: '0.75rem',   fontWeight: 600, lineHeight: 1.4 }, // 12px
      body1:     { fontSize: '0.875rem',  lineHeight: 1.5 },            // 14px
      body2:     { fontSize: '0.8125rem', lineHeight: 1.5 },            // 13px
      caption:   { fontSize: '0.75rem',   lineHeight: 1.4 },            // 12px
      overline:  { fontSize: '0.6875rem', lineHeight: 1.4 },            // 11px
    },
    shape: { borderRadius: 6 },
    components: {
      // Buttons — small by default, no shadow
      MuiButton: {
        defaultProps: { size: 'small', disableElevation: true },
        styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } },
      },
      MuiIconButton: { defaultProps: { size: 'small' } },
      // Form controls — small by default
      MuiTextField:   { defaultProps: { size: 'small' } },
      MuiSelect:      { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      MuiInputLabel:  { defaultProps: { size: 'small' } },
      // Chips — small by default
      MuiChip: { defaultProps: { size: 'small' } },
      // Cards — consistent border radius, outlined by default
      MuiCard:  { defaultProps: { variant: 'outlined' } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      // Table — dense
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600, fontSize: '0.75rem' },
          body: { fontSize: '0.8125rem' },
        },
      },
      // Tabs — compact
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', minHeight: 36, fontSize: '0.8125rem', fontWeight: 500 },
        },
      },
      MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
      // Accordion — compact
      MuiAccordionSummary: {
        styleOverrides: { root: { minHeight: 40, '&.Mui-expanded': { minHeight: 40 } } },
      },
      // Alerts — compact padding
      MuiAlert: { styleOverrides: { root: { fontSize: '0.8125rem', padding: '6px 12px' } } },
      // Dialogs — consistent radius
      MuiDialog: { styleOverrides: { paper: { borderRadius: 8 } } },
    },
  });

  return (
    <ThemeProvider theme={muiTheme}>
    <Router>
      <div className={`min-h-screen ${darkMode ? 'bg-neutral-950' : 'bg-neutral-100'}`}>
        <div className="flex">

          {/* ── Top Navigation Bar (36px) ── */}
          <nav className={`fixed w-full z-50 h-9 flex items-center border-b ${
            darkMode
              ? 'bg-neutral-900 border-neutral-800'
              : 'bg-white border-neutral-200'
          }`}>
            <div className="flex items-center justify-between w-full px-3">
              {/* Mobile hamburger */}
              <button
                onClick={toggleMenu}
                className={`sm:hidden p-1 rounded ${darkMode ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                <Bars3Icon className="h-4 w-4" />
              </button>

              {/* Logo */}
              <Link
                to="/"
                className="text-sm font-bold tracking-tight no-underline flex-grow sm:flex-grow-0"
              >
                <span className="text-gradient">EZ PM2 GUI</span>
              </Link>

              {/* Dark-mode toggle */}
              <button
                onClick={toggleDarkMode}
                className={`p-1 rounded transition-colors ${
                  darkMode
                    ? 'text-neutral-400 hover:text-yellow-400'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
              </button>
            </div>
          </nav>

          {/* ── Mobile Sidebar ── */}
          {menuOpen && (
            <div className="fixed inset-0 z-40 sm:hidden">
              <div className="fixed inset-0 bg-black/50" onClick={toggleMenu} />
              <div className={`fixed left-0 top-0 h-full w-[200px] border-r shadow-xl ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
              }`}>
                <div className="pt-9 h-full overflow-y-auto">
                  <SidebarMenu toggleAbout={toggleAbout} onItemClick={toggleMenu} />
                </div>
              </div>
            </div>
          )}

          {/* ── Desktop Sidebar (200px) ── */}
          <div className={`hidden sm:flex flex-col fixed left-0 top-9 h-[calc(100vh-2.25rem)] w-[200px] border-r overflow-y-auto ${
            darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
          }`}>
            <SidebarMenu toggleAbout={toggleAbout} />
          </div>

          {/* ── Main Content ── */}
          <main className={`flex-1 sm:ml-[200px] pt-9 min-h-screen ${
            darkMode ? 'bg-neutral-950' : 'bg-neutral-100'
          }`}>
            <div className="px-3 py-3 pb-10">

              {/* About panel */}
              {showAbout && (
                <div className={`card mb-3 p-4 animate-fade-in`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-xs">EZ</span>
                    </div>
                    <div>
                      <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-neutral-900'}`}>
                        About EZ PM2 GUI
                      </h2>
                      <p className="text-xs text-neutral-500">v1.0.0 · Chandan Bhagat</p>
                    </div>
                  </div>
                  <ul className={`text-xs space-y-0.5 list-disc pl-4 mb-3 ${darkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    <li>Monitor and manage PM2 processes in real-time</li>
                    <li>Deploy new apps, configure ecosystems, manage clusters</li>
                    <li>Remote server SSH connections with live logs</li>
                    <li>Cron job scheduling and dark-mode support</li>
                  </ul>
                  <a
                    href="https://github.com/thechandanbhagat/ezpm2gui"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-500 hover:underline"
                  >
                    GitHub Repository ↗
                  </a>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2 text-xs font-medium text-danger-700 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800/50 rounded-md px-3 py-2 mb-3">
                  <div className="w-1.5 h-1.5 bg-danger-500 rounded-full animate-pulse shrink-0" />
                  {error}
                </div>
              )}

              <Routes>
                <Route path="/" element={
                  <MainDashboard
                    processes={filteredProcesses}
                    metrics={metrics}
                    searchTerm={searchTerm}
                    statusFilter={statusFilter}
                    onSearchChange={handleSearchChange}
                    onStatusFilterChange={handleStatusFilterChange}
                    onProcessAction={handleProcessAction}
                  />
                } />

                <Route path="/processes" element={
                  <MainDashboard
                    processes={filteredProcesses}
                    metrics={metrics}
                    searchTerm={searchTerm}
                    statusFilter={statusFilter}
                    onSearchChange={handleSearchChange}
                    onStatusFilterChange={handleStatusFilterChange}
                    onProcessAction={handleProcessAction}
                  />
                } />
                <Route path="/process/:id" element={<ProcessDetailPage onAction={handleProcessAction} />} />
                <Route path="/monit" element={<MonitDashboard processes={processes} onRefresh={() => {
                  const fetchProcesses = async () => {
                    try {
                      const response = await axios.get<PM2Process[]>('/api/processes');
                      setProcesses(response.data);
                    } catch (err) {
                      console.error('Error refreshing processes:', err);
                      setError('Failed to refresh process data');
                    }
                  };
                  fetchProcesses();
                }} />} />
                <Route path="/advanced-monitoring" element={<AdvancedMonitoringDashboard 
                  processes={processes}
                  systemMetrics={metrics}
                  onRefresh={() => {
                    const fetchData = async () => {
                      try {
                        const [processesRes, metricsRes] = await Promise.all([
                          axios.get<PM2Process[]>('/api/processes'),
                          axios.get<SystemMetricsData>('/api/metrics')
                        ]);
                        setProcesses(processesRes.data);
                        setMetrics(metricsRes.data);
                      } catch (err) {
                        console.error('Error refreshing data:', err);
                        setError('Failed to refresh data');
                      }
                    };
                    fetchData();
                  }}
                />} />
                <Route path="/remote" element={<RemoteConnections />} />
                <Route path="/deploy" element={<DeployApplication />} />
                <Route path="/modules" element={<ModuleManagement />} />
                <Route path="/ecosystem" element={<EcosystemGenerator />} />
                <Route path="/configure/:id" element={<ProcessConfiguration procId={0} />} />
                <Route path="/cluster" element={<ClusterManagement processes={processes} onRefresh={() => {
                  const fetchProcesses = async () => {
                    try {
                      const response = await axios.get<PM2Process[]>('/api/processes');
                      setProcesses(response.data);
                    } catch (err) {
                      console.error('Error refreshing processes:', err);
                      setError('Failed to refresh process data');
                    }
                  };
                  fetchProcesses();
                }} />} />                <Route path="/logs" element={<LogStreamEnhanced />} />
                <Route path="/logs/:id" element={<LogStreamEnhanced />} />
                <Route path="/cron-jobs" element={<CronJobsPage />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/load-balancing-guide" element={<LoadBalancingGuide />} />
              </Routes>
            </div>{/* /px-3 py-3 */}
          </main>
        </div>

        <ConfirmationDialog
          isOpen={confirmationDialog.isOpen}
          title={confirmationDialog.title}
          message={confirmationDialog.message}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          type={confirmationDialog.action === 'delete' ? 'danger' : 'warning'}
        />
      </div>
    </Router>
    </ThemeProvider>
  );
};

export default App;

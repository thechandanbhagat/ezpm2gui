import React, { useState, useEffect, useRef } from 'react';
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
import SidebarMenu from './components/SidebarMenu';
import Settings from './components/Settings';
import LoadBalancingGuide from './components/LoadBalancingGuide';
import RemoteConnections from './components/RemoteConnections';
import CronJobsPage from './components/CronJobsPage';
import ServerSwitcher from './components/ServerSwitcher';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GitHubIcon from '@mui/icons-material/GitHub';
import { PM2Process, SystemMetricsData, ConfirmationDialogData } from './types/pm2';
import { RemoteConnection } from './types/remote';
import {
  MoonIcon,
  SunIcon,
  Bars3Icon,
  ArrowUpCircleIcon,
  StarIcon
} from '@heroicons/react/24/outline';

// Initialize socket connection with improved settings
// process.env.REACT_APP_API_URL is baked in at build time by CRA from .env.local / .env
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3101';

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
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  // @group Updates : Silently check for a newer npm version after initial load
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  
  // Theme state — default dark, respect system preference
  const [darkMode, setDarkMode] = useState<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  // @group Theme : Sync Tailwind 'dark' class on <html> so dark: variants work globally
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // @group ServerSwitcher : Active server state and remote connections list
  const [activeServerId, setActiveServerId] = useState<string>('local');
  const activeServerIdRef = useRef<string>('local');
  const [remoteConnections, setRemoteConnections] = useState<RemoteConnection[]>([]);

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

    // Initial data fetch (local processes + remote connections list)
    const fetchInitialData = async (): Promise<void> => {
      try {
        const [processesRes, metricsRes, connectionsRes] = await Promise.all([
          axios.get<PM2Process[]>('/api/processes'),
          axios.get<SystemMetricsData>('/api/metrics'),
          axios.get<RemoteConnection[]>('/api/remote/connections').catch(() => ({ data: [] }))
        ]);

        setProcesses(processesRes.data);
        setMetrics(metricsRes.data);
        setRemoteConnections(connectionsRes.data);
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
    // @group ServerSwitcher : Only apply socket process updates when viewing local server
    socket.on('processes', (data: PM2Process[]) => {
      if (activeServerIdRef.current !== 'local') return;
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

  // Filter processes when search, status, or namespace filter changes
  useEffect(() => {
    let result = [...processes];

    // Apply namespace filter
    if (namespaceFilter !== 'all') {
      result = result.filter(p => (p.pm2_env?.namespace || 'default') === namespaceFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.pm2_env.status === statusFilter);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        String(p.pm_id).includes(searchLower)
      );
    }

    setFilteredProcesses(result);
  }, [processes, searchTerm, statusFilter, namespaceFilter]);

  // @group ServerSwitcher : Poll remote processes when a remote server is active
  useEffect(() => {
    if (activeServerId === 'local') return;

    const fetchRemoteProcesses = async (): Promise<void> => {
      try {
        const res = await axios.get<PM2Process[]>(`/api/remote/${activeServerId}/processes`);
        setProcesses(res.data);
        setError('');
      } catch (err: any) {
        console.error('Error fetching remote processes:', err);
        setError(`Failed to fetch processes from remote server: ${err.response?.data?.error || err.message}`);
      }
    };

    fetchRemoteProcesses();
    const interval = setInterval(fetchRemoteProcesses, 3000);
    return () => clearInterval(interval);
  }, [activeServerId]);

  // @group ServerSwitcher : Refresh remote connections list periodically so status dots stay current
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await axios.get<RemoteConnection[]>('/api/remote/connections');
        setRemoteConnections(res.data);
      } catch {
        // silent — connections list is non-critical
      }
    };
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // Effect to handle dark mode class on document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // @group Updates : Check for update once after 4 s — non-blocking, silent on failure
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/update/check');
        const json = await res.json();
        if (json.success && json.data?.updateAvailable) {
          setUpdateAvailable(true);
        }
      } catch {
        // silent — update check is best-effort
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

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
  
  // Execute the actual API call — routes to remote API when a remote server is active
  const executeAction = async (id: number, action: string): Promise<void> => {
    try {
      if (activeServerIdRef.current !== 'local') {
        // Find process name by id for the remote API
        const proc = processes.find(p => p.pm_id === id);
        const processName = proc?.name || String(id);
        await axios.post(`/api/remote/${activeServerIdRef.current}/processes/${processName}/${action}`);
      } else {
        await axios.post(`/api/process/${id}/${action}`);
        // The socket will update the process list
      }
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

  // @group ServerSwitcher : Switch active server — auto-connect remote, reset processes view
  const handleServerSwitch = async (serverId: string): Promise<void> => {
    if (serverId === activeServerId) return;

    setProcesses([]);
    setError('');
    activeServerIdRef.current = serverId;
    setActiveServerId(serverId);

    if (serverId !== 'local') {
      // Auto-connect if not already connected
      const conn = remoteConnections.find(c => c.id === serverId);
      if (conn && !conn.connected) {
        try {
          await axios.post(`/api/remote/${serverId}/connect`);
          // Refresh connections list to reflect new connected state
          const res = await axios.get<RemoteConnection[]>('/api/remote/connections');
          setRemoteConnections(res.data);
        } catch (err: any) {
          setError(`Failed to connect to ${conn.name || conn.host}: ${err.response?.data?.error || err.message}`);
        }
      }
    } else {
      // Switching back to local — restore from socket / re-fetch
      try {
        const [processesRes, metricsRes] = await Promise.all([
          axios.get<PM2Process[]>('/api/processes'),
          axios.get<SystemMetricsData>('/api/metrics'),
        ]);
        setProcesses(processesRes.data);
        setMetrics(metricsRes.data);
      } catch (err) {
        console.error('Error restoring local processes:', err);
      }
    }
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

  const handleNamespaceFilterChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setNamespaceFilter(e.target.value);
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
  // Background colors aligned with Tailwind neutral palette so MUI Paper matches the process page card color:
  //   light → white cards on neutral-100 page bg
  //   dark  → neutral-900 (#0f172a) cards on neutral-950 (#020617) page bg
  const muiTheme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      ...(darkMode
        ? {
            background: {
              default: '#020617',   // neutral-950 — matches page bg
              paper:   '#0f172a',   // neutral-900 — matches process-list card bg
            },
          }
        : {
            background: {
              default: '#f1f5f9',   // neutral-100 — matches page bg
              paper:   '#ffffff',   // white       — matches process-list card bg
            },
          }
      ),
    },
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

              {/* Right side */}
              <div className="flex items-center gap-1.5">

                {/* @group Updates : Pulse badge — visible when a newer npm version exists */}
                {updateAvailable && (
                  <Link
                    to="/settings"
                    title="A newer version of ezpm2gui is available"
                    className={`relative flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium no-underline border transition-colors ${
                      darkMode
                        ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/20'
                        : 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                    }`}
                  >
                    <ArrowUpCircleIcon className="h-3.5 w-3.5" />
                    <span>Update</span>
                    <span className="flex h-1.5 w-1.5 ml-0.5">
                      <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-400"></span>
                    </span>
                  </Link>
                )}

                {/* Divider */}
                <span className={`h-4 w-px mx-0.5 ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />

                {/* @group GitHub : Star button */}
                <a
                  href="https://github.com/thechandanbhagat/ezpm2gui"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Star ezpm2gui on GitHub"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium no-underline border transition-colors ${
                    darkMode
                      ? 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-yellow-400/60 hover:text-yellow-400'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-yellow-400 hover:text-yellow-600'
                  }`}
                >
                  <StarIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Star</span>
                </a>

                {/* @group GitHub : Repo link */}
                <a
                  href="https://github.com/thechandanbhagat/ezpm2gui"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on GitHub"
                  className={`p-1 rounded transition-colors ${
                    darkMode
                      ? 'text-neutral-400 hover:text-white'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>

                {/* Divider */}
                <span className={`h-4 w-px mx-0.5 ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />

                {/* @group ServerSwitcher : Global server context switcher */}
                <ServerSwitcher
                  activeServerId={activeServerId}
                  connections={remoteConnections}
                  darkMode={darkMode}
                  onSwitch={handleServerSwitch}
                />

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

              {/* @group ServerSwitcher : Active remote server banner */}
              {activeServerId !== 'local' && (() => {
                const conn = remoteConnections.find(c => c.id === activeServerId);
                return (
                  <div className={`flex items-center gap-2 text-xs font-medium rounded-md px-3 py-2 mb-3 ${
                    darkMode
                      ? 'bg-primary-900/30 border border-primary-700/50 text-primary-300'
                      : 'bg-primary-50 border border-primary-200 text-primary-700'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse shrink-0" />
                    <span>
                      Viewing <strong>{conn?.name || 'Remote Server'}</strong>
                      {conn && <span className="opacity-60 font-normal"> · {conn.username}@{conn.host}</span>}
                    </span>
                    <button
                      onClick={() => handleServerSwitch('local')}
                      className="ml-auto underline opacity-70 hover:opacity-100 transition-opacity"
                    >
                      Switch to Local
                    </button>
                  </div>
                );
              })()}

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
                    onNamespaceFilterChange={handleNamespaceFilterChange}
                    namespaceFilter={namespaceFilter}
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
                    onNamespaceFilterChange={handleNamespaceFilterChange}
                    namespaceFilter={namespaceFilter}
                    onProcessAction={handleProcessAction}
                  />
                } />
                <Route path="/process/:id" element={
                  <ProcessDetailPage
                    onAction={handleProcessAction}
                    connectionId={activeServerId !== 'local' ? activeServerId : undefined}
                  />
                } />
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

        {/* @group AboutDialog : About popup dialog */}
        <Dialog open={showAbout} onClose={toggleAbout} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 11 }}>EZ</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.3 }}>EZ PM2 GUI</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: 400 }}>v1.3.1 · Chandan Bhagat</div>
            </div>
            <IconButton size="small" onClick={toggleAbout} sx={{ ml: 'auto' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ pt: 2, pb: 2.5 }}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8125rem', lineHeight: 1.8 }}>
              <li>Monitor and manage PM2 processes in real-time</li>
              <li>Deploy new apps, configure ecosystems, manage clusters</li>
              <li>Remote server SSH connections with live logs</li>
              <li>Cron job scheduling and dark-mode support</li>
            </ul>

            <Divider sx={{ my: 2 }} />

            <a
              href="https://github.com/thechandanbhagat/ezpm2gui"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: '#6366f1', textDecoration: 'none' }}
            >
              <GitHubIcon sx={{ fontSize: 15 }} />
              GitHub Repository ↗
            </a>
          </DialogContent>
        </Dialog>
      </div>
    </Router>
    </ThemeProvider>
  );
};

export default App;

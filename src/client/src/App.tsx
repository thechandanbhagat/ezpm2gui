import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
import RemoteEnhancedLogManagement from './components/RemoteEnhancedLogManagement';
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

// Initialize socket connection
const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');

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
  
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
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
    });

    socket.on('metrics', (data: SystemMetricsData) => {
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
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <h6 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Loading PM2 data...
          </h6>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className={`min-h-screen transition-all duration-300 ${darkMode ? 'bg-neutral-950' : 'bg-neutral-50'}`}>
        <div className="flex">
          {/* Top Navigation Bar */}
          <nav className={`fixed w-full z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 transition-all duration-300 ${darkMode ? 'bg-neutral-900/95 border-neutral-800' : 'bg-white/95 border-gray-200'}`}>
            <div className="px-3 py-3">
              <div className="flex items-center justify-between max-w mx-auto">
                <button
                  onClick={toggleMenu}
                  className={`sm:hidden p-3 rounded-xl transition-all duration-200 ${darkMode ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/50' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/50'} hover:shadow-md`}
                >
                  <Bars3Icon className="h-6 w-6" />
                </button>
                <Link 
                  to="/" 
                  className={`text-2xl font-bold tracking-tight no-underline transition-all duration-200 flex-grow sm:flex-grow-0 ${darkMode ? 'text-white hover:text-primary-400' : 'text-neutral-900 hover:text-primary-600'}`}
                >
                  <span className="text-gradient">EZ PM2 GUI</span>
                </Link>
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={toggleDarkMode}
                    className={`p-3 rounded-xl transition-all duration-200 ${darkMode ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/50' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/50'} hover:shadow-md`}
                  >
                    {darkMode ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                  </button>
                </div>
              </div>
            </div>
          </nav>
          
          {/* Mobile Sidebar */}
          {menuOpen && (
            <div className="fixed inset-0 z-40 sm:hidden animate-fade-in">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={toggleMenu}></div>
              <div className={`fixed left-0 top-0 h-full w-80 bg-white border-r border-gray-200 transform transition-all duration-500 ease-out animate-slide-up ${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'} shadow-2xl`}>
                <div className="pt-16 h-full overflow-y-auto">
                  <SidebarMenu toggleAbout={toggleAbout} onItemClick={toggleMenu} />
                </div>
              </div>
            </div>
          )}
          
          {/* Desktop Sidebar */}
          <div className={`hidden sm:block fixed left-0 top-16 h-[calc(100vh-4rem)] w-80 bg-white border-r border-gray-200 overflow-y-auto ${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`}>
            <SidebarMenu toggleAbout={toggleAbout} />
          </div>
          
          {/* Main Content */}
          <main className={`flex-1 sm:ml-80 pt-16 min-h-screen transition-all duration-300 ${darkMode ? 'bg-gray-50' : 'bg-gray-50'}`}>
            <div className="max-w mx-auto px-3 py-3">
              {showAbout && (
                <div className={`card-premium p-12 mb-12 animate-fade-in ${darkMode ? 'bg-neutral-900/80' : 'bg-white/80'} border ${darkMode ? 'border-neutral-800/50' : 'border-neutral-200/50'} shadow-xl`}>
                  <div className="flex items-center space-x-4 mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-white font-bold text-2xl">ez</span>
                    </div>
                    <div>
                      <h2 className={`text-3xl font-bold tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-neutral-900'}`}>
                        About ezPM2GUI
                      </h2>
                      <p className={`text-lg ${darkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                        Professional Process Management Interface
                      </p>
                    </div>
                  </div>
                  <p className={`mb-6 text-lg leading-relaxed ${darkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    Version: 1.0.0
                  </p>
                  <p className={`mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Created by: Chandan Bhagat
                  </p>
                  <p className={`mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Features:
                  </p>
                  <ul className={`list-disc pl-6 mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <li>Monitor and manage PM2 processes</li>
                    <li>Real-time logs and metrics</li>
                    <li>Deploy new applications</li>
                    <li>Configure ecosystem files</li>
                    <li>Cluster management</li>
                    <li>Dark mode support</li>
                  </ul>
                  <p className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    GitHub:&nbsp;
                    <a 
                      href="https://github.com/thechandanbhagat/ezpm2gui" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 underline"
                    >
                      GitHub Repository
                    </a>
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-danger-100 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800/50 text-danger-800 dark:text-danger-400 px-6 py-4 rounded-xl mb-8 animate-fade-in">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-danger-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">{error}</span>
                  </div>
                </div>
              )}              <Routes>
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
                <Route path="/enhanced-logs" element={<RemoteEnhancedLogManagement />} />
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
            </div>
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
  );
};

export default App;

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ProcessList from './components/ProcessList';
import ProcessDetailPage from './components/ProcessDetailPage';
import SystemMetrics from './components/SystemMetrics';
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
import { PM2Process, SystemMetricsData, ConfirmationDialogData } from './types/pm2';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Container, 
  Box, 
  Typography, 
  Grid, 
  AppBar, 
  Toolbar, 
  IconButton, 
  Paper,
  TextField,
  Alert,
  MenuItem,
  InputAdornment,
  Drawer,
  useMediaQuery,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent
} from '@mui/material';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Menu as MenuIcon,
  Search as SearchIcon,
  FilterAlt as FilterIcon
} from '@mui/icons-material';

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
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState<boolean>(prefersDarkMode);
  
  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogData>({
    isOpen: false,
    title: '',
    message: '',
    action: '',
    processId: null
  });

  // Create Material UI theme
  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
          primary: {
            main: '#3498db',
          },
          secondary: {
            main: '#2ecc71',
          },
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
              },
            },
          },
        },
      }),
    [darkMode],
  );
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
  
  const handleStatusFilterChange = (e: SelectChangeEvent): void => {
    setStatusFilter(e.target.value);
  };

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh' 
          }}
        >
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading PM2 data...
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <Router>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex' }}>
          <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
              <IconButton
                edge="start"
                color="inherit"
                onClick={toggleMenu}
                sx={{ mr: 2, display: { sm: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
              <Typography 
                variant="h6" 
                component={Link} 
                to="/" 
                sx={{ 
                  flexGrow: 1, 
                  textDecoration: 'none', 
                  color: 'inherit' 
                }}
              >
                ezPM2GUI
              </Typography>
              <IconButton 
                color="inherit" 
                onClick={toggleDarkMode}
                sx={{ ml: 1 }}
              >
                {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Toolbar>
          </AppBar>
          
          {/* Mobile drawer (temporary) */}
          <Drawer
            anchor="left"
            open={menuOpen}
            onClose={toggleMenu}
            variant="temporary"
            ModalProps={{
              keepMounted: true, // Better open performance on mobile
            }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
            }}
          >
            <Box
              sx={{ width: 240 }}
              role="presentation"
            >
              <Toolbar /> {/* This ensures content starts below the AppBar */}
              <SidebarMenu toggleAbout={toggleAbout} onItemClick={toggleMenu} />
            </Box>
          </Drawer>
          
          {/* Desktop drawer (permanent) */}
          <Drawer
            variant="permanent"
            sx={{
              width: 240,
              flexShrink: 0,
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': { 
                width: 240,
                boxSizing: 'border-box',
              },
            }}
          >
            <Toolbar /> {/* This ensures content starts below the AppBar */}
            <Box sx={{ overflow: 'auto' }}>
              <SidebarMenu toggleAbout={toggleAbout} />
            </Box>
          </Drawer>
          
          <Box component="main" sx={{ 
            flexGrow: 1, 
            p: 3,
            width: { sm: `calc(100% - 240px)` }
          }}>
            <Toolbar /> {/* This ensures content starts below the AppBar */}
            
            <Container maxWidth="lg" sx={{ mt: 2 }}>
              {showAbout && (
                <Paper sx={{ p: 3, mb: 3 }}>
                  <Typography variant="h5" sx={{ mb: 2 }}>
                    About ezPM2GUI
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>
                    Version: 1.0.0
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>
                    Created by: Chandan Bhagat
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>
                    Features:
                  </Typography>
                  <Typography component="ul" sx={{ pl: 2, mb: 2 }}>
                    <li>Monitor and manage PM2 processes</li>
                    <li>Real-time logs and metrics</li>
                    <li>Deploy new applications</li>
                    <li>Configure ecosystem files</li>
                    <li>Cluster management</li>
                    <li>Dark mode support</li>
                  </Typography>
                  <Typography variant="body1">
                    GitHub:&nbsp;
                    <a 
                      href="https://github.com/thechandanbhagat/ezpm2gui" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      GitHub Repository
                    </a>
                  </Typography>
                </Paper>
              )}

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}              <Routes>
                <Route path="/" element={
                  <>
                    <Paper sx={{ p: 2, mb: 3 }} variant="outlined">
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                        <TextField
                          label="Search processes"
                          value={searchTerm}
                          onChange={handleSearchChange}
                          size="small"
                          variant="outlined"
                          sx={{ flexGrow: 1, maxWidth: 300 }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon />
                              </InputAdornment>
                            ),
                          }}
                        />
                        
                        <FormControl sx={{ minWidth: 150 }} size="small">
                          <InputLabel id="status-filter-label">Status</InputLabel>
                          <Select
                            labelId="status-filter-label"
                            id="status-filter"
                            value={statusFilter}
                            label="Status"
                            onChange={handleStatusFilterChange}
                            startAdornment={
                              <InputAdornment position="start">
                                <FilterIcon />
                              </InputAdornment>
                            }
                          >
                            <MenuItem value="all">All</MenuItem>
                            <MenuItem value="online">Online</MenuItem>
                            <MenuItem value="stopped">Stopped</MenuItem>
                            <MenuItem value="errored">Errored</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>
                    </Paper>

                    <Grid container spacing={3}>
                      <Grid item xs={12} md={4}>
                        <SystemMetrics metrics={metrics} />
                      </Grid>
                      <Grid item xs={12} md={8}>
                        <ProcessList 
                          processes={filteredProcesses} 
                          onAction={handleProcessAction} 
                        />
                      </Grid>
                    </Grid>
                  </>
                } />
                {/* Add a duplicate route for /processes that renders the same content as / */}
                <Route path="/processes" element={
                  <>
                    <Paper sx={{ p: 2, mb: 3 }} variant="outlined">
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                        <TextField
                          label="Search processes"
                          value={searchTerm}
                          onChange={handleSearchChange}
                          size="small"
                          variant="outlined"
                          sx={{ flexGrow: 1, maxWidth: 300 }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon />
                              </InputAdornment>
                            ),
                          }}
                        />
                        
                        <FormControl sx={{ minWidth: 150 }} size="small">
                          <InputLabel id="status-filter-label">Status</InputLabel>
                          <Select
                            labelId="status-filter-label"
                            id="status-filter"
                            value={statusFilter}
                            label="Status"
                            onChange={handleStatusFilterChange}
                            startAdornment={
                              <InputAdornment position="start">
                                <FilterIcon />
                              </InputAdornment>
                            }
                          >
                            <MenuItem value="all">All</MenuItem>
                            <MenuItem value="online">Online</MenuItem>
                            <MenuItem value="stopped">Stopped</MenuItem>
                            <MenuItem value="errored">Errored</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>
                    </Paper>

                    <Grid container spacing={3}>
                      <Grid item xs={12} md={4}>
                        <SystemMetrics metrics={metrics} />
                      </Grid>
                      <Grid item xs={12} md={8}>
                        <ProcessList 
                          processes={filteredProcesses} 
                          onAction={handleProcessAction} 
                        />
                      </Grid>
                    </Grid>
                  </>
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
                <Route path="/settings" element={<Settings />} />
                <Route path="/load-balancing-guide" element={<LoadBalancingGuide />} />
              </Routes>
            </Container>
          </Box>
        </Box>

        <ConfirmationDialog 
          isOpen={confirmationDialog.isOpen}
          title={confirmationDialog.title}
          message={confirmationDialog.message}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          type={confirmationDialog.action === 'delete' ? 'danger' : 'warning'}
        />
      </ThemeProvider>
    </Router>
  );
};

export default App;

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  Grid,
  Card,
  CardContent,
  IconButton,
  Switch,
  FormControlLabel,
  Alert,  CircularProgress,
  List,
  ListItem,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  ButtonGroup
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  ExpandMore as ExpandMoreIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  BugReport as DebugIcon
} from '@mui/icons-material';
import { PM2Process } from '../types/pm2';
import axios from 'axios';
import { io } from 'socket.io-client';

interface LogEntry {
  id: string;
  processId: number;
  processName: string;
  type: 'out' | 'err';
  level: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
  content: string;
  timestamp: Date;
  raw: string;
}

interface LogFilter {
  processIds: number[];
  logTypes: ('out' | 'err')[];
  logLevels: ('error' | 'warn' | 'info' | 'debug' | 'unknown')[];
  searchTerm: string;
  timeRange: '1h' | '6h' | '24h' | 'all';
}

interface ProcessLogStats {
  processId: number;
  processName: string;
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastLogTime: Date | null;
}

const EnhancedLogManagement: React.FC = () => {
  const theme = useTheme();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);

  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [logStats, setLogStats] = useState<ProcessLogStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);

  const [filters, setFilters] = useState<LogFilter>({
    processIds: [],
    logTypes: ['out', 'err'],
    logLevels: ['error', 'warn', 'info', 'debug', 'unknown'],
    searchTerm: '',
    timeRange: '1h'
  });

  // Parse log level from content
  const parseLogLevel = (content: string): 'error' | 'warn' | 'info' | 'debug' | 'unknown' => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('error') || lowerContent.includes('err:')) return 'error';
    if (lowerContent.includes('warn') || lowerContent.includes('warning')) return 'warn';
    if (lowerContent.includes('info') || lowerContent.includes('log:')) return 'info';
    if (lowerContent.includes('debug') || lowerContent.includes('dbg:')) return 'debug';
    return 'unknown';
  };

  // Fetch available processes
  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const response = await axios.get('/api/processes');
        setProcesses(response.data);
        
        // Initialize filter with all process IDs
        setFilters(prev => ({
          ...prev,
          processIds: response.data.map((p: PM2Process) => p.pm_id)
        }));
      } catch (err) {
        setError('Failed to fetch processes');
      }
    };

    fetchProcesses();
  }, []);

  // Fetch logs for selected processes
  const fetchLogs = async () => {
    if (filters.processIds.length === 0) return;

    try {
      setLoading(true);
      const allLogs: LogEntry[] = [];

      // Fetch logs from all selected processes
      for (const processId of filters.processIds) {
        const process = processes.find(p => p.pm_id === processId);
        if (!process) continue;

        try {
          const [outResponse, errResponse] = await Promise.all([
            axios.get(`/api/logs/${processId}/out`),
            axios.get(`/api/logs/${processId}/err`)
          ]);

          // Process stdout logs
          outResponse.data.logs?.forEach((log: string, index: number) => {
            if (log.trim()) {
              allLogs.push({
                id: `${processId}-out-${index}-${Date.now()}`,
                processId,
                processName: process.name,
                type: 'out',
                level: parseLogLevel(log),
                content: log,
                timestamp: new Date(Date.now() - (outResponse.data.logs.length - index) * 1000),
                raw: log
              });
            }
          });

          // Process stderr logs
          errResponse.data.logs?.forEach((log: string, index: number) => {
            if (log.trim()) {
              allLogs.push({
                id: `${processId}-err-${index}-${Date.now()}`,
                processId,
                processName: process.name,
                type: 'err',
                level: parseLogLevel(log),
                content: log,
                timestamp: new Date(Date.now() - (errResponse.data.logs.length - index) * 1000),
                raw: log
              });
            }
          });
        } catch (processErr) {
          console.warn(`Failed to fetch logs for process ${processId}:`, processErr);
        }
      }

      // Sort logs by timestamp
      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setLogs(allLogs);
      generateLogStats(allLogs);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch logs');
      setLoading(false);
    }
  };

  // Generate statistics for each process
  const generateLogStats = (allLogs: LogEntry[]) => {
    const stats: ProcessLogStats[] = [];
    
    processes.forEach(process => {
      const processLogs = allLogs.filter(log => log.processId === process.pm_id);
      
      stats.push({
        processId: process.pm_id,
        processName: process.name,
        totalLogs: processLogs.length,
        errorCount: processLogs.filter(log => log.level === 'error').length,
        warningCount: processLogs.filter(log => log.level === 'warn').length,
        infoCount: processLogs.filter(log => log.level === 'info').length,
        lastLogTime: processLogs.length > 0 ? processLogs[0].timestamp : null
      });
    });

    setLogStats(stats);
  };

  // Apply filters to logs
  useEffect(() => {
    let filtered = logs;

    // Filter by process IDs
    if (filters.processIds.length > 0) {
      filtered = filtered.filter(log => filters.processIds.includes(log.processId));
    }

    // Filter by log types
    if (filters.logTypes.length > 0) {
      filtered = filtered.filter(log => filters.logTypes.includes(log.type));
    }

    // Filter by log levels
    if (filters.logLevels.length > 0) {
      filtered = filtered.filter(log => filters.logLevels.includes(log.level));
    }

    // Filter by search term
    if (filters.searchTerm) {
      const searchTerm = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.content.toLowerCase().includes(searchTerm) ||
        log.processName.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by time range
    if (filters.timeRange !== 'all') {
      const now = new Date();
      const timeRangeMs = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000
      }[filters.timeRange];

      filtered = filtered.filter(log => 
        now.getTime() - log.timestamp.getTime() <= timeRangeMs
      );
    }

    setFilteredLogs(filtered);
  }, [logs, filters]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Setup real-time log streaming
  useEffect(() => {
    if (isStreaming && filters.processIds.length > 0) {
      const socket = io();
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Connected to log streaming');
        
        // Subscribe to logs for all selected processes
        filters.processIds.forEach(processId => {
          socket.emit('subscribe-logs', { processId, logType: 'out' });
          socket.emit('subscribe-logs', { processId, logType: 'err' });
        });
      });

      socket.on('log-line', (data) => {
        if (filters.processIds.includes(data.processId)) {
          const process = processes.find(p => p.pm_id === data.processId);
          if (process) {
            const newLog: LogEntry = {
              id: `${data.processId}-${data.logType}-${Date.now()}-${Math.random()}`,
              processId: data.processId,
              processName: process.name,
              type: data.logType,
              level: parseLogLevel(data.line),
              content: data.line,
              timestamp: new Date(),
              raw: data.line
            };

            setLogs(prev => [newLog, ...prev].slice(0, 1000)); // Keep only latest 1000 logs
          }
        }
      });

      return () => {
        filters.processIds.forEach(processId => {
          socket.emit('unsubscribe-logs', { processId, logType: 'out' });
          socket.emit('unsubscribe-logs', { processId, logType: 'err' });
        });
        socket.disconnect();
      };
    }
  }, [isStreaming, filters.processIds, processes]);

  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
  };

  const handleProcessFilterChange = (event: SelectChangeEvent<number[]>) => {
    setFilters(prev => ({
      ...prev,
      processIds: event.target.value as number[]
    }));
  };

  const handleLogTypeChange = (logType: 'out' | 'err') => {
    setFilters(prev => ({
      ...prev,
      logTypes: prev.logTypes.includes(logType)
        ? prev.logTypes.filter(t => t !== logType)
        : [...prev.logTypes, logType]
    }));
  };

  const handleLogLevelChange = (level: 'error' | 'warn' | 'info' | 'debug' | 'unknown') => {
    setFilters(prev => ({
      ...prev,
      logLevels: prev.logLevels.includes(level)
        ? prev.logLevels.filter(l => l !== level)
        : [...prev.logLevels, level]
    }));
  };

  const clearLogs = () => {
    setLogs([]);
    setFilteredLogs([]);
  };

  const downloadLogs = () => {
    const content = filteredLogs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.processName}] [${log.type.toUpperCase()}] [${log.level.toUpperCase()}] ${log.content}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezpm2gui-logs-${new Date().toISOString().split('T')[0]}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <ErrorIcon color="error" fontSize="small" />;
      case 'warn': return <WarningIcon color="warning" fontSize="small" />;
      case 'info': return <InfoIcon color="info" fontSize="small" />;
      case 'debug': return <DebugIcon color="action" fontSize="small" />;
      default: return <InfoIcon color="disabled" fontSize="small" />;
    }
  };
  const getLogLevelColor = (level: string): 'error' | 'warning' | 'info' | 'primary' => {
    switch (level) {
      case 'error': return 'error';
      case 'warn': return 'warning';
      case 'info': return 'info';
      default: return 'primary';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Enhanced Log Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={isStreaming ? 'contained' : 'outlined'}
            color={isStreaming ? 'error' : 'primary'}
            onClick={toggleStreaming}
            startIcon={isStreaming ? <PauseIcon /> : <PlayIcon />}
            disabled={filters.processIds.length === 0}
          >
            {isStreaming ? 'Stop Stream' : 'Start Stream'}
          </Button>
          <IconButton onClick={fetchLogs} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <IconButton onClick={clearLogs}>
            <ClearIcon />
          </IconButton>
          <IconButton onClick={downloadLogs} disabled={filteredLogs.length === 0}>
            <DownloadIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Tabs value={selectedTab} onChange={(_, newValue) => setSelectedTab(newValue)} sx={{ mb: 2 }}>
        <Tab label="Log Viewer" />
        <Tab label="Statistics" />
        <Tab label="Filters" />
      </Tabs>

      {selectedTab === 0 && (
        <>
          {/* Quick Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search logs..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />
                  }}
                />
              </Grid>
              
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Processes</InputLabel>
                  <Select
                    multiple
                    value={filters.processIds}
                    onChange={handleProcessFilterChange}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as number[]).map((id) => {
                          const process = processes.find(p => p.pm_id === id);
                          return <Chip key={id} label={process?.name || id} size="small" />;
                        })}
                      </Box>
                    )}
                  >
                    {processes.map((process) => (
                      <MenuItem key={process.pm_id} value={process.pm_id}>
                        {process.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Time Range</InputLabel>
                  <Select
                    value={filters.timeRange}
                    onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
                  >
                    <MenuItem value="1h">Last Hour</MenuItem>
                    <MenuItem value="6h">Last 6 Hours</MenuItem>
                    <MenuItem value="24h">Last 24 Hours</MenuItem>
                    <MenuItem value="all">All Time</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={3}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Auto-scroll"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ mr: 2, alignSelf: 'center' }}>
                Log Types:
              </Typography>
              <ButtonGroup size="small">
                <Button
                  variant={filters.logTypes.includes('out') ? 'contained' : 'outlined'}
                  onClick={() => handleLogTypeChange('out')}
                >
                  Stdout
                </Button>
                <Button
                  variant={filters.logTypes.includes('err') ? 'contained' : 'outlined'}
                  onClick={() => handleLogTypeChange('err')}
                  color="error"
                >
                  Stderr
                </Button>
              </ButtonGroup>

              <Typography variant="body2" sx={{ ml: 2, mr: 2, alignSelf: 'center' }}>
                Levels:
              </Typography>
              <ButtonGroup size="small">
                {(['error', 'warn', 'info', 'debug'] as const).map(level => (
                  <Button
                    key={level}
                    variant={filters.logLevels.includes(level) ? 'contained' : 'outlined'}
                    onClick={() => handleLogLevelChange(level)}
                    color={getLogLevelColor(level)}
                  >
                    {level}
                  </Button>
                ))}
              </ButtonGroup>
            </Box>
          </Paper>

          {/* Log Display */}
          <Paper sx={{ height: 600, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6">
                Logs ({filteredLogs.length})
                {isStreaming && (
                  <Chip 
                    label="STREAMING" 
                    color="success" 
                    size="small" 
                    sx={{ ml: 2 }} 
                  />
                )}
              </Typography>
            </Box>
            
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading logs...</Typography>
              </Box>
            ) : (
              <Box
                ref={logContainerRef}
                sx={{
                  flex: 1,
                  overflow: 'auto',
                  p: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5'
                }}
              >
                {filteredLogs.length === 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    height: '100%' 
                  }}>
                    <Typography color="text.secondary">
                      No logs found matching the current filters
                    </Typography>
                  </Box>
                ) : (
                  filteredLogs.map((log) => (
                    <Box
                      key={log.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        py: 0.5,
                        px: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                          backgroundColor: 'action.hover'
                        }
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: 60,
                          color: 'text.secondary',
                          fontSize: '0.75rem'
                        }}
                      >
                        {log.timestamp.toLocaleTimeString()}
                      </Typography>
                      
                      <Chip
                        label={log.processName}
                        size="small"
                        sx={{ minWidth: 80, fontSize: '0.7rem' }}
                      />
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 20 }}>
                        {getLogLevelIcon(log.level)}
                      </Box>
                      
                      <Typography
                        sx={{
                          flex: 1,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: log.type === 'err' ? 'error.main' : 'text.primary'
                        }}
                      >
                        {log.content}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Paper>
        </>
      )}

      {selectedTab === 1 && (
        <Grid container spacing={3}>
          {logStats.map((stat) => (
            <Grid item xs={12} sm={6} md={4} key={stat.processId}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {stat.processName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Logs: {stat.totalLogs}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Chip
                      label={`${stat.errorCount} Errors`}
                      color="error"
                      size="small"
                      variant={stat.errorCount > 0 ? 'filled' : 'outlined'}
                    />
                    <Chip
                      label={`${stat.warningCount} Warnings`}
                      color="warning"
                      size="small"
                      variant={stat.warningCount > 0 ? 'filled' : 'outlined'}
                    />
                    <Chip
                      label={`${stat.infoCount} Info`}
                      color="info"
                      size="small"
                      variant={stat.infoCount > 0 ? 'filled' : 'outlined'}
                    />
                  </Box>
                  {stat.lastLogTime && (
                    <Typography variant="caption" color="text.secondary">
                      Last log: {stat.lastLogTime.toLocaleString()}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {selectedTab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Advanced Filters
          </Typography>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Process Selection</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {processes.map((process) => (
                  <ListItem key={process.pm_id}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={filters.processIds.includes(process.pm_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilters(prev => ({
                                ...prev,
                                processIds: [...prev.processIds, process.pm_id]
                              }));
                            } else {
                              setFilters(prev => ({
                                ...prev,
                                processIds: prev.processIds.filter(id => id !== process.pm_id)
                              }));
                            }
                          }}
                        />
                      }
                      label={`${process.name} (ID: ${process.pm_id})`}
                    />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Log Type Selection</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.logTypes.includes('out')}
                    onChange={() => handleLogTypeChange('out')}
                  />
                }
                label="Standard Output (stdout)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.logTypes.includes('err')}
                    onChange={() => handleLogTypeChange('err')}
                  />
                }
                label="Error Output (stderr)"
              />
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Log Level Selection</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {(['error', 'warn', 'info', 'debug', 'unknown'] as const).map(level => (
                <FormControlLabel
                  key={level}
                  control={
                    <Switch
                      checked={filters.logLevels.includes(level)}
                      onChange={() => handleLogLevelChange(level)}
                    />
                  }
                  label={level.toUpperCase()}
                />
              ))}
            </AccordionDetails>
          </Accordion>
        </Paper>
      )}
    </Box>
  );
};

export default EnhancedLogManagement;

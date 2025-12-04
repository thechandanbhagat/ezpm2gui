/* eslint-disable @typescript-eslint/no-unused-vars */
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
  Alert,
  CircularProgress,
  List,
  ListItem,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  ButtonGroup,
  Divider,
  Avatar,
  ListItemAvatar,
  ListItemText,
  Badge
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  BugReport as DebugIcon,
  Computer as ServerIcon,
  Cloud as RemoteIcon,
  Apps as AppIcon,
  Storage as LocalIcon
} from '@mui/icons-material';
import { PM2Process } from '../types/pm2';
import { RemoteConnection } from '../types/remote';
import axios from 'axios';
import { io } from 'socket.io-client';

interface RemoteLogEntry {
  id: string;
  serverId: string;
  serverName: string;
  processId: number;
  processName: string;
  type: 'out' | 'err';
  level: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
  content: string;
  timestamp: Date;
  raw: string;
  isRemote: boolean;
}

interface RemoteLogFilter {
  serverIds: string[];
  processIds: string[];
  logTypes: ('out' | 'err')[];
  logLevels: ('error' | 'warn' | 'info' | 'debug' | 'unknown')[];
  searchTerm: string;
  timeRange: '1h' | '6h' | '24h' | 'all';
}

interface ServerProcessGroup {
  serverId: string;
  serverName: string;
  isRemote: boolean;
  processes: PM2Process[];
}

interface ProcessLogStats {
  serverId: string;
  serverName: string;
  processId: string;
  processName: string;
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastLogTime: Date | null;
}

const RemoteEnhancedLogManagement: React.FC = () => {
  const theme = useTheme();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);

  const [serverGroups, setServerGroups] = useState<ServerProcessGroup[]>([]);
  const [remoteConnections, setRemoteConnections] = useState<RemoteConnection[]>([]);
  const [logs, setLogs] = useState<RemoteLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<RemoteLogEntry[]>([]);
  const [logStats, setLogStats] = useState<ProcessLogStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const [expandedServers, setExpandedServers] = useState<string[]>(['local']);

  const [filters, setFilters] = useState<RemoteLogFilter>({
    serverIds: [],
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

  // Fetch remote connections and local processes
  useEffect(() => {
    const fetchServersAndProcesses = async () => {
      try {
        setLoading(true);
        
        // Fetch local processes
        const localProcessesResponse = await axios.get('/api/processes');
        const localProcesses = localProcessesResponse.data;

        // Fetch remote connections
        const remoteConnectionsResponse = await axios.get('/api/remote/connections');
        const connections = remoteConnectionsResponse.data;
        setRemoteConnections(connections);

        const groups: ServerProcessGroup[] = [];

        // Add local server group
        groups.push({
          serverId: 'local',
          serverName: 'Local Server',
          isRemote: false,
          processes: localProcesses
        });

        // Add remote server groups
        for (const connection of connections) {
          try {
            if (connection.connected) {
              const remoteProcessesResponse = await axios.get(`/api/remote/${connection.id}/processes`);
              groups.push({
                serverId: connection.id,
                serverName: connection.name,
                isRemote: true,
                processes: remoteProcessesResponse.data
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch processes for remote server ${connection.name}:`, err);
            // Still add the server group even if processes couldn't be fetched
            groups.push({
              serverId: connection.id,
              serverName: connection.name,
              isRemote: true,
              processes: []
            });
          }
        }

        setServerGroups(groups);
        
        // Initialize filters with all server IDs
        setFilters(prev => ({
          ...prev,
          serverIds: groups.map(g => g.serverId)
        }));

        setLoading(false);
      } catch (err) {
        setError('Failed to fetch servers and processes');
        setLoading(false);
      }
    };

    fetchServersAndProcesses();
  }, []);

  // Fetch logs for selected servers and processes
  const fetchLogs = async () => {
    if (filters.serverIds.length === 0) return;

    try {
      setLoading(true);
      const allLogs: RemoteLogEntry[] = [];

      for (const serverId of filters.serverIds) {
        const serverGroup = serverGroups.find(g => g.serverId === serverId);
        if (!serverGroup) continue;

        const relevantProcesses = filters.processIds.length > 0 
          ? serverGroup.processes.filter(p => filters.processIds.includes(`${serverId}-${p.pm_id}`))
          : serverGroup.processes;

        for (const process of relevantProcesses) {
          try {
            let logResponse;
            
            if (serverGroup.isRemote) {
              // Fetch logs from remote server
              logResponse = await axios.get(`/api/remote/${serverId}/logs/${process.pm_id}`);
            } else {
              // Fetch logs from local server
              const [outResponse, errResponse] = await Promise.all([
                axios.get(`/api/logs/${process.pm_id}/out`),
                axios.get(`/api/logs/${process.pm_id}/err`)
              ]);
              logResponse = {
                data: {
                  stdout: outResponse.data.logs || [],
                  stderr: errResponse.data.logs || []
                }
              };
            }

            // Process stdout logs
            logResponse.data.stdout?.forEach((log: string, index: number) => {
              if (log.trim()) {
                allLogs.push({
                  id: `${serverId}-${process.pm_id}-out-${index}-${Date.now()}`,
                  serverId,
                  serverName: serverGroup.serverName,
                  processId: process.pm_id,
                  processName: process.name,
                  type: 'out',
                  level: parseLogLevel(log),
                  content: log,
                  timestamp: new Date(Date.now() - (logResponse.data.stdout.length - index) * 1000),
                  raw: log,
                  isRemote: serverGroup.isRemote
                });
              }
            });

            // Process stderr logs
            logResponse.data.stderr?.forEach((log: string, index: number) => {
              if (log.trim()) {
                allLogs.push({
                  id: `${serverId}-${process.pm_id}-err-${index}-${Date.now()}`,
                  serverId,
                  serverName: serverGroup.serverName,
                  processId: process.pm_id,
                  processName: process.name,
                  type: 'err',
                  level: parseLogLevel(log),
                  content: log,
                  timestamp: new Date(Date.now() - (logResponse.data.stderr.length - index) * 1000),
                  raw: log,
                  isRemote: serverGroup.isRemote
                });
              }
            });
          } catch (processErr) {
            console.warn(`Failed to fetch logs for process ${process.pm_id} on ${serverGroup.serverName}:`, processErr);
          }
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

  // Generate statistics for each process across all servers
  const generateLogStats = (allLogs: RemoteLogEntry[]) => {
    const stats: ProcessLogStats[] = [];
    
    serverGroups.forEach(serverGroup => {
      serverGroup.processes.forEach(process => {
        const processLogs = allLogs.filter(log => 
          log.serverId === serverGroup.serverId && log.processId === process.pm_id
        );
        
        if (processLogs.length > 0) {
          stats.push({
            serverId: serverGroup.serverId,
            serverName: serverGroup.serverName,
            processId: `${serverGroup.serverId}-${process.pm_id}`,
            processName: process.name,
            totalLogs: processLogs.length,
            errorCount: processLogs.filter(log => log.level === 'error').length,
            warningCount: processLogs.filter(log => log.level === 'warn').length,
            infoCount: processLogs.filter(log => log.level === 'info').length,
            lastLogTime: processLogs.length > 0 ? processLogs[0].timestamp : null
          });
        }
      });
    });

    setLogStats(stats);
  };

  // Apply filters to logs
  useEffect(() => {
    let filtered = logs;

    // Filter by server IDs
    if (filters.serverIds.length > 0) {
      filtered = filtered.filter(log => filters.serverIds.includes(log.serverId));
    }

    // Filter by process IDs
    if (filters.processIds.length > 0) {
      filtered = filtered.filter(log => 
        filters.processIds.includes(`${log.serverId}-${log.processId}`)
      );
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
        log.processName.toLowerCase().includes(searchTerm) ||
        log.serverName.toLowerCase().includes(searchTerm)
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

  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
  };

  const handleServerFilterChange = (event: SelectChangeEvent<string[]>) => {
    setFilters(prev => ({
      ...prev,
      serverIds: event.target.value as string[]
    }));
  };

  const handleProcessFilterChange = (event: SelectChangeEvent<string[]>) => {
    setFilters(prev => ({
      ...prev,
      processIds: event.target.value as string[]
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
      `[${log.timestamp.toISOString()}] [${log.serverName}] [${log.processName}] [${log.type.toUpperCase()}] [${log.level.toUpperCase()}] ${log.content}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezpm2gui-remote-logs-${new Date().toISOString().split('T')[0]}.log`;
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

  const getServerIcon = (isRemote: boolean) => {
    return isRemote ? <RemoteIcon color="primary" /> : <LocalIcon color="secondary" />;
  };

  const getAllProcessOptions = () => {
    const options: { value: string; label: string; serverId: string; serverName: string }[] = [];
    
    serverGroups.forEach(serverGroup => {
      serverGroup.processes.forEach(process => {
        options.push({
          value: `${serverGroup.serverId}-${process.pm_id}`,
          label: `${process.name} (${serverGroup.serverName})`,
          serverId: serverGroup.serverId,
          serverName: serverGroup.serverName
        });
      });
    });
    
    return options;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Remote Enhanced Log Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={isStreaming ? 'contained' : 'outlined'}
            color={isStreaming ? 'error' : 'primary'}
            onClick={toggleStreaming}
            startIcon={isStreaming ? <PauseIcon /> : <PlayIcon />}
            disabled={filters.serverIds.length === 0}
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
        <Tab label="Server Tree" />
      </Tabs>

      {selectedTab === 0 && (
        <>
          {/* Enhanced Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
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
                  <InputLabel>Servers</InputLabel>
                  <Select
                    multiple
                    value={filters.serverIds}
                    onChange={handleServerFilterChange}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((id) => {
                          const server = serverGroups.find(g => g.serverId === id);
                          return (
                            <Chip 
                              key={id} 
                              label={server?.serverName || id} 
                              size="small" 
                              icon={getServerIcon(server?.isRemote || false)}
                            />
                          );
                        })}
                      </Box>
                    )}
                  >
                    {serverGroups.map((serverGroup) => (
                      <MenuItem key={serverGroup.serverId} value={serverGroup.serverId}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getServerIcon(serverGroup.isRemote)}
                          {serverGroup.serverName}
                          <Badge badgeContent={serverGroup.processes.length} color="primary" />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Applications</InputLabel>
                  <Select
                    multiple
                    value={filters.processIds}
                    onChange={handleProcessFilterChange}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((id) => {
                          const option = getAllProcessOptions().find(p => p.value === id);
                          return <Chip key={id} label={option?.label || id} size="small" />;
                        })}
                      </Box>
                    )}
                  >
                    {getAllProcessOptions().map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AppIcon fontSize="small" />
                          {option.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={3}>
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
            </Grid>

            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ mr: 2 }}>
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

              <Typography variant="body2" sx={{ ml: 2, mr: 2 }}>
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

              <FormControlLabel
                control={
                  <Switch
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    size="small"
                  />
                }
                label="Auto-scroll"
                sx={{ ml: 2 }}
              />
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
                        label={log.serverName}
                        size="small"
                        icon={getServerIcon(log.isRemote)}
                        sx={{ minWidth: 100, fontSize: '0.7rem' }}
                        color={log.isRemote ? 'primary' : 'secondary'}
                      />
                      
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {getServerIcon(stat.serverId !== 'local')}
                    <Typography variant="h6">
                      {stat.processName}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Server: {stat.serverName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Logs: {stat.totalLogs}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
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
            Server and Application Tree
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          {serverGroups.map((serverGroup) => (
            <Accordion 
              key={serverGroup.serverId}
              expanded={expandedServers.includes(serverGroup.serverId)}
              onChange={() => {
                setExpandedServers(prev => 
                  prev.includes(serverGroup.serverId)
                    ? prev.filter(id => id !== serverGroup.serverId)
                    : [...prev, serverGroup.serverId]
                );
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {getServerIcon(serverGroup.isRemote)}
                  <Typography variant="h6">{serverGroup.serverName}</Typography>
                  <Badge badgeContent={serverGroup.processes.length} color="primary">
                    <AppIcon />
                  </Badge>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List>
                  {serverGroup.processes.length === 0 ? (
                    <ListItem>
                      <ListItemText 
                        primary="No applications found"
                        secondary={serverGroup.isRemote ? "Check remote connection" : "No PM2 processes running"}
                      />
                    </ListItem>
                  ) : (
                    serverGroup.processes.map((process) => {
                      const processLogs = logStats.find(s => 
                        s.serverId === serverGroup.serverId && 
                        s.processId === `${serverGroup.serverId}-${process.pm_id}`
                      );
                      
                      return (
                        <ListItem key={process.pm_id}>
                          <ListItemAvatar>
                            <Avatar>
                              <AppIcon />
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1">{process.name}</Typography>
                                <Chip 
                                  label={`ID: ${process.pm_id}`} 
                                  size="small" 
                                  variant="outlined" 
                                />
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 1 }}>
                                {processLogs ? (
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip
                                      label={`${processLogs.totalLogs} Total`}
                                      size="small"
                                      variant="outlined"
                                    />
                                    {processLogs.errorCount > 0 && (
                                      <Chip
                                        label={`${processLogs.errorCount} Errors`}
                                        size="small"
                                        color="error"
                                      />
                                    )}
                                    {processLogs.warningCount > 0 && (
                                      <Chip
                                        label={`${processLogs.warningCount} Warnings`}
                                        size="small"
                                        color="warning"
                                      />
                                    )}
                                  </Box>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    No logs available
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      );
                    })
                  )}
                </List>
              </AccordionDetails>
            </Accordion>
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default RemoteEnhancedLogManagement;

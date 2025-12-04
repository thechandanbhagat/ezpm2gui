import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Cloud as CloudIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { RemoteConnection, PM2Process, SystemInfo } from '../types/remote';
import { io } from 'socket.io-client';
import LogChatTaskbar from './LogChatTaskbar';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const RemoteConnections: React.FC = () => {
  const [connections, setConnections] = useState<RemoteConnection[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<RemoteConnection | null>(null);
  const [processes, setProcesses] = useState<{ [key: string]: PM2Process[] }>({});
  const [systemInfo, setSystemInfo] = useState<{ [key: string]: SystemInfo }>({});
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Multiple log windows support
  const [logWindows, setLogWindows] = useState<{ [key: string]: {
    connectionId: string;
    processName: string;
    processId: string;
    connectionName: string;
    logs: string[];
  } }>({});
  const [socket, setSocket] = useState<any>(null);
  // New/Edit connection form state
  const [connectionForm, setConnectionForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    useSudo: false
  });  useEffect(() => {
    loadConnections();
    
    // Initialize Socket.IO connection
    const newSocket = io();
    setSocket(newSocket);
      // Set up global socket event listeners for all log windows
    newSocket.on('remote-log-line', (data: any) => {
      console.log('Received remote-log-line:', data);
      const windowKey = `${data.connectionId}-${data.processId}`;
      console.log('Looking for window key:', windowKey);
      
      setLogWindows(prev => {
        console.log('Current log windows:', Object.keys(prev));
        if (prev[windowKey]) {
          console.log('Updating logs for window:', windowKey);
          return {
            ...prev,
            [windowKey]: {
              ...prev[windowKey],
              logs: [...prev[windowKey].logs, `[${data.logType.toUpperCase()}] ${data.line}`]
            }
          };
        } else {
          console.log('Window not found for key:', windowKey);
        }
        return prev;
      });
    });

    newSocket.on('remote-log-error', (data: any) => {
      console.error('Remote log error:', data);
      setError(`Log error: ${data.error}`);
    });

    newSocket.on('remote-log-error', (data: any) => {
      console.error('Remote log error:', data);
      setError(`Log streaming error: ${data.error}`);
    });
    
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  const loadConnections = async () => {
    try {
      const response = await fetch('/api/remote/connections');
      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
      setError('Failed to load connections');
    }
  };
  const handleConnect = async (connectionId: string) => {
    setLoading(prev => ({ ...prev, [connectionId]: true }));
    try {
      const response = await fetch(`/api/remote/${connectionId}/connect`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadProcesses(connectionId);
        await loadSystemInfo(connectionId);
        setConnections(prev => 
          prev.map(conn => 
            conn.id === connectionId 
              ? { ...conn, connected: true } 
              : conn
          )
        );
      } else {
        // Try to parse as JSON, but handle non-JSON responses
        try {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to connect');
        } catch (parseError) {
          // If response isn't valid JSON, get text instead
          const errorText = await response.text();
          setError(errorText || 'Failed to connect (Invalid server response)');
        }
      }
    } catch (error) {
      console.error('Connection failed:', error);
      setError(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(prev => ({ ...prev, [connectionId]: false }));
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/remote/${connectionId}/disconnect`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setConnections(prev => 
          prev.map(conn => 
            conn.id === connectionId 
              ? { ...conn, connected: false } 
              : conn
          )
        );
        setProcesses(prev => {
          const newProcesses = { ...prev };
          delete newProcesses[connectionId];
          return newProcesses;
        });
      }
    } catch (error) {
      console.error('Disconnect failed:', error);
      setError('Disconnect failed');
    }
  };

  const loadProcesses = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/remote/${connectionId}/processes`);
      if (response.ok) {
        const data = await response.json();
        setProcesses(prev => ({ ...prev, [connectionId]: data }));
      }
    } catch (error) {
      console.error('Failed to load processes:', error);
    }
  };
  const loadSystemInfo = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/remote/${connectionId}/system-info`);
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(prev => ({ ...prev, [connectionId]: data }));
      }
    } catch (error) {
      console.error('Failed to load system info:', error);
    }
  };  const openLiveLogs = async (connectionId: string, processName: string, processId?: number) => {
    try {
      // Use process ID if available, otherwise fall back to name
      const processIdentifier = processId !== undefined ? processId.toString() : processName;
      
      // Create a unique key for this log window
      const windowKey = `${connectionId}-${processIdentifier}`;
      
      // Check if window is already open
      if (logWindows[windowKey]) {
        console.log('Log window already open for:', windowKey);
        return;
      }
      
      // Find connection name
      const connection = connections.find(c => c.id === connectionId);
      const connectionName = connection?.name || 'Unknown';
      
      // Initialize the log window
      setLogWindows(prev => ({
        ...prev,
        [windowKey]: {
          connectionId,
          processName,
          processId: processIdentifier,
          connectionName,
          logs: []
        }
      }));
        // First, get recent logs
      const response = await fetch(`/api/remote/${connectionId}/logs/${processIdentifier}`);
      if (response.ok) {
        const data = await response.json();
        const recentLogs: string[] = [];
        if (data.stdout && data.stdout.length > 0) {
          recentLogs.push(...data.stdout.map((line: string) => `[STDOUT] ${line}`));
        }
        if (data.stderr && data.stderr.length > 0) {
          recentLogs.push(...data.stderr.map((line: string) => `[STDERR] ${line}`));
        }
        
        // Update the specific window's logs
        setLogWindows(prev => ({
          ...prev,
          [windowKey]: {
            ...prev[windowKey],
            logs: recentLogs
          }
        }));
      }
        // Subscribe to live logs via socket
      if (socket) {
        console.log('Emitting subscribe-remote-logs with:', { connectionId, processId: processIdentifier });
        socket.emit('subscribe-remote-logs', { 
          connectionId, 
          processId: processIdentifier
        });
        
        console.log('Socket subscription sent, current log windows:', Object.keys(logWindows));
      } else {
        console.error('Socket not available for subscription');
      }
    } catch (error) {
      console.error('Failed to open live logs:', error);
      setError('Failed to open live logs');
    }
  };  const closeLiveLogs = (windowKey: string) => {
    const logWindow = logWindows[windowKey];
    if (socket && logWindow) {
      socket.emit('unsubscribe-remote-logs', {
        connectionId: logWindow.connectionId,
        processId: logWindow.processId
      });
    }
    
    // Remove the log window
    setLogWindows(prev => {
      const newWindows = { ...prev };
      delete newWindows[windowKey];
      return newWindows;
    });
  };

  const clearLogs = (windowKey: string) => {
    setLogWindows(prev => ({
      ...prev,
      [windowKey]: {
        ...prev[windowKey],
        logs: []
      }
    }));
  };
  const handleProcessAction = async (connectionId: string, processName: string, action: string) => {
    try {
      const response = await fetch(`/api/remote/${connectionId}/processes/${processName}/${action}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadProcesses(connectionId);
      } else {
        const errorData = await response.json();
        setError(errorData.error || `Failed to ${action} process`);
      }
    } catch (error) {
      console.error(`Process ${action} failed:`, error);
      setError(`Process ${action} failed`);
    }
  };

  const addConnection = async () => {
    try {
      const response = await fetch('/api/remote/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(connectionForm)
      });

      if (response.ok) {
        await loadConnections();
        setOpenDialog(false);
        setConnectionForm({
          name: '',
          host: '',
          port: 22,
          username: '',
          password: '',
          privateKey: '',
          useSudo: false
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to add connection');
      }
    } catch (error) {
      console.error('Failed to add connection:', error);
      setError('Failed to add connection');
    }
  };

  const openEditDialog = (connection: RemoteConnection) => {
    setEditingConnection(connection);
    setConnectionForm({
      name: connection.name,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: '', // Don't pre-fill password for security
      privateKey: connection.privateKey || '',
      useSudo: connection.useSudo || false
    });
    setOpenDialog(true);
  };

  const updateConnection = async () => {
    if (!editingConnection) return;

    try {
      const response = await fetch(`/api/remote/connections/${editingConnection.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(connectionForm)
      });

      if (response.ok) {
        await loadConnections();
        setOpenDialog(false);
        setEditingConnection(null);
        setConnectionForm({
          name: '',
          host: '',
          port: 22,
          username: '',
          password: '',
          privateKey: '',
          useSudo: false
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update connection');
      }
    } catch (error) {
      console.error('Failed to update connection:', error);
      setError('Failed to update connection');
    }
  };

  const handleDialogClose = () => {
    setOpenDialog(false);
    setEditingConnection(null);
    setConnectionForm({
      name: '',
      host: '',
      port: 22,
      username: '',
      password: '',
      privateKey: '',
      useSudo: false
    });
  };

  const handleDialogSubmit = () => {
    if (editingConnection) {
      updateConnection();
    } else {
      addConnection();
    }
  };

  const deleteConnection = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/remote/connections/${connectionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadConnections();
      }
    } catch (error) {
      console.error('Failed to delete connection:', error);
      setError('Failed to delete connection');
    }
  };

  const toggleConnectionExpansion = (connectionId: string) => {
    setExpandedConnections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(connectionId)) {
        newSet.delete(connectionId);
      } else {
        newSet.add(connectionId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'success';
      case 'stopped': return 'error';
      case 'stopping': return 'warning';
      case 'waiting restart': return 'info';
      case 'launching': return 'info';
      default: return 'default';
    }
  };

  const handleConnectAll = async () => {
    const disconnectedConnections = connections.filter(c => !c.connected);
    for (const conn of disconnectedConnections) {
      await handleConnect(conn.id);
    }
  };

  const handleDisconnectAll = async () => {
    const connectedConnections = connections.filter(c => c.connected);
    for (const conn of connectedConnections) {
      await handleDisconnect(conn.id);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          <CloudIcon sx={{ mr: 2, verticalAlign: 'middle' }} />
          Remote Server Connections
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {connections.some(c => !c.connected) && (
            <Button
              variant="outlined"
              startIcon={<PlayIcon />}
              onClick={handleConnectAll}
              disabled={Object.values(loading).some(l => l)}
            >
              Connect All
            </Button>
          )}
          {connections.some(c => c.connected) && (
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={handleDisconnectAll}
              disabled={Object.values(loading).some(l => l)}
            >
              Disconnect All
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Add Connection
          </Button>
        </Box>
      </Box>

      {/* Info banner for disconnected servers */}
      {connections.length > 0 && !connections.some(c => c.connected) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Remote servers are configured but not connected.</strong> Click the "Connect" button on any server below to establish an SSH connection and manage remote PM2 processes.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {connections.map((connection) => (
          <Grid item xs={12} key={connection.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="h6">{connection.name}</Typography>
                    <Chip
                      label={connection.connected ? 'Connected' : 'Disconnected'}
                      color={connection.connected ? 'success' : 'default'}
                      size="small"
                      sx={{ ml: 2 }}
                    />
                  </Box>
                  <Box>
                    {connection.connected ? (
                      <>
                        <IconButton
                          onClick={() => {
                            loadProcesses(connection.id);
                            loadSystemInfo(connection.id);
                          }}
                          disabled={loading[connection.id]}
                        >
                          <RefreshIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => toggleConnectionExpansion(connection.id)}
                        >
                          {expandedConnections.has(connection.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                        <Button
                          variant="outlined"
                          onClick={() => handleDisconnect(connection.id)}
                          disabled={loading[connection.id]}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="contained"
                        onClick={() => handleConnect(connection.id)}
                        disabled={loading[connection.id]}
                        startIcon={loading[connection.id] ? <CircularProgress size={20} /> : undefined}
                      >
                        Connect
                      </Button>
                    )}
                    <IconButton
                      onClick={() => openEditDialog(connection)}
                      sx={{ ml: 1 }}
                      title="Edit Connection"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => deleteConnection(connection.id)}
                      color="error"
                      sx={{ ml: 1 }}
                      title="Delete Connection"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary">
                  {connection.username}@{connection.host}:{connection.port}
                </Typography>

                <Collapse in={expandedConnections.has(connection.id) && connection.connected}>
                  <Box sx={{ mt: 2 }}>
                    <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                      <Tab label="Processes" />
                      <Tab label="System Info" />
                    </Tabs>

                    <TabPanel value={tabValue} index={0}>
                      {processes[connection.id] && (
                        <TableContainer component={Paper}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>CPU</TableCell>
                                <TableCell>Memory</TableCell>
                                <TableCell>Uptime</TableCell>
                                <TableCell>Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {processes[connection.id].map((process) => (
                                <TableRow key={process.name}>
                                  <TableCell>{process.name}</TableCell>
                                  <TableCell>
                                    <Chip
                                      label={process.status}
                                      color={getStatusColor(process.status) as any}
                                      size="small"
                                    />
                                  </TableCell>
                                  <TableCell>{process.cpu}%</TableCell>
                                  <TableCell>{process.memory}</TableCell>
                                  <TableCell>{process.uptime}</TableCell>
                                  <TableCell>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleProcessAction(connection.id, process.name, 'start')}
                                      disabled={process.status === 'online'}
                                    >
                                      <PlayIcon />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleProcessAction(connection.id, process.name, 'stop')}
                                      disabled={process.status === 'stopped'}
                                    >
                                      <StopIcon />
                                    </IconButton>                                    <IconButton
                                      size="small"
                                      onClick={() => handleProcessAction(connection.id, process.name, 'restart')}
                                    >
                                      <RefreshIcon />
                                    </IconButton>                                    <IconButton
                                      size="small"
                                      onClick={() => handleProcessAction(connection.id, process.name, 'delete')}
                                      color="error"
                                    >
                                      <DeleteIcon />
                                    </IconButton>                                    <IconButton
                                      size="small"
                                      onClick={() => openLiveLogs(connection.id, process.name, process.pm_id)}
                                      color="primary"
                                      title="View Live Logs"
                                    >
                                      <VisibilityIcon />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </TabPanel>

                    <TabPanel value={tabValue} index={1}>
                      {systemInfo[connection.id] && (
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <Typography variant="h6">System Information</Typography>
                            <Typography>Hostname: {systemInfo[connection.id].hostname}</Typography>
                            <Typography>Platform: {systemInfo[connection.id].platform}</Typography>
                            <Typography>Architecture: {systemInfo[connection.id].arch}</Typography>
                            <Typography>Node.js: {systemInfo[connection.id].nodeVersion}</Typography>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Typography variant="h6">Resources</Typography>
                            <Typography>Total Memory: {systemInfo[connection.id].totalMemory}</Typography>
                            <Typography>Free Memory: {systemInfo[connection.id].freeMemory}</Typography>
                            <Typography>CPU Count: {systemInfo[connection.id].cpuCount}</Typography>
                            <Typography>Load Average: {systemInfo[connection.id].loadAverage?.join(', ')}</Typography>
                          </Grid>
                        </Grid>
                      )}
                    </TabPanel>
                  </Box>
                </Collapse>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>      {/* Add/Edit Connection Dialog */}
      <Dialog open={openDialog} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>{editingConnection ? 'Edit Remote Connection' : 'Add Remote Connection'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Connection Name"
                value={connectionForm.name}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Host"
                value={connectionForm.host}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, host: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={connectionForm.port}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, port: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Username"
                value={connectionForm.username}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, username: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={connectionForm.password}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder={editingConnection ? "Leave blank to keep existing password" : ""}
                helperText={editingConnection ? "Leave blank to keep current password" : ""}
              />
            </Grid>
            <Grid item xs={12}>              <TextField
                fullWidth
                label="Private Key (optional)"
                multiline
                rows={4}
                value={connectionForm.privateKey}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, privateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            </Grid>            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={connectionForm.useSudo}
                    onChange={(e) => setConnectionForm(prev => ({ ...prev, useSudo: e.target.checked }))}
                  />
                }
                label="Use sudo for privileged commands (requires password)"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Cancel</Button>
          <Button onClick={handleDialogSubmit} variant="contained">
            {editingConnection ? 'Update Connection' : 'Add Connection'}
          </Button>
        </DialogActions>
      </Dialog>      {/* Multiple Log Chat Taskbars */}
      {Object.entries(logWindows).map(([windowKey, logWindow], index) => (
        <LogChatTaskbar
          key={windowKey}
          connectionId={logWindow.connectionId}
          processId={logWindow.processId}
          processName={logWindow.processName}
          connectionName={logWindow.connectionName}
          logs={logWindow.logs}
          onClose={() => closeLiveLogs(windowKey)}
          onClear={() => clearLogs(windowKey)}
          rightOffset={20 + (index * 420)}
          zIndex={1000 + index}
        />
      ))}
    </Box>
  );
};

export default RemoteConnections;


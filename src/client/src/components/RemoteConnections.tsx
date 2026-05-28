import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
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
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { RemoteConnection, PM2Process, SystemInfo } from '../types/remote';
import { io } from 'socket.io-client';
import LogStatusBar from './LogStatusBar';

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
      {value === index && <Box sx={{ p: 1.5 }}>{children}</Box>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side hybrid encryption helpers
// Uses the server's RSA public key to wrap a one-time AES-256-GCM key,
// then encrypts the plaintext with that AES key.  Nothing sensitive ever
// travels as plain text through the HTTP body.
// ---------------------------------------------------------------------------

interface EncryptedPayload {
  encryptedKey: string; // RSA-OAEP wrapped AES key, base64
  iv: string;           // 12-byte AES-GCM IV, base64
  data: string;         // AES-GCM ciphertext + auth tag, base64
}

const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

async function fetchServerPublicKey(): Promise<CryptoKey> {
  const res = await fetch('/api/remote/public-key');
  if (!res.ok) throw new Error('Could not fetch server public key');
  const { publicKey } = await res.json();
  // Strip PEM headers/newlines → DER bytes
  const pemBody = (publicKey as string)
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    'spki',
    der.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

async function hybridEncrypt(publicKey: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  // Generate a random AES-256-GCM key
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);

  // Wrap the AES key with RSA-OAEP using the server's public key
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawAes
  );

  // Encrypt the plaintext with AES-GCM (WebCrypto appends 16-byte auth tag)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  return {
    encryptedKey: toBase64(encryptedKey),
    iv: toBase64(iv.buffer),
    data: toBase64(encryptedData),
  };
}

async function encryptFormFields(form: {
  password: string;
  privateKey: string;
}): Promise<{ password: EncryptedPayload | undefined; privateKey: EncryptedPayload | undefined }> {
  const publicKey = await fetchServerPublicKey();
  return {
    password: form.password ? await hybridEncrypt(publicKey, form.password) : undefined,
    privateKey: form.privateKey ? await hybridEncrypt(publicKey, form.privateKey) : undefined,
  };
}

const RemoteConnections: React.FC = () => {
  const { t } = useTranslation();
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
      setError(t('remoteConnections.logStreamingError', { error: data.error }));
    });
    
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(t('remoteConnections.failedToLoadConnections'));
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
        // Auto-expand so the user sees processes immediately after connecting
        setExpandedConnections(prev => new Set([...prev, connectionId]));
      } else {
        // Try to parse as JSON, but handle non-JSON responses
        try {
          const errorData = await response.json();
          setError(errorData.error || t('remoteConnections.failedToConnect'));
        } catch (parseError) {
          // If response isn't valid JSON, get text instead
          const errorText = await response.text();
          setError(errorText || t('remoteConnections.failedToConnectInvalidResponse'));
        }
      }
    } catch (error) {
      console.error('Connection failed:', error);
      setError(t('remoteConnections.connectionFailed', { message: error instanceof Error ? error.message : 'Unknown error' }));
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
      setError(t('remoteConnections.disconnectFailed'));
    }
  };

  const loadProcesses = async (connectionId: string) => {
    setLoading(prev => ({ ...prev, [`${connectionId}-processes`]: true }));
    try {
      const response = await fetch(`/api/remote/${connectionId}/processes`);
      if (response.ok) {
        const data = await response.json();
        setProcesses(prev => ({ ...prev, [connectionId]: data }));
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(t('remoteConnections.failedToLoadProcesses', { error: errorData.error || response.statusText }));
        setProcesses(prev => ({ ...prev, [connectionId]: [] }));
      }
    } catch (error) {
      console.error('Failed to load processes:', error);
      setError(t('remoteConnections.failedToLoadProcessesNetwork'));
      setProcesses(prev => ({ ...prev, [connectionId]: [] }));
    } finally {
      setLoading(prev => ({ ...prev, [`${connectionId}-processes`]: false }));
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
      setError(t('remoteConnections.failedToOpenLiveLogs'));
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
        setError(errorData.error || t('remoteConnections.failedToProcessAction', { action }));
      }
    } catch (error) {
      console.error(`Process ${action} failed:`, error);
      setError(t('remoteConnections.processActionFailed', { action }));
    }
  };

  const addConnection = async () => {
    try {
      const encrypted = await encryptFormFields(connectionForm);
      const payload = {
        ...connectionForm,
        password: encrypted.password,
        privateKey: encrypted.privateKey,
      };
      const response = await fetch('/api/remote/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
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
        setError(errorData.error || t('remoteConnections.failedToAddConnection'));
      }
    } catch (error) {
      console.error('Failed to add connection:', error);
      setError(t('remoteConnections.failedToAddConnection'));
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
      const encrypted = await encryptFormFields(connectionForm);
      const payload = {
        ...connectionForm,
        password: encrypted.password,
        privateKey: encrypted.privateKey,
      };
      const response = await fetch(`/api/remote/connections/${editingConnection.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
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
        setError(errorData.error || t('remoteConnections.failedToUpdateConnection'));
      }
    } catch (error) {
      console.error('Failed to update connection:', error);
      setError(t('remoteConnections.failedToUpdateConnection'));
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
      setError(t('remoteConnections.failedToDeleteConnection'));
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
    <Box>
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">{t('remoteConnections.title')}</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t('remoteConnections.subtitle')}</p>
        </div>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {connections.some(c => !c.connected) && (
            <Button variant="outlined" size="small" startIcon={<PlayIcon />}
              onClick={handleConnectAll} disabled={Object.values(loading).some(l => l)}
              sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}>
              {t('remoteConnections.connectAll')}
            </Button>
          )}
          {connections.some(c => c.connected) && (
            <Button variant="outlined" size="small" startIcon={<StopIcon />}
              onClick={handleDisconnectAll} disabled={Object.values(loading).some(l => l)}
              sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}>
              {t('remoteConnections.disconnectAll')}
            </Button>
          )}
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)}
            sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}>
            {t('remoteConnections.addConnection')}
          </Button>
        </Box>
      </div>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={1.5}>
        {connections.length === 0 ? (
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {t('remoteConnections.noConnections')}
              </Typography>
            </Paper>
          </Grid>
        ) : connections.map((connection) => (
          <Grid item xs={12} key={connection.id}>
            <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
              {/* Connection header row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderBottom: expandedConnections.has(connection.id) ? '1px solid' : 'none', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                    {connection.name}
                  </Typography>
                  <Chip
                    label={connection.connected ? t('remoteConnections.connected') : t('remoteConnections.disconnected')}
                    color={connection.connected ? 'success' : 'default'}
                    size="small"
                    sx={{ fontSize: '0.65rem', height: 18 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
                    {connection.username}@{connection.host}:{connection.port}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {connection.connected ? (
                    <>
                      <IconButton size="small"
                        onClick={() => { loadProcesses(connection.id); loadSystemInfo(connection.id); }}
                        disabled={loading[connection.id]}>
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => toggleConnectionExpansion(connection.id)}>
                        {expandedConnections.has(connection.id) ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                      <Button variant="outlined" size="small"
                        onClick={() => handleDisconnect(connection.id)} disabled={loading[connection.id]}
                        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}>
                        {t('remoteConnections.disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="contained" size="small"
                      onClick={() => handleConnect(connection.id)} disabled={loading[connection.id]}
                      startIcon={loading[connection.id] ? <CircularProgress size={12} /> : undefined}
                      sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}>
                      {t('remoteConnections.connect')}
                    </Button>
                  )}
                  <IconButton size="small" onClick={() => openEditDialog(connection)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => deleteConnection(connection.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              {/* Expanded panel */}
              <Collapse in={expandedConnections.has(connection.id) && connection.connected}>
                <Box>
                  <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}
                    sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider', minHeight: 32 }}>
                    <Tab label={t('remoteConnections.tabProcesses')} sx={{ fontSize: '0.7rem', minHeight: 32, py: 0, px: 1.5 }} />
                    <Tab label={t('remoteConnections.tabSystemInfo')} sx={{ fontSize: '0.7rem', minHeight: 32, py: 0, px: 1.5 }} />
                  </Tabs>

                  {/* Processes tab */}
                  <TabPanel value={tabValue} index={0}>
                    {loading[`${connection.id}-processes`] ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : processes[connection.id] === undefined ? (
                      <Typography variant="caption" color="text.secondary">
                        {t('remoteConnections.clickRefreshToLoad')}
                      </Typography>
                    ) : processes[connection.id].length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        {t('remoteConnections.noPm2Processes')}
                      </Typography>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colName')}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colStatus')}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colCpu')}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colMemory')}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colUptime')}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.5 }}>{t('remoteConnections.colActions')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {processes[connection.id].map((process) => (
                            <TableRow key={process.name}>
                              <TableCell sx={{ py: 0.5 }}>
                                <Typography variant="caption" fontWeight={500}>{process.name}</Typography>
                              </TableCell>
                              <TableCell sx={{ py: 0.5 }}>
                                <Chip label={process.status} color={getStatusColor(process.status) as any} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                              </TableCell>
                              <TableCell sx={{ py: 0.5 }}><Typography variant="caption">{process.cpu}%</Typography></TableCell>
                              <TableCell sx={{ py: 0.5 }}><Typography variant="caption">{process.memory}</Typography></TableCell>
                              <TableCell sx={{ py: 0.5 }}><Typography variant="caption">{process.uptime}</Typography></TableCell>
                              <TableCell sx={{ py: 0.5 }}>
                                {process.status === 'online' ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    startIcon={<StopIcon fontSize="small" />}
                                    onClick={() => handleProcessAction(connection.id, process.name, 'stop')}
                                    sx={{ mr: 0.5, fontSize: '0.65rem', py: 0.25, px: 0.75 }}
                                  >
                                     {t('actions.stop')}
                                  </Button>
                                ) : (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="success"
                                    startIcon={<PlayIcon fontSize="small" />}
                                    onClick={() => handleProcessAction(connection.id, process.name, 'start')}
                                    sx={{ mr: 0.5, fontSize: '0.65rem', py: 0.25, px: 0.75 }}
                                  >
                                     {t('actions.start')}
                                  </Button>
                                )}
                                <IconButton size="small" onClick={() => handleProcessAction(connection.id, process.name, 'restart')}>
                                  <RefreshIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleProcessAction(connection.id, process.name, 'delete')}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" color="primary" onClick={() => openLiveLogs(connection.id, process.name, process.pm_id)}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabPanel>

                  {/* System info tab */}
                  <TabPanel value={tabValue} index={1}>
                    {systemInfo[connection.id] ? (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="caption" sx={{ fontWeight: 700, mb: 1, display: 'block' }}>{t('remoteConnections.systemInformation')}</Typography>
                          {[
                            [t('remoteConnections.hostname'),     systemInfo[connection.id].hostname],
                            [t('remoteConnections.platform'),     systemInfo[connection.id].platform],
                            [t('remoteConnections.architecture'), systemInfo[connection.id].arch],
                            [t('remoteConnections.nodeJs'),      systemInfo[connection.id].nodeVersion],
                          ].map(([label, value]) => (
                            <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>{label}:</Typography>
                              <Typography variant="caption">{value}</Typography>
                            </Box>
                          ))}
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="caption" sx={{ fontWeight: 700, mb: 1, display: 'block' }}>{t('remoteConnections.resources')}</Typography>
                          {[
                            [t('remoteConnections.totalMemory'), systemInfo[connection.id].totalMemory],
                            [t('remoteConnections.freeMemory'),  systemInfo[connection.id].freeMemory],
                            [t('remoteConnections.cpuCount'),    systemInfo[connection.id].cpuCount],
                            [t('remoteConnections.loadAverage'), systemInfo[connection.id].loadAverage?.join(', ')],
                          ].map(([label, value]) => (
                            <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>{label}:</Typography>
                              <Typography variant="caption">{value}</Typography>
                            </Box>
                          ))}
                        </Grid>
                      </Grid>
                    ) : (
                      <Typography variant="caption" color="text.secondary">{t('remoteConnections.noSystemInfo')}</Typography>
                    )}
                  </TabPanel>
                </Box>
              </Collapse>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Add/Edit Connection Dialog */}
      <Dialog open={openDialog} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '0.875rem', py: 1.5 }}>{editingConnection ? t('remoteConnections.editRemoteConnection') : t('remoteConnections.addRemoteConnection')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.connectionName')}
                value={connectionForm.name}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label={t('remoteConnections.host')}
                value={connectionForm.host}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, host: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('remoteConnections.port')}
                type="number"
                value={connectionForm.port}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, port: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.username')}
                value={connectionForm.username}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, username: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.password')}
                type="password"
                value={connectionForm.password}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder={editingConnection ? t('remoteConnections.passwordPlaceholder') : ""}
                helperText={editingConnection ? t('remoteConnections.leaveBlankCurrent') : ""}
              />
            </Grid>
            <Grid item xs={12}>              <TextField
                fullWidth
                label={t('remoteConnections.privateKey')}
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
                label={t('remoteConnections.useSudo')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} size="small" sx={{ fontSize: '0.75rem' }}>{t('common.cancel')}</Button>
          <Button onClick={handleDialogSubmit} variant="contained" size="small" sx={{ fontSize: '0.75rem' }}>
            {editingConnection ? t('remoteConnections.updateConnection') : t('remoteConnections.addConnection')}
          </Button>
        </DialogActions>
      </Dialog>      {/* VS Code-style log status bar — renders all active log sessions as tabs */}
      <LogStatusBar
        logWindows={logWindows}
        onClose={closeLiveLogs}
        onClear={clearLogs}
      />
    </Box>
  );
};

export default RemoteConnections;


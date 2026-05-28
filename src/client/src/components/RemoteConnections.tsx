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

// @group Types : Component prop interfaces

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

// @group Encryption : Client-side hybrid encryption helpers
// Uses the server's RSA public key to wrap a one-time AES-256-GCM key,
// then encrypts the plaintext with that AES key. Nothing sensitive ever
// travels as plain text through the HTTP body.

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
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);

  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawAes
  );

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

// @group Constants : CLI design tokens for MUI sx props

const CLI_MONO = 'JetBrains Mono, monospace';

const sxTextField = {
  '& .MuiInputBase-root': { fontFamily: CLI_MONO, fontSize: '0.625rem', backgroundColor: '#0d0d0d', borderRadius: '2px' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1e1e1e' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#333' },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
  '& input': { color: '#e8e8e8', fontFamily: CLI_MONO },
  '& textarea': { color: '#e8e8e8', fontFamily: CLI_MONO },
  '& .MuiInputLabel-root': { fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#555' },
  '& .MuiFormHelperText-root': { fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#555' },
};

const sxBtnPrimary = {
  fontFamily: 'inherit',
  fontSize: '0.625rem',
  textTransform: 'none',
  backgroundColor: '#e8e8e8',
  color: '#0a0a0a',
  borderRadius: '2px',
  '&:hover': { backgroundColor: '#ccc' },
  boxShadow: 'none',
  '&:active': { boxShadow: 'none' },
  py: 0.5,
  px: 2,
};

const sxBtnOutlined = {
  fontFamily: 'inherit',
  fontSize: '0.625rem',
  textTransform: 'none',
  color: '#888',
  borderColor: '#333',
  borderRadius: '2px',
  '&:hover': { borderColor: '#555', backgroundColor: 'transparent' },
  py: 0.5,
  px: 2,
};

const sxBtnDanger = {
  fontFamily: 'inherit',
  fontSize: '0.625rem',
  textTransform: 'none',
  color: '#ef4444',
  borderColor: '#ef4444',
  borderRadius: '2px',
  borderWidth: 1,
  borderStyle: 'solid',
  backgroundColor: 'transparent',
  '&:hover': { backgroundColor: '#1a0000' },
  py: 0.5,
  px: 2,
};

const sxBtnSuccess = {
  fontFamily: 'inherit',
  fontSize: '0.625rem',
  textTransform: 'none',
  color: '#22c55e',
  borderColor: '#22c55e',
  borderRadius: '2px',
  borderWidth: 1,
  borderStyle: 'solid',
  backgroundColor: 'transparent',
  '&:hover': { backgroundColor: '#001a0a' },
  py: 0.5,
  px: 2,
};

const sxTableCellHead = {
  fontFamily: CLI_MONO,
  fontSize: '0.5625rem',
  color: '#444',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.15em',
  borderBottom: '1px solid #1e1e1e',
  py: 1,
  px: 2,
};

const sxTableCellBody = {
  fontFamily: CLI_MONO,
  fontSize: '0.625rem',
  color: '#888',
  borderBottom: '1px solid #111',
  py: 1,
  px: 2,
};

// @group Utilities : Status colour helpers

const getStatusChipSx = (status: string) => {
  const base = {
    fontFamily: CLI_MONO,
    fontSize: '0.5625rem',
    height: 16,
    borderRadius: '2px',
    border: '1px solid',
  };
  switch (status) {
    case 'online':          return { ...base, backgroundColor: '#0a1f0a', color: '#22c55e', borderColor: '#22c55e' };
    case 'stopped':         return { ...base, backgroundColor: '#1a0000', color: '#ef4444', borderColor: '#ef4444' };
    case 'stopping':        return { ...base, backgroundColor: '#1a1000', color: '#f59e0b', borderColor: '#f59e0b' };
    case 'waiting restart': return { ...base, backgroundColor: '#0a0f1a', color: '#22d3ee', borderColor: '#22d3ee' };
    case 'launching':       return { ...base, backgroundColor: '#0a0f1a', color: '#22d3ee', borderColor: '#22d3ee' };
    default:                return { ...base, backgroundColor: '#1a1a1a', color: '#888',    borderColor: '#333'    };
  }
};

const getConnectedChipSx = (connected: boolean) => ({
  fontFamily: CLI_MONO,
  fontSize: '0.5625rem',
  height: 16,
  borderRadius: '2px',
  backgroundColor: connected ? '#0a1f0a' : '#1a1a1a',
  color: connected ? '#22c55e' : '#555',
  border: `1px solid ${connected ? '#22c55e' : '#333'}`,
});

// @group Component : RemoteConnections main component

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

  // @group State : Multiple log windows support
  const [logWindows, setLogWindows] = useState<{ [key: string]: {
    connectionId: string;
    processName: string;
    processId: string;
    connectionName: string;
    logs: string[];
  } }>({});
  const [socket, setSocket] = useState<any>(null);

  // @group State : New/Edit connection form state
  const [connectionForm, setConnectionForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    useSudo: false
  });

  // @group Lifecycle : Socket and data initialisation
  useEffect(() => {
    loadConnections();

    const newSocket = io();
    setSocket(newSocket);

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

  // @group DataFetching : Connection and process data loaders

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
      const response = await fetch(`/api/remote/${connectionId}/connect`, { method: 'POST' });

      if (response.ok) {
        await loadProcesses(connectionId);
        await loadSystemInfo(connectionId);
        setConnections(prev =>
          prev.map(conn => conn.id === connectionId ? { ...conn, connected: true } : conn)
        );
        setExpandedConnections(prev => new Set([...prev, connectionId]));
      } else {
        try {
          const errorData = await response.json();
          setError(errorData.error || t('remoteConnections.failedToConnect'));
        } catch (parseError) {
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
      const response = await fetch(`/api/remote/${connectionId}/disconnect`, { method: 'POST' });

      if (response.ok) {
        setConnections(prev =>
          prev.map(conn => conn.id === connectionId ? { ...conn, connected: false } : conn)
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
  };

  // @group LogHandlers : Live log window management

  const openLiveLogs = async (connectionId: string, processName: string, processId?: number) => {
    try {
      const processIdentifier = processId !== undefined ? processId.toString() : processName;
      const windowKey = `${connectionId}-${processIdentifier}`;

      if (logWindows[windowKey]) {
        console.log('Log window already open for:', windowKey);
        return;
      }

      const connection = connections.find(c => c.id === connectionId);
      const connectionName = connection?.name || 'Unknown';

      setLogWindows(prev => ({
        ...prev,
        [windowKey]: { connectionId, processName, processId: processIdentifier, connectionName, logs: [] }
      }));

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
        setLogWindows(prev => ({
          ...prev,
          [windowKey]: { ...prev[windowKey], logs: recentLogs }
        }));
      }

      if (socket) {
        console.log('Emitting subscribe-remote-logs with:', { connectionId, processId: processIdentifier });
        socket.emit('subscribe-remote-logs', { connectionId, processId: processIdentifier });
        console.log('Socket subscription sent, current log windows:', Object.keys(logWindows));
      } else {
        console.error('Socket not available for subscription');
      }
    } catch (error) {
      console.error('Failed to open live logs:', error);
      setError(t('remoteConnections.failedToOpenLiveLogs'));
    }
  };

  const closeLiveLogs = (windowKey: string) => {
    const logWindow = logWindows[windowKey];
    if (socket && logWindow) {
      socket.emit('unsubscribe-remote-logs', {
        connectionId: logWindow.connectionId,
        processId: logWindow.processId
      });
    }
    setLogWindows(prev => {
      const newWindows = { ...prev };
      delete newWindows[windowKey];
      return newWindows;
    });
  };

  const clearLogs = (windowKey: string) => {
    setLogWindows(prev => ({
      ...prev,
      [windowKey]: { ...prev[windowKey], logs: [] }
    }));
  };

  // @group ProcessHandlers : PM2 process action handlers

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

  // @group ConnectionCRUD : Add, edit, update, delete connection handlers

  const addConnection = async () => {
    try {
      const encrypted = await encryptFormFields(connectionForm);
      const payload = { ...connectionForm, password: encrypted.password, privateKey: encrypted.privateKey };
      const response = await fetch('/api/remote/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await loadConnections();
        setOpenDialog(false);
        setConnectionForm({ name: '', host: '', port: 22, username: '', password: '', privateKey: '', useSudo: false });
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
      password: '',
      privateKey: connection.privateKey || '',
      useSudo: connection.useSudo || false
    });
    setOpenDialog(true);
  };

  const updateConnection = async () => {
    if (!editingConnection) return;

    try {
      const encrypted = await encryptFormFields(connectionForm);
      const payload = { ...connectionForm, password: encrypted.password, privateKey: encrypted.privateKey };
      const response = await fetch(`/api/remote/connections/${editingConnection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await loadConnections();
        setOpenDialog(false);
        setEditingConnection(null);
        setConnectionForm({ name: '', host: '', port: 22, username: '', password: '', privateKey: '', useSudo: false });
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
    setConnectionForm({ name: '', host: '', port: 22, username: '', password: '', privateKey: '', useSudo: false });
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
      const response = await fetch(`/api/remote/connections/${connectionId}`, { method: 'DELETE' });
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

  // @group Render : Main component render

  return (
    <Box sx={{ backgroundColor: '#0a0a0a', minHeight: '100%' }}>

      {/* @group Render > Header : Page header with actions */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1e1e1e]">
        <div>
          <h1 className="font-mono text-xs font-semibold text-[#e8e8e8] leading-tight tracking-wide">
            ▸ {t('remoteConnections.title').toUpperCase()}
          </h1>
          <p className="font-mono text-[0.625rem] text-[#555] mt-0.5">{t('remoteConnections.subtitle')}</p>
        </div>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {connections.some(c => !c.connected) && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayIcon sx={{ fontSize: '0.75rem !important' }} />}
              onClick={handleConnectAll}
              disabled={Object.values(loading).some(l => l)}
              sx={sxBtnSuccess}
            >
              {t('remoteConnections.connectAll')}
            </Button>
          )}
          {connections.some(c => c.connected) && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<StopIcon sx={{ fontSize: '0.75rem !important' }} />}
              onClick={handleDisconnectAll}
              disabled={Object.values(loading).some(l => l)}
              sx={sxBtnDanger}
            >
              {t('remoteConnections.disconnectAll')}
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: '0.75rem !important' }} />}
            onClick={() => setOpenDialog(true)}
            sx={sxBtnPrimary}
          >
            {t('remoteConnections.addConnection')}
          </Button>
        </Box>
      </div>

      {/* @group Render > ErrorBanner : Error alert */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            mb: 2,
            backgroundColor: '#1a0000',
            color: '#ef4444',
            border: '1px solid #3a0000',
            borderRadius: '2px',
            fontFamily: CLI_MONO,
            fontSize: '0.625rem',
            '& .MuiAlert-icon': { color: '#ef4444' },
          }}
        >
          {error}
        </Alert>
      )}

      {/* @group Render > ConnectionList : Connection cards */}
      <Grid container spacing={1}>
        {connections.length === 0 ? (
          <Grid item xs={12}>
            <Paper
              variant="outlined"
              sx={{ p: 3, textAlign: 'center', backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '2px' }}
            >
              <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#555' }}>
                {t('remoteConnections.noConnections')}
              </Typography>
            </Paper>
          </Grid>
        ) : connections.map((connection) => (
          <Grid item xs={12} key={connection.id}>
            <Paper
              variant="outlined"
              sx={{ p: 0, overflow: 'hidden', backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '2px' }}
            >
              {/* Connection header row */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                borderBottom: expandedConnections.has(connection.id) ? '1px solid #1e1e1e' : 'none',
                backgroundColor: '#141414',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                  {/* Status dot */}
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: connection.connected ? '#22c55e' : '#555',
                    flexShrink: 0,
                    display: 'inline-block',
                  }} />
                  <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.6875rem', color: '#e8e8e8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {connection.name}
                  </Typography>
                  <Chip
                    label={connection.connected ? t('remoteConnections.connected') : t('remoteConnections.disconnected')}
                    size="small"
                    sx={getConnectedChipSx(connection.connected)}
                  />
                  <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#555', whiteSpace: 'nowrap' }}>
                    {connection.username}@{connection.host}:{connection.port}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {connection.connected ? (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => { loadProcesses(connection.id); loadSystemInfo(connection.id); }}
                        disabled={loading[connection.id]}
                        sx={{ color: '#555', '&:hover': { color: '#888', backgroundColor: 'transparent' } }}
                      >
                        <RefreshIcon sx={{ fontSize: '0.875rem' }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => toggleConnectionExpansion(connection.id)}
                        sx={{ color: '#555', '&:hover': { color: '#888', backgroundColor: 'transparent' } }}
                      >
                        {expandedConnections.has(connection.id)
                          ? <ExpandLessIcon sx={{ fontSize: '0.875rem' }} />
                          : <ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />}
                      </IconButton>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleDisconnect(connection.id)}
                        disabled={loading[connection.id]}
                        sx={sxBtnOutlined}
                      >
                        {t('remoteConnections.disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleConnect(connection.id)}
                      disabled={loading[connection.id]}
                      startIcon={loading[connection.id] ? <CircularProgress size={10} sx={{ color: '#0a0a0a' }} /> : undefined}
                      sx={sxBtnPrimary}
                    >
                      {t('remoteConnections.connect')}
                    </Button>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => openEditDialog(connection)}
                    sx={{ color: '#555', '&:hover': { color: '#888', backgroundColor: 'transparent' } }}
                  >
                    <EditIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => deleteConnection(connection.id)}
                    sx={{ color: '#555', '&:hover': { color: '#ef4444', backgroundColor: 'transparent' } }}
                  >
                    <DeleteIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                </Box>
              </Box>

              {/* @group Render > ExpandedPanel : Processes and system info tabs */}
              <Collapse in={expandedConnections.has(connection.id) && connection.connected}>
                <Box sx={{ backgroundColor: '#111' }}>
                  <Tabs
                    value={tabValue}
                    onChange={(_, v) => setTabValue(v)}
                    TabIndicatorProps={{ style: { backgroundColor: '#22c55e', height: 1 } }}
                    sx={{ minHeight: 28, borderBottom: '1px solid #1e1e1e', backgroundColor: '#0d0d0d' }}
                  >
                    <Tab
                      label={t('remoteConnections.tabProcesses')}
                      sx={{ minHeight: 28, fontSize: '0.625rem', textTransform: 'none', fontFamily: CLI_MONO, color: '#555', py: 0, px: 2, '&.Mui-selected': { color: '#e8e8e8' } }}
                    />
                    <Tab
                      label={t('remoteConnections.tabSystemInfo')}
                      sx={{ minHeight: 28, fontSize: '0.625rem', textTransform: 'none', fontFamily: CLI_MONO, color: '#555', py: 0, px: 2, '&.Mui-selected': { color: '#e8e8e8' } }}
                    />
                  </Tabs>

                  {/* Processes tab */}
                  <TabPanel value={tabValue} index={0}>
                    {loading[`${connection.id}-processes`] ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={16} sx={{ color: '#22c55e' }} />
                      </Box>
                    ) : processes[connection.id] === undefined ? (
                      <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#555' }}>
                        {t('remoteConnections.clickRefreshToLoad')}
                      </Typography>
                    ) : processes[connection.id].length === 0 ? (
                      <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#555' }}>
                        {t('remoteConnections.noPm2Processes')}
                      </Typography>
                    ) : (
                      <Table size="small" sx={{ backgroundColor: '#111' }}>
                        <TableHead sx={{ backgroundColor: '#0d0d0d' }}>
                          <TableRow>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colName')}</TableCell>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colStatus')}</TableCell>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colCpu')}</TableCell>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colMemory')}</TableCell>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colUptime')}</TableCell>
                            <TableCell sx={sxTableCellHead}>{t('remoteConnections.colActions')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {processes[connection.id].map((process) => (
                            <TableRow key={process.name} sx={{ '&:hover': { backgroundColor: '#141414' } }}>
                              <TableCell sx={sxTableCellBody}>
                                <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#e8e8e8', fontWeight: 500 }}>
                                  {process.name}
                                </Typography>
                              </TableCell>
                              <TableCell sx={sxTableCellBody}>
                                <Chip
                                  label={process.status}
                                  size="small"
                                  sx={getStatusChipSx(process.status)}
                                />
                              </TableCell>
                              <TableCell sx={sxTableCellBody}>{process.cpu}%</TableCell>
                              <TableCell sx={sxTableCellBody}>{process.memory}</TableCell>
                              <TableCell sx={sxTableCellBody}>{process.uptime}</TableCell>
                              <TableCell sx={{ ...sxTableCellBody, whiteSpace: 'nowrap' }}>
                                {process.status === 'online' ? (
                                  <Button
                                    size="small"
                                    startIcon={<StopIcon sx={{ fontSize: '0.75rem !important' }} />}
                                    onClick={() => handleProcessAction(connection.id, process.name, 'stop')}
                                    sx={{ ...sxBtnDanger, mr: 0.5 }}
                                  >
                                    {t('actions.stop')}
                                  </Button>
                                ) : (
                                  <Button
                                    size="small"
                                    startIcon={<PlayIcon sx={{ fontSize: '0.75rem !important' }} />}
                                    onClick={() => handleProcessAction(connection.id, process.name, 'start')}
                                    sx={{ ...sxBtnSuccess, mr: 0.5 }}
                                  >
                                    {t('actions.start')}
                                  </Button>
                                )}
                                <IconButton
                                  size="small"
                                  onClick={() => handleProcessAction(connection.id, process.name, 'restart')}
                                  sx={{ color: '#555', '&:hover': { color: '#f59e0b', backgroundColor: 'transparent' } }}
                                >
                                  <RefreshIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleProcessAction(connection.id, process.name, 'delete')}
                                  sx={{ color: '#555', '&:hover': { color: '#ef4444', backgroundColor: 'transparent' } }}
                                >
                                  <DeleteIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => openLiveLogs(connection.id, process.name, process.pm_id)}
                                  sx={{ color: '#555', '&:hover': { color: '#22d3ee', backgroundColor: 'transparent' } }}
                                >
                                  <VisibilityIcon sx={{ fontSize: '0.875rem' }} />
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
                          <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', mb: 1, display: 'block' }}>
                            {t('remoteConnections.systemInformation')}
                          </Typography>
                          {[
                            [t('remoteConnections.hostname'),     systemInfo[connection.id].hostname],
                            [t('remoteConnections.platform'),     systemInfo[connection.id].platform],
                            [t('remoteConnections.architecture'), systemInfo[connection.id].arch],
                            [t('remoteConnections.nodeJs'),      systemInfo[connection.id].nodeVersion],
                          ].map(([label, value]) => (
                            <Box key={label} sx={{ display: 'flex', gap: 1.5, mb: 0.5 }}>
                              <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#555', minWidth: 90 }}>{label}:</Typography>
                              <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#888' }}>{value}</Typography>
                            </Box>
                          ))}
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', mb: 1, display: 'block' }}>
                            {t('remoteConnections.resources')}
                          </Typography>
                          {[
                            [t('remoteConnections.totalMemory'), systemInfo[connection.id].totalMemory],
                            [t('remoteConnections.freeMemory'),  systemInfo[connection.id].freeMemory],
                            [t('remoteConnections.cpuCount'),    systemInfo[connection.id].cpuCount],
                            [t('remoteConnections.loadAverage'), systemInfo[connection.id].loadAverage?.join(', ')],
                          ].map(([label, value]) => (
                            <Box key={label} sx={{ display: 'flex', gap: 1.5, mb: 0.5 }}>
                              <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#555', minWidth: 90 }}>{label}:</Typography>
                              <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.5625rem', color: '#888' }}>{value}</Typography>
                            </Box>
                          ))}
                        </Grid>
                      </Grid>
                    ) : (
                      <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#555' }}>
                        {t('remoteConnections.noSystemInfo')}
                      </Typography>
                    )}
                  </TabPanel>
                </Box>
              </Collapse>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* @group Render > Dialog : Add/Edit Connection Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleDialogClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '2px', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ fontFamily: CLI_MONO, fontSize: '0.75rem', color: '#e8e8e8', fontWeight: 600, borderBottom: '1px solid #1e1e1e', py: 1.5 }}>
          {editingConnection ? t('remoteConnections.editRemoteConnection') : t('remoteConnections.addRemoteConnection')}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#111', pt: '16px !important' }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.connectionName')}
                value={connectionForm.name}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, name: e.target.value }))}
                size="small"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label={t('remoteConnections.host')}
                value={connectionForm.host}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, host: e.target.value }))}
                size="small"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('remoteConnections.port')}
                type="number"
                value={connectionForm.port}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                size="small"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.username')}
                value={connectionForm.username}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, username: e.target.value }))}
                size="small"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.password')}
                type="password"
                value={connectionForm.password}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder={editingConnection ? t('remoteConnections.passwordPlaceholder') : ''}
                helperText={editingConnection ? t('remoteConnections.leaveBlankCurrent') : ''}
                size="small"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('remoteConnections.privateKey')}
                multiline
                rows={4}
                value={connectionForm.privateKey}
                onChange={(e) => setConnectionForm(prev => ({ ...prev, privateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                sx={sxTextField}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={connectionForm.useSudo}
                    onChange={(e) => setConnectionForm(prev => ({ ...prev, useSudo: e.target.checked }))}
                    size="small"
                    sx={{
                      color: '#333',
                      '&.Mui-checked': { color: '#22c55e' },
                      '& .MuiSvgIcon-root': { fontSize: '0.875rem' },
                    }}
                  />
                }
                label={
                  <Typography sx={{ fontFamily: CLI_MONO, fontSize: '0.625rem', color: '#888' }}>
                    {t('remoteConnections.useSudo')}
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #1e1e1e', px: 2, py: 1.5, backgroundColor: '#111', gap: 1 }}>
          <Button onClick={handleDialogClose} size="small" sx={sxBtnOutlined}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDialogSubmit} size="small" sx={sxBtnPrimary}>
            {editingConnection ? t('remoteConnections.updateConnection') : t('remoteConnections.addConnection')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* @group Render > LogStatusBar : VS Code-style log status bar */}
      <LogStatusBar
        logWindows={logWindows}
        onClose={closeLiveLogs}
        onClear={clearLogs}
      />
    </Box>
  );
};

export default RemoteConnections;

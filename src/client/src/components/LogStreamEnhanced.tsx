import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  IconButton,
  Divider,
  CircularProgress,
  useTheme,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Clear as ClearIcon,
  Download as DownloadIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import axios from 'axios';
import { io } from 'socket.io-client';

interface LogStreamEnhancedProps {
  processId?: number | string;
  logType?: 'out' | 'err';
}

const LogStreamEnhanced: React.FC<LogStreamEnhancedProps> = ({ processId: propProcessId, logType: propLogType = 'out' }) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const processId = params.id ? Number(params.id) : propProcessId ? Number(propProcessId) : null;
  const theme = useTheme();
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followLogs, setFollowLogs] = useState(true);
  const [filter, setFilter] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableProcesses, setAvailableProcesses] = useState<{id: number, name: string}[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<number | null>(processId);
  const [selectedLogType, setSelectedLogType] = useState<'out' | 'err'>(propLogType as 'out' | 'err');
  
  const socketRef = useRef<any>(null);

  // Fetch available processes
  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const response = await axios.get('/api/processes');
        const processes = response.data.map((p: any) => ({ 
          id: p.pm_id, 
          name: p.name 
        }));
        
        setAvailableProcesses(processes);
        
        if (!processId && processes.length > 0) {
          setSelectedProcess(processes[0].id);
        }
      } catch (err) {
        setError('Failed to fetch available processes');
      }
    };
    
    fetchProcesses();
  }, [processId]);

  // Setup log streaming socket connection
  useEffect(() => {
    if (!selectedProcess) return;
    
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/logs/${selectedProcess}/${selectedLogType}`);
        setLogs(response.data.logs || []);
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch logs');
        setLoading(false);
      }
    };
    
    fetchLogs();
    
    // Set up socket connection for real-time logs
    const socket = io();
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('subscribe-logs', { 
        processId: selectedProcess, 
        logType: selectedLogType 
      });
      setIsStreaming(true);
    });
    
    socket.on('log-line', (data) => {
      if (data.processId === selectedProcess && data.logType === selectedLogType) {
        setLogs(prev => [...prev, data.line]);
      }
    });
    
    return () => {
      if (socket) {
        socket.emit('unsubscribe-logs', { 
          processId: selectedProcess, 
          logType: selectedLogType 
        });
        socket.disconnect();
      }
    };
  }, [selectedProcess, selectedLogType]);

  // Auto-scroll when logs change
  useEffect(() => {
    if (followLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, followLogs]);

  const handleProcessChange = (event: SelectChangeEvent) => {
    const newProcessId = Number(event.target.value);
    setSelectedProcess(newProcessId);
    navigate(`/logs/${newProcessId}`);
  };

  const handleLogTypeChange = (event: SelectChangeEvent) => {
    setSelectedLogType(event.target.value as 'out' | 'err');
  };

  const toggleStreaming = () => {
    if (!selectedProcess) return;
    
    if (isStreaming) {
      // Stop streaming
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe-logs', { 
          processId: selectedProcess, 
          logType: selectedLogType 
        });
      }
    } else {
      // Start streaming
      if (socketRef.current) {
        socketRef.current.emit('subscribe-logs', { 
          processId: selectedProcess, 
          logType: selectedLogType 
        });
      }
    }
    setIsStreaming(!isStreaming);
  };

  const refreshLogs = async () => {
    if (!selectedProcess) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`/api/logs/${selectedProcess}/${selectedLogType}`);
      setLogs(response.data.logs || []);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch logs');
      setLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    if (!selectedProcess) return;
    
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const processName = availableProcesses.find(p => p.id === selectedProcess)?.name || selectedProcess;
    const filename = `${processName}-${selectedLogType}.log`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = filter
    ? logs.filter(log => log.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: { xs: 2, md: 0 }}}>
            Log Streaming
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <FormControl sx={{ minWidth: 150 }} size="small">
              <InputLabel>Process</InputLabel>
              <Select
                value={selectedProcess?.toString() || ''}
                onChange={handleProcessChange}
                label="Process"
                disabled={availableProcesses.length === 0}
              >
                {availableProcesses.map(process => (
                  <MenuItem key={process.id} value={process.id}>
                    {process.name} (ID: {process.id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <FormControl sx={{ minWidth: 120 }} size="small">
              <InputLabel>Log Type</InputLabel>
              <Select
                value={selectedLogType}
                onChange={handleLogTypeChange}
                label="Log Type"
              >
                <MenuItem value="out">Standard</MenuItem>
                <MenuItem value="err">Error</MenuItem>
              </Select>
            </FormControl>
            
            <Button
              variant="outlined"
              size="small"
              color={isStreaming ? 'error' : 'primary'}
              onClick={toggleStreaming}
              disabled={!selectedProcess}
            >
              {isStreaming ? 'Stop' : 'Start'} Stream
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', mb: 2, gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
            <TextField
              fullWidth
              size="small"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={followLogs}
                  onChange={(e) => setFollowLogs(e.target.checked)}
                  color="primary"
                />
              }
              label="Auto-scroll"
            />
            
            <IconButton onClick={refreshLogs} size="small">
              <RefreshIcon />
            </IconButton>
            <IconButton onClick={clearLogs} size="small">
              <ClearIcon />
            </IconButton>
            <IconButton onClick={downloadLogs} size="small" disabled={!selectedProcess || logs.length === 0}>
              <DownloadIcon />
            </IconButton>
          </Box>
        </Box>
        
        <Divider />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        ) : !selectedProcess ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <Typography variant="body1" color="text.secondary">
              Please select a process to view logs
            </Typography>
          </Box>
        ) : (
          <Box
            ref={logContainerRef}
            sx={{
              mt: 2,
              height: '400px',
              overflowY: 'auto',
              backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {filteredLogs.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No logs available
              </Typography>
            ) : (
              filteredLogs.map((log, index) => (
                <Box 
                  key={index}
                  component="div"
                  sx={{ 
                    mb: 0.5,
                    color: selectedLogType === 'err' || log.toLowerCase().includes('error') 
                      ? 'error.main' 
                      : log.toLowerCase().includes('warn') 
                        ? 'warning.main'
                        : 'text.primary'
                  }}
                >
                  {log}
                </Box>
              ))
            )}
            
            {isStreaming && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Streaming logs...
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default LogStreamEnhanced;

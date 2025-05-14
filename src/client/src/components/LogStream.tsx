import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
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

interface LogStreamProps {
  processId?: number | string;
  logType?: 'out' | 'err';
}

const LogStream: React.FC<LogStreamProps> = ({ processId: propProcessId, logType = 'out' }) => {
  const params = useParams<{ id: string }>();
  const processId = propProcessId || Number(params.id);
  const theme = useTheme();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followLogs, setFollowLogs] = useState(true);
  const [filter, setFilter] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    fetchLogs();
    
    // Set up socket connection for real-time logs
    const socket = io();
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('subscribe-logs', { processId, logType });
    });
    
    socket.on('log-line', (data) => {
      if (data.processId === processId && data.logType === logType) {
        setLogs(prev => [...prev, data.line]);
        if (followLogs && logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }
    });
    
    return () => {
      // Clean up socket connection
      if (socket) {
        socket.off('log-line');
        socket.emit('unsubscribe-logs', { processId, logType });
        socket.disconnect();
      }
    };
  }, [processId, logType]);

  useEffect(() => {
    // Auto-scroll when followLogs is true
    if (followLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, followLogs]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/logs/${processId}/${logType}`);
      setLogs(response.data.logs || []);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch logs');
      setLoading(false);
    }
  };

  const toggleStreaming = () => {
    if (isStreaming) {
      // Stop streaming
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe-logs', { processId, logType });
      }
    } else {
      // Start streaming
      if (socketRef.current) {
        socketRef.current.emit('subscribe-logs', { processId, logType });
      }
    }
    setIsStreaming(!isStreaming);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${processId}-${logType}.log`;
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {logType === 'out' ? 'Standard Output' : 'Error Output'} Logs
          </Typography>
          <Box>
            <Button
              variant="outlined"
              size="small"
              color={isStreaming ? 'error' : 'primary'}
              onClick={toggleStreaming}
              sx={{ mr: 1 }}
            >
              {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
            </Button>
            <IconButton onClick={fetchLogs} size="small" sx={{ mr: 1 }}>
              <RefreshIcon />
            </IconButton>
            <IconButton onClick={clearLogs} size="small" sx={{ mr: 1 }}>
              <ClearIcon />
            </IconButton>
            <IconButton onClick={downloadLogs} size="small">
              <DownloadIcon />
            </IconButton>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 2 }}>
            <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
            <TextField
              fullWidth
              size="small"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Box>
          
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
        </Box>
        
        <Divider />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
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
                    color: logType === 'err' && log.toLowerCase().includes('error') 
                      ? 'error.main' 
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

export default LogStream;

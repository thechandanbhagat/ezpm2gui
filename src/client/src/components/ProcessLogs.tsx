import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LogEntry } from '../types/pm2';
import { 
  Box,
  Button, 
  ButtonGroup, 
  CircularProgress, 
  FormControlLabel,
  Checkbox,
  Paper,
  Stack,
  Typography,
  Alert
} from '@mui/material';

interface ProcessLogsProps {
  processId: number;
  processName: string;
}

const ProcessLogs: React.FC<ProcessLogsProps> = ({ processId, processName }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [logType, setLogType] = useState<'all' | 'out' | 'err'>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    const fetchLogs = async (): Promise<void> => {
      try {
        setLoading(true);
        // We'll get both types and filter on the frontend for a better UX
        const outResponse = await axios.get(`/api/logs/${processId}/out`);
        const errResponse = await axios.get(`/api/logs/${processId}/err`);

        // Process logs with timestamp and type
        const outLogs: LogEntry[] = outResponse.data.logs.map((log: string) => ({
          type: 'out',
          content: log,
          timestamp: new Date().toISOString(),
        }));
        
        const errLogs: LogEntry[] = errResponse.data.logs.map((log: string) => ({
          type: 'err',
          content: log,
          timestamp: new Date().toISOString(),
        }));

        // Combine and sort by approximate time
        const allLogs = [...outLogs, ...errLogs].sort((a, b) => 
          a.timestamp.localeCompare(b.timestamp)
        );
        
        setLogs(allLogs);
        setError('');
      } catch (err) {
        console.error('Error fetching logs:', err);
        setError(`Failed to fetch logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchLogs();

    // Set up interval for auto-refresh
    if (autoRefresh) {
      intervalId = setInterval(fetchLogs, 5000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [processId, autoRefresh]);

  // Handle auto-scrolling when logs update
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleLogTypeChange = (newType: 'all' | 'out' | 'err'): void => {
    setLogType(newType);
  };

  const toggleAutoRefresh = (): void => {
    setAutoRefresh(!autoRefresh);
  };
  
  const toggleAutoScroll = (): void => {
    setAutoScroll(!autoScroll);
  };

  // Filter logs by type
  const filteredLogs = logs.filter(log => {
    if (logType === 'all') return true;
    return log.type === logType;
  });

  return (
    <Box sx={{ width: '100%' }}>
      <Paper elevation={0} sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ButtonGroup size="small" variant="outlined">
          <Button 
            variant={logType === 'all' ? 'contained' : 'outlined'} 
            onClick={() => handleLogTypeChange('all')}
            color="primary"
          >
            All Logs
          </Button>
          <Button 
            variant={logType === 'out' ? 'contained' : 'outlined'} 
            onClick={() => handleLogTypeChange('out')}
            color="primary"
          >
            Standard Out
          </Button>
          <Button 
            variant={logType === 'err' ? 'contained' : 'outlined'} 
            onClick={() => handleLogTypeChange('err')}
            color="error"
          >
            Error
          </Button>
        </ButtonGroup>
        
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControlLabel
            control={
              <Checkbox
                checked={autoScroll}
                onChange={toggleAutoScroll}
                size="small"
              />
            }
            label="Auto-scroll"
          />
          <Button 
            variant={autoRefresh ? 'contained' : 'outlined'}
            onClick={toggleAutoRefresh}
            color="primary"
            size="small"
          >
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {loading && logs.length === 0 ? (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          py: 8 
        }}>
          <CircularProgress size={30} sx={{ mr: 2 }} />
          <Typography variant="body1">Loading logs...</Typography>
        </Box>
      ) : filteredLogs.length === 0 ? (
        <Box sx={{ 
          textAlign: 'center',
          py: 8,
          bgcolor: 'background.paper',
          borderRadius: 1
        }}>
          <Typography variant="body1" color="text.secondary">
            No logs available for this process.
          </Typography>
        </Box>
      ) : (
        <Paper 
          variant="outlined" 
          sx={{ 
            height: 350, 
            overflow: 'auto',
            p: 2,
            bgcolor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }} 
          ref={logsContainerRef}
        >
          {filteredLogs.map((log, index) => (
            <Box 
              key={index} 
              sx={{ 
                mb: 0.5,
                color: log.type === 'err' ? 'error.main' : 'text.primary',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {log.content}
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default ProcessLogs;

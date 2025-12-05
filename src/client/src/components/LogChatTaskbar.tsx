import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Collapse,
  List,
  ListItem,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Minimize as MinimizeIcon,
  Maximize as MaximizeIcon,
  Clear as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon
} from '@mui/icons-material';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'stdout' | 'stderr';
  message: string;
}

interface LogChatTaskbarProps {
  connectionId: string;
  processId: string;
  processName: string;
  connectionName: string;
  logs: string[];
  onClose: () => void;
  onClear: () => void;
  rightOffset?: number;
  zIndex?: number;
}

const LogChatTaskbar: React.FC<LogChatTaskbarProps> = ({
  connectionId,
  processId,
  processName,
  connectionName,
  logs,
  onClose,
  onClear,
  rightOffset = 20,
  zIndex = 1000
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [displayLogs, setDisplayLogs] = useState<{ stdout: LogEntry[], stderr: LogEntry[] }>({
    stdout: [],
    stderr: []
  });
  const [activeTab, setActiveTab] = useState<'stdout' | 'stderr' | 'all'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  // Convert logs to structured format
  useEffect(() => {
    if (!isPaused) {
      const newLogs = { stdout: [], stderr: [] } as { stdout: LogEntry[], stderr: LogEntry[] };
      
      logs.forEach((log, index) => {
        const logType = log.startsWith('[STDOUT]') ? 'stdout' : 'stderr';
        const message = log.replace(/^\[(STDOUT|STDERR)\]\s*/, '');
        
        if (message.trim()) { // Only add non-empty messages
          const logEntry = {
            id: `${Date.now()}-${index}`,
            timestamp: new Date(),
            type: logType as 'stdout' | 'stderr',
            message
          };
          
          newLogs[logType].push(logEntry);
        }
      });
      
      setDisplayLogs(newLogs);
    }
  }, [logs, isPaused]);
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!isMinimized && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogs, isMinimized, isPaused]);

  const getTotalLogCount = () => {
    return displayLogs.stdout.length + displayLogs.stderr.length;
  };

  const getAllLogs = () => {
    const allLogs = [...displayLogs.stdout, ...displayLogs.stderr];
    return allLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const getLogColor = (type: string) => {
    return type === 'stderr' ? '#ff5252' : '#4caf50';
  };

  return (
    <Paper
      elevation={8}      sx={{
        position: 'fixed',
        bottom: 0,
        right: rightOffset,
        width: isMinimized ? 400 : 1000,
        maxHeight: isMinimized ? 60 : 800,
        zIndex: zIndex,
        borderRadius: '8px 8px 0 0',
        overflow: 'hidden',
        transition: 'all 0.3s ease-in-out'
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          cursor: 'pointer'
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight="bold">
            Logs: {processName}
          </Typography>
          <Chip
            label={connectionName}
            size="small"
            sx={{ 
              bgcolor: 'rgba(255,255,255,0.2)', 
              color: 'inherit',
              fontSize: '0.7rem',
              height: 20
            }}
          />          {getTotalLogCount() > 0 && (
            <Chip
              label={`${getTotalLogCount()} lines`}
              size="small"
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                color: 'inherit',
                fontSize: '0.7rem',
                height: 20
              }}
            />
          )}
          {displayLogs.stdout.length > 0 && (
            <Chip
              label={`OUT: ${displayLogs.stdout.length}`}
              size="small"
              sx={{ 
                bgcolor: 'rgba(76,175,80,0.8)', 
                color: 'white',
                fontSize: '0.7rem',
                height: 20
              }}
            />
          )}
          {displayLogs.stderr.length > 0 && (
            <Chip
              label={`ERR: ${displayLogs.stderr.length}`}
              size="small"
              sx={{ 
                bgcolor: 'rgba(244,67,54,0.8)', 
                color: 'white',
                fontSize: '0.7rem',
                height: 20
              }}
            />
          )}
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={isPaused ? 'Resume' : 'Pause'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaused(!isPaused);
              }}
              sx={{ color: 'inherit', mr: 0.5 }}
            >
              {isPaused ? <PlayIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
            <Tooltip title="Clear logs">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
                setDisplayLogs({ stdout: [], stderr: [] });
              }}
              sx={{ color: 'inherit', mr: 0.5 }}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={isMinimized ? 'Maximize' : 'Minimize'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              sx={{ color: 'inherit', mr: 0.5 }}
            >
              {isMinimized ? <MaximizeIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Close">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Logs Content */}
      <Collapse in={!isMinimized}>        <Box          sx={{
            height: 440,
            overflow: 'auto',
            bgcolor: '#1e1e1e',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}
        >
          {getTotalLogCount() === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#888'
              }}
            >
              {isPaused ? 'Logs paused - Click play to resume' : 'Waiting for logs...'}
            </Box>
          ) : (
            <List dense sx={{ p: 0 }}>              {getAllLogs().map((log) => (
                <ListItem
                  key={log.id}
                  sx={{
                    py: 0.1,
                    px: 1,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  <Box sx={{ 
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    minHeight: '20px'
                  }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#888',
                        fontSize: '10px',
                        minWidth: '60px',
                        flexShrink: 0
                      }}
                    >
                      {formatTime(log.timestamp)}
                    </Typography>
                    <Chip
                      label={log.type === 'stderr' ? 'ERR' : 'OUT'}
                      size="small"
                      sx={{
                        bgcolor: getLogColor(log.type),
                        color: 'white',
                        fontSize: '8px',
                        height: 14,
                        minWidth: 32,
                        flexShrink: 0,
                        '& .MuiChip-label': {
                          px: 0.5
                        }
                      }}
                    />                    <Tooltip title={log.message} placement="top">
                      <Typography
                        variant="body2"
                        sx={{
                          wordBreak: 'break-word',
                          fontSize: '11px',
                          lineHeight: 1.3,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'default'
                        }}
                      >
                        {log.message}
                      </Typography>
                    </Tooltip>
                  </Box>
                </ListItem>
              ))}
              <div ref={logsEndRef} />
            </List>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default LogChatTaskbar;

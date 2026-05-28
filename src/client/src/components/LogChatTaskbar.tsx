import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import {
  Close as CloseIcon,
  Remove as MinimizeIcon,
  OpenInFull as MaximizeIcon,
  Delete as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon
} from '@mui/icons-material';

// @group Types : Log entry structure
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

// @group LogChatTaskbar : Floating terminal-style log panel anchored to the bottom of the viewport
const LogChatTaskbar: React.FC<LogChatTaskbarProps> = ({
  processName,
  connectionName,
  logs,
  onClose,
  onClear,
  rightOffset = 20,
  zIndex = 1000
}) => {
  const { t } = useTranslation();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // @group LogProcessing : Parse raw log strings into structured entries
  useEffect(() => {
    if (isPaused) return;
    const parsed: LogEntry[] = [];
    logs.forEach((log, index) => {
      const isStderr = log.startsWith('[STDERR]');
      const message = log.replace(/^\[(STDOUT|STDERR)\]\s*/, '').trim();
      if (message) {
        parsed.push({
          id: `${Date.now()}-${index}`,
          timestamp: new Date(),
          type: isStderr ? 'stderr' : 'stdout',
          message
        });
      }
    });
    setDisplayLogs(parsed);
  }, [logs, isPaused]);

  // @group AutoScroll : Scroll to newest log line
  useEffect(() => {
    if (!isMinimized && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogs, isMinimized, isPaused]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const stdoutCount = displayLogs.filter(l => l.type === 'stdout').length;
  const stderrCount = displayLogs.filter(l => l.type === 'stderr').length;

  // @group Render : Floating terminal panel
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        right: rightOffset,
        width: isMinimized ? 360 : 680,
        zIndex,
        borderRadius: '4px 4px 0 0',
        overflow: 'hidden',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
        transition: 'width 0.2s ease',
        border: '1px solid #1e1e1e',
        borderBottom: 'none',
        bgcolor: '#111',
      }}
    >
      {/* Header bar */}
      <Box
        onClick={() => setIsMinimized(m => !m)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.75,
          cursor: 'pointer',
          bgcolor: '#0d0d0d',
          borderBottom: '1px solid #1e1e1e',
          userSelect: 'none',
        }}
      >
        {/* Left: title + counters */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          {/* Traffic-light dot — green = live, grey = paused */}
          <Box sx={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            bgcolor: isPaused ? '#555' : '#22c55e',
            boxShadow: isPaused ? 'none' : '0 0 5px rgba(34,197,94,0.5)',
          }} />

          <Typography
            variant="body2"
            sx={{ color: '#e8e8e8', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {processName}
          </Typography>

          <Typography variant="caption" sx={{ color: '#555', fontSize: '0.68rem', fontFamily: 'monospace', flexShrink: 0 }}>
            {connectionName}
          </Typography>

          {/* Log counters */}
          {!isMinimized && (stdoutCount > 0 || stderrCount > 0) && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: 0.5 }}>
              {stdoutCount > 0 && (
                <Box sx={{ px: 0.75, py: 0.1, borderRadius: '2px', bgcolor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <Typography sx={{ fontSize: '0.62rem', color: '#22c55e', lineHeight: 1.5, fontFamily: 'monospace' }}>
                    OUT {stdoutCount}
                  </Typography>
                </Box>
              )}
              {stderrCount > 0 && (
                <Box sx={{ px: 0.75, py: 0.1, borderRadius: '2px', bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <Typography sx={{ fontSize: '0.62rem', color: '#ef4444', lineHeight: 1.5, fontFamily: 'monospace' }}>
                    ERR {stderrCount}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Right: action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <Tooltip title={isPaused ? t('logPanel.resume') : t('logPanel.pause')}>
            <IconButton size="small" onClick={() => setIsPaused(p => !p)} sx={{ color: '#555', '&:hover': { color: '#888' } }}>
              {isPaused ? <PlayIcon sx={{ fontSize: 14 }} /> : <PauseIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('logPanel.clear')}>
            <IconButton size="small" onClick={() => { onClear(); setDisplayLogs([]); }} sx={{ color: '#555', '&:hover': { color: '#888' } }}>
              <ClearIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={isMinimized ? t('logPanel.expand') : t('logPanel.collapse')}>
            <IconButton size="small" onClick={() => setIsMinimized(m => !m)} sx={{ color: '#555', '&:hover': { color: '#888' } }}>
              {isMinimized ? <MaximizeIcon sx={{ fontSize: 13 }} /> : <MinimizeIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('logPanel.close')}>
            <IconButton size="small" onClick={onClose} sx={{ color: '#555', '&:hover': { color: '#ef4444' } }}>
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Log body */}
      {!isMinimized && (
        <Box
          sx={{
            height: 320,
            overflowY: 'auto',
            bgcolor: '#0a0a0a',
            fontFamily: 'monospace',
            fontSize: '0.72rem',
            lineHeight: 1.5,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: '#1e1e1e', borderRadius: 2 },
          }}
        >
          {displayLogs.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography sx={{ color: '#555', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                {isPaused ? t('logPanel.paused') : t('logPanel.waiting')}
              </Typography>
            </Box>
          ) : (
            displayLogs.map(log => (
              <Box
                key={log.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  px: 1.5,
                  py: 0.25,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                }}
              >
                {/* Timestamp */}
                <Typography component="span" sx={{ color: '#333', fontSize: '0.68rem', flexShrink: 0, mt: '1px', fontFamily: 'monospace' }}>
                  {formatTime(log.timestamp)}
                </Typography>

                {/* OUT / ERR badge */}
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                    mt: '1px',
                    color: log.type === 'stderr' ? '#ef4444' : '#22c55e',
                  }}
                >
                  {log.type === 'stderr' ? 'ERR' : 'OUT'}
                </Typography>

                {/* Message */}
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    color: log.type === 'stderr' ? '#fca5a5' : '#e8e8e8',
                    wordBreak: 'break-word',
                    flex: 1,
                  }}
                >
                  {log.message}
                </Typography>
              </Box>
            ))
          )}
          <div ref={logsEndRef} />
        </Box>
      )}
    </Box>
  );
};

export default LogChatTaskbar;

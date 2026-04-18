import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
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
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Chip,
  SelectChangeEvent,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import { LogEntry } from '../types/pm2';

// @group Types
interface ProcessLogsProps {
  processId: number;
  processName: string;
  /** When set, fetches logs from the remote server instead of local */
  connectionId?: string;
}

const LINE_OPTIONS = [
  { label: '100 lines', value: 100 },
  { label: '500 lines', value: 500 },
  { label: '1 000 lines', value: 1000 },
  { label: 'All', value: 0 },
];

// @group ProcessLogs : Log history viewer with lines control and download
const ProcessLogs: React.FC<ProcessLogsProps> = ({ processId, processName, connectionId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [logType, setLogType] = useState<'all' | 'out' | 'err'>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [lines, setLines] = useState<number>(200);
  const [totalLines, setTotalLines] = useState<{ out: number; err: number }>({ out: 0, err: 0 });
  const [logPaths, setLogPaths] = useState<{ out: string; err: string }>({ out: '', err: '' });
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // @group LogHistory : Build the correct API URL based on local vs remote
  const buildUrl = useCallback((type: 'out' | 'err', download = false): string => {
    if (connectionId) {
      const base = `/api/remote/${connectionId}/logs/${processId}/${type}`;
      return download ? `${base}/download` : `${base}?lines=${lines}`;
    }
    const base = `/api/logs/${processId}/${type}`;
    return download ? `${base}/download` : `${base}?lines=${lines}`;
  }, [connectionId, processId, lines]);

  const fetchLogs = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const [outRes, errRes] = await Promise.all([
        axios.get(buildUrl('out')),
        axios.get(buildUrl('err')),
      ]);

      const outData = outRes.data;
      const errData = errRes.data;

      // Both local and remote endpoints now return { logs, logPath, totalLines }
      const outLogs: LogEntry[] = (outData.logs || []).map((line: string) => ({
        type: 'out' as const,
        content: line,
        timestamp: '',
      }));
      const errLogs: LogEntry[] = (errData.logs || []).map((line: string) => ({
        type: 'err' as const,
        content: line,
        timestamp: '',
      }));

      setLogs([...outLogs, ...errLogs]);
      setTotalLines({ out: outData.totalLines || 0, err: errData.totalLines || 0 });
      setLogPaths({ out: outData.logPath || '', err: errData.logPath || '' });
      setError('');
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(`Failed to fetch logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [fetchLogs, autoRefresh]);

  // Auto-scroll when logs update
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // @group LogHistory : Download via axios blob — works through proxy and in Electron
  const handleDownload = async (type: 'out' | 'err'): Promise<void> => {
    try {
      const url = buildUrl(type, true);
      const response = await axios.get(url, { responseType: 'blob' });
      const blob    = new Blob([response.data], { type: 'text/plain; charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href     = blobUrl;
      a.download = `${processName}-${type}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error('Download failed:', err);
    }
  };

  const filteredLogs = logs.filter(log => logType === 'all' || log.type === logType);

  const activeLogPath = logType === 'err' ? logPaths.err : logPaths.out;

  return (
    <Box sx={{ width: '100%' }}>

      {/* ── Toolbar row 1: type filter + lines selector ── */}
      <Paper elevation={0} variant="outlined" sx={{ p: 1.5, mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>

        {/* Log type toggle */}
        <ButtonGroup size="small" variant="outlined">
          <Button variant={logType === 'all' ? 'contained' : 'outlined'} onClick={() => setLogType('all')}>All</Button>
          <Button variant={logType === 'out' ? 'contained' : 'outlined'} onClick={() => setLogType('out')}>stdout</Button>
          <Button variant={logType === 'err' ? 'contained' : 'outlined'} color="error" onClick={() => setLogType('err')}>stderr</Button>
        </ButtonGroup>

        {/* Lines selector */}
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Lines to load</InputLabel>
          <Select
            label="Lines to load"
            value={lines}
            onChange={(e: SelectChangeEvent<number>) => setLines(Number(e.target.value))}
          >
            {LINE_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Total count badges */}
        {totalLines.out > 0 && (
          <Tooltip title="Total lines in stdout log file">
            <Chip label={`stdout: ${totalLines.out.toLocaleString()} lines`} size="small" variant="outlined" />
          </Tooltip>
        )}
        {totalLines.err > 0 && (
          <Tooltip title="Total lines in stderr log file">
            <Chip label={`stderr: ${totalLines.err.toLocaleString()} lines`} size="small" variant="outlined" color="error" />
          </Tooltip>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Auto-scroll + auto-refresh */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <FormControlLabel
            control={<Checkbox checked={autoScroll} onChange={() => setAutoScroll(v => !v)} size="small" />}
            label={<Typography variant="caption">Auto-scroll</Typography>}
            sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Checkbox checked={autoRefresh} onChange={() => setAutoRefresh(v => !v)} size="small" />}
            label={<Typography variant="caption">Auto-refresh</Typography>}
            sx={{ m: 0 }}
          />
          <Tooltip title="Refresh now">
            <span>
              <Button size="small" variant="outlined" onClick={fetchLogs} sx={{ minWidth: 32, px: 0.5 }}>
                <RefreshIcon fontSize="small" />
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Paper>

      {/* ── Toolbar row 2: log path + download ── */}
      <Paper elevation={0} variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {activeLogPath && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.65, flex: 1, wordBreak: 'break-all' }}>
            {activeLogPath}
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Tooltip title="Download full stdout log">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={() => handleDownload('out')}
            >
              stdout
            </Button>
          </Tooltip>
          <Tooltip title="Download full stderr log">
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={() => handleDownload('err')}
            >
              stderr
            </Button>
          </Tooltip>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {/* ── Log content ── */}
      {loading && logs.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress size={24} sx={{ mr: 1.5 }} />
          <Typography variant="body2">Loading logs…</Typography>
        </Box>
      ) : filteredLogs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">No log entries for this filter.</Typography>
        </Box>
      ) : (
        <Paper
          variant="outlined"
          ref={logsContainerRef}
          sx={{
            height: 400,
            overflow: 'auto',
            p: 1.5,
            bgcolor: theme => theme.palette.mode === 'dark' ? '#0d1117' : '#f6f8fa',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            lineHeight: 1.6,
          }}
        >
          {filteredLogs.map((log, i) => (
            <Box
              key={i}
              sx={{
                color: log.type === 'err' ? 'error.main' : 'text.primary',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {log.content}
            </Box>
          ))}
        </Paper>
      )}

      {/* Showing N of M hint */}
      {filteredLogs.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
          Showing {filteredLogs.length.toLocaleString()} {lines === 0 ? '' : `of last ${lines.toLocaleString()} requested`} lines
          {logType !== 'err' && totalLines.out > 0 && logType !== 'out' ? ` · stdout total: ${totalLines.out.toLocaleString()}` : ''}
          {logType !== 'out' && totalLines.err > 0 && logType !== 'err' ? ` · stderr total: ${totalLines.err.toLocaleString()}` : ''}
        </Typography>
      )}
    </Box>
  );
};

export default ProcessLogs;

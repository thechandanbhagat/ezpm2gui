import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  ButtonGroup,
  CircularProgress,
  Alert,
  Collapse,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RefreshIcon from '@mui/icons-material/Refresh';

// @group Types
interface LogFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: 'out' | 'err' | 'unknown';
  compressed: boolean;
}

// @group Types : stdout + stderr paired for the same date
interface LogFileGroup {
  /** The date/rotation key, e.g. "2026-03-14_00-00-00" or "current" */
  dateKey: string;
  /** Human-readable date label derived from ls output or filename */
  displayDate: string;
  stdout?: LogFile;
  stderr?: LogFile;
}

interface LogFileBrowserProps {
  processId: number;
  processName: string;
  connectionId?: string;
}

const LINE_OPTIONS = [
  { label: '100 lines', value: 100 },
  { label: '500 lines', value: 500 },
  { label: '1 000 lines', value: 1000 },
  { label: 'All', value: 0 },
];

// @group Utilities : Human-readable file size
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

// @group Utilities : Extract date key from a rotated log filename
// e.g. "booking-manager-out__2026-03-14_00-00-00.log" → "2026-03-14_00-00-00"
// e.g. "booking-manager-out.log" → "current"
const extractDateKey = (fileName: string): string => {
  const match = fileName.match(/__(\d{4}-\d{2}-\d{2}[_-]\d{2}[:-]\d{2}[:-]\d{2})/);
  return match ? match[1] : 'current';
};

// @group Utilities : Format date key for display
// "2026-03-14_00-00-00" → "Mar 14, 2026"   "current" → "Current"
const formatDateKey = (key: string): string => {
  if (key === 'current') return 'Current';
  // Parse "2026-03-14_00-00-00" → Date
  const normalized = key.replace(/_(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// @group LogFileBrowser : Group flat file list into paired stdout/stderr rows
const groupFiles = (files: LogFile[]): LogFileGroup[] => {
  const map = new Map<string, LogFileGroup>();

  for (const file of files) {
    const key = extractDateKey(file.name);
    if (!map.has(key)) {
      map.set(key, { dateKey: key, displayDate: formatDateKey(key) });
    }
    const group = map.get(key)!;
    if (file.type === 'out')      group.stdout = file;
    else if (file.type === 'err') group.stderr = file;
    else {
      // unknown type — attach to whichever slot is free
      if (!group.stdout) group.stdout = file;
      else group.stderr = file;
    }
  }

  // Sort: current first, then newest date first
  return Array.from(map.values()).sort((a, b) => {
    if (a.dateKey === 'current') return -1;
    if (b.dateKey === 'current') return  1;
    return b.dateKey.localeCompare(a.dateKey);
  });
};

// @group LogFileBrowser : Browse and view rotated PM2 log files grouped by date
const LogFileBrowser: React.FC<LogFileBrowserProps> = ({ processId, processName, connectionId }) => {
  const [files, setFiles]         = useState<LogFile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<'out' | 'err'>('out');
  const [fileContent, setFileContent] = useState<Record<string, string[]>>({});
  const [fileTotal, setFileTotal]     = useState<Record<string, number>>({});
  const [fileLoading, setFileLoading] = useState<Record<string, boolean>>({});
  const [fileError, setFileError]     = useState<Record<string, string>>({});
  const [lines, setLines]         = useState<number>(200);
  const [downloadError, setDownloadError] = useState<string>('');

  // @group LogFileBrowser : URL builders
  const listUrl = connectionId
    ? `/api/remote/${connectionId}/log-files/${processId}`
    : `/api/log-files/${processId}`;

  const fileReadUrl = useCallback((filePath: string): string => {
    const encoded = encodeURIComponent(filePath);
    return connectionId
      ? `/api/remote/${connectionId}/log-file?path=${encoded}&lines=${lines}`
      : `/api/log-file?path=${encoded}&lines=${lines}`;
  }, [connectionId, lines]);

  // @group LogFileBrowser : Fetch file listing
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(listUrl);
      setFiles(res.data.files || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to list log files');
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // @group LogFileBrowser : Load a specific file's content
  const loadFileContent = useCallback(async (filePath: string) => {
    if (fileLoading[filePath]) return;
    setFileLoading(prev => ({ ...prev, [filePath]: true }));
    setFileError(prev => ({ ...prev, [filePath]: '' }));
    try {
      const res = await axios.get(fileReadUrl(filePath));
      setFileContent(prev => ({ ...prev, [filePath]: res.data.logs || [] }));
      setFileTotal(prev => ({ ...prev, [filePath]: res.data.totalLines || 0 }));
    } catch (err: any) {
      setFileError(prev => ({
        ...prev,
        [filePath]: err.response?.data?.error || err.message || 'Failed to read file',
      }));
    } finally {
      setFileLoading(prev => ({ ...prev, [filePath]: false }));
    }
  }, [fileReadUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when lines selector changes while a row is open
  useEffect(() => {
    if (!expandedKey) return;
    const groups = groupFiles(files);
    const group  = groups.find(g => g.dateKey === expandedKey);
    if (!group) return;
    const active = expandedTab === 'out' ? group.stdout : group.stderr;
    if (active) loadFileContent(active.path);
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  // @group LogFileBrowser : Toggle row expansion and auto-load the first available tab
  const toggleExpand = (group: LogFileGroup) => {
    if (expandedKey === group.dateKey) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(group.dateKey);
    const defaultTab: 'out' | 'err' = group.stdout ? 'out' : 'err';
    setExpandedTab(defaultTab);
    const file = defaultTab === 'out' ? group.stdout : group.stderr;
    if (file && !fileContent[file.path]) loadFileContent(file.path);
  };

  // @group LogFileBrowser : Switch content tab (stdout ↔ stderr) inside an expanded row
  const switchTab = (group: LogFileGroup, tab: 'out' | 'err') => {
    setExpandedTab(tab);
    const file = tab === 'out' ? group.stdout : group.stderr;
    if (file && !fileContent[file.path]) loadFileContent(file.path);
  };

  // @group LogFileBrowser : Download via axios blob — works through proxy and in Electron
  const download = useCallback(async (file: LogFile) => {
    setDownloadError('');
    try {
      const encoded = encodeURIComponent(file.path);
      const url = connectionId
        ? `/api/remote/${connectionId}/log-file/download?path=${encoded}`
        : `/api/log-file/download?path=${encoded}`;
      const response = await axios.get(url, { responseType: 'blob' });
      const blob     = new Blob([response.data], { type: 'text/plain; charset=utf-8' });
      const blobUrl  = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href     = blobUrl;
      a.download = file.name.replace(/\.gz$/, '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Download failed';
      setDownloadError(`${file.name}: ${msg}`);
    }
  }, [connectionId]);

  // Download both stdout + stderr sequentially
  const downloadBoth = useCallback(async (group: LogFileGroup) => {
    if (group.stdout) await download(group.stdout);
    if (group.stderr) await download(group.stderr);
  }, [download]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const groups = groupFiles(files);

  // ── Render: loading / error / empty ──────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 6, justifyContent: 'center' }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">Scanning log directory…</Typography>
      </Box>
    );
  }

  if (error) return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>;

  if (groups.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <FolderOpenIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No log files found for <strong>{processName}</strong>.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Log rotation may not be enabled. Run <code>pm2 install pm2-logrotate</code> to get daily archives.
        </Typography>
      </Box>
    );
  }

  // ── Render: table ─────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Download error banner */}
      {downloadError && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setDownloadError('')}>
          {downloadError}
        </Alert>
      )}

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {groups.length} date{groups.length !== 1 ? 's' : ''} · {files.length} file{files.length !== 1 ? 's' : ''}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Lines to load</InputLabel>
          <Select
            label="Lines to load"
            value={lines}
            onChange={(e: SelectChangeEvent<number>) => setLines(Number(e.target.value))}
          >
            {LINE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Tooltip title="Refresh file list">
          <IconButton size="small" onClick={fetchFiles}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 36 }} />
              <TableCell>Date</TableCell>
              <TableCell align="right">stdout</TableCell>
              <TableCell align="right">stderr</TableCell>
              <TableCell align="right">Download</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map(group => {
              const isOpen   = expandedKey === group.dateKey;
              const activeFile = expandedTab === 'out' ? group.stdout : group.stderr;

              return (
                <React.Fragment key={group.dateKey}>
                  {/* ── Summary row ── */}
                  <TableRow
                    hover
                    sx={{ cursor: 'pointer', '& td': { borderBottom: isOpen ? 0 : undefined } }}
                    onClick={() => toggleExpand(group)}
                  >
                    <TableCell padding="checkbox">
                      <IconButton size="small">
                        {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" fontWeight={group.dateKey === 'current' ? 600 : 400}>
                        {group.displayDate}
                      </Typography>
                    </TableCell>

                    {/* stdout size */}
                    <TableCell align="right">
                      {group.stdout
                        ? <Typography variant="caption" color="text.secondary">{formatSize(group.stdout.size)}</Typography>
                        : <Typography variant="caption" sx={{ opacity: 0.3 }}>—</Typography>
                      }
                    </TableCell>

                    {/* stderr size */}
                    <TableCell align="right">
                      {group.stderr
                        ? <Typography variant="caption" color="error.main">{formatSize(group.stderr.size)}</Typography>
                        : <Typography variant="caption" sx={{ opacity: 0.3 }}>—</Typography>
                      }
                    </TableCell>

                    {/* Download actions */}
                    <TableCell align="right" onClick={e => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {group.stdout && (
                          <Tooltip title="Download stdout">
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{ minWidth: 0, px: 1, fontSize: '0.7rem' }}
                              onClick={() => download(group.stdout!)}
                            >
                              <DownloadIcon sx={{ fontSize: 13, mr: 0.4 }} />out
                            </Button>
                          </Tooltip>
                        )}
                        {group.stderr && (
                          <Tooltip title="Download stderr">
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              sx={{ minWidth: 0, px: 1, fontSize: '0.7rem' }}
                              onClick={() => download(group.stderr!)}
                            >
                              <DownloadIcon sx={{ fontSize: 13, mr: 0.4 }} />err
                            </Button>
                          </Tooltip>
                        )}
                        {group.stdout && group.stderr && (
                          <Tooltip title="Download both files">
                            <Button
                              size="small"
                              variant="contained"
                              disableElevation
                              sx={{ minWidth: 0, px: 1, fontSize: '0.7rem' }}
                              onClick={() => downloadBoth(group)}
                            >
                              <DownloadIcon sx={{ fontSize: 13, mr: 0.4 }} />both
                            </Button>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>

                  {/* ── Expanded content row ── */}
                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>

                          {/* stdout / stderr tab switcher */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <ButtonGroup size="small" variant="outlined">
                              {group.stdout && (
                                <Button
                                  variant={expandedTab === 'out' ? 'contained' : 'outlined'}
                                  disableElevation
                                  onClick={() => switchTab(group, 'out')}
                                >
                                  stdout · {formatSize(group.stdout.size)}
                                </Button>
                              )}
                              {group.stderr && (
                                <Button
                                  variant={expandedTab === 'err' ? 'contained' : 'outlined'}
                                  color="error"
                                  disableElevation
                                  onClick={() => switchTab(group, 'err')}
                                >
                                  stderr · {formatSize(group.stderr.size)}
                                </Button>
                              )}
                            </ButtonGroup>

                            <Box sx={{ flex: 1 }} />

                            {activeFile && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<DownloadIcon fontSize="small" />}
                                onClick={() => download(activeFile)}
                              >
                                Download full file
                              </Button>
                            )}
                          </Box>

                          {/* Content viewer */}
                          {activeFile && (
                            <>
                              {fileLoading[activeFile.path] && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                                  <CircularProgress size={16} />
                                  <Typography variant="caption">Loading…</Typography>
                                </Box>
                              )}
                              {fileError[activeFile.path] && (
                                <Alert severity="error">{fileError[activeFile.path]}</Alert>
                              )}
                              {!fileLoading[activeFile.path] && !fileError[activeFile.path] && fileContent[activeFile.path] && (
                                <>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                    {fileContent[activeFile.path].length.toLocaleString()}
                                    {lines > 0 ? ` of last ${lines.toLocaleString()}` : ''} lines shown
                                    {fileTotal[activeFile.path] ? ` · ${fileTotal[activeFile.path].toLocaleString()} total` : ''}
                                    <Box component="span" sx={{ fontFamily: 'monospace', opacity: 0.5, ml: 1 }}>
                                      {activeFile.path}
                                    </Box>
                                  </Typography>
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      maxHeight: 380,
                                      overflow: 'auto',
                                      p: 1.5,
                                      bgcolor: theme => theme.palette.mode === 'dark' ? '#0d1117' : '#f6f8fa',
                                      fontFamily: 'monospace',
                                      fontSize: '0.78rem',
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {fileContent[activeFile.path].length === 0
                                      ? <Typography variant="caption" color="text.secondary">File is empty.</Typography>
                                      : fileContent[activeFile.path].map((line, i) => (
                                          <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {line}
                                          </Box>
                                        ))
                                    }
                                  </Paper>
                                </>
                              )}
                            </>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LogFileBrowser;

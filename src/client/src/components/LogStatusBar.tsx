import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import {
  Close as CloseIcon,
  Delete as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  KeyboardArrowDown as CollapseIcon,
  KeyboardArrowUp as ExpandIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';

// @group Types : Log status bar data types
interface LogWindowState {
  connectionId: string;
  processName: string;
  processId: string;
  connectionName: string;
  logs: string[];
}

interface LogEntry {
  id: string;
  type: 'stdout' | 'stderr';
  message: string;
  timestamp: Date;
}

interface LogStatusBarProps {
  logWindows: Record<string, LogWindowState>;
  onClose: (windowKey: string) => void;
  onClear: (windowKey: string) => void;
}

// @group Helpers : Parse raw "[STDOUT]/[STDERR] msg" strings into structured entries
const parseRawLogs = (raw: string[]): LogEntry[] => {
  const out: LogEntry[] = [];
  raw.forEach((log, i) => {
    const isStderr = log.startsWith('[STDERR]');
    const message = log.replace(/^\[(STDOUT|STDERR)\]\s*/, '').trim();
    if (message) {
      out.push({ id: String(i), type: isStderr ? 'stderr' : 'stdout', message, timestamp: new Date() });
    }
  });
  return out;
};

const TAB_H  = 28;  // px — status bar height
const PANEL_H = 320; // px — expanded log area height

// @group LogStatusBar : VS Code-style bottom status bar with slide-up log panel
const LogStatusBar: React.FC<LogStatusBarProps> = ({ logWindows, onClose, onClear }) => {
  const [activeKey, setActiveKey]       = useState<string | null>(null);
  const [isPaused,  setIsPaused]        = useState(false);
  const [frozen,    setFrozen]          = useState<Record<string, LogEntry[]>>({});
  const logsEndRef  = useRef<HTMLDivElement>(null);
  const prevKeysRef = useRef<string[]>([]);
  const tabBarRef   = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // @group StateSync : Auto-select newly-opened sessions; clean up closed active key.
  // Intentionally only reacts to logWindows changes, NOT activeKey — so that a
  // user-initiated collapse (activeKey → null) is preserved until a new window opens.
  useEffect(() => {
    const keys    = Object.keys(logWindows);
    const prevKeys = prevKeysRef.current;

    // A new session was opened → auto-select it
    const newKeys = keys.filter(k => !prevKeys.includes(k));
    if (newKeys.length > 0) {
      setActiveKey(newKeys[newKeys.length - 1]);
    } else if (keys.length === 0) {
      setActiveKey(null);
    } else {
      // Active session was closed by the user → fall back to first remaining
      setActiveKey(prev => (prev && logWindows[prev] ? prev : null));
    }

    prevKeysRef.current = keys;
  }, [logWindows]); // eslint-disable-line react-hooks/exhaustive-deps

  // @group PauseHandling : Freeze log snapshot when pause is toggled on
  const handlePause = () => {
    if (!isPaused) {
      // Capture the current parsed view so it stays frozen
      const snap: Record<string, LogEntry[]> = {};
      Object.entries(logWindows).forEach(([k, w]) => { snap[k] = parseRawLogs(w.logs); });
      setFrozen(snap);
    }
    setIsPaused(p => !p);
  };

  // @group LogDerived : Live-parse logs unless paused (frozen snapshot used instead)
  const parsedLogs = useMemo<Record<string, LogEntry[]>>(() => {
    if (isPaused) return frozen;
    const result: Record<string, LogEntry[]> = {};
    Object.entries(logWindows).forEach(([k, w]) => { result[k] = parseRawLogs(w.logs); });
    return result;
  }, [logWindows, isPaused, frozen]);

  // @group AutoScroll
  useEffect(() => {
    if (activeKey && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [parsedLogs, activeKey, isPaused]);

  // @group ScrollSync : Keep scroll-arrow enabled state in sync with tab bar scroll position
  const syncScrollState = () => {
    const el = tabBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    syncScrollState();
  }, [logWindows]);

  const scrollTabs = (dir: 'left' | 'right') => {
    const el = tabBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
    setTimeout(syncScrollState, 200);
  };

  if (Object.keys(logWindows).length === 0) return null;

  const activeLogs   = activeKey ? (parsedLogs[activeKey] ?? []) : [];
  const activeWindow = activeKey ? logWindows[activeKey]   : null;

  const countOf = (key: string, type: 'stdout' | 'stderr') =>
    (parsedLogs[key] ?? []).filter(l => l.type === type).length;

  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // @group Render : Status bar + slide-up panel
  return (
    <Box sx={{
      position: 'fixed',
      bottom: 0,
      left: { xs: 0, sm: '200px' },
      right: 0,
      zIndex: 1200,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Slide-up log panel (only when a tab is active) ── */}
      {activeKey && (
        <Box sx={{
          height: PANEL_H,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#0c0c0c',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Panel header */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            flexShrink: 0,
            height: 30,
            bgcolor: '#181818',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Live / paused indicator */}
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: isPaused ? '#555' : '#22c55e',
                boxShadow: isPaused ? 'none' : '0 0 5px #22c55e88',
              }} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#aaa' }}>
                {activeWindow?.processName}
                <Box component="span" sx={{ color: '#555', mx: 0.5 }}>·</Box>
                {activeWindow?.connectionName}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {countOf(activeKey, 'stdout') > 0 && (
                  <Box sx={{ px: 0.6, py: 0, borderRadius: '3px', bgcolor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#22c55e', fontFamily: 'monospace', lineHeight: '16px' }}>
                      OUT {countOf(activeKey, 'stdout')}
                    </Typography>
                  </Box>
                )}
                {countOf(activeKey, 'stderr') > 0 && (
                  <Box sx={{ px: 0.6, py: 0, borderRadius: '3px', bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#ef4444', fontFamily: 'monospace', lineHeight: '16px' }}>
                      ERR {countOf(activeKey, 'stderr')}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Tooltip title={isPaused ? 'Resume' : 'Pause'}>
                <IconButton size="small" onClick={handlePause} sx={{ color: '#666', '&:hover': { color: '#ccc' } }}>
                  {isPaused ? <PlayIcon sx={{ fontSize: 13 }} /> : <PauseIcon sx={{ fontSize: 13 }} />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear">
                <IconButton size="small" onClick={() => onClear(activeKey)} sx={{ color: '#666', '&:hover': { color: '#ccc' } }}>
                  <ClearIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Collapse">
                <IconButton size="small" onClick={() => setActiveKey(null)} sx={{ color: '#666', '&:hover': { color: '#ccc' } }}>
                  <CollapseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close session">
                <IconButton size="small" onClick={() => onClose(activeKey)} sx={{ color: '#666', '&:hover': { color: '#ef4444' } }}>
                  <CloseIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Log lines */}
          <Box sx={{
            flex: 1,
            overflowY: 'auto',
            py: 0.5,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: '#2a2a2a', borderRadius: 2 },
          }}>
            {activeLogs.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography sx={{ color: '#3a3a3a', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  {isPaused ? '⏸ paused' : '● waiting for logs…'}
                </Typography>
              </Box>
            ) : (
              activeLogs.map(log => (
                <Box
                  key={log.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    px: 1.5,
                    py: '1px',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' },
                  }}
                >
                  <Typography component="span" sx={{ color: '#3d3d3d', fontSize: '0.68rem', flexShrink: 0, fontFamily: 'monospace', pt: '1px' }}>
                    {fmt(log.timestamp)}
                  </Typography>
                  <Typography component="span" sx={{ color: log.type === 'stderr' ? '#7f1d1d' : '#14532d', fontSize: '0.65rem', flexShrink: 0, fontFamily: 'monospace', pt: '1px', minWidth: 22 }}>
                    {log.type === 'stderr' ? 'ERR' : 'OUT'}
                  </Typography>
                  <Typography component="span" sx={{
                    color: log.type === 'stderr' ? '#fca5a5' : '#d4d4d4',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-word',
                    flex: 1,
                    lineHeight: 1.5,
                  }}>
                    {log.message}
                  </Typography>
                </Box>
              ))
            )}
            <div ref={logsEndRef} />
          </Box>
        </Box>
      )}

      {/* ── Tab bar ── */}
      <Box sx={{
        height: TAB_H,
        bgcolor: '#161616',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Section label — always visible, left-pinned */}
        <Typography sx={{
          fontSize: '0.6rem', color: '#444', fontFamily: 'monospace',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          px: 1, whiteSpace: 'nowrap', flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          alignSelf: 'stretch', display: 'flex', alignItems: 'center',
        }}>
          LOGS
        </Typography>

        {/* Scroll left button */}
        <Box
          onClick={() => scrollTabs('left')}
          sx={{
            display: canScrollLeft ? 'flex' : 'none',
            alignItems: 'center',
            px: 0.25,
            height: '100%',
            cursor: 'pointer',
            color: '#555',
            flexShrink: 0,
            '&:hover': { color: '#aaa', bgcolor: 'rgba(255,255,255,0.04)' },
          }}
        >
          <ChevronLeftIcon sx={{ fontSize: 16 }} />
        </Box>

        {/* Scrollable tab list */}
        <Box
          ref={tabBarRef}
          onScroll={syncScrollState}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            px: 0.5,
            height: '100%',
            '&::-webkit-scrollbar': { height: 3 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: '#2a2a2a', borderRadius: 2 },
          }}
        >

        {Object.entries(logWindows).map(([key, win]) => {
          const isActive  = key === activeKey;
          const outCount  = countOf(key, 'stdout');
          const errCount  = countOf(key, 'stderr');

          return (
            <Box
              key={key}
              onClick={() => setActiveKey(isActive ? null : key)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.6,
                px: 1,
                height: 20,
                borderRadius: '3px',
                cursor: 'pointer',
                flexShrink: 0,
                bgcolor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                transition: 'background 0.1s',
                '&:hover': { bgcolor: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)' },
              }}
            >
              {/* Live pulse dot */}
              <Box sx={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                bgcolor: '#22c55e',
                boxShadow: '0 0 4px #22c55e88',
              }} />

              {/* Process name */}
              <Typography sx={{
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                color: isActive ? '#e5e5e5' : '#888',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {win.processName}
              </Typography>

              {/* Connection name */}
              <Typography sx={{ fontSize: '0.62rem', color: '#3d3d3d', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {win.connectionName}
              </Typography>

              {/* Counts */}
              {outCount > 0 && (
                <Typography sx={{ fontSize: '0.62rem', color: '#22c55e', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {outCount}
                </Typography>
              )}
              {errCount > 0 && (
                <Typography sx={{ fontSize: '0.62rem', color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {errCount}
                </Typography>
              )}

              {/* Expand / collapse chevron */}
              {isActive
                ? <CollapseIcon sx={{ fontSize: 11, color: '#555', ml: 0.25 }} />
                : <ExpandIcon   sx={{ fontSize: 11, color: '#3a3a3a', ml: 0.25 }} />
              }

              {/* Close × */}
              <Box
                component="span"
                onClick={e => { e.stopPropagation(); onClose(key); }}
                sx={{
                  fontSize: '13px',
                  lineHeight: 1,
                  color: '#444',
                  cursor: 'pointer',
                  ml: 0.25,
                  display: 'flex',
                  alignItems: 'center',
                  '&:hover': { color: '#ef4444' },
                }}
              >
                ×
              </Box>
            </Box>
          );
        })}
        </Box>{/* end scrollable tab list */}

        {/* Scroll right button */}
        <Box
          onClick={() => scrollTabs('right')}
          sx={{
            display: canScrollRight ? 'flex' : 'none',
            alignItems: 'center',
            px: 0.25,
            height: '100%',
            cursor: 'pointer',
            color: '#555',
            flexShrink: 0,
            '&:hover': { color: '#aaa', bgcolor: 'rgba(255,255,255,0.04)' },
          }}
        >
          <ChevronRightIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
};

export default LogStatusBar;

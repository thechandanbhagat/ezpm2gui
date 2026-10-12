import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

const TAB_H  = 28;   // px — status bar height
const PANEL_H = 320; // px — expanded log area height

// @group LogStatusBar : CLI-style bottom status bar with slide-up log panel
const LogStatusBar: React.FC<LogStatusBarProps> = ({ logWindows, onClose, onClear }) => {
  const { t } = useTranslation();
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
    const keys     = Object.keys(logWindows);
    const prevKeys = prevKeysRef.current;

    const newKeys = keys.filter(k => !prevKeys.includes(k));
    if (newKeys.length > 0) {
      setActiveKey(newKeys[newKeys.length - 1]);
    } else if (keys.length === 0) {
      setActiveKey(null);
    } else {
      setActiveKey(prev => (prev && logWindows[prev] ? prev : null));
    }

    prevKeysRef.current = keys;
  }, [logWindows]); // eslint-disable-line react-hooks/exhaustive-deps

  // @group PauseHandling : Freeze log snapshot when pause is toggled on
  const handlePause = () => {
    if (!isPaused) {
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
          bgcolor: 'var(--ez-bg-page)',
          borderTop: '1px solid var(--ez-border)',
          borderLeft: '1px solid var(--ez-border)',
          borderRight: '1px solid var(--ez-border)',
        }}>
          {/* Panel header */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            flexShrink: 0,
            height: 30,
            bgcolor: 'var(--ez-bg-sidebar)',
            borderBottom: '1px solid var(--ez-border)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Live / paused indicator */}
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: isPaused ? 'var(--ez-text-subtle)' : 'var(--ez-accent)',
                boxShadow: isPaused ? 'none' : '0 0 5px rgba(34,197,94,0.5)',
              }} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--ez-text-muted)' }}>
                {activeWindow?.processName}
                <Box component="span" sx={{ color: 'var(--ez-text-faint)', mx: 0.5 }}>·</Box>
                {activeWindow?.connectionName}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {countOf(activeKey, 'stdout') > 0 && (
                  <Box sx={{ px: 0.6, py: 0, borderRadius: '2px', bgcolor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--ez-accent)', fontFamily: 'monospace', lineHeight: '16px' }}>
                      OUT {countOf(activeKey, 'stdout')}
                    </Typography>
                  </Box>
                )}
                {countOf(activeKey, 'stderr') > 0 && (
                  <Box sx={{ px: 0.6, py: 0, borderRadius: '2px', bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--ez-danger-text)', fontFamily: 'monospace', lineHeight: '16px' }}>
                      ERR {countOf(activeKey, 'stderr')}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Tooltip title={isPaused ? t('logPanel.resume') : t('logPanel.pause')}>
                <IconButton size="small" onClick={handlePause} sx={{ color: 'var(--ez-text-subtle)', '&:hover': { color: 'var(--ez-text-muted)' } }}>
                  {isPaused ? <PlayIcon sx={{ fontSize: 13 }} /> : <PauseIcon sx={{ fontSize: 13 }} />}
                </IconButton>
              </Tooltip>
              <Tooltip title={t('logPanel.clear')}>
                <IconButton size="small" onClick={() => onClear(activeKey)} sx={{ color: 'var(--ez-text-subtle)', '&:hover': { color: 'var(--ez-text-muted)' } }}>
                  <ClearIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('logPanel.collapse')}>
                <IconButton size="small" onClick={() => setActiveKey(null)} sx={{ color: 'var(--ez-text-subtle)', '&:hover': { color: 'var(--ez-text-muted)' } }}>
                  <CollapseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('logPanel.closeSession')}>
                <IconButton size="small" onClick={() => onClose(activeKey)} sx={{ color: 'var(--ez-text-subtle)', '&:hover': { color: 'var(--ez-danger-text)' } }}>
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
            '&::-webkit-scrollbar-thumb': { bgcolor: 'var(--ez-border)', borderRadius: 2 },
          }}>
            {activeLogs.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography sx={{ color: 'var(--ez-text-subtle)', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                  {isPaused ? t('logPanel.paused') : t('logPanel.waiting')}
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
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                  }}
                >
                  <Typography component="span" sx={{ color: 'var(--ez-text-faint)', fontSize: '0.75rem', flexShrink: 0, fontFamily: 'monospace', pt: '1px' }}>
                    {fmt(log.timestamp)}
                  </Typography>
                  <Typography component="span" sx={{
                    color: log.type === 'stderr' ? 'var(--ez-danger-text)' : 'var(--ez-accent)',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                    pt: '1px',
                    minWidth: 22,
                  }}>
                    {log.type === 'stderr' ? 'ERR' : 'OUT'}
                  </Typography>
                  <Typography component="span" sx={{
                    color: log.type === 'stderr' ? 'var(--ez-danger-text)' : 'var(--ez-text)',
                    fontSize: '0.875rem',
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
        bgcolor: 'var(--ez-bg-sidebar)',
        borderTop: '1px solid var(--ez-border)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Section label — always visible, left-pinned */}
        <Typography sx={{
          fontSize: '0.75rem', color: 'var(--ez-text-subtle)', fontFamily: 'monospace',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          px: 1, whiteSpace: 'nowrap', flexShrink: 0,
          borderRight: '1px solid var(--ez-border)',
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
            color: 'var(--ez-text-subtle)',
            flexShrink: 0,
            '&:hover': { color: 'var(--ez-text-muted)', bgcolor: 'rgba(255,255,255,0.03)' },
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
            '&::-webkit-scrollbar-thumb': { bgcolor: 'var(--ez-border)', borderRadius: 2 },
          }}
        >
          {Object.entries(logWindows).map(([key, win]) => {
            const isActive = key === activeKey;
            const outCount = countOf(key, 'stdout');
            const errCount = countOf(key, 'stderr');

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
                  borderRadius: '2px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  bgcolor: isActive ? 'var(--ez-bg-surface)' : 'transparent',
                  border: isActive ? '1px solid var(--ez-border)' : '1px solid transparent',
                  transition: 'background 0.1s',
                  '&:hover': { bgcolor: isActive ? 'var(--ez-bg-surface-muted)' : 'rgba(255,255,255,0.03)' },
                }}
              >
                {/* Live pulse dot */}
                <Box sx={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  bgcolor: 'var(--ez-accent)',
                  boxShadow: '0 0 4px rgba(34,197,94,0.5)',
                }} />

                {/* Process name */}
                <Typography sx={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: isActive ? 'var(--ez-text)' : 'var(--ez-text-muted)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {win.processName}
                </Typography>

                {/* Connection name */}
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--ez-text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {win.connectionName}
                </Typography>

                {/* Counts */}
                {outCount > 0 && (
                  <Typography sx={{ fontSize: '0.75rem', color: 'var(--ez-accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {outCount}
                  </Typography>
                )}
                {errCount > 0 && (
                  <Typography sx={{ fontSize: '0.75rem', color: 'var(--ez-danger-text)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {errCount}
                  </Typography>
                )}

                {/* Expand / collapse chevron */}
                {isActive
                  ? <CollapseIcon sx={{ fontSize: 11, color: 'var(--ez-text-subtle)', ml: 0.25 }} />
                  : <ExpandIcon   sx={{ fontSize: 11, color: 'var(--ez-text-faint)', ml: 0.25 }} />
                }

                {/* Close × */}
                <Box
                  component="span"
                  onClick={e => { e.stopPropagation(); onClose(key); }}
                  sx={{
                    fontSize: '13px',
                    lineHeight: 1,
                    color: 'var(--ez-text-subtle)',
                    cursor: 'pointer',
                    ml: 0.25,
                    display: 'flex',
                    alignItems: 'center',
                    '&:hover': { color: 'var(--ez-danger-text)' },
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
            color: 'var(--ez-text-subtle)',
            flexShrink: 0,
            '&:hover': { color: 'var(--ez-text-muted)', bgcolor: 'rgba(255,255,255,0.03)' },
          }}
        >
          <ChevronRightIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
};

export default LogStatusBar;

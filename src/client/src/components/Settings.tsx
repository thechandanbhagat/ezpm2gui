import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Button,
  Divider,
  Snackbar,
  Alert,
  SelectChangeEvent,
  Chip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import TuneIcon         from '@mui/icons-material/Tune';
import PaletteIcon      from '@mui/icons-material/Palette';
import TerminalIcon     from '@mui/icons-material/Terminal';
import DeleteSweepIcon  from '@mui/icons-material/DeleteSweep';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import RestartAltIcon   from '@mui/icons-material/RestartAlt';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import PageHeader from './PageHeader';

// @group Types : Settings page types
type SectionId = 'general' | 'appearance' | 'pm2' | 'advanced' | 'updates';

// @group Types : npm update check response
interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  publishedAt?: string;
}

// @group Types : ndjson line from install stream
interface InstallLine {
  type: 'log' | 'error' | 'done' | 'fail';
  message: string;
}

interface Section {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

// @group Constants : Sidebar section definitions
const SECTIONS: Section[] = [
  { id: 'general',    label: 'General',    icon: <TuneIcon    sx={{ fontSize: 16 }} /> },
  { id: 'appearance', label: 'Appearance', icon: <PaletteIcon sx={{ fontSize: 16 }} /> },
  { id: 'pm2',        label: 'PM2',        icon: <TerminalIcon sx={{ fontSize: 16 }} /> },
  { id: 'advanced',   label: 'Advanced',   icon: <DeleteSweepIcon sx={{ fontSize: 16 }} /> },
  { id: 'updates',    label: 'Updates',    icon: <SystemUpdateAltIcon sx={{ fontSize: 16 }} /> },
];

// @group Utilities : Load setting from localStorage with fallback
const load = (key: string, fallback: string) =>
  localStorage.getItem(key) ?? fallback;

// @group Settings : Main Settings page component
const Settings: React.FC = () => {

  // @group State : Active sidebar section
  const [activeSection, setActiveSection] = useState<SectionId>('general');

  // @group State : Update section
  const [versionInfo,    setVersionInfo]    = useState<VersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [checkError,     setCheckError]     = useState<string | null>(null);
  const [installLines,   setInstallLines]   = useState<InstallLine[]>([]);
  const [installing,     setInstalling]     = useState(false);
  const [restarting,     setRestarting]     = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // @group Effects : Auto-scroll log output as lines arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [installLines]);

  // @group State : All settings values
  const [autoRefresh,      setAutoRefresh]      = useState<boolean>(load('autoRefresh', 'true') === 'true');
  const [refreshInterval,  setRefreshInterval]  = useState<string>(load('refreshInterval', '3000'));
  const [logLines,         setLogLines]         = useState<string>(load('logLines', '100'));
  const [pm2Path,          setPm2Path]          = useState<string>(load('pm2Path', 'pm2'));
  const [theme,            setTheme]            = useState<string>(load('theme', 'blue'));
  const [compactMode,      setCompactMode]      = useState<boolean>(load('compactMode', 'false') === 'true');
  const [showTimestamps,   setShowTimestamps]   = useState<boolean>(load('showTimestamps', 'true') === 'true');
  const [toastOpen,        setToastOpen]        = useState<boolean>(false);
  const [toastMsg,         setToastMsg]         = useState<string>('Settings saved');

  // @group Handlers : Persist a key and show toast
  const save = useCallback((key: string, value: string, msg = 'Saved') => {
    localStorage.setItem(key, value);
    setToastMsg(msg);
    setToastOpen(true);
  }, []);

  const handleThemeChange = (e: SelectChangeEvent) => {
    setTheme(e.target.value);
    save('theme', e.target.value);
  };

  const handleResetDefaults = () => {
    const defaults: Record<string, string> = {
      autoRefresh: 'true', refreshInterval: '3000', logLines: '100',
      pm2Path: 'pm2', theme: 'blue', compactMode: 'false', showTimestamps: 'true',
    };
    Object.entries(defaults).forEach(([k, v]) => localStorage.setItem(k, v));
    setAutoRefresh(true);
    setRefreshInterval('3000');
    setLogLines('100');
    setPm2Path('pm2');
    setTheme('blue');
    setCompactMode(false);
    setShowTimestamps(true);
    setToastMsg('Reset to defaults');
    setToastOpen(true);
  };

  const handleClearData = () => {
    localStorage.clear();
    setToastMsg('All local data cleared');
    setToastOpen(true);
  };

  // @group Handlers : Check for update from npm registry
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setCheckError(null);
    setVersionInfo(null);
    try {
      const res = await fetch('/api/update/check');
      const json = await res.json();
      if (json.success) {
        setVersionInfo(json.data as VersionInfo);
      } else {
        setCheckError(json.error || 'Failed to check for updates');
      }
    } catch {
      setCheckError('Network error — could not reach npm registry');
    } finally {
      setCheckingUpdate(false);
    }
  };

  // @group Handlers : Install update — reads ndjson stream
  const handleInstallUpdate = async () => {
    setInstalling(true);
    setInstallLines([]);
    try {
      const res = await fetch('/api/update/install', { method: 'POST' });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as InstallLine;
            setInstallLines((prev) => [...prev, parsed]);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setInstallLines((prev) => [...prev, { type: 'fail', message: `Stream error: ${(err as Error).message}` }]);
    } finally {
      setInstalling(false);
      // Re-check version after install
      handleCheckUpdate();
    }
  };

  // @group Handlers : Graceful server restart
  const handleRestartServer = async () => {
    setRestarting(true);
    try {
      await fetch('/api/update/restart', { method: 'POST' });
    } catch { /* expected — server goes away */ }
    // Poll until server is back
    const poll = setInterval(async () => {
      try {
        await fetch('/api/update/check');
        clearInterval(poll);
        setRestarting(false);
        window.location.reload();
      } catch { /* still restarting */ }
    }, 1500);
  };

  // @group Components : Reusable setting row — label/description left, control right
  const SettingRow: React.FC<{
    label: string;
    description?: string;
    control: React.ReactNode;
    last?: boolean;
  }> = ({ label, description, control, last }) => (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5, gap: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
          {description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {description}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>{control}</Box>
      </Box>
      {!last && <Divider />}
    </>
  );

  // @group Components : Section wrapper card
  const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ px: 2 }}>{children}</Box>
    </Paper>
  );

  // @group Render : Section content panels
  const renderSection = () => {
    switch (activeSection) {

      // ── General ────────────────────────────────────────────────
      case 'general':
        return (
          <>
            <SectionCard title="Dashboard">
              <SettingRow
                label="Auto Refresh"
                description="Automatically refresh process data at a set interval"
                control={
                  <Switch
                    size="small"
                    checked={autoRefresh}
                    onChange={e => { setAutoRefresh(e.target.checked); save('autoRefresh', String(e.target.checked)); }}
                  />
                }
              />
              <SettingRow
                label="Refresh Interval"
                description="How often to poll for updated process data"
                last
                control={
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select
                      value={refreshInterval}
                      disabled={!autoRefresh}
                      onChange={e => { setRefreshInterval(e.target.value); save('refreshInterval', e.target.value); }}
                    >
                      <MenuItem value="1000">Every 1s</MenuItem>
                      <MenuItem value="2000">Every 2s</MenuItem>
                      <MenuItem value="3000">Every 3s</MenuItem>
                      <MenuItem value="5000">Every 5s</MenuItem>
                      <MenuItem value="10000">Every 10s</MenuItem>
                      <MenuItem value="30000">Every 30s</MenuItem>
                    </Select>
                  </FormControl>
                }
              />
            </SectionCard>

            <SectionCard title="Logs">
              <SettingRow
                label="Log Lines to Display"
                description="Maximum number of log lines shown in the log viewer"
                control={
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={logLines}
                      onChange={e => { setLogLines(e.target.value); save('logLines', e.target.value); }}
                    >
                      <MenuItem value="50">50</MenuItem>
                      <MenuItem value="100">100</MenuItem>
                      <MenuItem value="200">200</MenuItem>
                      <MenuItem value="500">500</MenuItem>
                      <MenuItem value="1000">1000</MenuItem>
                    </Select>
                  </FormControl>
                }
              />
              <SettingRow
                label="Show Timestamps"
                description="Display timestamps alongside each log line"
                last
                control={
                  <Switch
                    size="small"
                    checked={showTimestamps}
                    onChange={e => { setShowTimestamps(e.target.checked); save('showTimestamps', String(e.target.checked)); }}
                  />
                }
              />
            </SectionCard>
          </>
        );

      // ── Appearance ─────────────────────────────────────────────
      case 'appearance':
        return (
          <>
            <SectionCard title="Theme">
              <SettingRow
                label="Compact Mode"
                description="Reduce padding and spacing for a denser layout"
                control={
                  <Switch
                    size="small"
                    checked={compactMode}
                    onChange={e => { setCompactMode(e.target.checked); save('compactMode', String(e.target.checked)); }}
                  />
                }
              />
              <SettingRow
                label="Accent Color"
                description="Primary color used for highlights and active states"
                last
                control={
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select value={theme} onChange={handleThemeChange}>
                      <MenuItem value="blue">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                          Blue
                        </Box>
                      </MenuItem>
                      <MenuItem value="purple">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
                          Purple
                        </Box>
                      </MenuItem>
                      <MenuItem value="green">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
                          Green
                        </Box>
                      </MenuItem>
                      <MenuItem value="orange">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f97316' }} />
                          Orange
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                }
              />
            </SectionCard>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Dark / light mode is toggled from the top-right sun/moon icon in the navigation bar.
              </Typography>
            </Paper>
          </>
        );

      // ── PM2 ────────────────────────────────────────────────────
      case 'pm2':
        return (
          <SectionCard title="PM2 Executable">
            <SettingRow
              label="PM2 Path"
              description="Absolute path or command name for the PM2 binary"
              last
              control={
                <TextField
                  size="small"
                  value={pm2Path}
                  onChange={e => setPm2Path(e.target.value)}
                  onBlur={e => save('pm2Path', e.target.value)}
                  placeholder="pm2"
                  sx={{ width: 200 }}
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8125rem' } }}
                />
              }
            />
          </SectionCard>
        );

      // ── Advanced ───────────────────────────────────────────────
      case 'advanced':
        return (
          <>
            <SectionCard title="Reset">
              <SettingRow
                label="Reset to Defaults"
                description="Restore all settings to their original default values"
                last
                control={
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RestartAltIcon fontSize="small" />}
                    onClick={handleResetDefaults}
                  >
                    Reset
                  </Button>
                }
              />
            </SectionCard>

            <SectionCard title="Data">
              <SettingRow
                label="Clear Local Storage"
                description="Wipe all locally stored data including preferences and cached values"
                last
                control={
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<DeleteSweepIcon fontSize="small" />}
                    onClick={handleClearData}
                  >
                    Clear All
                  </Button>
                }
              />
            </SectionCard>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>Note:</strong> Clearing local storage will remove all saved preferences.
                The page will revert to defaults on next load.
              </Typography>
            </Paper>
          </>
        );

      // ── Updates ────────────────────────────────────────────────
      case 'updates': {
        const lastLine = installLines[installLines.length - 1];
        const installDone = lastLine?.type === 'done';
        const installFailed = lastLine?.type === 'fail';

        return (
          <>
            {/* ── Version check ── */}
            <SectionCard title="Version">
              <SettingRow
                label="Current Version"
                description="The version of ezpm2gui currently running"
                control={
                  <Chip
                    label={versionInfo ? `v${versionInfo.currentVersion}` : 'unknown'}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                }
              />
              <SettingRow
                label="Latest on npm"
                description="The most recent published version from the npm registry"
                control={
                  versionInfo ? (
                    <Chip
                      label={`v${versionInfo.latestVersion}`}
                      size="small"
                      color={versionInfo.updateAvailable ? 'warning' : 'success'}
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <Chip label="—" size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                  )
                }
              />
              <SettingRow
                label="Status"
                description={
                  versionInfo?.publishedAt
                    ? `Latest published: ${new Date(versionInfo.publishedAt).toLocaleDateString()}`
                    : 'Click Check for Updates to fetch latest version info'
                }
                last
                control={
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={checkingUpdate ? <CircularProgress size={12} /> : <SystemUpdateAltIcon fontSize="small" />}
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate || installing}
                  >
                    {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                  </Button>
                }
              />
            </SectionCard>

            {/* ── Check error ── */}
            {checkError && (
              <Alert severity="error" sx={{ mb: 2, fontSize: '0.8125rem' }}>
                {checkError}
              </Alert>
            )}

            {/* ── Update available banner ── */}
            {versionInfo && (
              <Alert
                severity={versionInfo.updateAvailable ? 'info' : 'success'}
                sx={{ mb: 2, fontSize: '0.8125rem' }}
              >
                {versionInfo.updateAvailable
                  ? `v${versionInfo.latestVersion} is available. Install it below.`
                  : `You are on the latest version (v${versionInfo.currentVersion}).`}
              </Alert>
            )}

            {/* ── Install update ── */}
            {versionInfo?.updateAvailable && !installDone && (
              <SectionCard title="Install Update">
                <SettingRow
                  label={`Install v${versionInfo.latestVersion}`}
                  description="Runs npm install -g ezpm2gui@latest. Frontend assets update immediately; restart the server to apply backend changes."
                  last
                  control={
                    <Button
                      variant="contained"
                      size="small"
                      color="primary"
                      startIcon={installing ? <CircularProgress size={12} color="inherit" /> : <SystemUpdateAltIcon fontSize="small" />}
                      onClick={handleInstallUpdate}
                      disabled={installing}
                    >
                      {installing ? 'Installing...' : 'Install Update'}
                    </Button>
                  }
                />
              </SectionCard>
            )}

            {/* ── Install log output ── */}
            {installLines.length > 0 && (
              <Paper variant="outlined" sx={{ mb: 2 }}>
                <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
                    Install Output
                  </Typography>
                  {installing && <LinearProgress sx={{ width: 80, ml: 1 }} />}
                </Box>
                <Box sx={{ p: 1.5, maxHeight: 260, overflowY: 'auto', bgcolor: 'background.default' }}>
                  {installLines.map((line, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      component="div"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        lineHeight: 1.6,
                        color: line.type === 'error' || line.type === 'fail' ? 'error.main'
                          : line.type === 'done' ? 'success.main'
                          : 'text.secondary',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {line.message}
                    </Typography>
                  ))}
                  <div ref={logEndRef} />
                </Box>
              </Paper>
            )}

            {/* ── Post-install actions ── */}
            {installDone && (
              <SectionCard title="Apply Update">
                <SettingRow
                  label="Reload Page"
                  description="Refresh to load the updated frontend assets immediately"
                  control={
                    <Button variant="outlined" size="small" onClick={() => window.location.reload()}>
                      Reload
                    </Button>
                  }
                />
                <SettingRow
                  label="Restart Server"
                  description="Restarts the Node.js server process to apply backend changes. Requires a process manager (PM2, systemd, nodemon) to respawn the process."
                  last
                  control={
                    <Button
                      variant="contained"
                      size="small"
                      color="warning"
                      startIcon={restarting ? <CircularProgress size={12} color="inherit" /> : <RestartAltIcon fontSize="small" />}
                      onClick={handleRestartServer}
                      disabled={restarting}
                    >
                      {restarting ? 'Restarting...' : 'Restart Server'}
                    </Button>
                  }
                />
              </SectionCard>
            )}

            {installFailed && (
              <Alert severity="error" sx={{ fontSize: '0.8125rem' }}>
                Update failed. Check the output above. You can also run <code>npm install -g ezpm2gui@latest</code> manually.
              </Alert>
            )}
          </>
        );
      }
    }
  };

  // @group Render : Page layout — sidebar + content
  return (
    <Box>
      <PageHeader title="Settings" subtitle="Application preferences and configuration" />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>

        {/* ── Left sidebar nav ── */}
        <Paper variant="outlined" sx={{ width: 168, flexShrink: 0, overflow: 'hidden' }}>
          {SECTIONS.map((s, i) => (
            <React.Fragment key={s.id}>
              <Box
                onClick={() => setActiveSection(s.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  px: 1.75, py: 1.25, cursor: 'pointer',
                  bgcolor: activeSection === s.id ? 'primary.main' : 'transparent',
                  color: activeSection === s.id ? 'primary.contrastText' : 'text.secondary',
                  transition: 'background 0.15s',
                  '&:hover': activeSection !== s.id
                    ? { bgcolor: 'action.hover', color: 'text.primary' }
                    : {},
                }}
              >
                {s.icon}
                <Typography variant="body2" sx={{ fontWeight: activeSection === s.id ? 600 : 400, fontSize: '0.8125rem' }}>
                  {s.label}
                </Typography>
                {activeSection === s.id && (
                  <CheckCircleIcon sx={{ fontSize: 13, ml: 'auto', opacity: 0.8 }} />
                )}
              </Box>
              {i < SECTIONS.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Paper>

        {/* ── Right content ── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </Typography>
            <Chip
              label="Auto-saved"
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.6875rem', height: 18, opacity: 0.5 }}
            />
          </Box>

          {renderSection()}
        </Box>
      </Box>

      {/* @group Toast : Save confirmation */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity="success"
          icon={<CheckCircleIcon fontSize="small" />}
          sx={{ fontSize: '0.8125rem' }}
        >
          {toastMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings;

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
import LockIcon         from '@mui/icons-material/Lock';
import LockOpenIcon     from '@mui/icons-material/LockOpen';
import PageHeader from './PageHeader';

// @group Types : Settings page types
type SectionId = 'general' | 'appearance' | 'pm2' | 'advanced' | 'updates' | 'security';

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
  { id: 'security',   label: 'Security',   icon: <LockIcon sx={{ fontSize: 16 }} /> },
];

// @group Utilities : Load setting from localStorage with fallback
const load = (key: string, fallback: string) =>
  localStorage.getItem(key) ?? fallback;

// @group Components : Reusable setting row — label/description left, control right
// Defined outside Settings to keep a stable reference across re-renders (prevents focus loss)
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
// Defined outside Settings to keep a stable reference across re-renders (prevents focus loss)
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

// @group Settings : Main Settings page component
const Settings: React.FC = () => {

  // @group State : Active sidebar section — allow external deep-link via ?section=security
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('section');
    const valid: SectionId[] = ['general', 'appearance', 'pm2', 'advanced', 'updates', 'security'];
    return (valid.includes(s as SectionId) ? s : 'general') as SectionId;
  });

  // @group State : Security section
  const [secPasswordSet,     setSecPasswordSet]     = useState<boolean | null>(null);
  const [secNewPassword,     setSecNewPassword]     = useState('');
  const [secConfirmPassword, setSecConfirmPassword] = useState('');
  const [secCurrentPassword, setSecCurrentPassword] = useState('');
  const [secRemovePassword,  setSecRemovePassword]  = useState('');
  const [secSaving,          setSecSaving]          = useState(false);
  const [secRemoving,        setSecRemoving]         = useState(false);
  const [secError,           setSecError]           = useState<string | null>(null);
  const [secSuccess,         setSecSuccess]         = useState<string | null>(null);
  const [autoLockMinutes,    setAutoLockMinutes]    = useState<number>(0);
  const [autoLockSaving,     setAutoLockSaving]     = useState(false);
  // PIN state
  const [pinSet,             setPinSet]             = useState<boolean | null>(null);
  const [pinNew,             setPinNew]             = useState('');
  const [pinConfirm,         setPinConfirm]         = useState('');
  const [pinRemovePassword,  setPinRemovePassword]  = useState('');
  const [pinSaving,          setPinSaving]          = useState(false);
  const [pinRemoving,        setPinRemoving]        = useState(false);

  // @group Effects : Load security status when the security section is opened
  React.useEffect(() => {
    if (activeSection !== 'security' || secPasswordSet !== null) return;
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(j => {
        setSecPasswordSet(j.passwordSet ?? false);
        setPinSet(j.pinSet ?? false);
        setAutoLockMinutes(j.autoLockMinutes ?? 0);
      })
      .catch(() => setSecPasswordSet(false));
  }, [activeSection, secPasswordSet]);

  // @group Handlers : Set or change PIN
  const handlePinSave = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (!/^\d{4}$/.test(pinNew)) {
      setSecError('PIN must be exactly 4 digits');
      return;
    }
    if (pinNew !== pinConfirm) {
      setSecError('PINs do not match');
      return;
    }
    setPinSaving(true);
    try {
      const res  = await fetch('/api/auth/pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinNew }),
      });
      const json = await res.json();
      if (json.success) {
        setPinSet(true);
        setPinNew('');
        setPinConfirm('');
        setSecSuccess(pinSet ? 'PIN changed successfully' : 'PIN protection enabled');
      } else {
        setSecError(json.error || 'Failed to save PIN');
      }
    } catch {
      setSecError('Network error — could not reach the server');
    } finally {
      setPinSaving(false);
    }
  };

  // @group Handlers : Remove PIN
  const handlePinRemove = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (!pinRemovePassword) {
      setSecError('Enter your current password to remove the PIN');
      return;
    }
    setPinRemoving(true);
    try {
      const res  = await fetch('/api/auth/pin/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pinRemovePassword }),
      });
      const json = await res.json();
      if (json.success) {
        setPinSet(false);
        setPinRemovePassword('');
        setSecSuccess('PIN protection removed');
      } else {
        setSecError(json.error || 'Failed to remove PIN');
      }
    } catch {
      setSecError('Network error — could not reach the server');
    } finally {
      setPinRemoving(false);
    }
  };

  // @group Handlers : Set or change password
  const handleSecSave = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (secNewPassword.length < 4) {
      setSecError('Password must be at least 4 characters');
      return;
    }
    if (secNewPassword !== secConfirmPassword) {
      setSecError('Passwords do not match');
      return;
    }
    setSecSaving(true);
    try {
      const body: Record<string, string> = { password: secNewPassword };
      if (secPasswordSet) body.currentPassword = secCurrentPassword;
      const res  = await fetch('/api/auth/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setSecPasswordSet(true);
        setSecNewPassword('');
        setSecConfirmPassword('');
        setSecCurrentPassword('');
        setSecSuccess(secPasswordSet ? 'Password changed successfully' : 'Password protection enabled');
      } else {
        setSecError(json.error || 'Failed to save password');
      }
    } catch {
      setSecError('Network error — could not reach the server');
    } finally {
      setSecSaving(false);
    }
  };

  // @group Handlers : Remove password
  const handleSecRemove = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (!secRemovePassword) {
      setSecError('Enter your current password to remove protection');
      return;
    }
    setSecRemoving(true);
    try {
      const res  = await fetch('/api/auth/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: secRemovePassword }),
      });
      const json = await res.json();
      if (json.success) {
        setSecPasswordSet(false);
        setSecRemovePassword('');
        setSecSuccess('Password protection removed');
      } else {
        setSecError(json.error || 'Failed to remove password');
      }
    } catch {
      setSecError('Network error — could not reach the server');
    } finally {
      setSecRemoving(false);
    }
  };

  // @group Handlers : Save auto-lock timeout
  const handleAutoLockSave = async (minutes: number) => {
    setAutoLockSaving(true);
    setSecError(null);
    setSecSuccess(null);
    try {
      const res  = await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLockMinutes: minutes }),
      });
      const json = await res.json();
      if (json.success) {
        setAutoLockMinutes(json.autoLockMinutes);
        setSecSuccess(json.autoLockMinutes === 0 ? 'Auto-lock disabled' : `Auto-lock set to ${json.autoLockMinutes} minute${json.autoLockMinutes !== 1 ? 's' : ''}`);
        // Notify App.tsx so the inactivity timer updates immediately
        window.dispatchEvent(new CustomEvent('ezpm2_autolock_changed', { detail: { autoLockMinutes: json.autoLockMinutes } }));
      } else {
        setSecError(json.error || 'Failed to save auto-lock setting');
      }
    } catch {
      setSecError('Network error — could not reach the server');
    } finally {
      setAutoLockSaving(false);
    }
  };

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

      // ── Security ───────────────────────────────────────────────
      case 'security': {
        const isLoading = secPasswordSet === null;
        return (
          <>
            {secError   && <Alert severity="error"   sx={{ mb: 2, fontSize: '0.8125rem' }} onClose={() => setSecError(null)}>{secError}</Alert>}
            {secSuccess && <Alert severity="success" sx={{ mb: 2, fontSize: '0.8125rem' }} onClose={() => setSecSuccess(null)}>{secSuccess}</Alert>}

            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              <>
                {/* Status */}
                <SectionCard title="Status">
                  <SettingRow
                    label="Password Protection"
                    description="When enabled, a password is required to access EZ PM2 GUI"
                    last
                    control={
                      <Chip
                        label={secPasswordSet ? 'Enabled' : 'Disabled'}
                        size="small"
                        color={secPasswordSet ? 'success' : 'default'}
                        variant={secPasswordSet ? 'filled' : 'outlined'}
                        icon={secPasswordSet ? <LockIcon sx={{ fontSize: '12px !important' }} /> : <LockOpenIcon sx={{ fontSize: '12px !important' }} />}
                      />
                    }
                  />
                </SectionCard>

                {/* Set / Change password */}
                <SectionCard title={secPasswordSet ? 'Change Password' : 'Set Password'}>
                  {secPasswordSet && (
                    <SettingRow
                      label="Current Password"
                      description="Required to change the existing password"
                      control={
                        <TextField
                          type="password"
                          size="small"
                          value={secCurrentPassword}
                          onChange={e => setSecCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          sx={{ width: 200 }}
                        />
                      }
                    />
                  )}
                  <SettingRow
                    label="New Password"
                    description="Minimum 4 characters"
                    control={
                      <TextField
                        type="password"
                        size="small"
                        value={secNewPassword}
                        onChange={e => setSecNewPassword(e.target.value)}
                        placeholder="New password"
                        sx={{ width: 200 }}
                      />
                    }
                  />
                  <SettingRow
                    label="Confirm Password"
                    description="Re-enter new password to confirm"
                    last
                    control={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          type="password"
                          size="small"
                          value={secConfirmPassword}
                          onChange={e => setSecConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                          sx={{ width: 200 }}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleSecSave}
                          disabled={secSaving || !secNewPassword || !secConfirmPassword}
                          startIcon={secSaving ? <CircularProgress size={12} color="inherit" /> : <LockIcon fontSize="small" />}
                        >
                          {secSaving ? 'Saving...' : secPasswordSet ? 'Change' : 'Enable'}
                        </Button>
                      </Box>
                    }
                  />
                </SectionCard>

                {/* Remove password */}
                {secPasswordSet && (
                  <SectionCard title="Remove Password">
                    <SettingRow
                      label="Disable Protection"
                      description="Enter your current password to remove password protection"
                      last
                      control={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TextField
                            type="password"
                            size="small"
                            value={secRemovePassword}
                            onChange={e => setSecRemovePassword(e.target.value)}
                            placeholder="Current password"
                            sx={{ width: 160 }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={handleSecRemove}
                            disabled={secRemoving || !secRemovePassword}
                            startIcon={secRemoving ? <CircularProgress size={12} color="inherit" /> : <LockOpenIcon fontSize="small" />}
                          >
                            {secRemoving ? 'Removing...' : 'Remove'}
                          </Button>
                        </Box>
                      }
                    />
                  </SectionCard>
                )}

                {/* PIN Protection */}
                {secPasswordSet && (
                  <SectionCard title="PIN Protection">
                    <SettingRow
                      label="PIN Status"
                      description="A 4-digit PIN can be used on the lock screen as an alternative to your password"
                      control={
                        <Chip
                          size="small"
                          label={pinSet ? 'Enabled' : 'Disabled'}
                          color={pinSet ? 'success' : 'default'}
                          variant={pinSet ? 'filled' : 'outlined'}
                        />
                      }
                    />
                    <SettingRow
                      label={pinSet ? 'Change PIN' : 'Set PIN'}
                      description="Enter a 4-digit numeric PIN"
                      control={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TextField
                            size="small"
                            value={pinNew}
                            onChange={e => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="New PIN"
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
                            sx={{ width: 100 }}
                          />
                          <TextField
                            size="small"
                            value={pinConfirm}
                            onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="Confirm"
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
                            sx={{ width: 100 }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handlePinSave}
                            disabled={pinSaving || pinNew.length !== 4 || pinConfirm.length !== 4}
                            startIcon={pinSaving ? <CircularProgress size={12} color="inherit" /> : undefined}
                          >
                            {pinSaving ? 'Saving...' : pinSet ? 'Change' : 'Enable'}
                          </Button>
                        </Box>
                      }
                    />
                    {pinSet && (
                      <SettingRow
                        label="Remove PIN"
                        description="Enter your current password to remove PIN protection"
                        last
                        control={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TextField
                              type="password"
                              size="small"
                              value={pinRemovePassword}
                              onChange={e => setPinRemovePassword(e.target.value)}
                              placeholder="Current password"
                              sx={{ width: 160 }}
                            />
                            <Button
                              variant="outlined"
                              size="small"
                              color="error"
                              onClick={handlePinRemove}
                              disabled={pinRemoving || !pinRemovePassword}
                              startIcon={pinRemoving ? <CircularProgress size={12} color="inherit" /> : <LockOpenIcon fontSize="small" />}
                            >
                              {pinRemoving ? 'Removing...' : 'Remove'}
                            </Button>
                          </Box>
                        }
                      />
                    )}
                    {!pinSet && <Box />}
                  </SectionCard>
                )}

                {/* Auto-lock timeout */}
                {secPasswordSet && (
                  <SectionCard title="Auto-Lock">
                    <SettingRow
                      label="Lock after inactivity"
                      description="Automatically lock the app after a period of inactivity. Set to 0 to disable."
                      last
                      control={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TextField
                            type="number"
                            size="small"
                            value={autoLockMinutes}
                            onChange={e => setAutoLockMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            inputProps={{ min: 0, max: 480, step: 1 }}
                            sx={{ width: 80 }}
                          />
                          <Typography variant="caption" color="text.secondary">min</Typography>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleAutoLockSave(autoLockMinutes)}
                            disabled={autoLockSaving}
                            startIcon={autoLockSaving ? <CircularProgress size={12} color="inherit" /> : undefined}
                          >
                            {autoLockSaving ? 'Saving...' : 'Save'}
                          </Button>
                        </Box>
                      }
                    />
                  </SectionCard>
                )}

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    The password is hashed with PBKDF2 (SHA-512, 100,000 iterations) and stored server-side.
                    It is never stored in plain text.
                  </Typography>
                </Paper>
              </>
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

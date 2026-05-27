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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const SECTIONS: Section[] = [
    { id: 'general',    label: t('settings.sections.general'),    icon: <TuneIcon    sx={{ fontSize: 16 }} /> },
    { id: 'appearance', label: t('settings.sections.appearance'), icon: <PaletteIcon sx={{ fontSize: 16 }} /> },
    { id: 'pm2',        label: t('settings.sections.pm2'),        icon: <TerminalIcon sx={{ fontSize: 16 }} /> },
    { id: 'advanced',   label: t('settings.sections.advanced'),   icon: <DeleteSweepIcon sx={{ fontSize: 16 }} /> },
    { id: 'updates',    label: t('settings.sections.updates'),    icon: <SystemUpdateAltIcon sx={{ fontSize: 16 }} /> },
    { id: 'security',   label: t('settings.sections.security'),   icon: <LockIcon sx={{ fontSize: 16 }} /> },
  ];

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
      setSecError(t('settings.messages.pinMustBe4Digits'));
      return;
    }
    if (pinNew !== pinConfirm) {
      setSecError(t('settings.messages.pinsDoNotMatch'));
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
        setSecSuccess(pinSet ? t('settings.messages.pinChanged') : t('settings.messages.pinEnabled'));
      } else {
        setSecError(json.error || t('settings.messages.failedSavePin'));
      }
    } catch {
      setSecError(t('settings.messages.networkError'));
    } finally {
      setPinSaving(false);
    }
  };

  // @group Handlers : Remove PIN
  const handlePinRemove = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (!pinRemovePassword) {
      setSecError(t('settings.messages.enterPasswordToRemovePin'));
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
        setSecSuccess(t('settings.messages.pinRemoved'));
      } else {
        setSecError(json.error || t('settings.messages.failedRemovePin'));
      }
    } catch {
      setSecError(t('settings.messages.networkError'));
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
        setSecSuccess(secPasswordSet ? t('settings.messages.passwordChanged') : t('settings.messages.passwordEnabled'));
      } else {
        setSecError(json.error || t('settings.messages.failedSavePassword'));
      }
    } catch {
      setSecError(t('settings.messages.networkError'));
    } finally {
      setSecSaving(false);
    }
  };

  // @group Handlers : Remove password
  const handleSecRemove = async () => {
    setSecError(null);
    setSecSuccess(null);
    if (!secRemovePassword) {
      setSecError(t('settings.messages.enterPasswordToRemove'));
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
        setSecSuccess(t('settings.messages.passwordRemoved'));
      } else {
        setSecError(json.error || t('settings.messages.failedRemovePassword'));
      }
    } catch {
      setSecError(t('settings.messages.networkError'));
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
        setSecSuccess(json.autoLockMinutes === 0 ? t('settings.messages.autoLockDisabled') : `Auto-lock set to ${json.autoLockMinutes} minute${json.autoLockMinutes !== 1 ? 's' : ''}`);
        // Notify App.tsx so the inactivity timer updates immediately
        window.dispatchEvent(new CustomEvent('ezpm2_autolock_changed', { detail: { autoLockMinutes: json.autoLockMinutes } }));
      } else {
        setSecError(json.error || t('settings.messages.failedSaveAutolock'));
      }
    } catch {
      setSecError(t('settings.messages.networkError'));
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
  const [toastMsg,         setToastMsg]         = useState<string>('');

  // @group Handlers : Persist a key and show toast
  const save = useCallback((key: string, value: string, msg?: string) => {
    localStorage.setItem(key, value);
    setToastMsg(msg ?? t('settings.messages.saved'));
    setToastOpen(true);
  }, [t]);

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
    setToastMsg(t('settings.messages.resetToDefaults'));
    setToastOpen(true);
  };

  const handleClearData = () => {
    localStorage.clear();
    setToastMsg(t('settings.messages.dataCleared'));
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
        setCheckError(json.error || t('settings.messages.failedCheckUpdates'));
      }
    } catch {
      setCheckError(t('settings.messages.networkErrorNpm'));
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
            <SectionCard title={t('settings.cards.dashboard')}>
              <SettingRow
                label={t('settings.rows.autoRefresh')}
                description={t('settings.rows.autoRefreshDesc')}
                control={
                  <Switch
                    size="small"
                    checked={autoRefresh}
                    onChange={e => { setAutoRefresh(e.target.checked); save('autoRefresh', String(e.target.checked)); }}
                  />
                }
              />
              <SettingRow
                label={t('settings.rows.refreshInterval')}
                description={t('settings.rows.refreshIntervalDesc')}
                last
                control={
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select
                      value={refreshInterval}
                      disabled={!autoRefresh}
                      onChange={e => { setRefreshInterval(e.target.value); save('refreshInterval', e.target.value); }}
                    >
                      <MenuItem value="1000">{t('settings.intervals.every1s')}</MenuItem>
                      <MenuItem value="2000">{t('settings.intervals.every2s')}</MenuItem>
                      <MenuItem value="3000">{t('settings.intervals.every3s')}</MenuItem>
                      <MenuItem value="5000">{t('settings.intervals.every5s')}</MenuItem>
                      <MenuItem value="10000">{t('settings.intervals.every10s')}</MenuItem>
                      <MenuItem value="30000">{t('settings.intervals.every30s')}</MenuItem>
                    </Select>
                  </FormControl>
                }
              />
            </SectionCard>

            <SectionCard title={t('settings.cards.logs')}>
              <SettingRow
                label={t('settings.rows.logLines')}
                description={t('settings.rows.logLinesDesc')}
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
                label={t('settings.rows.showTimestamps')}
                description={t('settings.rows.showTimestampsDesc')}
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
            <SectionCard title={t('settings.cards.theme')}>
              <SettingRow
                label={t('settings.rows.compactMode')}
                description={t('settings.rows.compactModeDesc')}
                control={
                  <Switch
                    size="small"
                    checked={compactMode}
                    onChange={e => { setCompactMode(e.target.checked); save('compactMode', String(e.target.checked)); }}
                  />
                }
              />
              <SettingRow
                label={t('settings.rows.accentColor')}
                description={t('settings.rows.accentColorDesc')}
                last
                control={
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select value={theme} onChange={handleThemeChange}>
                      <MenuItem value="blue">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                          {t('settings.colors.blue')}
                        </Box>
                      </MenuItem>
                      <MenuItem value="purple">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
                          {t('settings.colors.purple')}
                        </Box>
                      </MenuItem>
                      <MenuItem value="green">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
                          {t('settings.colors.green')}
                        </Box>
                      </MenuItem>
                      <MenuItem value="orange">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f97316' }} />
                          {t('settings.colors.orange')}
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                }
              />
            </SectionCard>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {t('settings.notes.darkModeToggle')}
              </Typography>
            </Paper>
          </>
        );

      // ── PM2 ────────────────────────────────────────────────────
      case 'pm2':
        return (
          <SectionCard title={t('settings.cards.pm2Executable')}>
            <SettingRow
              label={t('settings.rows.pm2Path')}
              description={t('settings.rows.pm2PathDesc')}
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
            <SectionCard title={t('settings.cards.reset')}>
              <SettingRow
                label={t('settings.rows.resetToDefaults')}
                description={t('settings.rows.resetToDefaultsDesc')}
                last
                control={
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RestartAltIcon fontSize="small" />}
                    onClick={handleResetDefaults}
                  >
                    {t('settings.buttons.reset')}
                  </Button>
                }
              />
            </SectionCard>

            <SectionCard title={t('settings.cards.data')}>
              <SettingRow
                label={t('settings.rows.clearLocalStorage')}
                description={t('settings.rows.clearLocalStorageDesc')}
                last
                control={
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<DeleteSweepIcon fontSize="small" />}
                    onClick={handleClearData}
                  >
                    {t('settings.buttons.clearAll')}
                  </Button>
                }
              />
            </SectionCard>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('settings.notes.clearDataNote')}
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
            <SectionCard title={t('settings.cards.version')}>
              <SettingRow
                label={t('settings.rows.currentVersion')}
                description={t('settings.rows.currentVersionDesc')}
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
                label={t('settings.rows.latestOnNpm')}
                description={t('settings.rows.latestOnNpmDesc')}
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
                label={t('settings.rows.statusLabel')}
                description={
                  versionInfo?.publishedAt
                    ? `${t('settings.notes.latestPublishedPrefix')} ${new Date(versionInfo.publishedAt).toLocaleDateString()}`
                    : t('settings.notes.clickToFetch')
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
                    {checkingUpdate ? t('settings.buttons.checking') : t('settings.buttons.checkForUpdates')}
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
              <SectionCard title={t('settings.cards.installUpdate')}>
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
                      {installing ? t('settings.buttons.installing') : t('settings.buttons.installUpdate')}
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
                    {t('settings.cards.installOutput')}
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
              <SectionCard title={t('settings.cards.applyUpdate')}>
                <SettingRow
                  label={t('settings.rows.reloadPage')}
                  description={t('settings.rows.reloadPageDesc')}
                  control={
                    <Button variant="outlined" size="small" onClick={() => window.location.reload()}>
                      {t('settings.buttons.reload')}
                    </Button>
                  }
                />
                <SettingRow
                  label={t('settings.rows.restartServer')}
                  description={t('settings.rows.restartServerDesc')}
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
                      {restarting ? t('settings.buttons.restarting') : t('settings.buttons.restartServer')}
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
                <SectionCard title={t('settings.cards.status')}>
                  <SettingRow
                    label={t('settings.rows.passwordProtection')}
                    description={t('settings.rows.passwordProtectionDesc')}
                    last
                    control={
                      <Chip
                        label={secPasswordSet ? t('common.enabled') : t('settings.rows.disabled')}
                        size="small"
                        color={secPasswordSet ? 'success' : 'default'}
                        variant={secPasswordSet ? 'filled' : 'outlined'}
                        icon={secPasswordSet ? <LockIcon sx={{ fontSize: '12px !important' }} /> : <LockOpenIcon sx={{ fontSize: '12px !important' }} />}
                      />
                    }
                  />
                </SectionCard>

                {/* Set / Change password */}
                <SectionCard title={secPasswordSet ? t('settings.cards.changePassword') : t('settings.cards.setPassword')}>
                  {secPasswordSet && (
                    <SettingRow
                      label={t('settings.rows.currentPassword')}
                      description={t('settings.rows.currentPasswordDesc')}
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
                    label={t('settings.rows.newPassword')}
                    description={t('settings.rows.newPasswordDesc')}
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
                    label={t('settings.rows.confirmPassword')}
                    description={t('settings.rows.confirmPasswordDesc')}
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
                          {secSaving ? t('settings.buttons.saving') : secPasswordSet ? t('settings.buttons.change') : t('settings.buttons.enable')}
                        </Button>
                      </Box>
                    }
                  />
                </SectionCard>

                {/* Remove password */}
                {secPasswordSet && (
                  <SectionCard title={t('settings.cards.removePassword')}>
                    <SettingRow
                      label={t('settings.rows.disableProtection')}
                      description={t('settings.rows.disableProtectionDesc')}
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
                            {secRemoving ? t('settings.buttons.removing') : t('settings.buttons.remove')}
                          </Button>
                        </Box>
                      }
                    />
                  </SectionCard>
                )}

                {/* PIN Protection */}
                {secPasswordSet && (
                  <SectionCard title={t('settings.cards.pinProtection')}>
                    <SettingRow
                      label={t('settings.rows.pinStatus')}
                      description={t('settings.rows.pinStatusDesc')}
                      control={
                        <Chip
                          size="small"
                          label={pinSet ? t('common.enabled') : t('settings.rows.disabled')}
                          color={pinSet ? 'success' : 'default'}
                          variant={pinSet ? 'filled' : 'outlined'}
                        />
                      }
                    />
                    <SettingRow
                      label={pinSet ? t('settings.rows.changePin') : t('settings.rows.setPin')}
                      description={t('settings.rows.pinDesc')}
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
                            {pinSaving ? t('settings.buttons.saving') : pinSet ? t('settings.buttons.change') : t('settings.buttons.enable')}
                          </Button>
                        </Box>
                      }
                    />
                    {pinSet && (
                      <SettingRow
                        label={t('settings.rows.removePin')}
                        description={t('settings.rows.removePinDesc')}
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
                              {pinRemoving ? t('settings.buttons.removing') : t('settings.buttons.remove')}
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
                  <SectionCard title={t('settings.cards.autoLock')}>
                    <SettingRow
                      label={t('settings.rows.lockAfterInactivity')}
                      description={t('settings.rows.lockAfterInactivityDesc')}
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
                          <Typography variant="caption" color="text.secondary">{t('settings.messages.min')}</Typography>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleAutoLockSave(autoLockMinutes)}
                            disabled={autoLockSaving}
                            startIcon={autoLockSaving ? <CircularProgress size={12} color="inherit" /> : undefined}
                          >
                            {autoLockSaving ? t('settings.buttons.saving') : t('settings.buttons.save')}
                          </Button>
                        </Box>
                      }
                    />
                  </SectionCard>
                )}

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('settings.notes.securityNote')}
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
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

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
              label={t('settings.autoSaved')}
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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import PageHeader from './PageHeader';
import { useTranslation } from 'react-i18next';
import { setToken, clearToken } from '../auth';

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
  icon: string;
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
    <div className="flex items-center justify-between py-3 gap-6">
      <div className="min-w-0">
        <span className="text-[10px] font-mono text-[#e8e8e8] block">{label}</span>
        {description && (
          <span className="text-[9px] font-mono text-[#555] block mt-0.5">{description}</span>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
    {!last && <div className="border-t border-[#111]" />}
  </>
);

// @group Components : Section wrapper card
// Defined outside Settings to keep a stable reference across re-renders (prevents focus loss)
const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-[#111] border border-[#1e1e1e] rounded-sm mb-3">
    <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center gap-2">
      <span className="text-[9px] font-mono font-bold text-[#555] uppercase tracking-[0.15em]">{title}</span>
    </div>
    <div className="px-4">{children}</div>
  </div>
);

// @group Components : CLI toggle switch
const CliToggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={[
      'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-sm transition-colors duration-150',
      checked ? 'bg-[#22c55e]' : 'bg-[#1a1a1a] border border-[#333]',
    ].join(' ')}
  >
    <span
      className={[
        'pointer-events-none inline-block h-3 w-3 rounded-sm bg-[#0a0a0a] shadow transition-transform duration-150 mt-0.5',
        checked ? 'translate-x-3.5' : 'translate-x-0.5',
      ].join(' ')}
    />
  </button>
);

// @group Components : CLI status badge
const StatusBadge: React.FC<{ active: boolean; labelOn: string; labelOff: string }> = ({ active, labelOn, labelOff }) => (
  <span
    className={[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] border',
      active
        ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5'
        : 'border-[#333] text-[#555] bg-transparent',
    ].join(' ')}
  >
    {active ? labelOn : labelOff}
  </span>
);

// @group Settings : Main Settings page component
const Settings: React.FC = () => {
  const { t } = useTranslation();

  const SECTIONS: Section[] = [
    { id: 'general',    label: t('settings.sections.general'),    icon: '⚙' },
    { id: 'appearance', label: t('settings.sections.appearance'), icon: '◈' },
    { id: 'pm2',        label: t('settings.sections.pm2'),        icon: '▶' },
    { id: 'advanced',   label: t('settings.sections.advanced'),   icon: '⚠' },
    { id: 'updates',    label: t('settings.sections.updates'),    icon: '↑' },
    { id: 'security',   label: t('settings.sections.security'),   icon: '⊙' },
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
        // Setting/changing the password revokes old sessions server-side — store
        // the fresh token so this client stays signed in instead of being locked out.
        if (json.token) setToken(json.token);
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
        // Password removed — enforcement is off and the old token was revoked.
        clearToken();
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

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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

  // @group Utilities : Shared input class
  const inputCls = 'bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none';
  const selectCls = inputCls;

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
                  <CliToggle
                    checked={autoRefresh}
                    onChange={v => { setAutoRefresh(v); save('autoRefresh', String(v)); }}
                  />
                }
              />
              <SettingRow
                label={t('settings.rows.refreshInterval')}
                description={t('settings.rows.refreshIntervalDesc')}
                last
                control={
                  <select
                    className={selectCls}
                    value={refreshInterval}
                    disabled={!autoRefresh}
                    onChange={e => { setRefreshInterval(e.target.value); save('refreshInterval', e.target.value); }}
                  >
                    <option value="1000">{t('settings.intervals.every1s')}</option>
                    <option value="2000">{t('settings.intervals.every2s')}</option>
                    <option value="3000">{t('settings.intervals.every3s')}</option>
                    <option value="5000">{t('settings.intervals.every5s')}</option>
                    <option value="10000">{t('settings.intervals.every10s')}</option>
                    <option value="30000">{t('settings.intervals.every30s')}</option>
                  </select>
                }
              />
            </SectionCard>

            <SectionCard title={t('settings.cards.logs')}>
              <SettingRow
                label={t('settings.rows.logLines')}
                description={t('settings.rows.logLinesDesc')}
                control={
                  <select
                    className={selectCls}
                    value={logLines}
                    onChange={e => { setLogLines(e.target.value); save('logLines', e.target.value); }}
                  >
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                    <option value="1000">1000</option>
                  </select>
                }
              />
              <SettingRow
                label={t('settings.rows.showTimestamps')}
                description={t('settings.rows.showTimestampsDesc')}
                last
                control={
                  <CliToggle
                    checked={showTimestamps}
                    onChange={v => { setShowTimestamps(v); save('showTimestamps', String(v)); }}
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
                  <CliToggle
                    checked={compactMode}
                    onChange={v => { setCompactMode(v); save('compactMode', String(v)); }}
                  />
                }
              />
              <SettingRow
                label={t('settings.rows.accentColor')}
                description={t('settings.rows.accentColorDesc')}
                last
                control={
                  <select className={selectCls} value={theme} onChange={handleThemeChange}>
                    <option value="blue">{t('settings.colors.blue')}</option>
                    <option value="purple">{t('settings.colors.purple')}</option>
                    <option value="green">{t('settings.colors.green')}</option>
                    <option value="orange">{t('settings.colors.orange')}</option>
                  </select>
                }
              />
            </SectionCard>

            <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
              <span className="text-[9px] font-mono text-[#555] block">
                {t('settings.notes.darkModeToggle')}
              </span>
            </div>
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
                <input
                  className={`${inputCls} w-48`}
                  value={pm2Path}
                  onChange={e => setPm2Path(e.target.value)}
                  onBlur={e => save('pm2Path', e.target.value)}
                  placeholder="pm2"
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
                  <button
                    className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-4 py-1.5 rounded-sm hover:text-[#e8e8e8] hover:border-[#555] transition-colors"
                    onClick={handleResetDefaults}
                  >
                    {t('settings.buttons.reset')}
                  </button>
                }
              />
            </SectionCard>

            <SectionCard title={t('settings.cards.data')}>
              <SettingRow
                label={t('settings.rows.clearLocalStorage')}
                description={t('settings.rows.clearLocalStorageDesc')}
                last
                control={
                  <button
                    className="border border-[#ef4444]/40 text-[#ef4444] font-mono text-xs px-4 py-1.5 rounded-sm hover:bg-[#1a0000] transition-colors"
                    onClick={handleClearData}
                  >
                    {t('settings.buttons.clearAll')}
                  </button>
                }
              />
            </SectionCard>

            <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
              <span className="text-[9px] font-mono text-[#555] block">
                {t('settings.notes.clearDataNote')}
              </span>
            </div>
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
                  <span className="bg-[#0a0a0a] border border-[#1e1e1e] font-mono text-[10px] text-[#22d3ee] px-2 py-1 rounded-sm">
                    {versionInfo ? `v${versionInfo.currentVersion}` : 'unknown'}
                  </span>
                }
              />
              <SettingRow
                label={t('settings.rows.latestOnNpm')}
                description={t('settings.rows.latestOnNpmDesc')}
                control={
                  versionInfo ? (
                    <span
                      className={[
                        'bg-[#0a0a0a] border font-mono text-[10px] px-2 py-1 rounded-sm',
                        versionInfo.updateAvailable
                          ? 'border-[#f59e0b]/40 text-[#f59e0b]'
                          : 'border-[#22c55e]/40 text-[#22c55e]',
                      ].join(' ')}
                    >
                      v{versionInfo.latestVersion}
                    </span>
                  ) : (
                    <span className="bg-[#0a0a0a] border border-[#1e1e1e] font-mono text-[10px] text-[#555] px-2 py-1 rounded-sm">
                      —
                    </span>
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
                  <button
                    className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate || installing}
                  >
                    {checkingUpdate ? t('settings.buttons.checking') : t('settings.buttons.checkForUpdates')}
                  </button>
                }
              />
            </SectionCard>

            {/* ── Check error ── */}
            {checkError && (
              <div className="bg-[#1a0000] border border-[#ef4444]/30 rounded-sm px-3 py-2 mb-3">
                <span className="text-[10px] font-mono text-[#ef4444]">{checkError}</span>
              </div>
            )}

            {/* ── Update available banner ── */}
            {versionInfo && (
              <div
                className={[
                  'rounded-sm px-3 py-2 mb-3 border',
                  versionInfo.updateAvailable
                    ? 'bg-[#1a1200] border-[#f59e0b]/30'
                    : 'bg-[#001a08] border-[#22c55e]/30',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-[10px] font-mono',
                    versionInfo.updateAvailable ? 'text-[#f59e0b]' : 'text-[#22c55e]',
                  ].join(' ')}
                >
                  {versionInfo.updateAvailable
                    ? `v${versionInfo.latestVersion} is available. Install it below.`
                    : `You are on the latest version (v${versionInfo.currentVersion}).`}
                </span>
              </div>
            )}

            {/* ── Install update ── */}
            {versionInfo?.updateAvailable && !installDone && (
              <SectionCard title={t('settings.cards.installUpdate')}>
                <SettingRow
                  label={`Install v${versionInfo.latestVersion}`}
                  description="Runs npm install -g ezpm2gui@latest. Frontend assets update immediately; restart the server to apply backend changes."
                  last
                  control={
                    <button
                      className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                      onClick={handleInstallUpdate}
                      disabled={installing}
                    >
                      {installing ? t('settings.buttons.installing') : t('settings.buttons.installUpdate')}
                    </button>
                  }
                />
              </SectionCard>
            )}

            {/* ── Install log output ── */}
            {installLines.length > 0 && (
              <div className="bg-[#111] border border-[#1e1e1e] rounded-sm mb-3">
                <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold text-[#555] uppercase tracking-[0.15em]">
                    {t('settings.cards.installOutput')}
                  </span>
                  {installing && (
                    <div className="flex gap-0.5 items-center">
                      <span className="w-1 h-1 bg-[#22c55e] rounded-full animate-pulse" />
                      <span className="w-1 h-1 bg-[#22c55e] rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-1 bg-[#22c55e] rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </div>
                <div className="p-3 max-h-64 overflow-y-auto bg-[#0a0a0a]">
                  {installLines.map((line, i) => (
                    <div
                      key={i}
                      className={[
                        'font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all',
                        line.type === 'error' || line.type === 'fail' ? 'text-[#ef4444]'
                          : line.type === 'done' ? 'text-[#22c55e]'
                          : 'text-[#555]',
                      ].join(' ')}
                    >
                      {line.message}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            {/* ── Post-install actions ── */}
            {installDone && (
              <SectionCard title={t('settings.cards.applyUpdate')}>
                <SettingRow
                  label={t('settings.rows.reloadPage')}
                  description={t('settings.rows.reloadPageDesc')}
                  control={
                    <button
                      className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-4 py-1.5 rounded-sm hover:text-[#e8e8e8] hover:border-[#555] transition-colors"
                      onClick={() => window.location.reload()}
                    >
                      {t('settings.buttons.reload')}
                    </button>
                  }
                />
                <SettingRow
                  label={t('settings.rows.restartServer')}
                  description={t('settings.rows.restartServerDesc')}
                  last
                  control={
                    <button
                      className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                      onClick={handleRestartServer}
                      disabled={restarting}
                    >
                      {restarting ? t('settings.buttons.restarting') : t('settings.buttons.restartServer')}
                    </button>
                  }
                />
              </SectionCard>
            )}

            {installFailed && (
              <div className="bg-[#1a0000] border border-[#ef4444]/30 rounded-sm px-3 py-2">
                <span className="text-[10px] font-mono text-[#ef4444]">
                  Update failed. Check the output above. You can also run{' '}
                  <code className="bg-[#0a0a0a] border border-[#1e1e1e] font-mono text-[10px] text-[#22d3ee] px-1 rounded-sm">
                    npm install -g ezpm2gui@latest
                  </code>{' '}
                  manually.
                </span>
              </div>
            )}
          </>
        );
      }

      // ── Security ───────────────────────────────────────────────
      case 'security': {
        const isLoading = secPasswordSet === null;
        return (
          <>
            {secError && (
              <div className="bg-[#1a0000] border border-[#ef4444]/30 rounded-sm px-3 py-2 mb-3 flex items-start justify-between gap-2">
                <span className="text-[10px] font-mono text-[#ef4444]">{secError}</span>
                <button onClick={() => setSecError(null)} className="text-[#ef4444] text-[10px] font-mono shrink-0 hover:text-[#ff6666]">✕</button>
              </div>
            )}
            {secSuccess && (
              <div className="bg-[#001a08] border border-[#22c55e]/30 rounded-sm px-3 py-2 mb-3 flex items-start justify-between gap-2">
                <span className="text-[10px] font-mono text-[#22c55e]">{secSuccess}</span>
                <button onClick={() => setSecSuccess(null)} className="text-[#22c55e] text-[10px] font-mono shrink-0 hover:text-[#66ff99]">✕</button>
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-8">
                <span className="text-[10px] font-mono text-[#555] animate-pulse">loading...</span>
              </div>
            ) : (
              <>
                {/* Status */}
                <SectionCard title={t('settings.cards.status')}>
                  <SettingRow
                    label={t('settings.rows.passwordProtection')}
                    description={t('settings.rows.passwordProtectionDesc')}
                    last
                    control={
                      <StatusBadge
                        active={!!secPasswordSet}
                        labelOn={t('common.enabled')}
                        labelOff={t('settings.rows.disabled')}
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
                        <input
                          type="password"
                          className={`${inputCls} w-48`}
                          value={secCurrentPassword}
                          onChange={e => setSecCurrentPassword(e.target.value)}
                          placeholder="Current password"
                        />
                      }
                    />
                  )}
                  <SettingRow
                    label={t('settings.rows.newPassword')}
                    description={t('settings.rows.newPasswordDesc')}
                    control={
                      <input
                        type="password"
                        className={`${inputCls} w-48`}
                        value={secNewPassword}
                        onChange={e => setSecNewPassword(e.target.value)}
                        placeholder="New password"
                      />
                    }
                  />
                  <SettingRow
                    label={t('settings.rows.confirmPassword')}
                    description={t('settings.rows.confirmPasswordDesc')}
                    last
                    control={
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          className={`${inputCls} w-48`}
                          value={secConfirmPassword}
                          onChange={e => setSecConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                        />
                        <button
                          className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                          onClick={handleSecSave}
                          disabled={secSaving || !secNewPassword || !secConfirmPassword}
                        >
                          {secSaving ? t('settings.buttons.saving') : secPasswordSet ? t('settings.buttons.change') : t('settings.buttons.enable')}
                        </button>
                      </div>
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
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            className={`${inputCls} w-40`}
                            value={secRemovePassword}
                            onChange={e => setSecRemovePassword(e.target.value)}
                            placeholder="Current password"
                          />
                          <button
                            className="border border-[#ef4444]/40 text-[#ef4444] font-mono text-xs px-4 py-1.5 rounded-sm hover:bg-[#1a0000] disabled:opacity-40 transition-colors"
                            onClick={handleSecRemove}
                            disabled={secRemoving || !secRemovePassword}
                          >
                            {secRemoving ? t('settings.buttons.removing') : t('settings.buttons.remove')}
                          </button>
                        </div>
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
                        <StatusBadge
                          active={!!pinSet}
                          labelOn={t('common.enabled')}
                          labelOff={t('settings.rows.disabled')}
                        />
                      }
                    />
                    <SettingRow
                      label={pinSet ? t('settings.rows.changePin') : t('settings.rows.setPin')}
                      description={t('settings.rows.pinDesc')}
                      control={
                        <div className="flex items-center gap-2">
                          <input
                            className={`${inputCls} w-24`}
                            value={pinNew}
                            onChange={e => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="New PIN"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                          />
                          <input
                            className={`${inputCls} w-24`}
                            value={pinConfirm}
                            onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="Confirm"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                          />
                          <button
                            className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                            onClick={handlePinSave}
                            disabled={pinSaving || pinNew.length !== 4 || pinConfirm.length !== 4}
                          >
                            {pinSaving ? t('settings.buttons.saving') : pinSet ? t('settings.buttons.change') : t('settings.buttons.enable')}
                          </button>
                        </div>
                      }
                    />
                    {pinSet && (
                      <SettingRow
                        label={t('settings.rows.removePin')}
                        description={t('settings.rows.removePinDesc')}
                        last
                        control={
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              className={`${inputCls} w-40`}
                              value={pinRemovePassword}
                              onChange={e => setPinRemovePassword(e.target.value)}
                              placeholder="Current password"
                            />
                            <button
                              className="border border-[#ef4444]/40 text-[#ef4444] font-mono text-xs px-4 py-1.5 rounded-sm hover:bg-[#1a0000] disabled:opacity-40 transition-colors"
                              onClick={handlePinRemove}
                              disabled={pinRemoving || !pinRemovePassword}
                            >
                              {pinRemoving ? t('settings.buttons.removing') : t('settings.buttons.remove')}
                            </button>
                          </div>
                        }
                      />
                    )}
                    {!pinSet && <div />}
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
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className={`${inputCls} w-20`}
                            value={autoLockMinutes}
                            onChange={e => setAutoLockMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            min={0}
                            max={480}
                            step={1}
                          />
                          <span className="text-[10px] font-mono text-[#555]">{t('settings.messages.min')}</span>
                          <button
                            className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 transition-colors"
                            onClick={() => handleAutoLockSave(autoLockMinutes)}
                            disabled={autoLockSaving}
                          >
                            {autoLockSaving ? t('settings.buttons.saving') : t('settings.buttons.save')}
                          </button>
                        </div>
                      }
                    />
                  </SectionCard>
                )}

                <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
                  <span className="text-[9px] font-mono text-[#555] block">
                    {t('settings.notes.securityNote')}
                  </span>
                </div>
              </>
            )}
          </>
        );
      }
    }
  };

  // @group Render : Page layout — sidebar + content
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="flex gap-4 items-start">

        {/* ── Left sidebar nav ── */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm w-40 shrink-0 overflow-hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={[
                'w-full flex items-center gap-2 px-3 py-2.5 text-left font-mono text-[10px] border-l-2 transition-colors',
                activeSection === s.id
                  ? 'border-[#22c55e] text-[#e8e8e8] bg-[#141414]'
                  : 'border-transparent text-[#555] hover:text-[#888] hover:bg-[#141414]',
              ].join(' ')}
            >
              <span className="text-[9px] shrink-0">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── Right content ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em]">
              ▸ {SECTIONS.find(s => s.id === activeSection)?.label}
            </span>
            <span className="text-[9px] font-mono text-[#333] border border-[#222] rounded-sm px-1.5 py-0.5">
              {t('settings.autoSaved')}
            </span>
          </div>

          {renderSection()}
        </div>
      </div>

      {/* @group Toast : Save confirmation */}
      {toastOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-[#111] border border-[#22c55e]/40 rounded-sm px-4 py-2 flex items-center gap-2 shadow-lg">
            <span className="text-[10px] font-mono text-[#22c55e]">✓</span>
            <span className="text-[10px] font-mono text-[#e8e8e8]">{toastMsg}</span>
            <button
              onClick={() => setToastOpen(false)}
              className="text-[#555] text-[10px] font-mono ml-2 hover:text-[#888]"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

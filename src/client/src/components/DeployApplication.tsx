import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// @group Types
type AppType = 'node' | 'python' | 'dotnet' | 'other';
interface EnvVariable { key: string; value: string; }
interface AppTypeConfig {
  label: string;
  scriptLabel: string;
  scriptHelp: string;
  interpreterEnvVar?: string;
  defaultExecMode: 'fork' | 'cluster';
  supportsCluster: boolean;
  requiresInterpreter?: boolean;
  interpreterHelp?: string;
}

// @group Constants
const APP_CONFIGS: Record<AppType, AppTypeConfig> = {
  node:   { label: 'node.js',  scriptLabel: 'entry file',   scriptHelp: 'dist/index.js',               defaultExecMode: 'fork',  supportsCluster: true  },
  python: { label: 'python',   scriptLabel: 'python file',  scriptHelp: 'app.py',                      defaultExecMode: 'fork',  supportsCluster: false, requiresInterpreter: true, interpreterHelp: '/path/to/venv/bin/python' },
  dotnet: { label: '.net',     scriptLabel: 'dll path',     scriptHelp: 'bin/Release/net8.0/app.dll',  defaultExecMode: 'fork',  supportsCluster: false, interpreterEnvVar: 'DOTNET_COMMAND' },
  other:  { label: 'other',    scriptLabel: 'script/binary', scriptHelp: '/path/to/executable',        defaultExecMode: 'fork',  supportsCluster: false },
};

// @group Pill : Inline toggle option (used for app type and exec mode)
const Pill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-0.5 rounded text-xs font-mono transition-all ${
      active
        ? 'bg-[#e8e8e8] text-[#0a0a0a] font-semibold'
        : 'text-[#555] hover:text-[#999] hover:bg-[#1a1a1a]'
    }`}
  >
    {children}
  </button>
);

// @group InlineField : Prompt-style labeled input row
const InlineField: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}> = ({ label, children, hint, error }) => (
  <div className="flex items-start gap-0 group">
    <span className="font-mono text-xs text-[#444] w-28 shrink-0 pt-1.5 select-none">{label}</span>
    <div className="flex-1 min-w-0">
      {children}
      {hint  && <p className="text-xs font-mono text-[#333] mt-0.5">{hint}</p>}
      {error && <p className="text-xs font-mono text-red-400 mt-0.5">{error}</p>}
    </div>
  </div>
);

// @group PromptInput : Minimal dark input
const PromptInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }> = ({ hasError, className = '', ...props }) => (
  <input
    {...props}
    className={`w-full bg-transparent font-mono text-xs text-[#e8e8e8] placeholder-[#2e2e2e]
      border-b border-[#222] focus:border-[#444] outline-none py-1 transition-colors
      ${hasError ? 'border-red-800 focus:border-red-600' : ''}
      ${className}`}
  />
);

// @group PromptSelect : Minimal dark select
const PromptSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...props }) => (
  <select
    {...props}
    className={`bg-transparent font-mono text-xs text-[#e8e8e8] border-b border-[#222]
      focus:border-[#444] outline-none py-1 transition-colors cursor-pointer ${className}`}
  />
);

// @group SectionHeader : ▸ prompt-style section label
const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mt-5 mb-3">
    <span className="text-[#444] font-mono text-xs select-none">▸</span>
    <span className="font-mono text-xs text-[#666] uppercase tracking-widest">{children}</span>
    <div className="flex-1 border-t border-[#1a1a1a]" />
  </div>
);

// @group Toggle : Minimal inline checkbox toggle
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-1.5 font-mono text-xs transition-colors ${
      checked ? 'text-[#e8e8e8]' : 'text-[#333] line-through'
    }`}
  >
    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-all ${
      checked ? 'border-[#555] bg-[#555]' : 'border-[#2a2a2a]'
    }`}>
      {checked && (
        <svg className="w-2.5 h-2.5 text-[#0a0a0a]" viewBox="0 0 10 10" fill="currentColor">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    {label}
  </button>
);

// @group DeployApplication : Main component
const DeployApplication: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // @group State
  const [appType,   setAppType]   = useState<AppType>('node');
  const [autoSetup, setAutoSetup] = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [success,   setSuccess]   = useState('');
  const [error,     setError]     = useState('');
  const [portError, setPortError] = useState('');
  const [envVars,   setEnvVars]   = useState<EnvVariable[]>([]);
  const [newEnv,    setNewEnv]    = useState<EnvVariable>({ key: '', value: '' });
  const [logs,      setLogs]      = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: '', script: '', cwd: '', namespace: 'default',
    instances: 1, exec_mode: 'fork', autorestart: true,
    watch: false, max_memory_restart: '150M', port: '', interpreter: '',
  });

  // @group Effects
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { if (success) { const id = setTimeout(() => setSuccess(''), 3000); return () => clearTimeout(id); } }, [success]);
  useEffect(() => { if (error)   { const id = setTimeout(() => setError(''),   5000); return () => clearTimeout(id); } }, [error]);

  // @group Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    if (name === 'port') {
      setPortError(value && (!/^\d+$/.test(value) || +value < 1 || +value > 65535) ? t('deploy.portError') : '');
    }
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAppTypeChange = (val: AppType) => {
    setAppType(val);
    setForm(prev => ({ ...prev, exec_mode: APP_CONFIGS[val].defaultExecMode }));
  };

  const detectType = async () => {
    const projectPath = form.cwd || (() => {
      const s = form.script;
      const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
      return i > 0 ? s.substring(0, i) : '.';
    })();
    if (!projectPath || projectPath === '.') { setError(t('deploy.setWorkingDirectoryFirst')); return; }
    try {
      setDetecting(true);
      const { data } = await axios.post('/api/deploy/detect-project', { projectPath });
      if (data.success && data.projectType) {
        handleAppTypeChange(data.projectType as AppType);
        setSuccess(t('deploy.detectedProject', { name: data.config?.name || data.projectType }));
      } else {
        setError(t('deploy.couldNotDetect'));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('deploy.detectionFailed'));
    } finally {
      setDetecting(false);
    }
  };

  const addEnvVar = () => {
    if (!newEnv.key.trim()) return;
    setEnvVars(prev => [...prev, { ...newEnv }]);
    setNewEnv({ key: '', value: '' });
  };
  const removeEnvVar = (i: number) => setEnvVars(prev => prev.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, field: 'key' | 'value', val: string) =>
    setEnvVars(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portError) return;
    const envObject: Record<string, string> = {};
    envVars.forEach(({ key, value }) => { if (key.trim()) envObject[key] = value; });
    if (form.interpreter && APP_CONFIGS[appType].interpreterEnvVar) {
      envObject[APP_CONFIGS[appType].interpreterEnvVar!] = form.interpreter;
    }
    setLoading(true);
    setLogs([]);
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, env: envObject, appType, autoSetup }),
      });
      if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json();
        setError(body.error || t('deploy.deploymentFailed'));
        setLoading(false);
        return;
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6));
            if (event.type === 'log') {
              setLogs(prev => [...prev, event.message as string]);
            } else if (event.type === 'done') {
              if (event.success) {
                setSuccess(t('deploy.deployedSuccessfully'));
                setTimeout(() => navigate('/processes'), 2000);
              } else {
                const msg = (event.error as string) || t('deploy.deploymentFailed');
                setError(msg.includes('port') && msg.includes('use') ? t('deploy.portInUse', { port: form.port }) : msg);
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      setError(err.message || t('deploy.failedToDeploy'));
    } finally {
      setLoading(false);
    }
  };

  const cfg = APP_CONFIGS[appType];

  // @group Render
  return (
    <form onSubmit={handleSubmit} className="min-h-screen">

      {/* ── Outer shell — always dark ── */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0a0a0a] overflow-hidden shadow-2xl">

        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1a] bg-[#0d0d0d]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#444]">$</span>
            <span className="font-mono text-xs text-[#666]">pm2 deploy</span>
            <span className="font-mono text-xs text-[#e8e8e8]">—{t('deploy.newProcess')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/processes')}
              className="font-mono text-xs text-[#444] hover:text-[#888] transition-colors px-2 py-1"
            >
              esc
            </button>
            <button
              type="submit"
              disabled={loading || !!portError}
              className="flex items-center gap-1.5 font-mono text-xs px-3 py-1 rounded
                bg-[#e8e8e8] text-[#0a0a0a] font-semibold hover:bg-white
                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {loading
                ? <><ArrowPathIcon className="h-3 w-3 animate-spin" />{t('deploy.deploying')}</>
                : <>⏎ {t('deploy.deployBtn')}</>
              }
            </button>
          </div>
        </div>

        {/* Form body */}
        <div className="px-6 py-4 pb-6">

          {/* ▸ type */}
          <SectionHeader>{t('deploy.sectionType')}</SectionHeader>
          <div className="flex items-center gap-1 ml-6">
            {(Object.keys(APP_CONFIGS) as AppType[]).map(k => (
              <Pill key={k} active={appType === k} onClick={() => handleAppTypeChange(k)}>
                {APP_CONFIGS[k].label}
              </Pill>
            ))}
          </div>

          {/* ▸ identity */}
          <SectionHeader>{t('deploy.sectionIdentity')}</SectionHeader>
          <div className="ml-6 space-y-3">
            <InlineField label={t('deploy.fieldName')}>
              <PromptInput
                required
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="my-app"
                autoComplete="off"
              />
            </InlineField>
            <InlineField label={t('deploy.fieldNamespace')}>
              <PromptInput
                name="namespace"
                value={form.namespace}
                onChange={handleChange}
                placeholder="default"
              />
            </InlineField>
          </div>

          {/* ▸ entry point */}
          <SectionHeader>{t('deploy.sectionEntryPoint')}</SectionHeader>
          <div className="ml-6 space-y-3">
            <InlineField label={t(`deploy.scriptLabel${appType.charAt(0).toUpperCase() + appType.slice(1)}`)} hint={cfg.scriptHelp}>
              <PromptInput
                required
                name="script"
                value={form.script}
                onChange={handleChange}
                placeholder={cfg.scriptHelp}
              />
            </InlineField>
            <InlineField label={t('deploy.fieldDirectory')} hint={t('deploy.workingDirectoryHelper')}>
              <div className="relative">
                <PromptInput
                  name="cwd"
                  value={form.cwd}
                  onChange={handleChange}
                  placeholder="/path/to/project"
                  style={{ paddingRight: '1.5rem' }}
                />
                <button
                  type="button"
                  onClick={detectType}
                  disabled={detecting}
                  title={t('deploy.autoDetect')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-[#333] hover:text-[#888] transition-colors disabled:opacity-30"
                >
                  {detecting
                    ? <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    : <MagnifyingGlassIcon className="h-3 w-3" />
                  }
                </button>
              </div>
            </InlineField>
            {cfg.requiresInterpreter && (
              <InlineField label={t('deploy.fieldInterpreter')} hint={cfg.interpreterHelp}>
                <PromptInput
                  name="interpreter"
                  value={form.interpreter}
                  onChange={handleChange}
                  placeholder={cfg.interpreterHelp}
                />
              </InlineField>
            )}
          </div>

          {/* ▸ runtime */}
          <SectionHeader>{t('deploy.sectionRuntime')}</SectionHeader>
          <div className="ml-6 space-y-3">
            <div className="flex items-start gap-8">
              <InlineField label="instances">
                <PromptInput
                  type="number"
                  name="instances"
                  value={form.instances}
                  onChange={handleChange}
                  min={1}
                  className="w-16"
                />
              </InlineField>
              <InlineField label={t('deploy.fieldExecMode')}>
                <PromptSelect
                  name="exec_mode"
                  value={form.exec_mode}
                  disabled={!cfg.supportsCluster}
                  onChange={handleChange}
                >
                  <option value="fork">fork</option>
                  {cfg.supportsCluster && <option value="cluster">cluster</option>}
                </PromptSelect>
              </InlineField>
              <InlineField label={t('deploy.fieldMaxMemory')}>
                <PromptInput
                  name="max_memory_restart"
                  value={form.max_memory_restart}
                  onChange={handleChange}
                  placeholder="150M"
                  className="w-20"
                />
              </InlineField>
              <InlineField label={t('deploy.fieldPort')} error={portError}>
                <PromptInput
                  name="port"
                  value={form.port}
                  onChange={handleChange}
                  placeholder="optional"
                  hasError={!!portError}
                  className="w-24"
                />
              </InlineField>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-5 pt-1">
              <Toggle checked={form.autorestart} onChange={v => setForm(p => ({ ...p, autorestart: v }))} label={t('deploy.toggleAutorestart')} />
              <Toggle checked={form.watch}       onChange={v => setForm(p => ({ ...p, watch: v }))}       label={t('deploy.toggleWatch')} />
              <Toggle checked={autoSetup}        onChange={setAutoSetup}                                   label={t('deploy.toggleAutoSetup')} />
            </div>

            {+form.instances > 1 && (
              <p className="font-mono text-xs text-[#444] mt-1">
                <span className="text-[#888]">→</span>{' '}
                {form.exec_mode === 'cluster'
                  ? t('deploy.instancesCluster', { count: form.instances })
                  : t('deploy.instancesFork', { count: form.instances })}
              </p>
            )}
          </div>

          {/* ▸ environment */}
          <SectionHeader>{t('deploy.sectionEnvironment')}</SectionHeader>
          <div className="ml-6">
            {/* Existing vars */}
            {envVars.length > 0 && (
              <div className="mb-3 space-y-0.5">
                {envVars.map((env, i) => (
                  <div key={i} className="flex items-center gap-2 group/row py-0.5">
                    <input
                      value={env.key}
                      onChange={e => updateEnvVar(i, 'key', e.target.value)}
                      className="w-36 bg-transparent font-mono text-xs text-[#e8e8e8] outline-none border-b border-transparent focus:border-[#333] placeholder-[#333] transition-colors"
                      placeholder="KEY"
                    />
                    <span className="text-[#333] font-mono text-xs shrink-0">=</span>
                    <input
                      value={env.value}
                      onChange={e => updateEnvVar(i, 'value', e.target.value)}
                      className="flex-1 bg-transparent font-mono text-xs text-[#888] outline-none border-b border-transparent focus:border-[#333] placeholder-[#333] transition-colors"
                      placeholder="value"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(i)}
                      className="opacity-0 group-hover/row:opacity-100 text-[#333] hover:text-red-500 transition-all"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new var */}
            <div className="flex items-center gap-2">
              <input
                value={newEnv.key}
                onChange={e => setNewEnv(p => ({ ...p, key: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEnvVar(); } }}
                className="w-36 bg-transparent font-mono text-xs text-[#e8e8e8] outline-none border-b border-[#1e1e1e] focus:border-[#444] placeholder-[#2a2a2a] transition-colors py-1"
                placeholder="KEY"
              />
              <span className="text-[#2a2a2a] font-mono text-xs shrink-0">=</span>
              <input
                value={newEnv.value}
                onChange={e => setNewEnv(p => ({ ...p, value: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEnvVar(); } }}
                className="flex-1 bg-transparent font-mono text-xs text-[#888] outline-none border-b border-[#1e1e1e] focus:border-[#444] placeholder-[#2a2a2a] transition-colors py-1"
                placeholder="value"
              />
              <button
                type="button"
                onClick={addEnvVar}
                disabled={!newEnv.key.trim()}
                className="font-mono text-xs text-[#333] hover:text-[#888] disabled:opacity-20 transition-colors flex items-center gap-1"
              >
                <PlusIcon className="h-3 w-3" />
                {t('deploy.addEnvVar')}
              </button>
            </div>
            {envVars.length === 0 && (
              <p className="font-mono text-xs text-[#2a2a2a] mt-2">
                {t('deploy.noEnvVarsHint')}
              </p>
            )}
          </div>

          {/* ▸ log (when deploying) */}
          {logs.length > 0 && (
            <>
              <SectionHeader>{t('deploy.sectionLog')}</SectionHeader>
              <div className="ml-6 max-h-52 overflow-y-auto space-y-px">
                {logs.map((line, i) => {
                  const color =
                    line.startsWith('[ERROR]') ? '#f87171' :
                    line.startsWith('[WARN]')  ? '#fbbf24' :
                    line.startsWith('[OK]')    ? '#4ade80' :
                    line.startsWith('[STEP]')  ? '#60a5fa' :
                    line.startsWith('[SKIP]')  ? '#374151' : '#4b5563';
                  return (
                    <p key={i} className="font-mono text-xs" style={{ color, whiteSpace: 'pre-wrap' }}>
                      {line}
                    </p>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center justify-between px-6 py-2 border-t border-[#1a1a1a] bg-[#0d0d0d]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#2a2a2a]">
              {form.name ? <span className="text-[#555]">{form.name}</span> : t('deploy.unnamed')}
              <span className="text-[#222]"> · </span>
              <span className="text-[#333]">{APP_CONFIGS[appType].label}</span>
              {form.script && <><span className="text-[#222]"> · </span><span className="text-[#2a2a2a]">{form.script}</span></>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <span className="font-mono text-xs text-[#444] flex items-center gap-1.5">
                <ArrowPathIcon className="h-2.5 w-2.5 animate-spin" />
                {t('deploy.deployingStatus')}
              </span>
            )}
            <span className="font-mono text-xs text-[#2a2a2a]">
              {envVars.length > 0 && t('deploy.envCount', { count: envVars.length })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Toast notifications ── */}
      {(error || success) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
          {error && (
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg
              bg-[#0a0a0a] border border-[#2a1a1a] shadow-xl text-xs font-mono text-red-400">
              <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="ml-1 text-[#444] hover:text-red-400">
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          {success && (
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg
              bg-[#0a0a0a] border border-[#1a2a1a] shadow-xl text-xs font-mono text-green-400">
              <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>
      )}
    </form>
  );
};

export default DeployApplication;

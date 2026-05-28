import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  PuzzlePieceIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import PageHeader from './PageHeader';

// @group Types : Notification callback passed in from App
type NotifyFn = (message: string, type?: 'error' | 'warn' | 'success' | 'info') => void;

// @group Types : Module data shape from server
interface Module {
  name: string;
  version: string;
  status: string;
}

// @group Types : A single config field definition for a known module
interface ConfigField {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'boolean';
  default: string;
}

// @group Constants : Curated list of well-known PM2 modules
const KNOWN_MODULES: { name: string; description: string; category: string }[] = [
  { name: 'pm2-logrotate',        description: 'Automatically rotate PM2 log files to prevent unbounded disk growth.',       category: 'Logging'       },
  { name: 'pm2-server-monit',     description: 'Monitor CPU, memory, network and disk usage of your server in PM2.',          category: 'Monitoring'    },
  { name: 'pm2-auto-pull',        description: 'Auto pull & restart from a git remote whenever a new commit is pushed.',      category: 'Deployment'    },
  { name: 'pm2-slack',            description: 'Send process event notifications (restart, stop, error) to Slack channels.',  category: 'Notifications' },
  { name: 'pm2-telegram',         description: 'Receive PM2 process event alerts directly in a Telegram chat.',               category: 'Notifications' },
  { name: 'pm2-githook',          description: 'Listen for GitHub webhook pushes and auto-deploy on new commits.',            category: 'Deployment'    },
  { name: 'pm2-metrics',          description: 'Expose aggregated PM2 process metrics for Prometheus / Grafana scraping.',   category: 'Monitoring'    },
  { name: 'pm2-notify',           description: 'Cross-platform desktop/email notifications for PM2 process state changes.',  category: 'Notifications' },
  { name: 'pm2-keymetrics-agent', description: 'Connect to the Keymetrics SaaS dashboard for remote monitoring.',            category: 'Monitoring'    },
  { name: 'pm2-intercom',         description: 'Expose a simple RPC bridge between PM2 processes via pm2 trigger.',          category: 'Utilities'     },
];

// @group Constants : Schema definitions for well-known module config keys
const MODULE_SCHEMAS: Record<string, ConfigField[]> = {
  'pm2-logrotate': [
    { key: 'max_size',       label: 'Max Log Size',              description: 'Size before rotation, e.g. 10M or 1G',           type: 'text',    default: '10M'                },
    { key: 'retain',         label: 'Retained Rotations',        description: 'How many rotated files to keep',                  type: 'number',  default: '30'                 },
    { key: 'compress',       label: 'Compress Rotated Logs',     description: 'Gzip rotated log files',                         type: 'boolean', default: 'false'              },
    { key: 'dateFormat',     label: 'Date Format',               description: 'Timestamp appended to rotated file names',       type: 'text',    default: 'YYYY-MM-DD_HH-mm-ss'},
    { key: 'rotateModule',   label: 'Rotate PM2 Module Logs',    description: 'Include PM2 internal module logs in rotation',    type: 'boolean', default: 'true'               },
    { key: 'workerInterval', label: 'Worker Interval (s)',       description: 'How often to check log sizes',                   type: 'number',  default: '30'                 },
    { key: 'rotateInterval', label: 'Cron Rotate Schedule',      description: 'Cron expression for time-based rotation',        type: 'text',    default: '0 0 * * *'          },
    { key: 'TZ',             label: 'Timezone',                  description: 'e.g. America/New_York (blank = system default)',  type: 'text',    default: ''                   },
    { key: 'su',             label: 'Run as su',                 description: 'Use sudo for log rotation (Unix only)',           type: 'boolean', default: 'false'              },
  ],
  'pm2-server-monit': [
    { key: 'port',    label: 'HTTP Port',              description: 'Port the monitoring dashboard listens on',  type: 'number', default: '4357' },
    { key: 'refresh', label: 'Refresh Interval (ms)',  description: 'Polling interval for system metrics',       type: 'number', default: '2000' },
  ],
  'pm2-auto-pull': [
    { key: 'service_name', label: 'Service Name', description: 'Systemd service name for auto-pull',          type: 'text',   default: 'pm2-auto-pull' },
    { key: 'port',         label: 'Webhook Port', description: 'Port that receives GitHub webhook payloads',  type: 'number', default: '8888'          },
    { key: 'secret',       label: 'Webhook Secret', description: 'HMAC secret to verify payload signatures', type: 'text',   default: ''              },
  ],
  'pm2-slack': [
    { key: 'slack_url',  label: 'Slack Webhook URL', description: 'Incoming webhook URL from your Slack app',      type: 'text',    default: '' },
    { key: 'servername', label: 'Server Name',        description: 'Label displayed in Slack notifications',         type: 'text',    default: '' },
    { key: 'events',     label: 'Events to Notify',   description: 'Comma-separated: start,stop,restart,error',     type: 'text',    default: 'start,stop,restart,error,kill,exception' },
  ],
  'pm2-telegram': [
    { key: 'telegram_token',   label: 'Bot Token',   description: 'Telegram bot token from @BotFather',      type: 'text',   default: '' },
    { key: 'telegram_chat_id', label: 'Chat ID',     description: 'Target chat or group ID for alerts',      type: 'text',   default: '' },
    { key: 'servername',       label: 'Server Name', description: 'Label shown in Telegram notifications',   type: 'text',   default: '' },
  ],
};

// @group Utilities : Map status string to badge colours
const statusBadge = (status: string): string => {
  const s = status.toLowerCase();
  if (s.includes('online') || s.includes('enabled'))
    return 'text-[9px] font-mono text-[#22c55e] border border-[#22c55e]/30 bg-[#022c00] px-1.5 py-0.5 rounded-sm';
  if (s.includes('error') || s.includes('disabled'))
    return 'text-[9px] font-mono text-[#ef4444] border border-[#ef4444]/30 bg-[#1a0000] px-1.5 py-0.5 rounded-sm';
  return 'text-[9px] font-mono text-[#f59e0b] border border-[#f59e0b]/30 bg-[#1a0e00] px-1.5 py-0.5 rounded-sm';
};

// @group Utilities : Map category to a colour accent
const categoryColor: Record<string, string> = {
  Logging:       'text-[#22d3ee] border border-[#22d3ee]/20 bg-[#001a1f]',
  Monitoring:    'text-[#22c55e] border border-[#22c55e]/20 bg-[#022c00]',
  Deployment:    'text-[#a78bfa] border border-[#a78bfa]/20 bg-[#16003a]',
  Notifications: 'text-[#f59e0b] border border-[#f59e0b]/20 bg-[#1a0e00]',
  Utilities:     'text-[#888] border border-[#333] bg-[#1a1a1a]',
};

// @group ConfigPanel : Slide-over panel for configuring a single installed module
interface ConfigPanelProps {
  moduleName: string;
  onClose: () => void;
  onNotify: NotifyFn;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ moduleName, onClose, onNotify }) => {
  const schema = MODULE_SCHEMAS[moduleName] ?? [];

  const [config,   setConfig]   = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  // Extra free-form pairs (for unknown modules or advanced users)
  const [extras,   setExtras]   = useState<{ key: string; value: string }[]>([]);

  // @group DataFetch : Load current config from server
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`/api/modules/${encodeURIComponent(moduleName)}/config`);
        const saved: Record<string, string> = res.data.config ?? {};
        setConfig(saved);

        // Any keys not in the schema go into extras
        const schemaKeys = new Set(schema.map(f => f.key));
        const extraPairs = Object.entries(saved)
          .filter(([k]) => !schemaKeys.has(k))
          .map(([key, value]) => ({ key, value: String(value) }));
        setExtras(extraPairs);
      } catch {
        onNotify('Failed to load module configuration', 'error');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleName]);

  // @group Handlers : Save config to server
  const handleSave = async () => {
    const merged: Record<string, string> = { ...config };
    extras.forEach(({ key, value }) => { if (key.trim()) merged[key.trim()] = value; });
    try {
      setSaving(true);
      await axios.put(`/api/modules/${encodeURIComponent(moduleName)}/config`, { config: merged });
      onNotify(`Configuration saved for ${moduleName}`, 'success');
      onClose();
    } catch (err: any) {
      onNotify(err.response?.data?.error || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: string) => setConfig(p => ({ ...p, [key]: value }));

  const setExtra = (i: number, field: 'key' | 'value', val: string) =>
    setExtras(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-md h-full
                      bg-[#111] border-l border-[#1e1e1e] shadow-2xl overflow-hidden">

        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e] shrink-0">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#555] mb-0.5">▸ CONFIGURE MODULE</p>
            <p className="text-[11px] font-mono font-bold text-[#e8e8e8]">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-[#444] hover:text-[#888] p-1 rounded-sm hover:bg-[#1a1a1a] transition-colors">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-xs font-mono text-[#555]">
              <svg className="h-4 w-4 animate-spin text-[#888]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              loading…
            </div>
          ) : (
            <>
              {/* Schema-based fields */}
              {schema.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-[#555]">▸ SETTINGS</p>
                  {schema.map(field => {
                    const val = config[field.key] ?? field.default;
                    return (
                      <div key={field.key}>
                        <label className="block text-[10px] font-mono text-[#888] mb-1">
                          {field.label}
                        </label>
                        {field.type === 'boolean' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setField(field.key, val === 'true' ? 'false' : 'true')}
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-sm border-2 border-transparent
                                          transition-colors duration-200 focus:outline-none cursor-pointer
                                          ${val === 'true' ? 'bg-[#22c55e]' : 'bg-[#2a2a2a]'}`}
                            >
                              <span className={`pointer-events-none inline-block h-4 w-4 rounded-sm bg-[#0a0a0a] shadow
                                               transform transition-transform duration-200
                                               ${val === 'true' ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                            <span className="text-[10px] font-mono text-[#555]">{val === 'true' ? 'enabled' : 'disabled'}</span>
                          </div>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={val}
                            onChange={e => setField(field.key, e.target.value)}
                            placeholder={field.default}
                            className="w-full h-8 px-3 bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm
                                       placeholder-[#333] focus:outline-none focus:border-[#333]"
                          />
                        )}
                        {field.description && (
                          <p className="mt-0.5 text-[10px] font-mono text-[#444]">{field.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Free-form extra pairs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-[#555]">
                    ▸ {schema.length > 0 ? 'ADDITIONAL KEYS' : 'CONFIGURATION KEYS'}
                  </p>
                  <button
                    onClick={() => setExtras(p => [...p, { key: '', value: '' }])}
                    className="text-[10px] font-mono text-[#888] hover:text-[#e8e8e8] transition-colors"
                  >
                    + add key
                  </button>
                </div>

                {extras.length === 0 && schema.length > 0 ? (
                  <p className="text-[10px] font-mono text-[#444] italic">no additional keys</p>
                ) : (
                  extras.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={e.key}
                        onChange={ev => setExtra(i, 'key', ev.target.value)}
                        placeholder="key"
                        className="w-32 h-7 px-2 bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm
                                   placeholder-[#333] focus:outline-none focus:border-[#333]"
                      />
                      <input
                        type="text"
                        value={e.value}
                        onChange={ev => setExtra(i, 'value', ev.target.value)}
                        placeholder="value"
                        className="flex-1 h-7 px-2 bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm
                                   placeholder-[#333] focus:outline-none focus:border-[#333]"
                      />
                      <button
                        onClick={() => setExtras(p => p.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-[#444] hover:text-[#ef4444] transition-colors"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {schema.length === 0 && extras.length === 0 && (
                <p className="text-[10px] font-mono text-[#444] italic text-center py-4">
                  no configuration found — use "+ add key" to add custom settings
                </p>
              )}
            </>
          )}
        </div>

        {/* Panel footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1e1e1e] shrink-0">
          <button
            onClick={onClose}
            className="h-7 px-3 text-xs font-mono border border-[#1e1e1e] text-[#555] hover:text-[#888] hover:border-[#333] rounded-sm transition-colors"
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="h-7 px-3 bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold rounded-sm
                       disabled:opacity-40 transition-colors flex items-center gap-1.5 hover:bg-[#ccc]"
          >
            {saving ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                saving…
              </>
            ) : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// @group ModuleManagement : Install, uninstall, configure, and browse PM2 modules
const ModuleManagement: React.FC<{ onNotify: NotifyFn }> = ({ onNotify }) => {
  const { t } = useTranslation();
  const [modules,         setModules]         = useState<Module[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [newModuleName,   setNewModuleName]   = useState('');
  const [installing,      setInstalling]      = useState(false);
  const [configModule,    setConfigModule]    = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/modules');
      setModules(res.data);
    } catch (err: any) {
      onNotify(err.response?.data?.error || t('errors.failedToFetchModules'), 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNotify]);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  // @group Handlers : Install a module by name
  const handleInstall = async () => {
    if (!newModuleName.trim()) { onNotify(t('errors.moduleNameRequired'), 'warn'); return; }
    try {
      setInstalling(true);
      await axios.post('/api/modules/install', { moduleName: newModuleName.trim() });
      onNotify(`Installed: ${newModuleName.trim()}`, 'success');
      setNewModuleName('');
      setDialogOpen(false);
      fetchModules();
    } catch (err: any) {
      onNotify(err.response?.data?.error || 'Failed to install module', 'error');
    } finally {
      setInstalling(false);
    }
  };

  // @group Handlers : One-click install from catalog
  const handleQuickInstall = async (name: string) => {
    try {
      await axios.post('/api/modules/install', { moduleName: name });
      onNotify(`Installed: ${name}`, 'success');
      fetchModules();
    } catch (err: any) {
      onNotify(err.response?.data?.error || `Failed to install ${name}`, 'error');
    }
  };

  // @group Handlers : Uninstall a module
  const handleUninstall = async (name: string) => {
    try {
      await axios.delete(`/api/modules/${name}`);
      onNotify(`Uninstalled: ${name}`, 'success');
      fetchModules();
    } catch (err: any) {
      onNotify(err.response?.data?.error || 'Failed to uninstall module', 'error');
    }
  };

  const installedNames = new Set(modules.map(m => m.name));

  // @group Render
  return (
    <div>
      {/* Header */}
      <PageHeader
        title={t('modules.title')}
        subtitle={t('modules.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchModules}
              disabled={loading}
              className="h-7 px-3 text-xs font-mono border border-[#1e1e1e] text-[#555] hover:text-[#888] hover:border-[#333]
                         rounded-sm disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
            <button
              onClick={() => setDialogOpen(true)}
              className="h-7 px-3 bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold rounded-sm
                         hover:bg-[#ccc] transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              install module
            </button>
          </div>
        }
      />

      {/* ── Installed Modules ── */}
      <section className="mb-6">
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#555] mb-2">▸ INSTALLED</p>

        <div className="border border-[#1e1e1e] rounded-sm overflow-hidden bg-[#111]">
          {loading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-xs font-mono text-[#555]">
              <svg className="h-4 w-4 animate-spin text-[#888]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              loading modules…
            </div>
          ) : modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-1 text-[#555]">
              <PuzzlePieceIcon className="h-5 w-5 opacity-40" />
              <span className="text-[10px] font-mono">no PM2 modules installed</span>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e1e1e] bg-[#0d0d0d] text-[#555]">
                  <th className="px-3 py-2 text-left text-[9px] font-mono uppercase tracking-[0.15em]">Name</th>
                  <th className="px-3 py-2 text-left text-[9px] font-mono uppercase tracking-[0.15em]">Version</th>
                  <th className="px-3 py-2 text-left text-[9px] font-mono uppercase tracking-[0.15em]">Status</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-[0.15em]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod, i) => (
                  <tr
                    key={mod.name}
                    className={`border-b last:border-0 border-[#1a1a1a] ${i % 2 === 0 ? '' : 'bg-[#0d0d0d]/50'}`}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-[11px] text-[#e8e8e8]">{mod.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#555]">{mod.version}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block ${statusBadge(mod.status)}`}>
                        {mod.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setConfigModule(mod.name)}
                          title="Configure"
                          className="inline-flex items-center justify-center h-6 w-6 rounded-sm
                                     text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] transition-colors"
                        >
                          <Cog6ToothIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleUninstall(mod.name)}
                          title="Uninstall"
                          className="inline-flex items-center justify-center h-6 w-6 rounded-sm
                                     text-[#444] hover:text-[#ef4444] hover:bg-[#1a0000] transition-colors"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Available Modules Catalog ── */}
      <section>
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#555] mb-2">▸ AVAILABLE MODULES</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {KNOWN_MODULES.map(mod => {
            const isInstalled = installedNames.has(mod.name);
            return (
              <div
                key={mod.name}
                className="flex items-start gap-3 bg-[#0d0d0d] border border-[#1e1e1e] rounded-sm p-3
                           hover:border-[#333] transition-colors"
              >
                <div className="shrink-0 mt-0.5 h-7 w-7 rounded-sm flex items-center justify-center bg-[#1a1a1a]">
                  <PuzzlePieceIcon className="h-4 w-4 text-[#444]" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-[#e8e8e8]">{mod.name}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${categoryColor[mod.category] ?? categoryColor.Utilities}`}>
                      {mod.category}
                    </span>
                    {isInstalled && (
                      <span className="text-[9px] font-mono text-[#22c55e] border border-[#22c55e]/30 bg-[#022c00] px-1.5 py-0.5 rounded-sm">
                        installed
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-[#555] mt-0.5 leading-relaxed">{mod.description}</p>
                </div>

                <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                  {isInstalled ? (
                    <button
                      onClick={() => setConfigModule(mod.name)}
                      title="Configure"
                      className="h-7 w-7 flex items-center justify-center rounded-sm
                                 border border-[#1e1e1e] text-[#555]
                                 hover:text-[#888] hover:border-[#333] transition-colors"
                    >
                      <Cog6ToothIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleQuickInstall(mod.name)}
                      title="Install"
                      className="h-7 w-7 flex items-center justify-center rounded-sm
                                 border border-[#1e1e1e] text-[#555]
                                 hover:text-[#888] hover:border-[#333] transition-colors"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Install Dialog ── */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-[#111] border border-[#1e1e1e] rounded-sm shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
              <p className="font-mono text-xs text-[#e8e8e8] font-semibold">▸ INSTALL PM2 MODULE</p>
              <button onClick={() => setDialogOpen(false)} className="text-[#444] hover:text-[#888] p-1 rounded-sm hover:bg-[#1a1a1a] transition-colors">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-4">
              <label className="block text-[10px] font-mono text-[#555] mb-1">Module Name</label>
              <input
                autoFocus
                type="text"
                value={newModuleName}
                onChange={e => setNewModuleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInstall()}
                placeholder="e.g. pm2-logrotate"
                className="w-full h-8 px-3 bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm
                           placeholder-[#333] focus:outline-none focus:border-[#333]"
              />
              <p className="mt-1.5 text-[10px] font-mono text-[#444]">enter any npm-published PM2 module name</p>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1e1e1e]">
              <button
                onClick={() => setDialogOpen(false)}
                className="h-7 px-3 text-xs font-mono border border-[#1e1e1e] text-[#555] hover:text-[#888] hover:border-[#333] rounded-sm transition-colors"
              >
                cancel
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="h-7 px-3 bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold rounded-sm
                           disabled:opacity-40 transition-colors flex items-center gap-1.5 hover:bg-[#ccc]"
              >
                {installing ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    installing…
                  </>
                ) : (
                  <><ArrowDownTrayIcon className="h-3.5 w-3.5" />install</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Config Slide-Over ── */}
      {configModule && (
        <ConfigPanel
          moduleName={configModule}
          onClose={() => setConfigModule(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};

export default ModuleManagement;

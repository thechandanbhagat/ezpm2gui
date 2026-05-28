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
  if (s.includes('online') || s.includes('enabled'))  return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
  if (s.includes('error')  || s.includes('disabled')) return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
};

// @group Utilities : Map category to a colour accent
const categoryColor: Record<string, string> = {
  Logging:       'text-sky-500 bg-sky-500/10',
  Monitoring:    'text-emerald-500 bg-emerald-500/10',
  Deployment:    'text-violet-500 bg-violet-500/10',
  Notifications: 'text-amber-500 bg-amber-500/10',
  Utilities:     'text-neutral-400 bg-neutral-500/10',
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-md h-full
                      bg-white dark:bg-neutral-900
                      border-l border-neutral-200 dark:border-neutral-800
                      shadow-2xl overflow-hidden">

        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Configure Module
            </h2>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-xs text-neutral-400">
              <svg className="h-4 w-4 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading…
            </div>
          ) : (
            <>
              {/* Schema-based fields */}
              {schema.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Settings</p>
                  {schema.map(field => {
                    const val = config[field.key] ?? field.default;
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {field.label}
                        </label>
                        {field.type === 'boolean' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setField(field.key, val === 'true' ? 'false' : 'true')}
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                                          transition-colors duration-200 focus:outline-none cursor-pointer
                                          ${val === 'true' ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                            >
                              <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                                               transform transition-transform duration-200
                                               ${val === 'true' ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                            <span className="text-xs text-neutral-500">{val === 'true' ? 'Enabled' : 'Disabled'}</span>
                          </div>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={val}
                            onChange={e => setField(field.key, e.target.value)}
                            placeholder={field.default}
                            className="w-full h-8 px-3 text-xs rounded border
                                       bg-white dark:bg-neutral-800
                                       border-neutral-200 dark:border-neutral-700
                                       text-neutral-900 dark:text-neutral-100
                                       placeholder-neutral-400 dark:placeholder-neutral-500
                                       focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        )}
                        {field.description && (
                          <p className="mt-0.5 text-[11px] text-neutral-400">{field.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Free-form extra pairs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    {schema.length > 0 ? 'Additional Keys' : 'Configuration Keys'}
                  </p>
                  <button
                    onClick={() => setExtras(p => [...p, { key: '', value: '' }])}
                    className="text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + Add key
                  </button>
                </div>

                {extras.length === 0 && schema.length > 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No additional keys</p>
                ) : (
                  extras.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={e.key}
                        onChange={ev => setExtra(i, 'key', ev.target.value)}
                        placeholder="key"
                        className="w-32 h-7 px-2 text-xs rounded border font-mono
                                   bg-white dark:bg-neutral-800
                                   border-neutral-200 dark:border-neutral-700
                                   text-neutral-900 dark:text-neutral-100
                                   placeholder-neutral-400 dark:placeholder-neutral-500
                                   focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <input
                        type="text"
                        value={e.value}
                        onChange={ev => setExtra(i, 'value', ev.target.value)}
                        placeholder="value"
                        className="flex-1 h-7 px-2 text-xs rounded border
                                   bg-white dark:bg-neutral-800
                                   border-neutral-200 dark:border-neutral-700
                                   text-neutral-900 dark:text-neutral-100
                                   placeholder-neutral-400 dark:placeholder-neutral-500
                                   focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <button
                        onClick={() => setExtras(p => p.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {schema.length === 0 && extras.length === 0 && (
                <p className="text-xs text-neutral-400 italic text-center py-4">
                  No configuration found. Use "+ Add key" to add custom settings.
                </p>
              )}
            </>
          )}
        </div>

        {/* Panel footer */}
        <div className="flex justify-end gap-2 px-4 py-3
                        border-t border-neutral-200 dark:border-neutral-800 shrink-0">
          <button
            onClick={onClose}
            className="h-7 px-3 text-xs font-medium rounded border
                       border-neutral-200 dark:border-neutral-700
                       text-neutral-600 dark:text-neutral-400
                       hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="h-7 px-3 text-xs font-medium rounded
                       bg-primary-600 hover:bg-primary-700 text-white
                       disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Saving…
              </>
            ) : 'Save'}
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
              className="h-7 px-3 text-xs font-medium rounded border
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-600 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800
                         disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
            <button
              onClick={() => setDialogOpen(true)}
              className="h-7 px-3 text-xs font-medium rounded
                         bg-primary-600 hover:bg-primary-700 text-white
                         transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Install Module
            </button>
          </div>
        }
      />

      {/* ── Installed Modules ── */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
          Installed
        </h2>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-xs text-neutral-400">
              <svg className="h-4 w-4 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading modules…
            </div>
          ) : modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-1 text-xs text-neutral-400 dark:text-neutral-500">
              <PuzzlePieceIcon className="h-5 w-5 opacity-40" />
              <span>No PM2 modules installed</span>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800
                               bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Version</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod, i) => (
                  <tr
                    key={mod.name}
                    className={`border-b last:border-0 border-neutral-100 dark:border-neutral-800
                                ${i % 2 === 0 ? '' : 'bg-neutral-50/50 dark:bg-neutral-900/30'}`}
                  >
                    <td className="px-3 py-2 font-mono font-medium text-neutral-900 dark:text-neutral-100">{mod.name}</td>
                    <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{mod.version}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadge(mod.status)}`}>
                        {mod.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setConfigModule(mod.name)}
                          title="Configure"
                          className="inline-flex items-center justify-center h-6 w-6 rounded
                                     text-neutral-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20
                                     transition-colors"
                        >
                          <Cog6ToothIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleUninstall(mod.name)}
                          title="Uninstall"
                          className="inline-flex items-center justify-center h-6 w-6 rounded
                                     text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                                     transition-colors"
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
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
          Available Modules
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {KNOWN_MODULES.map(mod => {
            const isInstalled = installedNames.has(mod.name);
            return (
              <div
                key={mod.name}
                className="flex items-start gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800
                           bg-white dark:bg-neutral-900/40 px-3 py-2.5
                           hover:border-primary-300 dark:hover:border-primary-700/60 transition-colors"
              >
                <div className="shrink-0 mt-0.5 h-7 w-7 rounded flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                  <PuzzlePieceIcon className="h-4 w-4 text-neutral-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">{mod.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-px rounded ${categoryColor[mod.category] ?? categoryColor.Utilities}`}>
                      {mod.category}
                    </span>
                    {isInstalled && (
                      <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">{mod.description}</p>
                </div>

                <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                  {isInstalled ? (
                    <button
                      onClick={() => setConfigModule(mod.name)}
                      title="Configure"
                      className="h-7 w-7 flex items-center justify-center rounded
                                 border border-primary-300 dark:border-primary-700
                                 text-primary-600 dark:text-primary-400
                                 hover:bg-primary-50 dark:hover:bg-primary-900/20
                                 transition-colors"
                    >
                      <Cog6ToothIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleQuickInstall(mod.name)}
                      title="Install"
                      className="h-7 w-7 flex items-center justify-center rounded
                                 border border-primary-300 dark:border-primary-700
                                 text-primary-600 dark:text-primary-400
                                 hover:bg-primary-50 dark:hover:bg-primary-900/20
                                 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 dark:border-neutral-700
                          bg-white dark:bg-neutral-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Install PM2 Module</h3>
              <button onClick={() => setDialogOpen(false)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-4">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Module Name</label>
              <input
                autoFocus
                type="text"
                value={newModuleName}
                onChange={e => setNewModuleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInstall()}
                placeholder="e.g. pm2-logrotate"
                className="w-full h-8 px-3 text-xs rounded border
                           bg-white dark:bg-neutral-800
                           border-neutral-200 dark:border-neutral-700
                           text-neutral-900 dark:text-neutral-100
                           placeholder-neutral-400 dark:placeholder-neutral-500
                           focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1.5 text-[11px] text-neutral-400">Enter any npm-published PM2 module name.</p>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => setDialogOpen(false)}
                className="h-7 px-3 text-xs font-medium rounded border
                           border-neutral-200 dark:border-neutral-700
                           text-neutral-600 dark:text-neutral-400
                           hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="h-7 px-3 text-xs font-medium rounded
                           bg-primary-600 hover:bg-primary-700 text-white
                           disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {installing ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Installing…
                  </>
                ) : (
                  <><ArrowDownTrayIcon className="h-3.5 w-3.5" />Install</>
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

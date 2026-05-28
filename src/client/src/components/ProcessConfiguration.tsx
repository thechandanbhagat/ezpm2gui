import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

// @group Types : Component props and data interfaces
interface ConfigurationProps {
  procId?: number | string;
}

interface ConfigData {
  name: string;
  script: string;
  cwd: string;
  interpreter?: string;
  instances: number;
  exec_mode: 'fork' | 'cluster';
  autorestart: boolean;
  watch: boolean;
  ignore_watch: string[];
  env: Record<string, string>;
  max_memory_restart: string;
}

// @group Utilities : Reusable input/label primitives
const inputCls = 'bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none w-full';
const labelCls = 'text-[10px] font-mono text-[#888] mb-1 block';
const helpCls  = 'text-[9px] font-mono text-[#555] mt-0.5';
const sectionCls = 'bg-[#111] border border-[#1e1e1e] rounded-sm p-4';

// @group ProcessConfiguration : Form for editing a PM2 process configuration
const ProcessConfiguration: React.FC<ConfigurationProps> = ({ procId: propProcId }) => {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const processId = propProcId || Number(params.id);
  const navigate = useNavigate();

  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [envKeys, setEnvKeys] = useState<string[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // @group DataFetching : Load process config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/config/${processId}`);
        setConfig(response.data);
        setEnvKeys(Object.keys(response.data.env || {}));
        setLoading(false);
      } catch {
        setError(`Failed to fetch configuration for process ${processId}`);
        setLoading(false);
      }
    };
    fetchConfig();
  }, [processId]);

  // @group Handlers : Config field change handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setConfig(prev => {
      if (!prev) return prev;
      return { ...prev, [name]: type === 'checkbox' ? checked : value };
    });
  };

  const handleEnvChange = (key: string, value: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      return { ...prev, env: { ...prev.env, [key]: value } };
    });
  };

  const addNewEnvVar = () => {
    if (!newEnvKey.trim()) return;
    setConfig(prev => {
      if (!prev) return prev;
      return { ...prev, env: { ...prev.env, [newEnvKey]: newEnvValue } };
    });
    setEnvKeys(prev => [...prev, newEnvKey]);
    setNewEnvKey('');
    setNewEnvValue('');
  };

  const removeEnvVar = (key: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
    setEnvKeys(envKeys.filter(k => k !== key));
  };

  // @group BusinessLogic : Save configuration
  const saveConfig = async () => {
    try {
      await axios.post(`/api/config/${processId}`, config);
      setSuccess('Configuration saved successfully');
    } catch {
      setError('Failed to save configuration');
    }
  };

  // @group Render : Loading and error states
  if (loading) {
    return (
      <div className="font-mono text-xs text-[#555] p-4">
        {t('processConfig.loading')}
      </div>
    );
  }
  if (!config) {
    return (
      <div className="font-mono text-xs text-[#ef4444] p-4">
        {t('processConfig.notFound')}
      </div>
    );
  }

  // @group Render : Main form layout
  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xs font-semibold text-[#e8e8e8] tracking-[0.15em] uppercase">
            ▸ {t('processConfig.title')}
          </h1>
          <p className="font-mono text-[10px] text-[#555] mt-0.5">
            process id: {processId}
          </p>
        </div>
      </div>

      {/* Inline feedback banners */}
      {error && (
        <div className="bg-[#111] border border-[#ef4444]/40 rounded-sm px-3 py-2 font-mono text-[10px] text-[#ef4444] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-[#555] hover:text-[#888] ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-[#111] border border-[#22c55e]/40 rounded-sm px-3 py-2 font-mono text-[10px] text-[#22c55e] flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-[#555] hover:text-[#888] ml-4">✕</button>
        </div>
      )}

      {/* General settings section */}
      <div className={sectionCls}>
        <p className="font-mono text-[9px] text-[#555] uppercase tracking-[0.15em] mb-3">
          general
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          <div>
            <label className={labelCls}>name</label>
            <input
              className={inputCls}
              name="name"
              value={config.name}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label className={labelCls}>{t('processConfig.scriptPath')}</label>
            <input
              className={inputCls}
              name="script"
              value={config.script}
              onChange={handleInputChange}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>{t('processConfig.workingDir')}</label>
            <input
              className={inputCls}
              name="cwd"
              value={config.cwd}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label className={labelCls}>{t('processConfig.instances')}</label>
            <input
              className={inputCls}
              name="instances"
              type="number"
              value={config.instances}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label className={labelCls}>{t('processConfig.execMode')}</label>
            <select
              className={inputCls}
              name="exec_mode"
              value={config.exec_mode}
              onChange={handleInputChange}
            >
              <option value="fork">fork</option>
              <option value="cluster">cluster</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('processConfig.maxMemory')}</label>
            <input
              className={inputCls}
              name="max_memory_restart"
              value={config.max_memory_restart}
              onChange={handleInputChange}
            />
            <p className={helpCls}>e.g. 150M, 1G</p>
          </div>

        </div>

        {/* Toggles */}
        <div className="flex gap-6 mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="autorestart"
              checked={config.autorestart}
              onChange={handleInputChange}
              className="accent-[#22c55e]"
            />
            <span className="font-mono text-[10px] text-[#888]">{t('processConfig.autoRestart')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="watch"
              checked={config.watch}
              onChange={handleInputChange}
              className="accent-[#22c55e]"
            />
            <span className="font-mono text-[10px] text-[#888]">{t('processConfig.watchChanges')}</span>
          </label>
        </div>
      </div>

      {/* Environment variables section */}
      <div className={sectionCls}>
        <p className="font-mono text-[9px] text-[#555] uppercase tracking-[0.15em] mb-3">
          {t('processConfig.envVars')}
        </p>

        <div className="space-y-2">
          {envKeys.map(key => (
            <div key={key} className="flex items-center gap-2">
              <input
                className={`${inputCls} w-1/3 opacity-50`}
                value={key}
                readOnly
              />
              <input
                className={`${inputCls} flex-1`}
                value={config.env[key]}
                onChange={(e) => handleEnvChange(key, e.target.value)}
              />
              <button
                onClick={() => removeEnvVar(key)}
                className="font-mono text-[10px] text-[#555] hover:text-[#ef4444] px-2 py-1.5 border border-[#1e1e1e] rounded-sm transition-colors shrink-0"
              >
                {t('processConfig.remove')}
              </button>
            </div>
          ))}
        </div>

        {/* Add new env var */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1e1e1e]">
          <input
            className={`${inputCls} w-1/3`}
            placeholder={t('processConfig.newKey')}
            value={newEnvKey}
            onChange={(e) => setNewEnvKey(e.target.value)}
          />
          <input
            className={`${inputCls} flex-1`}
            placeholder={t('processConfig.newValue')}
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
          />
          <button
            onClick={addNewEnvVar}
            className="font-mono text-[10px] text-[#888] hover:text-[#e8e8e8] px-3 py-1.5 border border-[#1e1e1e] hover:border-[#333] rounded-sm transition-colors shrink-0"
          >
            + add
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => navigate('/processes')}
          className="font-mono text-xs text-[#555] hover:text-[#888] px-4 py-1.5 border border-[#1e1e1e] hover:border-[#333] rounded-sm transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={saveConfig}
          className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-white transition-colors"
        >
          {t('processConfig.saveConfig')}
        </button>
      </div>

    </div>
  );
};

export default ProcessConfiguration;

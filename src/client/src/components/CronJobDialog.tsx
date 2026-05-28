import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CronExpressionBuilder from './CronExpressionBuilder';
import ScriptEditor from './ScriptEditor';
import { CronJobConfig, CronValidationResult } from '../types/cron';

// @group Types : Component props
interface CronJobDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (job: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  editJob?: CronJobConfig;
}

// @group Configuration : Default form state
const DEFAULT_FORM = {
  name: '',
  description: '',
  scriptType: 'node' as 'node' | 'python' | 'shell' | 'dotnet',
  scriptMode: 'inline' as 'file' | 'inline',
  scriptPath: '',
  inlineScript: '',
  cronExpression: '0 * * * *',
  args: [] as string[],
  env: {} as Record<string, string>,
  cwd: '',
  enabled: true,
};

// @group Utilities : Shared input class string
const INPUT_CLS =
  'bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none w-full';

const LABEL_CLS = 'text-[10px] font-mono text-[#888] mb-1 block';
const HELP_CLS = 'text-[9px] font-mono text-[#555] mt-0.5';
const SECTION_TITLE_CLS = 'text-[10px] font-mono font-bold text-[#888] uppercase tracking-[0.1em] mb-3';

// @group Component : CronJobDialog modal
const CronJobDialog: React.FC<CronJobDialogProps> = ({ open, onClose, onSave, editJob }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<CronValidationResult>({ valid: true });
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [newArg, setNewArg] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // @group BusinessLogic : Populate form on open/edit
  useEffect(() => {
    if (editJob) {
      setFormData({
        name: editJob.name,
        description: editJob.description || '',
        scriptType: editJob.scriptType,
        scriptMode: editJob.scriptMode || 'file',
        scriptPath: editJob.scriptPath,
        inlineScript: editJob.inlineScript || '',
        cronExpression: editJob.cronExpression,
        args: editJob.args || [],
        env: editJob.env || {},
        cwd: editJob.cwd || '',
        enabled: editJob.enabled,
      });
    } else {
      setFormData({ ...DEFAULT_FORM });
    }
  }, [editJob, open]);

  // @group Utilities : Generic field updater
  const setField = <K extends keyof typeof DEFAULT_FORM>(field: K, value: typeof DEFAULT_FORM[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // @group BusinessLogic : Argument management
  const addArg = () => {
    if (newArg.trim()) {
      setField('args', [...formData.args, newArg.trim()]);
      setNewArg('');
    }
  };

  const removeArg = (index: number) => {
    setField('args', formData.args.filter((_, i) => i !== index));
  };

  // @group BusinessLogic : Environment variable management
  const addEnv = () => {
    if (newEnvKey.trim()) {
      setField('env', { ...formData.env, [newEnvKey.trim()]: newEnvValue.trim() });
      setNewEnvKey('');
      setNewEnvValue('');
    }
  };

  const removeEnv = (key: string) => {
    const next = { ...formData.env };
    delete next[key];
    setField('env', next);
  };

  // @group BusinessLogic : Form submission
  const handleSubmit = async () => {
    if (!validation.valid) return;
    if (!formData.name || !formData.cronExpression) {
      alert('Please fill in all required fields');
      return;
    }
    if (formData.scriptMode === 'file' && !formData.scriptPath) {
      alert('Please provide a script path');
      return;
    }
    if (formData.scriptMode === 'inline' && !formData.inlineScript) {
      alert('Please write your script');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving cron job:', error);
      alert('Failed to save cron job');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // @group Rendering : Dialog overlay and card
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="bg-[#111] border border-[#1e1e1e] rounded-sm w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* @group Rendering : Dialog title bar */}
        <div className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em] border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between shrink-0">
          <span>{editJob ? t('cronJobs.editJob') : t('cronJobs.createJob')}</span>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-[#888] font-mono text-xs leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* @group Rendering : Scrollable form body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">

          {/* @group Rendering : Basic info section */}
          <div>
            <p className={SECTION_TITLE_CLS}>{t('cronJobs.basicInfo')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>{t('cronJobs.jobName')} *</label>
                <input
                  type="text"
                  className={INPUT_CLS}
                  value={formData.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="My Scheduled Task"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.enabled}
                  onClick={() => setField('enabled', !formData.enabled)}
                  className={[
                    'relative inline-flex h-4 w-8 shrink-0 rounded-sm border transition-colors focus:outline-none',
                    formData.enabled
                      ? 'bg-[#22c55e]/20 border-[#22c55e]/40'
                      : 'bg-[#0d0d0d] border-[#333]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-3 w-3 rounded-sm bg-current transition-transform mt-0.5',
                      formData.enabled ? 'translate-x-4 text-[#22c55e]' : 'translate-x-0.5 text-[#555]',
                    ].join(' ')}
                  />
                </button>
                <span className="text-[10px] font-mono text-[#888]">
                  {formData.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="sm:col-span-3">
                <label className={LABEL_CLS}>Description</label>
                <textarea
                  className={INPUT_CLS + ' resize-none'}
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Optional description of this job"
                />
              </div>
            </div>
          </div>

          {/* @group Rendering : Section divider */}
          <div className="border-t border-[#1a1a1a]" />

          {/* @group Rendering : Script configuration section */}
          <div>
            <p className={SECTION_TITLE_CLS}>{t('cronJobs.scriptConfig')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>{t('cronJobs.scriptType')} *</label>
                <select
                  className={INPUT_CLS}
                  value={formData.scriptType}
                  onChange={(e) => setField('scriptType', e.target.value as typeof formData.scriptType)}
                >
                  <option value="node">Node.js</option>
                  <option value="python">Python</option>
                  <option value="shell">Shell Script</option>
                  <option value="dotnet">.NET</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>{t('cronJobs.scriptMode')} *</label>
                <select
                  className={INPUT_CLS}
                  value={formData.scriptMode}
                  onChange={(e) => setField('scriptMode', e.target.value as typeof formData.scriptMode)}
                >
                  <option value="inline">{t('cronJobs.writeInline')}</option>
                  <option value="file">{t('cronJobs.useFile')}</option>
                </select>
              </div>

              {formData.scriptMode === 'file' ? (
                <>
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLS}>{t('cronJobs.scriptPath')} *</label>
                    <input
                      type="text"
                      className={INPUT_CLS}
                      value={formData.scriptPath}
                      onChange={(e) => setField('scriptPath', e.target.value)}
                      placeholder="/path/to/script.js"
                    />
                    <p className={HELP_CLS}>Absolute or relative path to your script</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLS}>{t('cronJobs.workingDir')}</label>
                    <input
                      type="text"
                      className={INPUT_CLS}
                      value={formData.cwd}
                      onChange={(e) => setField('cwd', e.target.value)}
                      placeholder="/path/to/working/directory"
                    />
                    <p className={HELP_CLS}>Optional: Directory to run the script from</p>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <ScriptEditor
                    value={formData.inlineScript}
                    onChange={(val) => setField('inlineScript', val)}
                    scriptType={formData.scriptType}
                  />
                </div>
              )}
            </div>
          </div>

          {/* @group Rendering : Section divider */}
          <div className="border-t border-[#1a1a1a]" />

          {/* @group Rendering : Cron schedule section */}
          <CronExpressionBuilder
            value={formData.cronExpression}
            onChange={(expr) => setField('cronExpression', expr)}
            onValidationChange={setValidation}
          />

          {/* @group Rendering : Section divider */}
          <div className="border-t border-[#1a1a1a]" />

          {/* @group Rendering : Arguments section */}
          <div>
            <p className={SECTION_TITLE_CLS}>{t('cronJobs.scriptArgs')}</p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder={t('cronJobs.addArgument')}
                value={newArg}
                onChange={(e) => setNewArg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addArg()}
              />
              <button
                type="button"
                onClick={addArg}
                className="border border-[#333] text-[#888] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#555] shrink-0"
              >
                +
              </button>
            </div>
            {formData.args.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {formData.args.map((arg, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-[10px] px-2 py-0.5 rounded-sm"
                  >
                    {arg}
                    <button
                      type="button"
                      onClick={() => removeArg(i)}
                      className="text-[#555] hover:text-[#ef4444] leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* @group Rendering : Section divider */}
          <div className="border-t border-[#1a1a1a]" />

          {/* @group Rendering : Environment variables section */}
          <div>
            <p className={SECTION_TITLE_CLS}>{t('cronJobs.envVars')}</p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder={t('common.key')}
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
              />
              <input
                type="text"
                className={INPUT_CLS}
                placeholder={t('common.value')}
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEnv()}
              />
              <button
                type="button"
                onClick={addEnv}
                className="border border-[#333] text-[#888] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#555] shrink-0"
              >
                +
              </button>
            </div>
            {Object.entries(formData.env).length > 0 && (
              <div className="space-y-1">
                {Object.entries(formData.env).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1e1e1e] px-2.5 py-1.5 rounded-sm"
                  >
                    <span className="font-mono text-[10px] text-[#22d3ee] min-w-[100px]">{key}</span>
                    <span className="font-mono text-[10px] text-[#888] flex-1 truncate">{val}</span>
                    <button
                      type="button"
                      onClick={() => removeEnv(key)}
                      className="text-[#555] hover:text-[#ef4444] font-mono text-xs leading-none shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* @group Rendering : Dialog action buttons */}
        <div className="border-t border-[#1a1a1a] px-4 py-3 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="border border-[#333] text-[#888] font-mono text-xs px-4 py-1.5 rounded-sm hover:border-[#555] disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !validation.valid}
            className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40"
          >
            {saving
              ? t('cronJobs.saving')
              : editJob
              ? t('cronJobs.update')
              : t('cronJobs.create')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CronJobDialog;

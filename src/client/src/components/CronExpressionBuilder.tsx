import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { CronValidationResult } from '../types/cron';

// @group Types : Component props
interface CronExpressionBuilderProps {
  value: string;
  onChange: (expression: string) => void;
  onValidationChange?: (validation: CronValidationResult) => void;
}

// @group Configuration : Cron presets
const PRESETS: Record<string, string> = {
  'Every minute': '* * * * *',
  'Every 5 minutes': '*/5 * * * *',
  'Every 15 minutes': '*/15 * * * *',
  'Every 30 minutes': '*/30 * * * *',
  'Every hour': '0 * * * *',
  'Every 6 hours': '0 */6 * * *',
  'Every day at midnight': '0 0 * * *',
  'Every day at noon': '0 12 * * *',
  'Every Monday at 9 AM': '0 9 * * 1',
  'Every weekday at 9 AM': '0 9 * * 1-5',
  'Every month on the 1st': '0 0 1 * *',
};

const PRESET_I18N_MAP: Record<string, string> = {
  'Every minute': 'cronJobs.everyMinute',
  'Every 5 minutes': 'cronJobs.every5Minutes',
  'Every 15 minutes': 'cronJobs.every15Minutes',
  'Every 30 minutes': 'cronJobs.every30Minutes',
  'Every hour': 'cronJobs.everyHour',
  'Every 6 hours': 'cronJobs.every6Hours',
  'Every day at midnight': 'cronJobs.everydayMidnight',
  'Every day at noon': 'cronJobs.everydayNoon',
  'Every Monday at 9 AM': 'cronJobs.everyMondayAm',
  'Every weekday at 9 AM': 'cronJobs.everyWeekdayAm',
  'Every month on the 1st': 'cronJobs.everyMonthFirst',
};

// @group Configuration : Cron field definitions
const CRON_FIELDS = [
  { key: 'minute' as const, labelKey: 'cronJobs.minute', placeholder: '*', hint: '0-59 or *' },
  { key: 'hour' as const, labelKey: 'cronJobs.hour', placeholder: '*', hint: '0-23 or *' },
  { key: 'dayOfMonth' as const, labelKey: 'cronJobs.dayOfMonth', placeholder: '*', hint: '1-31 or *' },
  { key: 'month' as const, labelKey: 'cronJobs.month', placeholder: '*', hint: '1-12 or *' },
  { key: 'dayOfWeek' as const, labelKey: 'cronJobs.dayOfWeek', placeholder: '*', hint: '0-6 or *' },
];

// @group Utilities : Parse cron expression into parts
const parseCron = (expr: string) => {
  const parts = expr.split(' ');
  if (parts.length === 5) {
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    };
  }
  return { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
};

// @group Utilities : Shared class strings
const INPUT_CLS =
  'bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2 py-1 focus:border-[#555] focus:outline-none w-full';

// @group Component : CronExpressionBuilder
const CronExpressionBuilder: React.FC<CronExpressionBuilderProps> = ({
  value,
  onChange,
  onValidationChange,
}) => {
  const { t } = useTranslation();
  const [cronParts, setCronParts] = useState(parseCron(value));
  const [validation, setValidation] = useState<CronValidationResult>({ valid: true, description: '' });
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // @group BusinessLogic : Validate expression on change
  useEffect(() => {
    if (!value) return;
    const validate = async () => {
      try {
        const response = await axios.post('/api/cron-jobs/validate', { expression: value });
        if (response.data.success) {
          const result: CronValidationResult = response.data.data;
          setValidation(result);
          onValidationChange?.(result);
        }
      } catch {
        const invalid: CronValidationResult = { valid: false, error: 'Invalid cron expression' };
        setValidation(invalid);
        onValidationChange?.(invalid);
      }
    };
    validate();
  }, [value, onValidationChange]);

  // @group BusinessLogic : Sync parts -> expression
  useEffect(() => {
    const next = `${cronParts.minute} ${cronParts.hour} ${cronParts.dayOfMonth} ${cronParts.month} ${cronParts.dayOfWeek}`;
    if (next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronParts]);

  // @group BusinessLogic : Handle individual part edits
  const handlePartChange = (part: keyof typeof cronParts, val: string) => {
    setCronParts((prev) => ({ ...prev, [part]: val }));
    setActivePreset(null);
  };

  // @group BusinessLogic : Handle preset selection
  const handlePreset = (expr: string, label: string) => {
    onChange(expr);
    setCronParts(parseCron(expr));
    setActivePreset(label);
  };

  // @group BusinessLogic : Handle direct expression edit
  const handleDirectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setCronParts(parseCron(e.target.value));
    setActivePreset(null);
  };

  // @group Rendering : CronExpressionBuilder UI
  return (
    <div className="space-y-3">
      {/* Section title */}
      <p className="text-[10px] font-mono font-bold text-[#888] uppercase tracking-[0.1em]">
        {t('cronJobs.cronSchedule')}
      </p>

      {/* @group Rendering : Preset buttons */}
      <div>
        <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.1em] mb-1.5 block">
          {t('cronJobs.usePreset')}
        </span>
        <div className="flex flex-wrap gap-1">
          {Object.entries(PRESETS).map(([label, expr]) => {
            const isActive = activePreset === label;
            return (
              <button
                key={expr}
                type="button"
                onClick={() => handlePreset(expr, label)}
                className={[
                  'text-[9px] font-mono border px-2 py-0.5 rounded-sm transition-colors',
                  isActive
                    ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#022c00]'
                    : 'border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888]',
                ].join(' ')}
              >
                {t(PRESET_I18N_MAP[label] || label)}
              </button>
            );
          })}
        </div>
      </div>

      {/* @group Rendering : Direct expression input + preview */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3 space-y-2">
        <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.1em] block">
          Cron Expression
        </span>
        <input
          type="text"
          value={value}
          onChange={handleDirectChange}
          placeholder="* * * * *"
          className={[
            'bg-[#0a0a0a] border font-mono text-[10px] text-[#22d3ee] px-2.5 py-1.5 rounded-sm focus:outline-none w-full',
            validation.valid ? 'border-[#1e1e1e] focus:border-[#555]' : 'border-[#ef4444]/50',
          ].join(' ')}
        />
        {validation.valid && validation.description && (
          <p className="text-[10px] font-mono text-[#888]">{validation.description}</p>
        )}
        {!validation.valid && validation.error && (
          <p className="text-[10px] font-mono text-[#ef4444]">{validation.error}</p>
        )}
      </div>

      {/* @group Rendering : Visual field builder */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
        <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.1em] mb-2 block">
          {t('cronJobs.buildVisually')}
        </span>
        <div className="grid grid-cols-5 gap-2">
          {CRON_FIELDS.map(({ key, labelKey, placeholder, hint }) => (
            <div key={key}>
              <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.1em] mb-1 block">
                {t(labelKey)}
              </label>
              <input
                type="text"
                className={INPUT_CLS}
                value={cronParts[key]}
                onChange={(e) => handlePartChange(key, e.target.value)}
                placeholder={placeholder}
              />
              <p className="text-[9px] font-mono text-[#555] mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* @group Rendering : Next run display */}
      {validation.valid && validation.nextRun && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#555]">{t('cronJobs.nextRunLabel')}</span>
          <span className="font-mono text-[10px] text-[#22c55e] bg-[#022c00] border border-[#22c55e]/20 px-2 py-0.5 rounded-sm">
            {new Date(validation.nextRun).toLocaleString()}
          </span>
        </div>
      )}

      {/* @group Rendering : Format help text */}
      <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm px-3 py-2 space-y-1">
        <p className="text-[9px] font-mono text-[#555]">
          <span className="text-[#888]">format:</span> minute hour day-of-month month day-of-week
        </p>
        <p className="text-[9px] font-mono text-[#555]">
          <span className="text-[#888]">syntax:</span> * = any &nbsp; */5 = every 5 &nbsp; 1-5 = range &nbsp; 1,3,5 = list
        </p>
      </div>
    </div>
  );
};

export default CronExpressionBuilder;

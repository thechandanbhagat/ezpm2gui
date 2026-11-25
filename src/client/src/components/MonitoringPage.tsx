import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import PageHeader from './PageHeader';
import { AlertRule, HealthCheck, MonitoringConfig, MonitoringSnapshot, MonitoringTarget, RuleSource } from '../types/monitoring';
import './MonitoringPage.css';

type Editor = { type: 'check'; item: HealthCheck; base: MonitoringConfig; isNew: boolean }
  | { type: 'rule'; item: AlertRule; base: MonitoringConfig; isNew: boolean };
type Removal = { type: 'check' | 'rule'; id: string; name: string; base: MonitoringConfig };
const newId = () => typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const upsert = <T extends { id: string }>(items: T[], item: T) => items.some(existing => existing.id === item.id)
  ? items.map(existing => existing.id === item.id ? item : existing) : [...items, item];

const MonitoringPage: React.FC = () => {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [targets, setTargets] = useState<MonitoringTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const mounted = useRef(false);
  const fetching = useRef(false);
  const savingRef = useRef(false);
  const editorRef = useRef<HTMLFormElement>(null);
  const removalRef = useRef<HTMLDivElement>(null);

  const acceptSnapshot = useCallback((next: MonitoringSnapshot) => {
    setSnapshot(current => !current || next.config.revision >= current.config.revision ? next : current);
  }, []);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setRefreshing(true);
    const [status, availableTargets] = await Promise.allSettled([
      axios.get<MonitoringSnapshot>('/api/monitoring'),
      axios.get<MonitoringTarget[]>('/api/monitoring/targets'),
    ]);
    if (mounted.current) {
      if (status.status === 'fulfilled') { acceptSnapshot(status.value.data); setLoadError(false); }
      else setLoadError(true);
      if (availableTargets.status === 'fulfilled') { setTargets(availableTargets.value.data); setTargetError(false); }
      else setTargetError(true);
      setLoading(false);
      setRefreshing(false);
    }
    fetching.current = false;
  }, [acceptSnapshot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);

  const removalId = removal?.id;
  useEffect(() => { removalRef.current?.focus(); }, [removalId]);
  const editorId = editor?.item.id;
  useEffect(() => { editorRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [editorId]);

  const persist = async (config: MonitoringConfig): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true); setSaveError(''); setSaved(false);
    try {
      const response = await axios.put<MonitoringSnapshot>('/api/monitoring/config', config);
      if (mounted.current) { acceptSnapshot(response.data); setSaved(true); }
      return true;
    } catch (error: any) {
      if (mounted.current) {
        setSaveError(error.response?.status === 409 ? t('monitoring.conflict')
          : error.response?.data?.error || t('monitoring.saveFailed'));
        void refresh();
      }
      return false;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const openCheck = (check?: HealthCheck) => {
    if (!snapshot) return;
    setSaved(false); setSaveError('');
    setEditor({ type: 'check', base: snapshot.config, isNew: !check, item: check ? { ...check } : {
      id: newId(), name: '', enabled: true, kind: 'http', url: '', host: '', port: 443,
      expectedStatus: 200, intervalSeconds: 30, timeoutSeconds: 5, unhealthyAfter: 3,
    } });
  };
  const openRule = (rule?: AlertRule) => {
    if (!snapshot) return;
    setSaved(false); setSaveError('');
    setEditor({ type: 'rule', base: snapshot.config, isNew: !rule, item: rule ? { ...rule } : {
      id: newId(), name: '', enabled: true, source: snapshot.config.healthChecks.length ? 'health' : 'cpu',
      connectionId: 'local', processName: '', healthCheckId: snapshot.config.healthChecks[0]?.id || '',
      threshold: 85, durationSeconds: 180, windowSeconds: 600, cooldownSeconds: 900, webhookUrl: '',
    } });
  };
  const updateCheck = (patch: Partial<HealthCheck>) => setEditor(current => current?.type === 'check' ? { ...current, item: { ...current.item, ...patch } } : current);
  const updateRule = (patch: Partial<AlertRule>) => setEditor(current => current?.type === 'rule' ? { ...current, item: { ...current.item, ...patch } } : current);
  const saveEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || editor.base.revision !== snapshot?.config.revision) return;
    if (editor.type === 'check' && editor.item.timeoutSeconds >= editor.item.intervalSeconds) {
      setSaveError(t('monitoring.timeoutError')); return;
    }
    const config = editor.type === 'check'
      ? { ...editor.base, healthChecks: upsert(editor.base.healthChecks, { ...editor.item, name: editor.item.name.trim() }) }
      : { ...editor.base, rules: upsert(editor.base.rules, { ...editor.item, name: editor.item.name.trim() }) };
    if (await persist(config)) setEditor(null);
  };
  const deleteItem = async () => {
    if (!removal) return;
    const config = removal.type === 'check'
      ? { ...removal.base, healthChecks: removal.base.healthChecks.filter(check => check.id !== removal.id), rules: removal.base.rules.filter(rule => rule.source !== 'health' || rule.healthCheckId !== removal.id) }
      : { ...removal.base, rules: removal.base.rules.filter(rule => rule.id !== removal.id) };
    if (await persist(config)) setRemoval(null);
  };
  const cancel = () => { setEditor(null); setRemoval(null); setSaveError(''); };
  const date = (timestamp: number) => timestamp ? new Date(timestamp).toLocaleString() : t('monitoring.never');
  const badge = (status: string) => <span className={`monitoring-status monitoring-status-${status}`}>{t(`monitoring.status.${status}`)}</span>;
  const busy = saving || !!editor || !!removal;
  const config = snapshot?.config;
  const paused = !!config?.maintenanceUntil && config.maintenanceUntil > Date.now();
  const rule = editor?.type === 'rule' ? editor.item : null;
  const selectedTarget = targets.find(target => target.connectionId === rule?.connectionId);
  const processNames = Array.from(new Set(selectedTarget?.processes.map(process => process.name) || [])).sort();
  const currentRevision = editor?.base.revision ?? removal?.base.revision;
  const staleEditor = currentRevision !== undefined && currentRevision !== config?.revision;
  const relatedRules = removal?.type === 'check' ? removal.base.rules.filter(item => item.source === 'health' && item.healthCheckId === removal.id).length : 0;

  const numberField = (key: string, value: number, onChange: (value: number) => void, min: number, max: number, step = 1) => (
    <label className="monitoring-field"><span>{t(`monitoring.fields.${key}`)}</span>
      <input type="number" name={key} required min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  );

  return (
    <div className="monitoring-page">
      <PageHeader title={t('monitoring.title')} subtitle={t('monitoring.subtitle')} actions={
        <button type="button" className="btn-secondary monitoring-button" onClick={() => { void refresh(); }} disabled={refreshing}>
          <ArrowPathIcon aria-hidden="true" />{t('monitoring.refresh')}
        </button>
      } />
      {loadError && <p className="monitoring-error" role="alert">{t(snapshot ? 'monitoring.refreshFailed' : 'monitoring.loadFailed')}</p>}
      {loading && <p role="status">{t('monitoring.loading')}</p>}
      {snapshot && <>
        <div className="monitoring-maintenance">
          <div><strong>{t(paused ? 'monitoring.notificationsPaused' : 'monitoring.notificationsActive')}</strong>
            <p>{paused ? t('monitoring.pausedUntil', { time: date(config!.maintenanceUntil!) }) : t('monitoring.maintenanceHint')}</p>
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { void persist({ ...snapshot.config, maintenanceUntil: paused ? null : Date.now() + 3600000 }); }}>
            {t(paused ? 'monitoring.resume' : 'monitoring.pause')}
          </button>
        </div>
        {saved && <p className="monitoring-success" role="status">{t('monitoring.saved')}</p>}
        {saveError && <p className="monitoring-error" role="alert">{saveError}</p>}
        {staleEditor && <p className="monitoring-warning" role="status">{t('monitoring.draftOutdated')}</p>}
        <section aria-labelledby="monitoring-checks-title">
          <div className="monitoring-section-heading"><h2 id="monitoring-checks-title">{t('monitoring.checksTitle')}</h2>
            <button type="button" className="btn-primary monitoring-button" disabled={busy} onClick={() => openCheck()}><PlusIcon aria-hidden="true" />{t('monitoring.addCheck')}</button>
          </div>
          <p className="monitoring-help">{t('monitoring.probeLocation')}</p>
          {editor?.type === 'check' && <form ref={editorRef} onSubmit={saveEditor} className="monitoring-editor" aria-label={t(editor.isNew ? 'monitoring.addCheck' : 'monitoring.editCheck')}>
            <h3>{t(editor.isNew ? 'monitoring.addCheck' : 'monitoring.editCheck')}</h3>
            <fieldset disabled={saving}>
              <div className="monitoring-form-grid">
                <label className="monitoring-field"><span>{t('monitoring.fields.name')}</span><input name="name" required maxLength={120} value={editor.item.name} onChange={event => updateCheck({ name: event.target.value })} /></label>
                <label className="monitoring-field"><span>{t('monitoring.fields.protocol')}</span><select value={editor.item.kind} onChange={event => updateCheck({ kind: event.target.value as 'http' | 'tcp' })}><option value="http">HTTP / HTTPS</option><option value="tcp">TCP</option></select></label>
                {editor.item.kind === 'http' ? <>
                  <label className="monitoring-field monitoring-field-wide"><span>{t('monitoring.fields.url')}</span><input name="url" type="url" required value={editor.item.url || ''} placeholder="https://api.example.com/health" onChange={event => updateCheck({ url: event.target.value })} /></label>
                  {numberField('expectedStatus', editor.item.expectedStatus, value => updateCheck({ expectedStatus: value }), 100, 599)}
                </> : <>
                  <label className="monitoring-field"><span>{t('monitoring.fields.host')}</span><input name="host" required value={editor.item.host || ''} placeholder="db.example.com" onChange={event => updateCheck({ host: event.target.value })} /></label>
                  {numberField('port', editor.item.port ?? 443, value => updateCheck({ port: value }), 1, 65535)}
                </>}
                {numberField('interval', editor.item.intervalSeconds, value => updateCheck({ intervalSeconds: value }), 10, 3600)}
                {numberField('timeout', editor.item.timeoutSeconds, value => updateCheck({ timeoutSeconds: value }), 1, 30)}
                {numberField('failures', editor.item.unhealthyAfter, value => updateCheck({ unhealthyAfter: value }), 1, 20)}
              </div>
              <label className="monitoring-checkbox"><input type="checkbox" checked={editor.item.enabled} onChange={event => updateCheck({ enabled: event.target.checked })} />{t('monitoring.checkEnabled')}</label>
              {!editor.item.enabled && editor.base.rules.some(item => item.source === 'health' && item.healthCheckId === editor.item.id) && <p className="monitoring-help">{t('monitoring.disabledCheckHint')}</p>}
              <div className="monitoring-actions"><button type="submit" className="btn-primary" disabled={staleEditor}>{t(saving ? 'monitoring.saving' : 'monitoring.saveCheck')}</button><button type="button" className="btn-secondary" onClick={cancel}>{t('monitoring.cancel')}</button></div>
            </fieldset>
          </form>}
          {!config!.healthChecks.length && <p className="monitoring-empty">{t('monitoring.noChecks')}</p>}
          <ul className="monitoring-list">
            {config!.healthChecks.map(check => {
              const result = snapshot.healthResults.find(item => item.checkId === check.id);
              return <li key={check.id} className="monitoring-row">
                <div className="monitoring-row-main"><div className="monitoring-row-title"><h3>{check.name}</h3>{badge(check.enabled ? result?.status || 'unknown' : 'disabled')}</div>
                  <p className="monitoring-endpoint">{check.kind === 'http' ? check.url : `${check.host}:${check.port}`}</p>
                  <p className="monitoring-row-detail">{t('monitoring.checkSchedule', { seconds: check.intervalSeconds, count: check.unhealthyAfter })}</p>
                  {result?.message && <p className="monitoring-row-detail">{result.message}</p>}
                </div>
                <div className="monitoring-reading"><span>{t('monitoring.lastCheck')}</span><time dateTime={result?.checkedAt ? new Date(result.checkedAt).toISOString() : undefined}>{date(result?.checkedAt || 0)}</time><span>{result?.latencyMs !== null && result?.latencyMs !== undefined ? t('monitoring.latency', { value: Math.round(result.latencyMs) }) : t('monitoring.noLatency')}</span></div>
                <div className="monitoring-row-actions"><button className="btn-secondary" type="button" disabled={busy} onClick={() => openCheck(check)} aria-label={t('monitoring.editNamed', { name: check.name })}>{t('monitoring.edit')}</button><button className="btn-danger" type="button" disabled={busy} onClick={() => { setSaveError(''); setRemoval({ type: 'check', id: check.id, name: check.name, base: snapshot.config }); }} aria-label={t('monitoring.deleteNamed', { name: check.name })}>{t('monitoring.delete')}</button></div>
              </li>;
            })}
          </ul>
        </section>
        <section aria-labelledby="monitoring-rules-title">
          <div className="monitoring-section-heading"><h2 id="monitoring-rules-title">{t('monitoring.rulesTitle')}</h2><button type="button" className="btn-primary monitoring-button" disabled={busy} onClick={() => openRule()}><PlusIcon aria-hidden="true" />{t('monitoring.addRule')}</button></div>
          <p className="monitoring-help">{t('monitoring.rulesHint')}</p>
          {targetError && <p className="monitoring-warning" role="status">{t('monitoring.targetsFailed')}</p>}
          {editor?.type === 'rule' && rule && <form ref={editorRef} onSubmit={saveEditor} className="monitoring-editor" aria-label={t(editor.isNew ? 'monitoring.addRule' : 'monitoring.editRule')}>
            <h3>{t(editor.isNew ? 'monitoring.addRule' : 'monitoring.editRule')}</h3>
            <fieldset disabled={saving}>
              <div className="monitoring-form-grid">
                <label className="monitoring-field"><span>{t('monitoring.fields.name')}</span><input name="name" required maxLength={120} value={rule.name} onChange={event => updateRule({ name: event.target.value })} /></label>
                <label className="monitoring-field"><span>{t('monitoring.fields.source')}</span><select value={rule.source} onChange={event => updateRule({ source: event.target.value as RuleSource, threshold: event.target.value === 'restarts' ? 5 : event.target.value === 'memory' ? 512 : 85 })}>{(['health', 'cpu', 'memory', 'restarts', 'offline'] as RuleSource[]).map(source => <option key={source} value={source}>{t(`monitoring.sources.${source}`)}</option>)}</select></label>
                {rule.source === 'health' ? <label className="monitoring-field monitoring-field-wide"><span>{t('monitoring.fields.check')}</span><select required value={rule.healthCheckId} onChange={event => updateRule({ healthCheckId: event.target.value })}><option value="">{t('monitoring.selectCheck')}</option>{editor.base.healthChecks.map(check => <option key={check.id} value={check.id}>{check.name}{!check.enabled ? ` (${t('monitoring.status.disabled')})` : ''}</option>)}</select></label> : <>
                  <label className="monitoring-field"><span>{t('monitoring.fields.server')}</span><select required value={rule.connectionId} onChange={event => updateRule({ connectionId: event.target.value, processName: '' })}>
                    {!targets.some(target => target.connectionId === rule.connectionId) && <option value={rule.connectionId}>{rule.connectionId === 'local' ? t('monitoring.local') : rule.connectionId}</option>}
                    {targets.map(target => <option key={target.connectionId} value={target.connectionId} disabled={!target.connected && target.connectionId !== rule.connectionId}>{target.connectionId === 'local' ? t('monitoring.local') : target.name}{!target.connected ? ` (${t('monitoring.disconnected')})` : ''}</option>)}
                  </select></label>
                  <label className="monitoring-field"><span>{t('monitoring.fields.process')}</span><select required value={rule.processName} onChange={event => updateRule({ processName: event.target.value })}><option value="">{t('monitoring.selectProcess')}</option>{rule.processName && !processNames.includes(rule.processName) && <option value={rule.processName}>{rule.processName}</option>}{processNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
                </>}
                {['cpu', 'memory', 'restarts'].includes(rule.source) && numberField(rule.source === 'cpu' ? 'cpuThreshold' : rule.source === 'memory' ? 'memoryThreshold' : 'restartThreshold', rule.threshold, value => updateRule({ threshold: value }), rule.source === 'memory' ? 0.01 : rule.source === 'restarts' ? 1 : 0, rule.source === 'cpu' ? 100000 : rule.source === 'restarts' ? 1000000 : 1000000000, rule.source === 'restarts' ? 1 : 0.01)}
                {numberField('duration', rule.durationSeconds, value => updateRule({ durationSeconds: value }), 0, 86400)}
                {rule.source === 'restarts' && numberField('window', rule.windowSeconds, value => updateRule({ windowSeconds: value }), 10, 86400)}
                {numberField('cooldown', rule.cooldownSeconds, value => updateRule({ cooldownSeconds: value }), 0, 86400)}
                <label className="monitoring-field monitoring-field-wide"><span>{t('monitoring.fields.webhook')}</span><input name="webhook" type="url" value={rule.webhookUrl} onChange={event => updateRule({ webhookUrl: event.target.value })} /><span className="monitoring-help">{t('monitoring.webhookHint')}</span></label>
              </div>
              {rule.source !== 'health' && <p className="monitoring-help">{t('monitoring.processGroupHint')}</p>}
              {rule.source === 'health' && !editor.base.healthChecks.find(check => check.id === rule.healthCheckId)?.enabled && <p className="monitoring-warning">{t('monitoring.disabledCheckHint')}</p>}
              <label className="monitoring-checkbox"><input type="checkbox" checked={rule.enabled} onChange={event => updateRule({ enabled: event.target.checked })} />{t('monitoring.ruleEnabled')}</label>
              <div className="monitoring-actions"><button type="submit" className="btn-primary" disabled={staleEditor}>{t(saving ? 'monitoring.saving' : 'monitoring.saveRule')}</button><button type="button" className="btn-secondary" onClick={cancel}>{t('monitoring.cancel')}</button></div>
            </fieldset>
          </form>}
          {!config!.rules.length && <p className="monitoring-empty">{t('monitoring.noRules')}</p>}
          <ul className="monitoring-list">{config!.rules.map(item => {
            const state = snapshot.ruleStates.find(value => value.ruleId === item.id);
            const targetName = item.source === 'health' ? config!.healthChecks.find(check => check.id === item.healthCheckId)?.name
              : `${targets.find(target => target.connectionId === item.connectionId)?.name || (item.connectionId === 'local' ? t('monitoring.local') : item.connectionId)} / ${item.processName}`;
            return <li key={item.id} className="monitoring-row"><div className="monitoring-row-main"><div className="monitoring-row-title"><h3>{item.name}</h3>{badge(item.enabled ? state?.status || 'unknown' : 'suppressed')}</div><p className="monitoring-endpoint">{t(`monitoring.sources.${item.source}`)} · {targetName}</p><p className="monitoring-row-detail">{state?.message || t('monitoring.awaitingData')}</p></div><div className="monitoring-reading"><span>{t('monitoring.lastEvaluated')}</span><time dateTime={state?.updatedAt ? new Date(state.updatedAt).toISOString() : undefined}>{date(state?.updatedAt || 0)}</time>{['cpu', 'memory', 'restarts'].includes(item.source) && state?.value !== null && state?.value !== undefined && <span>{t(`monitoring.observed.${item.source}`, { value: Math.round(state.value * 100) / 100 })}</span>}</div><div className="monitoring-row-actions"><button className="btn-secondary" type="button" disabled={busy} onClick={() => openRule(item)} aria-label={t('monitoring.editNamed', { name: item.name })}>{t('monitoring.edit')}</button><button className="btn-danger" type="button" disabled={busy} onClick={() => { setSaveError(''); setRemoval({ type: 'rule', id: item.id, name: item.name, base: snapshot.config }); }} aria-label={t('monitoring.deleteNamed', { name: item.name })}>{t('monitoring.delete')}</button></div></li>;
          })}</ul>
        </section>
        {removal && <div ref={removalRef} tabIndex={-1} className="monitoring-confirm" role="group" aria-label={t('monitoring.confirmDelete')}><p>{t('monitoring.deleteQuestion', { name: removal.name })}</p>{relatedRules > 0 && <p>{t('monitoring.deleteLinkedRules', { count: relatedRules })}</p>}<div className="monitoring-actions"><button type="button" className="btn-danger" disabled={saving || staleEditor} onClick={() => { void deleteItem(); }}>{t(saving ? 'monitoring.saving' : 'monitoring.confirmDelete')}</button><button type="button" className="btn-secondary" disabled={saving} onClick={cancel}>{t('monitoring.cancel')}</button></div></div>}
        <section aria-labelledby="monitoring-events-title"><div className="monitoring-section-heading"><h2 id="monitoring-events-title">{t('monitoring.eventsTitle')}</h2></div><p className="monitoring-help">{t('monitoring.eventsHint')}</p>
          {!snapshot.events.length ? <p className="monitoring-empty">{t('monitoring.noEvents')}</p> : <ol className="monitoring-events">{snapshot.events.map(event => <li key={event.id}><div className="monitoring-event-heading"><strong>{event.ruleName}</strong>{badge(event.kind)}<time dateTime={new Date(event.timestamp).toISOString()}>{date(event.timestamp)}</time></div><p>{event.message}</p><span className={`monitoring-delivery monitoring-delivery-${event.delivery}`}>{t('monitoring.deliveryLabel')}: {t(`monitoring.delivery.${event.delivery}`)}</span></li>)}</ol>}
        </section>
      </>}
    </div>
  );
};

export default MonitoringPage;

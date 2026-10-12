import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface Provider {
  id: string;
  name: string;
  available: boolean;
  kind: 'local' | 'cloud';
  reason?: string;
  models?: Array<{ name: string; local: boolean }>;
}

interface Snapshot {
  processId: number;
  processName: string;
  source: 'local' | 'remote';
  status?: string;
  restarts?: number;
  cpuPercent?: number;
  memoryBytes?: number;
  notes?: string[];
  logs: Array<{ stream: 'stdout' | 'stderr'; message: string }>;
}

interface SnapshotResponse {
  snapshot: Snapshot;
  redactionCount: number;
  truncated: boolean;
  warnings?: string[];
}

interface AnalysisResult {
  provider: string;
  model?: string;
  analysis: string;
  lineCount: number;
  redactionCount: number;
  truncated: boolean;
  warnings?: string[];
}

interface LogAnalysisDialogProps {
  open: boolean;
  processId: number;
  processName?: string;
  connectionId?: string;
  onClose: () => void;
}

const providerIds = ['ollama', 'claude', 'codex', 'cursor', 'copilot'];
const providerNames: Record<string, string> = {
  ollama: 'Ollama', claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor CLI', copilot: 'GitHub Copilot CLI',
};

const buttonClass = 'px-3 py-1.5 text-xs font-mono rounded-sm border border-[var(--ez-border)] text-[var(--ez-text)] hover:bg-[var(--ez-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:opacity-50 disabled:cursor-not-allowed';
const selectClass = 'w-full min-w-0 px-2 py-2 text-xs font-mono rounded-sm border border-[var(--ez-border)] bg-[var(--ez-bg-page)] text-[var(--ez-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:opacity-50';

const failureMessage = (error: any, fallback: string): string =>
  typeof error?.response?.data?.error === 'string' ? error.response.data.error : fallback;

// @group LogAnalysis : Explicit, reviewable snapshots sent through the server's installed providers.
const LogAnalysisDialog: React.FC<LogAnalysisDialogProps> = ({ open, processId, processName, connectionId, onClose }) => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selection, setSelection] = useState({ providerId: '', model: '' });
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotResponse | null>(null);
  const [allowCloud, setAllowCloud] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [running, setRunning] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const providerRequest = useRef<AbortController | null>(null);
  const snapshotRequest = useRef<AbortController | null>(null);
  const analysisRequest = useRef<AbortController | null>(null);

  const loadProviders = useCallback(async () => {
    providerRequest.current?.abort();
    const controller = new AbortController();
    providerRequest.current = controller;
    setLoadingProviders(true);
    setProviderError('');
    try {
      const response = await axios.get<{ providers: Provider[] }>('/api/log-analysis/providers', { signal: controller.signal });
      if (controller.signal.aborted) return;
      const detected = response.data.providers;
      setProviders(detected);
      setSelection(previous => {
        const current = detected.find(provider => provider.id === previous.providerId && provider.available
          && (provider.id !== 'ollama' || provider.models?.some(model => model.local)));
        const preferred = current
          || detected.find(provider => provider.id === 'ollama' && provider.available && provider.models?.some(model => model.local))
          || detected.find(provider => provider.available && provider.kind === 'cloud')
          || detected.find(provider => provider.available)
          || detected[0];
        const localModels = preferred?.models?.filter(model => model.local) || [];
        const model = localModels.some(item => item.name === previous.model)
          ? previous.model : localModels[0]?.name || '';
        return { providerId: preferred?.id || '', model };
      });
    } catch (error) {
      if (!controller.signal.aborted) setProviderError(failureMessage(error, t('logAnalysis.providerError')));
    } finally {
      if (!controller.signal.aborted) setLoadingProviders(false);
    }
  }, [t]);

  const loadSnapshot = useCallback(async () => {
    snapshotRequest.current?.abort();
    const controller = new AbortController();
    snapshotRequest.current = controller;
    setLoadingSnapshot(true);
    setSnapshotError('');
    try {
      const response = await axios.post<SnapshotResponse>('/api/log-analysis/snapshot', {
        processId, ...(connectionId ? { connectionId } : {}),
      }, { signal: controller.signal });
      if (!controller.signal.aborted) setSnapshotInfo(response.data);
    } catch (error) {
      if (!controller.signal.aborted) setSnapshotError(failureMessage(error, t('logAnalysis.snapshotError')));
    } finally {
      if (!controller.signal.aborted) setLoadingSnapshot(false);
    }
  }, [processId, connectionId, t]);

  useEffect(() => {
    if (!open) return;
    setProviders([]);
    setSelection({ providerId: '', model: '' });
    setSnapshotInfo(null);
    setAllowCloud(false);
    setResult(null);
    setAnalysisError('');
    setAnalysisStatus('');
    setRunning(false);
    void loadProviders();
    void loadSnapshot();
    return () => {
      providerRequest.current?.abort();
      snapshotRequest.current?.abort();
      analysisRequest.current?.abort();
    };
  }, [open, loadProviders, loadSnapshot]);

  useEffect(() => { setAllowCloud(false); }, [selection.providerId]);

  const provider = providers.find(item => item.id === selection.providerId);
  const localModels = provider?.models?.filter(model => model.local) || [];
  const needsModel = provider?.id === 'ollama';
  const validModel = !needsModel || localModels.some(model => model.name === selection.model);
  const requiresCloud = provider?.kind === 'cloud';
  const snapshotNotes = Array.from(new Set([...(snapshotInfo?.warnings || []), ...(snapshotInfo?.snapshot.notes || [])]));
  const ready = Boolean(provider?.available && snapshotInfo?.snapshot.logs.length && validModel
    && (!requiresCloud || allowCloud) && !loadingProviders && !loadingSnapshot && !running);

  const cancelAnalysis = () => {
    analysisRequest.current?.abort();
    setRunning(false);
    setAnalysisStatus(t('logAnalysis.cancelled'));
  };

  const close = () => {
    providerRequest.current?.abort();
    snapshotRequest.current?.abort();
    analysisRequest.current?.abort();
    onClose();
  };

  const analyze = async () => {
    if (!ready || !provider || !snapshotInfo) return;
    const controller = new AbortController();
    analysisRequest.current = controller;
    setRunning(true);
    setAnalysisError('');
    setAnalysisStatus(t('logAnalysis.analyzing'));
    try {
      const response = await axios.post<AnalysisResult>('/api/log-analysis/analyze', {
        provider: provider.id,
        ...(needsModel ? { model: selection.model } : {}),
        snapshot: snapshotInfo.snapshot,
        allowCloud: requiresCloud && allowCloud,
      }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setResult({
          ...response.data,
          redactionCount: snapshotInfo.redactionCount + response.data.redactionCount,
          truncated: snapshotInfo.truncated || response.data.truncated,
          warnings: Array.from(new Set([...(snapshotInfo.warnings || []), ...(response.data.warnings || [])])),
        });
        setAnalysisStatus(t('logAnalysis.complete'));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setAnalysisError(failureMessage(error, t('logAnalysis.analysisError')));
        setAnalysisStatus('');
      }
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  };

  const errorRow = (message: string, retry: () => void) => message && (
    <Box role="alert" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, my: 1, color: 'var(--ez-danger-text)' }}>
      <span>{message}</span>
      <button type="button" onClick={retry} className={buttonClass}>{t('logAnalysis.retry')}</button>
    </Box>
  );

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="log-analysis-title" aria-describedby="log-analysis-description"
      PaperProps={{ sx: { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: undefined }, maxHeight: 'calc(100% - 32px)',
        bgcolor: 'var(--ez-bg-surface)', color: 'var(--ez-text)', border: '1px solid var(--ez-border)', borderRadius: '4px', boxShadow: 'none', fontFamily: 'monospace',
        '& ::selection': { bgcolor: 'var(--ez-primary-action)', color: 'var(--ez-primary-action-text)' },
        '& ::-webkit-scrollbar': { width: 6 }, '& ::-webkit-scrollbar-thumb': { bgcolor: 'var(--ez-border)', borderRadius: 2 },
      } }}>
      <DialogTitle id="log-analysis-title" sx={{ fontFamily: 'inherit', fontWeight: 600, fontSize: '1rem', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'var(--ez-bg-sidebar)' }}>
        <span style={{ flex: 1 }}>{t('logAnalysis.title')}</span>
        <button type="button" aria-label={t('logAnalysis.close')} onClick={close} className={`${buttonClass} p-1`}>
          <XMarkIcon className="h-4 w-4" />
        </button>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: '16px !important', fontSize: '0.8125rem', lineHeight: 1.6 }}>
        <Typography id="log-analysis-description" sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: 'var(--ez-text-muted)', maxWidth: '75ch', mb: 2 }}>
          {t('logAnalysis.description')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', mb: 1 }}>
          <label style={{ flex: '1 1 220px', minWidth: 0 }}>
            <span style={{ display: 'block', marginBottom: 4 }}>{t('logAnalysis.provider')}</span>
            <select aria-label={t('logAnalysis.provider')} value={selection.providerId} disabled={loadingProviders || running} className={selectClass}
              onChange={event => {
                const selected = providers.find(item => item.id === event.target.value);
                setSelection({ providerId: selected?.id || '', model: selected?.models?.find(model => model.local)?.name || '' });
              }}>
              {providers.length === 0 && <option value="">{t(loadingProviders ? 'logAnalysis.detecting' : 'logAnalysis.noProviders')}</option>}
              {providers.map(item => <option value={item.id} key={item.id}>{item.name} · {t(item.kind === 'local' ? 'logAnalysis.local' : 'logAnalysis.cloud')}{!item.available ? ` · ${t('logAnalysis.unavailable')}` : ''}</option>)}
            </select>
          </label>
          {needsModel && (
            <label style={{ flex: '1 1 200px', minWidth: 0 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>{t('logAnalysis.model')}</span>
              <select aria-label={t('logAnalysis.model')} value={selection.model} className={selectClass} disabled={running || localModels.length === 0}
                onChange={event => setSelection(previous => ({ ...previous, model: event.target.value }))}>
                {localModels.length === 0 && <option value="">{t('logAnalysis.noModels')}</option>}
                {localModels.map(model => <option value={model.name} key={model.name}>{model.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={loadingProviders || running} onClick={() => void loadProviders()} className={`${buttonClass} flex items-center gap-1.5`}>
            <ArrowPathIcon className="h-3.5 w-3.5" />{t('logAnalysis.refreshProviders')}
          </button>
        </Box>
        {errorRow(providerError, () => void loadProviders())}
        {provider && (
          <Box sx={{ color: 'var(--ez-text-muted)', mb: 2 }}>
            {provider.reason && <div>{provider.reason}</div>}
            {providerIds.includes(provider.id) && <div>{t(`logAnalysis.setup.${provider.id}`)}</div>}
            <div>{t('logAnalysis.serverMachine')}</div>
          </Box>
        )}
        {!loadingProviders && !providers.some(item => item.available) && (
          <Box sx={{ color: 'var(--ez-text-muted)', mb: 2 }}>
            <p style={{ margin: '8px 0' }}>{t('logAnalysis.noProviderHelp')}</p>
            <details>
              <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.setupTitle')}</summary>
              <ul style={{ paddingLeft: 20, marginTop: 8 }}>{providerIds.map(id => <li key={id}>{providerNames[id]}: {t(`logAnalysis.setup.${id}`)}</li>)}</ul>
            </details>
          </Box>
        )}
        {requiresCloud && (
          <Box sx={{ my: 2, p: 1.5, bgcolor: 'var(--ez-bg-page)', border: '1px solid var(--ez-border)', borderRadius: '2px' }}>
            <p style={{ margin: '0 0 8px' }}>{t('logAnalysis.cloudNotice', { provider: provider?.name })}</p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" checked={allowCloud} disabled={running} onChange={event => setAllowCloud(event.target.checked)}
                style={{ marginTop: 5, accentColor: 'var(--ez-accent)' }} />
              <span>{t('logAnalysis.cloudConsent', { provider: provider?.name })}</span>
            </label>
          </Box>
        )}
        {loadingSnapshot && <p role="status">{t('logAnalysis.loadingSnapshot')}</p>}
        {errorRow(snapshotError, () => void loadSnapshot())}
        {snapshotInfo && (
          <Box sx={{ mt: 2 }}>
            <Typography component="h3" sx={{ fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>{snapshotInfo.snapshot.processName || processName || String(processId)}</Typography>
            <p style={{ margin: '0 0 8px', color: 'var(--ez-text-muted)' }}>
              {t('logAnalysis.snapshotSummary', { count: snapshotInfo.snapshot.logs.length, redactions: snapshotInfo.redactionCount })}
              {' · '}{t(snapshotInfo.snapshot.source === 'remote' ? 'logAnalysis.remoteSource' : 'logAnalysis.localSource')}
              {snapshotInfo.snapshot.status ? ` · ${snapshotInfo.snapshot.status}` : ''}
              {typeof snapshotInfo.snapshot.restarts === 'number' ? ` · ${t('logAnalysis.restarts', { count: snapshotInfo.snapshot.restarts })}` : ''}
            </p>
            <p style={{ margin: '0 0 8px', color: 'var(--ez-text-muted)' }}>{t('logAnalysis.snapshotScope')}</p>
            {snapshotInfo.truncated && <p style={{ margin: '0 0 8px' }}>{t('logAnalysis.truncated')}</p>}
            {snapshotNotes.map((note, index) => <p key={index} style={{ margin: '0 0 8px' }}>{note}</p>)}
            {snapshotInfo.snapshot.logs.length === 0 ? <p>{t('logAnalysis.emptySnapshot')}</p> : (
              <details open>
                <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.preview')}</summary>
                <Box component="pre" aria-label={t('logAnalysis.preview')} sx={{ m: 0, mt: 1, p: 1.5, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', bgcolor: 'var(--ez-bg-page)', color: 'var(--ez-text)', fontSize: '0.75rem', fontFamily: 'inherit', border: '1px solid var(--ez-border)', borderRadius: '2px' }}>
                  {snapshotInfo.snapshot.logs.map((line, index) => `${index + 1}. [${line.stream}] ${line.message}`).join('\n')}
                </Box>
              </details>
            )}
          </Box>
        )}
        {analysisError && <p role="alert" style={{ color: 'var(--ez-danger-text)' }}>{analysisError} {t('logAnalysis.retryAnalysis')}</p>}
        <div role="status" aria-live="polite" style={{ marginTop: 12 }}>{analysisStatus}</div>
        {result && (
          <Box sx={{ mt: 2 }}>
            <Typography component="h3" sx={{ fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>{t('logAnalysis.resultTitle')}</Typography>
            <p style={{ margin: '0 0 8px', color: 'var(--ez-text-muted)' }}>{t('logAnalysis.advisory')}</p>
            <p style={{ margin: '0 0 8px', color: 'var(--ez-text-muted)' }}>
              {providers.find(item => item.id === result.provider)?.name || result.provider}{result.model ? ` · ${result.model}` : ''}
              {' · '}{t('logAnalysis.resultSummary', { count: result.lineCount, redactions: result.redactionCount })}
            </p>
            {result.truncated && <p>{t('logAnalysis.truncated')}</p>}
            {result.warnings?.map((warning, index) => <p key={index}>{warning}</p>)}
            <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'var(--ez-bg-page)', fontSize: 'inherit', fontFamily: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--ez-border)', borderRadius: '2px' }}>{result.analysis}</Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, flexWrap: 'wrap', gap: 1, borderTop: '1px solid var(--ez-border)' }}>
        <button type="button" className={buttonClass} onClick={close}>{t('logAnalysis.close')}</button>
        {running ? (
          <button type="button" className={buttonClass} onClick={cancelAnalysis}>{t('logAnalysis.cancel')}</button>
        ) : (
          <button type="button" onClick={() => void analyze()} disabled={!ready} className={`${buttonClass} border-[var(--ez-accent)] text-[var(--ez-accent)]`}>
            {t('logAnalysis.analyze')}
          </button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default LogAnalysisDialog;

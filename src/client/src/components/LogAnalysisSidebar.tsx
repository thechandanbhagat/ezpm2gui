import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { XMarkIcon, ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useLogAnalysis } from './LogAnalysisContext';
import { requiresCloudConsent, usableModels } from './logAnalysisModels';
import { LogAnalysisSnapshotPreview, LogAnalysisTranscript } from './LogAnalysisTranscript';

const buttonClass = 'px-3 py-2 text-xs font-mono rounded-sm border border-[var(--ez-border)] text-[var(--ez-text)] hover:bg-[var(--ez-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:opacity-50 disabled:cursor-not-allowed';
const fieldClass = 'w-full min-w-0 px-2 py-2 text-xs font-mono rounded-sm border border-[var(--ez-border)] bg-[var(--ez-bg-page)] text-[var(--ez-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:opacity-50';
const providerNames: Record<string, string> = {
  ollama: 'Ollama', claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor CLI', copilot: 'GitHub Copilot CLI',
};
const providerIds = Object.keys(providerNames);
const SIDEBAR_WIDTH = 'min(45vw, 36rem)';
const MAX_MODEL_LENGTH = 128;
const MAX_QUESTION_LENGTH = 4000;

export const LogAnalysisContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { visible } = useLogAnalysis();
  return <Box sx={{ marginInlineEnd: { xs: 0, sm: visible ? SIDEBAR_WIDTH : 0 } }}>{children}</Box>;
};

const ProviderControls = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  const provider = state.providers.find(item => item.id === state.selection.providerId);
  const models = usableModels(provider);
  const disabled = state.busy || state.running;
  return <>
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <label>
        <span className="block mb-1">{t('logAnalysis.provider')}</span>
        <select aria-label={t('logAnalysis.provider')} className={fieldClass} value={state.selection.providerId}
          disabled={state.loadingProviders || disabled} onChange={event => state.selectProvider(event.target.value)}>
          {state.providers.length === 0 && <option value="">{t(state.loadingProviders ? 'logAnalysis.detecting' : 'logAnalysis.noProviders')}</option>}
          {state.providers.map(item => <option value={item.id} key={item.id}>{item.name}{item.id === 'ollama' ? '' : ` · ${t(item.kind === 'local' ? 'logAnalysis.local' : 'logAnalysis.cloud')}`}{!item.available ? ` · ${t('logAnalysis.unavailable')}` : ''}</option>)}
        </select>
      </label>
      {provider?.id === 'ollama' ? <label>
        <span className="block mb-1">{t('logAnalysis.model')}</span>
        <select aria-label={t('logAnalysis.model')} className={fieldClass} value={state.selection.model} disabled={disabled || models.length === 0}
          onChange={event => state.selectModel(event.target.value)}>
          {models.length === 0 && <option value="">{t('logAnalysis.noModels')}</option>}
          {models.map(model => <option value={model.name} key={model.name}>{model.name} · {t(model.kind === 'cloud' ? 'logAnalysis.cloud' : 'logAnalysis.local')}</option>)}
        </select>
      </label> : provider && <label>
        <span className="block mb-1">{t('logAnalysis.cloudModel')}</span>
        <input aria-label={t('logAnalysis.cloudModel')} className={fieldClass} value={state.selection.model} disabled={disabled}
          maxLength={MAX_MODEL_LENGTH} placeholder={t('logAnalysis.providerDefault')} onChange={event => state.selectModel(event.target.value)} />
        <span className="block mt-1 text-[var(--ez-text-muted)]">{t('logAnalysis.modelHelp')}</span>
      </label>}
      <button type="button" disabled={state.loadingProviders || disabled} onClick={() => void state.refreshProviders()}
        className={`${buttonClass} flex items-center justify-center gap-1.5`}><ArrowPathIcon className="h-3.5 w-3.5" />{t('logAnalysis.refreshProviders')}</button>
    </Box>
    {provider?.reason && <p className="mt-2 text-[var(--ez-text-muted)]">{provider.reason}</p>}
    {provider && <details className="mt-3 text-[var(--ez-text-muted)]">
      <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.setupDetails')}</summary>
      {providerIds.includes(provider.id) && <p className="mt-2">{t(`logAnalysis.setup.${provider.id}`)}</p>}
      <p>{t('logAnalysis.serverMachine')}</p>
    </details>}
    {!state.loadingProviders && !state.providers.some(item => item.available) && <Box sx={{ color: 'var(--ez-text-muted)', mt: 1 }}>
      <p>{t('logAnalysis.noProviderHelp')}</p>
      <details><summary className="cursor-pointer">{t('logAnalysis.setupTitle')}</summary>
        <ul className="pl-5 mt-2">{providerIds.map(id => <li key={id}>{providerNames[id]}: {t(`logAnalysis.setup.${id}`)}</li>)}</ul>
      </details>
    </Box>}
  </>;
};

const CloudSharing = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  const provider = state.providers.find(item => item.id === state.selection.providerId);
  if (!requiresCloudConsent(provider, state.selection.model)) return null;
  return <Box sx={{ mt: 1.5, color: 'var(--ez-text-muted)' }}>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={state.allowCloud} disabled={state.busy || state.running} className="mt-1 accent-[var(--ez-accent)]"
          onChange={event => state.setAllowCloud(event.target.checked)} />
        <span>{t('logAnalysis.shareWithProvider', { provider: provider?.name })}</span>
      </label>
      <details className="mt-1">
        <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.sharingDetails')}</summary>
        <p className="mt-2">{t('logAnalysis.cloudNotice', { provider: provider?.name })}</p>
      </details>
  </Box>;
};

const ConversationHistory = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  return <details className="border-t border-[var(--ez-border)]">
    <summary className="cursor-pointer py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.history')}</summary>
    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
      <button type="button" disabled={state.busy || state.loadingHistory} className={buttonClass} onClick={() => void state.refreshHistory()}>{t('logAnalysis.refreshHistory')}</button>
    </Box>
    {state.loadingHistory && <p role="status">{t('logAnalysis.loadingHistory')}</p>}
    {state.historyError && <p role="alert" className="text-[var(--ez-danger-text)]">{state.historyError}</p>}
    {!state.loadingHistory && !state.history.length && <p className="mt-2 text-[var(--ez-text-muted)]">{t('logAnalysis.noHistory')}</p>}
    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
      {state.history.map(item => <li key={item.id}><button type="button" className={`${buttonClass} w-full text-left`} disabled={state.busy}
        aria-current={state.conversation?.id === item.id ? 'true' : undefined} onClick={() => void state.reopenConversation(item.id)}>
        {item.processName} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString()}</time>
      </button></li>)}
    </ul>
    {state.nextCursor && <button type="button" disabled={state.loadingHistory || state.busy} className={`${buttonClass} mt-2`}
      onClick={() => void state.refreshHistory(true)}>{t('logAnalysis.loadMore')}</button>}
  </details>;
};

export const LogAnalysisSidebar: React.FC = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  const provider = state.providers.find(item => item.id === state.selection.providerId);
  const providerSummary = provider ? `${provider.name}${state.selection.model ? ` · ${state.selection.model}` : ''}` : t(state.loadingProviders ? 'logAnalysis.detecting' : 'logAnalysis.noProviders');
  if (!state.visible) return null;
  return <Box component="aside" aria-labelledby="log-analysis-title" aria-describedby="log-analysis-description"
    sx={{ position: 'fixed', insetBlockStart: '2.25rem', insetBlockEnd: '1.75rem', insetInlineEnd: 0,
      width: { xs: 'calc(100vw - 44px)', sm: SIDEBAR_WIDTH }, zIndex: 45,
      display: 'flex', flexDirection: 'column', bgcolor: 'var(--ez-bg-surface)', color: 'var(--ez-text)',
      borderInlineStart: '1px solid var(--ez-border)', fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.6,
      '& ::selection': { bgcolor: 'var(--ez-primary-action)', color: 'var(--ez-primary-action-text)' } }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, bgcolor: 'var(--ez-bg-sidebar)', borderBottom: '1px solid var(--ez-border)' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" id="log-analysis-title" sx={{ fontFamily: 'inherit', fontWeight: 600, fontSize: '1rem' }}>{t('logAnalysis.title')}</Typography>
        {state.target && <p className="truncate text-xs text-[var(--ez-text-muted)]" title={`${state.target.processName || state.target.processId}${state.target.connectionId ? ` · ${state.target.connectionId}` : ''}`}>
          {state.target.processName || state.target.processId}{state.target.connectionId ? ` · ${state.target.connectionId}` : ''}
        </p>}
      </Box>
      <button type="button" disabled={state.busy} className={buttonClass} onClick={() => void state.newAnalysis()}>{t('logAnalysis.newAnalysis')}</button>
      <button type="button" aria-label={t('logAnalysis.close')} onClick={state.hideAnalysis} className={buttonClass}><XMarkIcon className="h-4 w-4" /></button>
    </Box>
    <Box sx={{ px: 2, overflow: 'auto', flex: 1, minHeight: 0 }}>
      <p id="log-analysis-description" className="sr-only">{t('logAnalysis.description')}</p>
      <details className="group border-b border-[var(--ez-border)]" aria-label={t('logAnalysis.settings')}>
        <summary className="flex cursor-pointer items-center justify-between gap-2 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">
          <span className="shrink-0 font-semibold">{t('logAnalysis.settings')}</span>
          <span className="min-w-0 truncate text-xs text-[var(--ez-text-muted)]" title={providerSummary}>{providerSummary}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 group-open:rotate-180" />
        </summary>
        <Box sx={{ pb: 2 }}><ProviderControls /></Box>
      </details>
      {state.providerError && <p role="alert" className="mt-2 text-[var(--ez-danger-text)]">{state.providerError}</p>}
      <ConversationHistory />
      <CloudSharing />
      <LogAnalysisSnapshotPreview />
      <LogAnalysisTranscript />
      {!state.conversation?.messages.length && !state.loadingSnapshot && <p className="py-6 text-[var(--ez-text-muted)]">{t('logAnalysis.emptyChat')}</p>}
    </Box>
    <Box component="form" onSubmit={event => { event.preventDefault(); void state.analyze(); }}
      sx={{ px: 2, py: 1.5, borderTop: '1px solid var(--ez-border)', bgcolor: 'var(--ez-bg-sidebar)' }}>
      <label className="block mb-2">
        <span className="block mb-1">{t(state.conversation?.messages.length ? 'logAnalysis.followup' : 'logAnalysis.question')}</span>
        <textarea aria-label={t(state.conversation?.messages.length ? 'logAnalysis.followup' : 'logAnalysis.question')} rows={2} maxLength={MAX_QUESTION_LENGTH}
          className={`${fieldClass} resize-y`} value={state.question} disabled={state.busy || state.running}
          placeholder={t('logAnalysis.questionPlaceholder')} onChange={event => state.setQuestion(event.target.value)} />
      </label>
      {state.analysisError && <p role="alert" className="text-[var(--ez-danger-text)] mb-2">{state.analysisError} {t('logAnalysis.retryAnalysis')}</p>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <span className="text-[var(--ez-text-muted)]">{t('logAnalysis.savedNotice')}</span>
        {state.running ? <button type="button" disabled={state.busy} className={buttonClass} onClick={() => void state.cancelAnalysis()}>{t('logAnalysis.cancel')}</button>
          : <button type="submit" disabled={!state.ready} className={`${buttonClass} border-[var(--ez-accent)] text-[var(--ez-accent)]`}>{t(state.busy ? 'logAnalysis.saving' : state.conversation?.messages.length ? 'logAnalysis.send' : 'logAnalysis.analyze')}</button>}
      </Box>
    </Box>
  </Box>;
};

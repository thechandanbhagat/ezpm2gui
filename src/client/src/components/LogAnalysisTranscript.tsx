import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useLogAnalysis } from './LogAnalysisContext';
import { LogAnalysisMarkdown } from './LogAnalysisMarkdown';
import { LogAnalysisFollowupSuggestions } from './LogAnalysisFollowupSuggestions';

const buttonClass = 'px-3 py-2 text-xs font-mono rounded-sm border border-[var(--ez-border)] text-[var(--ez-text)] hover:bg-[var(--ez-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:opacity-50 disabled:cursor-not-allowed';
const headingStyle = { fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, mb: 0.5 };
const previewStyle = { m: 0, mt: 1, p: 1.5, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  bgcolor: 'var(--ez-bg-page)', color: 'var(--ez-text)', fontSize: 'inherit', fontFamily: 'inherit', border: '1px solid var(--ez-border)' };

export const LogAnalysisSnapshotPreview: React.FC = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  const info = state.snapshotInfo;
  const notes = Array.from(new Set([...(info?.warnings || []), ...(info?.snapshot.notes || [])]));
  return <Box sx={{ mt: 2 }}>
    {state.loadingSnapshot && <p role="status">{t('logAnalysis.loadingSnapshot')}</p>}
    {state.snapshotError && <Box role="alert" sx={{ color: 'var(--ez-danger-text)' }}>
      <p>{state.snapshotError}</p><button type="button" className={buttonClass} onClick={() => void state.newAnalysis()}>{t('logAnalysis.retry')}</button>
    </Box>}
    {info && <details className="text-[var(--ez-text-muted)]">
      <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">
        <span className="font-semibold text-[var(--ez-text)]">{t('logAnalysis.snapshotTitle')}</span>
        {' · '}{t('logAnalysis.snapshotSummary', { count: info.snapshot.logs.length, redactions: info.redactionCount })}
      </summary>
      <p className="mt-2 mb-2">
        {t(info.snapshot.source === 'remote' ? 'logAnalysis.remoteSource' : 'logAnalysis.localSource')}
        {info.snapshot.status ? ` · ${info.snapshot.status}` : ''}
        {typeof info.snapshot.restarts === 'number' ? ` · ${t('logAnalysis.restarts', { count: info.snapshot.restarts })}` : ''}
      </p>
      <p className="mb-2 text-[var(--ez-text-muted)]">{t('logAnalysis.snapshotScope')}</p>
      {info.truncated && <p className="mb-2">{t('logAnalysis.truncated')}</p>}
      {notes.map(note => <p key={note} className="mb-2">{note}</p>)}
      {info.snapshot.logs.length === 0 ? <p>{t('logAnalysis.emptySnapshot')}</p> : <>
        <p className="mt-2">{t('logAnalysis.preview')}</p>
        <Box component="pre" aria-label={t('logAnalysis.preview')} sx={previewStyle}>{info.snapshot.logs.map((line, index) => `${index + 1}. [${line.stream}] ${line.message}`).join('\n')}</Box>
      </>}
    </details>}
  </Box>;
};

export const LogAnalysisTranscript: React.FC = () => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  const messages = state.conversation?.messages || [];
  if (!messages.length) return null;
  return <section aria-label={t('logAnalysis.transcript')} className="mt-4 space-y-6">
    <Typography component="h3" sx={headingStyle}>{t('logAnalysis.transcript')}</Typography>
    {messages.map(message => <Box key={message.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box component="article" aria-label={t('logAnalysis.you')} sx={{ alignSelf: 'flex-end', maxWidth: '85%', minWidth: 0,
        px: 2, py: 1.5, borderRadius: 2, bgcolor: 'var(--ez-accent-soft)', border: '1px solid var(--ez-accent-border)' }}>
        <p className="font-semibold mb-1">{t('logAnalysis.you')}</p>
        <p className="whitespace-pre-wrap break-words">{message.question}</p>
      </Box>
      <Box component="article" aria-label={t('logAnalysis.assistant')} sx={{ alignSelf: 'flex-start', width: '100%', minWidth: 0,
        px: 2, py: 1.5, borderRadius: 2, bgcolor: 'var(--ez-bg-surface-muted)', border: '1px solid var(--ez-border)' }}>
        <p className="mb-2"><span className="font-semibold">{t('logAnalysis.assistant')}</span>
          {' · '}<span className="text-[var(--ez-text-muted)]">{state.providers.find(provider => provider.id === message.provider)?.name || message.provider}</span></p>
        <p role="status" aria-live="polite" className={message.status === 'completed' ? 'sr-only' : undefined}>{t(`logAnalysis.status.${message.status}`)}</p>
        {message.error && <p role="alert" className="text-[var(--ez-danger-text)]">{message.error}</p>}
        {message.result && <LogAnalysisMarkdown content={message.result.analysis} />}
        <LogAnalysisFollowupSuggestions message={message} />
        <details className="mt-3 text-[var(--ez-text-muted)]">
          <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ez-accent)]">{t('logAnalysis.responseDetails')}</summary>
          <p className="mt-2">{message.model ? `${message.model} · ` : ''}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></p>
          {message.status === 'completed' && <p>{t(`logAnalysis.status.${message.status}`)}</p>}
          {message.result && <>
            <p>{t('logAnalysis.resultSummary', { count: message.result.lineCount, redactions: (state.conversation?.redactionCount || 0) + message.result.redactionCount })}</p>
            {(message.result.truncated || state.conversation?.truncated) && <p>{t('logAnalysis.truncated')}</p>}
            {message.result.warnings?.map(warning => <p key={warning}>{warning}</p>)}
            <p>{t('logAnalysis.advisory')}</p>
          </>}
        </details>
      </Box>
    </Box>)}
  </section>;
};

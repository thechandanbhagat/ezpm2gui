import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLogAnalysis } from './LogAnalysisContext';
import { AnalysisMessage } from './logAnalysisTypes';
import { createLogAnalysisFollowupQuestion, getLogAnalysisFollowups } from './logAnalysisFollowups';

const buttonClass = 'min-h-11 w-full rounded-sm border border-[var(--ez-border)] px-3 py-2 text-left text-xs text-[var(--ez-text)] hover:bg-[var(--ez-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)] disabled:cursor-not-allowed disabled:opacity-50';

export const LogAnalysisFollowupSuggestions: React.FC<{ message: AnalysisMessage }> = ({ message }) => {
  const { t } = useTranslation();
  const state = useLogAnalysis();
  if (message.status !== 'completed' || !message.result?.analysis.trim()) return null;
  const disabled = state.busy || state.running;
  const handleSuggestion = (event: React.MouseEvent<HTMLButtonElement>, suggestion: string) => {
    if (disabled) return;
    state.setQuestion(createLogAnalysisFollowupQuestion(suggestion, message.question,
      (question, followup) => t('logAnalysis.suggestions.reference', { question, suggestion: followup })));
    event.currentTarget.closest('aside')?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  };
  return <section aria-label={t('logAnalysis.suggestions.title')} className="mt-3 border-t border-[var(--ez-border)] pt-3">
    <p className="mb-2 text-xs text-[var(--ez-text-muted)]">{t('logAnalysis.suggestions.title')}</p>
    <div className="space-y-2">
      {getLogAnalysisFollowups(message.result.analysis).map(key => {
        const suggestion = t(`logAnalysis.suggestions.${key}`);
        return <button type="button" key={key} disabled={disabled} className={buttonClass}
          onClick={event => handleSuggestion(event, suggestion)}>{suggestion}</button>;
      })}
    </div>
  </section>;
};

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LogAnalysisSnapshotPreview, LogAnalysisTranscript } from './LogAnalysisTranscript';
import { useLogAnalysis } from './LogAnalysisContext';
import { AnalysisConversation, AnalysisMessage, SnapshotResponse } from './logAnalysisTypes';

jest.mock('./LogAnalysisContext', () => ({ useLogAnalysis: require('@jest/globals').jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
  const messages: Record<string, unknown> = require('../locales/en/translation.json');
  const translated = key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object'
    ? (value as Record<string, unknown>)[part] : undefined, messages);
  const text = typeof translated === 'string' ? translated : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => String(values[name] ?? ''));
} }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAX_SNAPSHOT_LINES = 400;
const MAX_CONVERSATION_MESSAGES = 200;
const timestamp = '2026-10-13T12:00:00.000Z';
const snapshot: SnapshotResponse = { snapshot: { processId: 1, processName: 'Sample application', source: 'remote', status: 'errored', restarts: 72,
  logs: [{ stream: 'stderr', message: 'Sample EADDRINUSE' }], notes: ['Partial history'] }, redactionCount: 2, truncated: true, warnings: ['Partial history'] };
const message: AnalysisMessage = { id: 'message-1', conversationId: 'conversation-1', provider: 'claude', model: 'sample-model',
  question: 'Investigate the failures', snapshot: snapshot.snapshot, status: 'completed', createdAt: timestamp, updatedAt: timestamp,
  result: { provider: 'claude', analysis: '## Findings\n\n**Port conflict** at `line 1`.', lineCount: 1, redactionCount: 1, truncated: true, warnings: ['Output warning'] } };
const conversation: AnalysisConversation = { id: 'conversation-1', processId: 1, processName: 'Sample application', source: 'remote',
  snapshot: snapshot.snapshot, messages: [message], redactionCount: 2, createdAt: timestamp, updatedAt: timestamp };
let container: HTMLDivElement;
let root: Root;

const mockState = (overrides: Partial<ReturnType<typeof useLogAnalysis>> = {}) => jest.mocked(useLogAnalysis).mockReturnValue({
  conversation, snapshotInfo: snapshot, providers: [{ id: 'claude', name: 'Claude Code', available: true, kind: 'cloud' }],
  busy: false, running: false, setQuestion: jest.fn(),
  newAnalysis: jest.fn(async () => undefined), ...overrides,
} as ReturnType<typeof useLogAnalysis>);
beforeEach(() => { mockState(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (node: React.ReactNode) => act(() => root.render(node));

describe('chat transcript', () => {
  test('separates requests and Markdown responses into labelled chat messages with collapsed response details', () => {
    render(<LogAnalysisTranscript />);
    const request = container.querySelector('article[aria-label="You"]');
    const response = container.querySelector('article[aria-label="Assistant"]');
    expect(request?.textContent).toContain('Investigate the failures');
    expect(request?.querySelector('details')).toBeNull();
    expect(response?.querySelector('h5')?.textContent).toBe('Findings');
    expect(response?.querySelector('strong')?.textContent).toBe('Port conflict');
    expect(response?.querySelector('details')?.open).toBe(false);
    expect(response?.querySelector('summary')?.textContent).toBe('Response details');
    expect(response?.querySelector('details')?.textContent).toContain('sample-model');
    expect(response?.querySelector('details')?.textContent).toContain('Output warning');
    expect(response?.querySelector('details')?.textContent).toContain('redacted values: 3');
    expect(response?.querySelector('[role="status"]')?.classList.contains('sr-only')).toBe(true);
    expect(response?.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(response?.querySelector('[role="status"]')?.textContent).toContain('Analysis complete');
  });

  test.each(['running', 'failed', 'cancelled', 'interrupted'] as const)('keeps %s status and errors visible outside collapsed details', status => {
    mockState({ conversation: { ...conversation, messages: [{ ...message, status, result: undefined, error: status === 'failed' ? 'Provider failed' : undefined }] } });
    render(<LogAnalysisTranscript />);
    const statusNode = container.querySelector('[role="status"]');
    expect(statusNode?.textContent).not.toBe('');
    expect(statusNode?.closest('details')).toBeNull();
    expect(statusNode?.classList.contains('sr-only')).toBe(false);
    if (status === 'failed') expect(container.querySelector('[role="alert"]')?.textContent).toBe('Provider failed');
  });

  test('keeps the live status mounted when a running response completes', () => {
    mockState({ conversation: { ...conversation, messages: [{ ...message, status: 'running', result: undefined }] } });
    render(<LogAnalysisTranscript />);
    const runningStatus = container.querySelector('[role="status"]');
    mockState();
    render(<LogAnalysisTranscript />);
    const completedStatus = container.querySelector('[role="status"]');
    expect(completedStatus).toBe(runningStatus);
    expect(completedStatus?.textContent).toContain('Analysis complete');
    expect(completedStatus?.classList.contains('sr-only')).toBe(true);
  });

  test('offers three contextual questions below every completed assistant response', () => {
    mockState({ conversation: { ...conversation, messages: [message, { ...message, id: 'message-2', question: 'Check database access',
      result: { ...message.result!, analysis: 'Database connection refused.' } }] } });
    render(<LogAnalysisTranscript />);
    const responses = container.querySelectorAll('article[aria-label="Assistant"]');
    expect(responses).toHaveLength(2);
    responses.forEach(response => expect(response.querySelectorAll('section button')).toHaveLength(3));
    expect(responses[0].querySelector('section')?.textContent).toContain('conflicting port');
    expect(responses[1].querySelector('section')?.textContent).toContain('connectivity and configuration');
    expect(container.querySelector('article[aria-label="You"] button')).toBeNull();
  });

  test.each(['running', 'failed', 'cancelled', 'interrupted'] as const)('does not offer follow-ups for a %s response, even with partial results', status => {
    mockState({ conversation: { ...conversation, messages: [{ ...message, status }] } });
    render(<LogAnalysisTranscript />);
    expect(container.querySelector('article section')).toBeNull();
  });

  test('does not offer follow-ups for a completed response without a result', () => {
    mockState({ conversation: { ...conversation, messages: [{ ...message, result: undefined }] } });
    render(<LogAnalysisTranscript />);
    expect(container.querySelector('article section')).toBeNull();
  });

  test.each(['', '  \n '])('does not offer follow-ups when a completed analysis is empty (%p)', analysis => {
    mockState({ conversation: { ...conversation, messages: [{ ...message, result: { ...message.result!, analysis } }] } });
    render(<LogAnalysisTranscript />);
    expect(container.querySelector('article section')).toBeNull();
  });

  test('references an older response when selecting its question and focuses the composer', () => {
    mockState({ conversation: { ...conversation, messages: [message, { ...message, id: 'message-2', question: 'Latest question' }] } });
    render(<aside><LogAnalysisTranscript /><textarea aria-label="Follow-up question" /></aside>);
    const suggestion = container.querySelector<HTMLButtonElement>('article[aria-label="Assistant"] section button')!;
    act(() => suggestion.click());
    expect(useLogAnalysis().setQuestion).toHaveBeenCalledWith(`Regarding your response to “Investigate the failures”: ${suggestion.textContent}`);
    expect(document.activeElement).toBe(container.querySelector('textarea'));
  });

  test.each([{ busy: true, running: false }, { busy: false, running: true }])('disables suggestions while an analysis is pending (%p)', status => {
    mockState(status);
    render(<aside><LogAnalysisTranscript /><textarea /></aside>);
    const suggestions = container.querySelectorAll<HTMLButtonElement>('article section button');
    expect(suggestions).toHaveLength(3);
    suggestions.forEach(suggestion => {
      expect(suggestion.disabled).toBe(true);
      act(() => suggestion.click());
    });
    expect(useLogAnalysis().setQuestion).not.toHaveBeenCalled();
  });

  test.each([null, { ...conversation, messages: [] }])('renders no transcript for an absent or empty conversation', value => {
    mockState({ conversation: value }); render(<LogAnalysisTranscript />); expect(container.childElementCount).toBe(0);
  });

  test('renders every turn in the maximum bounded conversation', () => {
    mockState({ conversation: { ...conversation, messages: Array.from({ length: MAX_CONVERSATION_MESSAGES }, (_, index) => ({ ...message, id: `message-${index}`, question: `Question ${index}` })) } });
    render(<LogAnalysisTranscript />);
    expect(container.querySelectorAll('article[aria-label="You"]')).toHaveLength(MAX_CONVERSATION_MESSAGES);
    expect(container.querySelectorAll('article[aria-label="Assistant"]')).toHaveLength(MAX_CONVERSATION_MESSAGES);
    expect(container.textContent).toContain(`Question ${MAX_CONVERSATION_MESSAGES - 1}`);
  });
});

describe('snapshot disclosure', () => {
  test('collapses source, scope, notes and raw preview behind one compact summary', () => {
    render(<LogAnalysisSnapshotPreview />);
    const details = container.querySelector('details');
    expect(details?.open).toBe(false);
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(details?.querySelector('summary')?.textContent).toContain('Log snapshot');
    expect(details?.querySelector('summary')?.textContent).toContain('1 lines');
    expect(details?.querySelector('pre')?.textContent).toBe('1. [stderr] Sample EADDRINUSE');
    expect(Array.from(details?.querySelectorAll('p') || []).filter(node => node.textContent === 'Partial history')).toHaveLength(1);
  });

  test('keeps loading and snapshot error visible when no snapshot is available', () => {
    mockState({ snapshotInfo: null, loadingSnapshot: true, snapshotError: 'Snapshot unavailable' });
    render(<LogAnalysisSnapshotPreview />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Snapshot unavailable');
    expect(container.querySelector('[role="alert"] button')?.textContent).toBe('Retry');
    expect(container.querySelector('details')).toBeNull();
  });

  test('handles an empty snapshot without an empty raw preview', () => {
    mockState({ snapshotInfo: { ...snapshot, snapshot: { ...snapshot.snapshot, logs: [] } } });
    render(<LogAnalysisSnapshotPreview />);
    expect(container.querySelector('details')?.textContent).toContain('No recent log lines');
    expect(container.querySelector('pre')).toBeNull();
  });

  test('preserves every line in a maximum snapshot inside the disclosure', () => {
    mockState({ snapshotInfo: { ...snapshot, snapshot: { ...snapshot.snapshot, logs: Array.from({ length: MAX_SNAPSHOT_LINES }, (_, index) => ({ stream: 'stdout', message: `Log ${index}` })) } } });
    render(<LogAnalysisSnapshotPreview />);
    expect(container.querySelector('pre')?.textContent?.split('\n')).toHaveLength(MAX_SNAPSHOT_LINES);
    expect(container.querySelector('pre')?.textContent).toContain(`${MAX_SNAPSHOT_LINES}. [stdout] Log ${MAX_SNAPSHOT_LINES - 1}`);
  });
});

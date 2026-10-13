import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import LogAnalysisDialog from './LogAnalysisDialog';
import { LogAnalysisProvider, useLogAnalysis } from './LogAnalysisContext';
import { LogAnalysisContent } from './LogAnalysisSidebar';
import { installAuthInterceptors, setToken, clearToken } from '../auth';

global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, 'crypto', { value: require('crypto').webcrypto, configurable: true });

jest.mock('react-i18next', () => {
  const messages = require('../locales/en/translation.json');
  const t = (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  };
  let currentT = t;
  return { useTranslation: () => ({ t: currentT }),
    __changeTranslation: () => { currentT = (key, values) => key === 'logAnalysis.description' ? 'Translated analysis description' : t(key, values); },
    __resetTranslation: () => { currentT = t; } };
});

const cloud = { id: 'codex', name: 'Codex', available: true, kind: 'cloud' };
const ollama = {
  id: 'ollama', name: 'Ollama', available: true, kind: 'local',
  models: [{ name: 'unverified', local: false, kind: 'unavailable', available: false },
    { name: 'fixture-cloud', local: false, kind: 'cloud', available: true },
    { name: 'fixture-local', local: true, kind: 'local', available: true }],
};
const fixture = {
  snapshot: { processId: 17, processName: 'Fixture application', source: 'remote', status: 'errored',
    notes: ['Synthetic partial history warning', 'Synthetic unique snapshot note'],
    logs: [{ stream: 'stdout', message: 'Synthetic test fixture started' }, { stream: 'stderr', message: 'Synthetic EADDRINUSE fixture' }] },
  redactionCount: 2, truncated: true, warnings: ['Synthetic partial history warning'],
};
const analysisFixture = {
  provider: 'codex', analysis: 'Suspected issue at line 2. <img src=x onerror=alert(1)>',
  lineCount: 2, redactionCount: 1, truncated: false,
};
const defaultQuestion = 'Analyze these application logs and identify suspected issues with supporting log evidence.';
const timestamp = '2026-10-13T10:00:00.000Z';
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
let root;
let container;
let requests;
let getProviders;
let refreshProviders;
let getSnapshot;
let sendMessage;
let getDetail;
let getHistory;
let cancelMessage;
let saved;
let latestContext;

const Trigger = () => {
  const context = useLogAnalysis();
  latestContext = context;
  return <LogAnalysisContent><button onClick={() => context.openAnalysis({ processId: 17, processName: 'Fixture application', connectionId: 'fixture-remote' })}>Open analysis</button><button onClick={() => context.openAnalysis({ processId: 18, processName: 'Other application', connectionId: 'other-remote' })}>Other process</button></LogAnalysisContent>;
};

beforeEach(() => {
  require('react-i18next').__resetTranslation();
  localStorage.clear();
  requests = [];
  getProviders = async () => ({ providers: [cloud] });
  refreshProviders = async config => getProviders(config);
  getSnapshot = async () => fixture;
  saved = { id: 'conversation-1', processId: 17, processName: 'Fixture application', source: 'remote', connectionId: 'fixture-remote',
    createdAt: timestamp, updatedAt: timestamp, ...fixture, messages: [] };
  sendMessage = async config => {
    const input = JSON.parse(config.data);
    saved = { ...saved, messages: [...saved.messages, { id: `message-${saved.messages.length + 1}`, conversationId: saved.id,
      question: input.question, clientRequestId: input.clientRequestId, provider: input.provider, model: input.model, snapshot: fixture.snapshot, status: 'completed', result: analysisFixture,
      createdAt: timestamp, updatedAt: timestamp }] };
    return { conversation: saved };
  };
  getDetail = async () => ({ conversation: saved });
  getHistory = async () => ({ conversations: [] });
  cancelMessage = async () => {
    saved = { ...saved, messages: saved.messages.map(message => ({ ...message, status: message.status === 'running' ? 'cancelled' : message.status })) };
    return { conversation: saved };
  };
  axios.defaults.adapter = async config => {
    requests.push(config);
    let data;
    if (config.url.endsWith('/providers/refresh')) data = await refreshProviders(config);
    else if (config.url.endsWith('/providers')) data = await getProviders(config);
    else if (config.url.endsWith('/snapshot')) data = await getSnapshot(config);
    else if (config.url.endsWith('/cancel')) data = await cancelMessage(config);
    else if (config.url.endsWith('/messages')) data = await sendMessage(config);
    else if (config.url.endsWith('/conversations')) {
      if (config.method === 'post') { saved = { ...saved, ...JSON.parse(config.data), messages: [] }; data = { conversation: saved }; }
      else data = await getHistory(config);
    } else if (config.url.includes('/conversations/')) data = await getDetail(config);
    else throw new Error(`Unexpected fixture request: ${config.url}`);
    return { data, config, status: 200, statusText: 'OK', headers: {} };
  };
  installAuthInterceptors();
  setToken('synthetic-test-session');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); await flush(); });
  container.remove();
  clearToken();
  jest.useRealTimers();
});

const sidebar = () => document.body.querySelector('aside[aria-labelledby="log-analysis-title"]');
const button = text => [...document.body.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const messageRequests = () => requests.filter(request => request.url.endsWith('/messages'));
const providerRequests = () => requests.filter(request => request.url.includes('/providers'));
async function renderProvider({ enabled = true, compatibility = false } = {}) {
  await act(async () => {
    root.render(<LogAnalysisProvider enabled={enabled}><Trigger />{compatibility && <LogAnalysisDialog open processId={17} processName="Fixture application" connectionId="fixture-remote" onClose={() => {}} />}</LogAnalysisProvider>);
    await flush();
  });
}
async function open() { await renderProvider(); await click(button('Open analysis')); }
async function click(element) { await act(async () => { element.click(); await flush(); }); }
async function change(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flush();
  });
}
async function runCloud(question = '') {
  if (question) await change(sidebar().querySelector('textarea'), question);
  await click(sidebar().querySelector('input[type="checkbox"]'));
  await click(button('Analyze logs') || button('Send question'));
}

test('reviews authenticated snapshot, saves a cloud request after consent, and keeps raw HTML inert', async () => {
  await open();
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(sidebar().querySelector('h2').textContent).toBe('Analyze application logs');
  expect(button('Analyze logs').disabled).toBe(true);
  expect(sidebar().textContent).toContain('independent of viewer filters');
  expect(sidebar().textContent.match(/Synthetic partial history warning/g)).toHaveLength(1);
  expect(sidebar().textContent).toContain('Synthetic unique snapshot note');
  const snapshotPreview = sidebar().querySelector('pre[aria-label="Review the redacted snapshot"]');
  expect(snapshotPreview.closest('details').open).toBe(false);
  expect(snapshotPreview.textContent).toContain('2. [stderr] Synthetic EADDRINUSE fixture');
  const snapshotRequest = requests.find(request => request.url.endsWith('/snapshot'));
  expect(JSON.parse(snapshotRequest.data)).toEqual({ processId: 17, connectionId: 'fixture-remote' });
  expect(snapshotRequest.headers.get('Authorization')).toBe('Bearer synthetic-test-session');
  await runCloud();
  expect(messageRequests()).toHaveLength(1);
  expect(JSON.parse(messageRequests()[0].data)).toEqual({ provider: 'codex', question: defaultQuestion, allowCloud: true, clientRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  const creation = requests.find(request => request.url.endsWith('/conversations') && request.method === 'post');
  expect(JSON.parse(creation.data)).toEqual({ ...fixture, connectionId: 'fixture-remote' });
  expect(messageRequests()[0].headers.get('Authorization')).toBe('Bearer synthetic-test-session');
  expect(sidebar().querySelector('img')).toBeNull();
  expect(sidebar().textContent).toContain('<img src=x onerror=alert(1)>');
  expect(sidebar().textContent).toContain('AI findings are advisory');
  expect(sidebar().textContent).toContain('2 lines analyzed · redacted values: 3');
  expect(JSON.parse(localStorage.getItem('ezpm2gui.logAnalysis.active'))).toEqual({ id: saved.id, visible: true });
  expect(localStorage.getItem('ezpm2gui.logAnalysis.active')).not.toContain('Synthetic');
});

test('keeps settings and snapshot details collapsed while separating the request and response as chats', async () => {
  await open();
  const settings = sidebar().querySelector('details[aria-label="AI settings"]');
  expect(settings.open).toBe(false);
  expect(settings.querySelector('summary').textContent).toContain('Codex');
  expect(sidebar().querySelector('input[type="checkbox"]').closest('details')).toBeNull();
  await click(settings.querySelector('summary'));
  expect(settings.open).toBe(true);
  await click(settings.querySelector('summary'));
  expect(settings.open).toBe(false);
  await runCloud('Investigate the failures');
  const request = sidebar().querySelector('article[aria-label="You"]');
  const response = sidebar().querySelector('article[aria-label="Assistant"]');
  expect(request.textContent).toContain('Investigate the failures');
  expect(request.textContent).not.toContain('Suspected issue');
  expect(response.textContent).toContain('Suspected issue at line 2.');
  expect(response.textContent).not.toContain('Investigate the failures');
  expect(response.querySelector('details').open).toBe(false);
  expect(response.querySelector('details').textContent).toContain('redacted values: 3');
});

test('prefers local Ollama, includes verified cloud models, blocks unverified models, and resets consent on model and provider changes', async () => {
  getProviders = async () => ({ providers: [cloud, ollama] });
  await open();
  const providerSelect = sidebar().querySelector('select[aria-label="Provider"]');
  const modelSelect = sidebar().querySelector('select[aria-label="Model"]');
  expect(providerSelect.value).toBe('ollama');
  expect(modelSelect.value).toBe('fixture-local');
  expect([...modelSelect.options].map(option => option.value)).toEqual(['fixture-cloud', 'fixture-local']);
  expect(button('Analyze logs').disabled).toBe(false);
  await click(button('Analyze logs'));
  expect(JSON.parse(messageRequests()[0].data)).toEqual({ provider: 'ollama', model: 'fixture-local', question: defaultQuestion, allowCloud: false, clientRequestId: expect.any(String) });
  await click(button('New analysis'));
  await change(modelSelect, 'fixture-cloud');
  expect(button('Analyze logs').disabled).toBe(true);
  await runCloud();
  expect(JSON.parse(messageRequests()[1].data)).toEqual({ provider: 'ollama', model: 'fixture-cloud', question: defaultQuestion, allowCloud: true, clientRequestId: expect.any(String) });
  await click(button('New analysis'));
  await click(sidebar().querySelector('input[type="checkbox"]'));
  await change(modelSelect, 'fixture-local');
  await change(modelSelect, 'fixture-cloud');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(false);
  await change(providerSelect, 'codex');
  await click(sidebar().querySelector('input[type="checkbox"]'));
  await change(providerSelect, 'ollama');
  await change(providerSelect, 'codex');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(false);
});

test.each(['claude', 'codex', 'cursor', 'copilot'])('forwards optional %s model and resets cloud consent when its override changes', async id => {
  getProviders = async () => ({ providers: [{ ...cloud, id, name: id }] });
  await open();
  await click(sidebar().querySelector('input[type="checkbox"]'));
  await change(sidebar().querySelector('input[aria-label="Cloud model (optional)"]'), 'fixture-supported-model');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(false);
  await runCloud('Investigate line 2');
  expect(JSON.parse(messageRequests()[0].data)).toEqual({ provider: id, model: 'fixture-supported-model', question: 'Investigate line 2', allowCloud: true, clientRequestId: expect.any(String) });
});

test('Ollama without usable models falls back to cloud and unavailable providers show recovery guidance', async () => {
  getProviders = async () => ({ providers: [{ ...ollama, models: [] }, cloud] });
  await open();
  expect(sidebar().querySelector('select').value).toBe('codex');
  getProviders = async () => ({ providers: [{ ...cloud, available: false, reason: 'Synthetic missing executable' }] });
  await click(button('Refresh providers'));
  expect(button('Analyze logs').disabled).toBe(true);
  expect(sidebar().textContent).toContain('Synthetic missing executable');
  expect(sidebar().textContent).toContain('Installation and sign-in guidance');
  expect(sidebar().textContent).toContain('claude auth login');
  expect(sidebar().textContent).toContain('codex login');
  expect(sidebar().textContent).toContain('agent login or cursor-agent login');
  expect(sidebar().textContent).toContain('copilot login');
  expect(sidebar().textContent).toContain('Existing CLI authentication is reused');
  expect(sidebar().textContent).toContain('CURSOR_API_KEY is optional');
  expect(sidebar().textContent).toContain('ollama signin');
});

test('snapshot and message errors expose recovery, preserve saved request scope, and block empty snapshots', async () => {
  getSnapshot = async () => { throw { response: { data: { error: 'Synthetic remote disconnected' } } }; };
  await open();
  expect(sidebar().querySelector('[role="alert"]').textContent).toContain('Synthetic remote disconnected');
  expect(button('Analyze logs').disabled).toBe(true);
  getSnapshot = async () => fixture;
  await click(button('Retry'));
  sendMessage = async () => { throw { response: { data: { error: 'Synthetic provider sign-in needed' } } }; };
  await runCloud();
  expect(sidebar().querySelector('[role="alert"]').textContent).toContain('Synthetic provider sign-in needed');
  expect(button('Analyze logs').disabled).toBe(false);
  expect(latestContext.conversation.id).toBe('conversation-1');
  getSnapshot = async () => ({ ...fixture, snapshot: { ...fixture.snapshot, logs: [] } });
  await click(button('New analysis'));
  await click(sidebar().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(true);
  expect(sidebar().textContent).toContain('No recent log lines are available');
});

test('closing preserves draft, provider and snapshot, including pending discovery, without cancelling requests', async () => {
  await open();
  await change(sidebar().querySelector('textarea'), 'Remember this question');
  await change(sidebar().querySelector('input[aria-label="Cloud model (optional)"]'), 'fixture-model');
  const snapshotRequest = requests.find(request => request.url.endsWith('/snapshot'));
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  expect(sidebar()).toBeNull();
  expect(snapshotRequest.signal.aborted).toBe(false);
  await click(button('Open analysis'));
  expect(sidebar().querySelector('textarea').value).toBe('Remember this question');
  expect(sidebar().querySelector('input[aria-label="Cloud model (optional)"]').value).toBe('fixture-model');
  expect(requests.filter(request => request.url.endsWith('/snapshot'))).toHaveLength(1);
});

test('reads the backend catalog once across hides, process changes, new analyses and saved conversations', async () => {
  getHistory = async () => ({ conversations: [saved] });
  await open();
  expect(providerRequests()).toHaveLength(1);
  expect(providerRequests()[0].method).toBe('get');
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  await click(button('Open analysis'));
  await click(sidebar().querySelector('li button'));
  await click(button('New analysis'));
  await click(button('Other process'));
  await click(button('Open analysis'));
  expect(providerRequests()).toHaveLength(1);
  expect(localStorage.getItem('ezpm2gui.logAnalysis.providers')).toBeNull();
});

test.each([{ catalog: [] }, { catalog: [{ ...cloud, available: false, reason: 'Synthetic missing CLI' }] }])('retains a successfully loaded empty or unavailable catalog until manual refresh', async ({ catalog }) => {
  getProviders = async () => ({ providers: catalog });
  await open();
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  await click(button('Other process'));
  await click(button('Open analysis'));
  await click(button('New analysis'));
  expect(providerRequests()).toHaveLength(1);
  expect(latestContext.providers).toEqual(catalog);
  expect(latestContext.loadingProviders).toBe(false);
  refreshProviders = async () => ({ providers: [ollama] });
  await click(button('Refresh providers'));
  expect(providerRequests()).toHaveLength(2);
  expect(providerRequests()[1].method).toBe('post');
  expect(JSON.parse(providerRequests()[1].data)).toEqual({});
  expect(providerRequests()[1].headers.get('Authorization')).toBe('Bearer synthetic-test-session');
  expect(latestContext.selection).toEqual({ providerId: 'ollama', model: 'fixture-local' });
});

test('coalesces pending catalog reads across scope changes and restores without restarting discovery', async () => {
  let resolveProviders;
  getProviders = () => new Promise(resolve => { resolveProviders = resolve; });
  localStorage.setItem('ezpm2gui.logAnalysis.active', JSON.stringify({ id: saved.id, visible: false }));
  await renderProvider();
  await click(button('Other process'));
  await click(button('Open analysis'));
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  await click(button('Open analysis'));
  expect(providerRequests()).toHaveLength(1);
  expect(providerRequests()[0].signal.aborted).toBe(false);
  expect(latestContext.loadingProviders).toBe(true);
  await act(async () => { resolveProviders({ providers: [cloud] }); await flush(); });
  expect(latestContext.providers).toEqual([cloud]);
  expect(latestContext.loadingProviders).toBe(false);
  await click(button('Other process'));
  expect(providerRequests()).toHaveLength(1);
});

test('manual refresh supersedes a pending cached read and repeated opens cannot replace its result', async () => {
  let resolveProviders;
  let resolveRefresh;
  getProviders = () => new Promise(resolve => { resolveProviders = resolve; });
  refreshProviders = () => new Promise(resolve => { resolveRefresh = resolve; });
  await open();
  await act(async () => { void latestContext.refreshProviders(); await flush(); });
  const cached = providerRequests()[0];
  expect(cached.signal.aborted).toBe(true);
  await click(button('Other process'));
  await click(button('Open analysis'));
  await act(async () => { void latestContext.refreshProviders(); await flush(); });
  expect(providerRequests()).toHaveLength(2);
  expect(providerRequests()[1].method).toBe('post');
  await act(async () => { resolveRefresh({ providers: [ollama] }); await flush(); });
  await act(async () => { resolveProviders({ providers: [cloud] }); await flush(); });
  expect(latestContext.providers).toEqual([ollama]);
  expect(latestContext.selection).toEqual({ providerId: 'ollama', model: 'fixture-local' });
  expect(latestContext.loadingProviders).toBe(false);
  await click(button('Other process'));
  expect(providerRequests()).toHaveLength(2);
});

test('manual refresh preserves a selected available model and a failed refresh retains the cached catalog', async () => {
  getProviders = async () => ({ providers: [ollama, cloud] });
  await open();
  await change(sidebar().querySelector('select[aria-label="Model"]'), 'fixture-cloud');
  refreshProviders = async () => ({ providers: [cloud, { ...ollama, models: [...ollama.models].reverse() }] });
  await click(button('Refresh providers'));
  expect(latestContext.selection).toEqual({ providerId: 'ollama', model: 'fixture-cloud' });
  const refreshedCatalog = latestContext.providers;
  refreshProviders = async () => { throw { response: { data: { error: 'Synthetic rescan failed' } } }; };
  await click(button('Refresh providers'));
  expect(latestContext.providerError).toBe('Synthetic rescan failed');
  expect(latestContext.providers).toEqual(refreshedCatalog);
  expect(latestContext.loadingProviders).toBe(false);
  await click(button('Other process'));
  expect(providerRequests()).toHaveLength(3);
});

test('refreshing to another cloud provider requires renewed consent while unchanged or failed refresh preserves it', async () => {
  await open();
  await click(sidebar().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(false);
  await click(button('Refresh providers'));
  expect(latestContext.selection.providerId).toBe('codex');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(true);
  expect(button('Analyze logs').disabled).toBe(false);
  refreshProviders = async () => ({ providers: [{ ...cloud, id: 'claude', name: 'Claude Code' }] });
  await click(button('Refresh providers'));
  expect(latestContext.selection.providerId).toBe('claude');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(false);
  expect(button('Analyze logs').disabled).toBe(true);
  await click(sidebar().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(false);
  refreshProviders = async () => { throw { response: { data: { error: 'Synthetic rescan failed' } } }; };
  await click(button('Refresh providers'));
  expect(latestContext.providerError).toBe('Synthetic rescan failed');
  expect(latestContext.selection.providerId).toBe('claude');
  expect(sidebar().querySelector('input[type="checkbox"]').checked).toBe(true);
});

test('logout discards the client catalog and late completions cannot overwrite the next authenticated catalog', async () => {
  let resolveProviders;
  getProviders = () => new Promise(resolve => { resolveProviders = resolve; });
  await open();
  const previous = providerRequests()[0];
  await renderProvider({ enabled: false });
  expect(previous.signal.aborted).toBe(true);
  expect(latestContext.providers).toEqual([]);
  getProviders = async () => ({ providers: [ollama] });
  await renderProvider();
  await click(button('Open analysis'));
  expect(providerRequests()).toHaveLength(2);
  await act(async () => { resolveProviders({ providers: [cloud] }); await flush(); });
  expect(latestContext.providers).toEqual([ollama]);
  expect(latestContext.selection).toEqual({ providerId: 'ollama', model: 'fixture-local' });
  expect(latestContext.loadingProviders).toBe(false);
});

test('logging in after logout reads the backend catalog again without rescanning', async () => {
  await open();
  expect(latestContext.providers).toEqual([cloud]);
  await renderProvider({ enabled: false });
  expect(latestContext.providers).toEqual([]);
  getProviders = async () => ({ providers: [ollama] });
  await renderProvider();
  await click(button('Open analysis'));
  expect(providerRequests()).toHaveLength(2);
  expect(providerRequests().every(request => request.method === 'get')).toBe(true);
  expect(latestContext.providers).toEqual([ollama]);
});

test('StrictMode restoration replaces an aborted catalog read and finishes loading', async () => {
  let resolveProviders;
  getProviders = () => new Promise(resolve => { resolveProviders = resolve; });
  localStorage.setItem('ezpm2gui.logAnalysis.active', JSON.stringify({ id: saved.id, visible: true }));
  await act(async () => {
    root.render(<React.StrictMode><LogAnalysisProvider><Trigger /></LogAnalysisProvider></React.StrictMode>);
    await flush();
  });
  expect(latestContext.loadingProviders).toBe(true);
  expect(providerRequests().filter(request => !request.signal.aborted)).toHaveLength(1);
  await act(async () => { resolveProviders({ providers: [cloud] }); await flush(); });
  expect(latestContext.providers).toEqual([cloud]);
  expect(latestContext.loadingProviders).toBe(false);
});

test('pending analysis completes while hidden and explicit cancellation uses the saved job endpoint', async () => {
  jest.useFakeTimers();
  sendMessage = async config => {
    const input = JSON.parse(config.data);
    saved = { ...saved, messages: [{ ...input, id: 'message-1', conversationId: saved.id, snapshot: fixture.snapshot, status: 'running', createdAt: timestamp, updatedAt: timestamp }] };
    return { conversation: saved };
  };
  await open();
  await runCloud();
  expect(button('Cancel analysis')).toBeDefined();
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  saved = { ...saved, messages: saved.messages.map(message => ({ ...message, status: 'completed', result: analysisFixture })) };
  await act(async () => { jest.advanceTimersByTime(1600); await flush(); });
  await click(button('Open analysis'));
  expect(sidebar().textContent).toContain('Suspected issue at line 2');
  await click(button('New analysis'));
  await runCloud();
  await click(button('Cancel analysis'));
  expect(sidebar().textContent).toContain('Analysis cancelled.');
  expect(requests.find(request => request.url.endsWith('/messages/message-1/cancel'))).toBeDefined();
});

test('restores durable conversation on reload and saves follow-up in the same chat without refetching logs', async () => {
  await open();
  await runCloud();
  const id = saved.id;
  await act(async () => { root.unmount(); await flush(); });
  root = createRoot(container);
  requests = [];
  await renderProvider();
  expect(sidebar().textContent).toContain('Suspected issue at line 2');
  expect(sidebar().textContent).toContain('2 lines · redacted values: 2');
  expect(sidebar().querySelector('textarea').getAttribute('aria-label')).toBe('Follow-up question');
  expect(button('Send question').disabled).toBe(true);
  expect(requests.some(request => request.url.endsWith('/snapshot'))).toBe(false);
  await runCloud('How do I verify the fix?');
  expect(messageRequests()[0].url).toBe(`/api/log-analysis/conversations/${id}/messages`);
  expect(saved.messages).toHaveLength(2);
  expect(sidebar().querySelectorAll('article')).toHaveLength(4);
});

test('saved response suggestions restore on reload and populate the composer without sending until reviewed', async () => {
  await open();
  await runCloud('Investigate startup failures');
  expect(sidebar().querySelectorAll('article[aria-label="Assistant"] section button')).toHaveLength(3);
  await act(async () => { root.unmount(); await flush(); });
  root = createRoot(container);
  requests = [];
  await renderProvider();
  const suggestions = sidebar().querySelectorAll('article[aria-label="Assistant"] section button');
  expect(suggestions).toHaveLength(3);
  expect(messageRequests()).toHaveLength(0);
  const requestCount = requests.length;
  await click(suggestions[0]);
  const question = `Regarding your response to “Investigate startup failures”: ${suggestions[0].textContent}`;
  expect(sidebar().querySelector('textarea').value).toBe(question);
  expect(document.activeElement).toBe(sidebar().querySelector('textarea'));
  expect(requests).toHaveLength(requestCount);
  expect(messageRequests()).toHaveLength(0);
  await click(sidebar().querySelector('input[type="checkbox"]'));
  await click(button('Send question'));
  expect(messageRequests()).toHaveLength(1);
  expect(JSON.parse(messageRequests()[0].data).question).toBe(question);
  expect(sidebar().querySelectorAll('article[aria-label="Assistant"] section button')).toHaveLength(6);
});

test('a pending follow-up disables previous response suggestions and keeps the draft intact', async () => {
  await open();
  await runCloud('Investigate startup failures');
  let resolveMessage;
  const completeMessage = sendMessage;
  sendMessage = config => new Promise(resolve => { resolveMessage = async () => resolve(await completeMessage(config)); });
  await change(sidebar().querySelector('textarea'), 'My pending question');
  await click(button('Send question'));
  const suggestions = sidebar().querySelectorAll('article[aria-label="Assistant"] section button');
  expect(suggestions).toHaveLength(3);
  expect([...suggestions].every(suggestion => suggestion.disabled)).toBe(true);
  await click(suggestions[0]);
  expect(sidebar().querySelector('textarea').value).toBe('My pending question');
  expect(messageRequests()).toHaveLength(2);
  await act(async () => { await resolveMessage(); await flush(); });
  expect(sidebar().querySelectorAll('article[aria-label="Assistant"] section button')).toHaveLength(6);
});

test('reopening a completed response from history shows its follow-up questions', async () => {
  saved = { ...saved, messages: [{ id: 'message-1', conversationId: saved.id, question: 'Saved investigation', provider: 'codex',
    snapshot: fixture.snapshot, status: 'completed', result: analysisFixture, createdAt: timestamp, updatedAt: timestamp }] };
  getHistory = async () => ({ conversations: [saved] });
  await open();
  expect(sidebar().querySelectorAll('article section button')).toHaveLength(0);
  await click(sidebar().querySelector('li button'));
  expect(sidebar().querySelectorAll('article[aria-label="Assistant"] section button')).toHaveLength(3);
  await click(sidebar().querySelector('article[aria-label="Assistant"] section button'));
  expect(sidebar().querySelector('textarea').value).toContain('Regarding your response to “Saved investigation”');
  expect(messageRequests()).toHaveLength(0);
});

test('restored running and interrupted requests retain status and scoped history can reopen saved conversations', async () => {
  saved = { ...saved, messages: [{ id: 'message-1', conversationId: saved.id, question: 'Question', provider: 'codex', snapshot: fixture.snapshot,
    status: 'interrupted', error: 'Synthetic backend stopped', createdAt: timestamp, updatedAt: timestamp }] };
  getHistory = async () => ({ conversations: [saved] });
  await open();
  expect(requests.find(request => request.url.endsWith('/conversations')).params).toEqual({ processId: 17, connectionId: 'fixture-remote', limit: 20 });
  await click([...sidebar().querySelectorAll('li button')][0]);
  expect(sidebar().textContent).toContain('Analysis interrupted when the server stopped');
  expect(sidebar().textContent).toContain('Synthetic backend stopped');
  expect(sidebar().querySelectorAll('article')).toHaveLength(2);
});

test('changing process ignores a late snapshot response from the previous scope', async () => {
  let resolveSnapshot;
  getSnapshot = config => JSON.parse(config.data).processId === 17 ? new Promise(resolve => { resolveSnapshot = resolve; }) : Promise.resolve({ ...fixture, snapshot: { ...fixture.snapshot, processId: 18, processName: 'Other application', logs: [{ stream: 'stdout', message: 'Other process logs' }] } });
  await open();
  await click(button('Other process'));
  await act(async () => { resolveSnapshot(fixture); await flush(); });
  expect(sidebar().textContent).toContain('Other process logs');
  expect(sidebar().textContent).not.toContain('Synthetic test fixture started');
});

test('authentication lock hides and clears session and aborts read requests', async () => {
  getProviders = () => new Promise(() => {});
  getSnapshot = () => new Promise(() => {});
  await open();
  await renderProvider({ enabled: false });
  expect(sidebar()).toBeNull();
  expect(latestContext.target).toBeNull();
  expect(latestContext.providers).toEqual([]);
  expect(latestContext.question).toBe('');
  expect(requests.filter(request => request.url.endsWith('/providers') || request.url.endsWith('/snapshot')).every(request => request.signal.aborted)).toBe(true);
  await click(button('Open analysis'));
  expect(sidebar()).toBeNull();
});

test('compatibility opener uses the global sidebar and malformed snapshot/history responses expose boundary errors', async () => {
  getSnapshot = async () => ({ snapshot: null });
  getHistory = async () => ({ conversations: null });
  await renderProvider({ compatibility: true });
  expect(sidebar()).not.toBeNull();
  expect(sidebar().textContent).toContain('Invalid analysis snapshot response');
  expect(sidebar().textContent).toContain('Invalid analysis history response');
  expect(button('Analyze logs').disabled).toBe(true);
});

test('reopening the same running conversation restarts polling for its new scope', async () => {
  jest.useFakeTimers();
  getHistory = async () => ({ conversations: [saved] });
  sendMessage = async config => {
    saved = { ...saved, messages: [{ ...JSON.parse(config.data), id: 'message-1', conversationId: saved.id, snapshot: fixture.snapshot, status: 'running', createdAt: timestamp, updatedAt: timestamp }] };
    return { conversation: saved };
  };
  await open();
  await runCloud();
  await click(sidebar().querySelector('li button'));
  saved = { ...saved, messages: saved.messages.map(message => ({ ...message, status: 'completed', result: analysisFixture })) };
  await act(async () => { jest.advanceTimersByTime(1600); await flush(); });
  expect(sidebar().textContent).toContain('Suspected issue at line 2');
});

test('reopening saved history cancels a pending initial snapshot and clears its loading state', async () => {
  let resolveSnapshot;
  getSnapshot = () => new Promise(resolve => { resolveSnapshot = resolve; });
  getHistory = async () => ({ conversations: [saved] });
  await open();
  const snapshotRequest = requests.find(request => request.url.endsWith('/snapshot'));
  await click(sidebar().querySelector('li button'));
  expect(snapshotRequest.signal.aborted).toBe(true);
  expect(sidebar().textContent).not.toContain('Loading and redacting recent logs');
  await click(sidebar().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(false);
  await act(async () => { resolveSnapshot({ ...fixture, snapshot: { ...fixture.snapshot, logs: [] } }); await flush(); });
  expect(sidebar().querySelector('pre').textContent).toContain('Synthetic EADDRINUSE fixture');
  expect(button('Analyze logs').disabled).toBe(false);
});

test('a lost accepted response reconciles the persisted message instead of creating a duplicate request', async () => {
  const storeMessage = sendMessage;
  sendMessage = async config => {
    await storeMessage(config);
    throw { response: { data: { error: 'Synthetic lost response' } } };
  };
  await open();
  await runCloud('Which line is the cause?');
  expect(saved.messages).toHaveLength(1);
  expect(sidebar().textContent).toContain('Suspected issue at line 2');
  expect(sidebar().textContent).not.toContain('Synthetic lost response');
  expect(sidebar().querySelector('textarea').value).toBe('');
  expect(messageRequests()).toHaveLength(1);
});

test('an uncertain failed send retains its UUID for an identical retry and a changed question gets a new UUID', async () => {
  const storeMessage = sendMessage;
  sendMessage = async () => { throw { response: { data: { error: 'Synthetic connection lost' } } }; };
  getDetail = async () => { throw { response: { data: { error: 'Synthetic history offline' } } }; };
  await open();
  await runCloud('Original question');
  const firstId = JSON.parse(messageRequests()[0].data).clientRequestId;
  expect(sidebar().textContent).toContain('Synthetic connection lost');
  expect(sidebar().textContent).toContain('Synthetic history offline');
  sendMessage = storeMessage;
  getDetail = async () => ({ conversation: saved });
  await click(button('Analyze logs'));
  expect(JSON.parse(messageRequests()[1].data).clientRequestId).toBe(firstId);
  expect(saved.messages).toHaveLength(1);
  sendMessage = async () => { throw { response: { data: { error: 'Synthetic connection lost' } } }; };
  await change(sidebar().querySelector('textarea'), 'A different question');
  await click(button('Send question'));
  const secondId = JSON.parse(messageRequests()[2].data).clientRequestId;
  expect(secondId).not.toBe(firstId);
  await change(sidebar().querySelector('textarea'), 'An edited question');
  sendMessage = storeMessage;
  await click(button('Send question'));
  expect(JSON.parse(messageRequests()[3].data).clientRequestId).not.toBe(secondId);
  expect(saved.messages).toHaveLength(2);
});

test('hiding while providers and snapshot are pending preserves both reads and completes the preview on reopen', async () => {
  let resolveProviders;
  let resolveSnapshot;
  getProviders = () => new Promise(resolve => { resolveProviders = resolve; });
  getSnapshot = () => new Promise(resolve => { resolveSnapshot = resolve; });
  await open();
  await click(sidebar().querySelector('button[aria-label="Close"]'));
  expect(requests.every(request => !request.signal.aborted)).toBe(true);
  await act(async () => { resolveProviders({ providers: [cloud] }); resolveSnapshot(fixture); await flush(); });
  await click(button('Open analysis'));
  expect(sidebar().querySelector('pre').textContent).toContain('Synthetic EADDRINUSE fixture');
  expect(requests.filter(request => request.url.endsWith('/snapshot'))).toHaveLength(1);
});

test('restores a hidden running request after reload and polls its saved response', async () => {
  jest.useFakeTimers();
  saved = { ...saved, messages: [{ id: 'message-1', conversationId: saved.id, question: 'Saved question', provider: 'codex', snapshot: fixture.snapshot,
    status: 'running', createdAt: timestamp, updatedAt: timestamp }] };
  localStorage.setItem('ezpm2gui.logAnalysis.active', JSON.stringify({ id: saved.id, visible: false }));
  await renderProvider();
  expect(sidebar()).toBeNull();
  expect(latestContext.running).toBe(true);
  saved = { ...saved, messages: saved.messages.map(message => ({ ...message, status: 'completed', result: analysisFixture })) };
  await act(async () => { jest.advanceTimersByTime(1600); await flush(); });
  await click(button('Open analysis'));
  expect(sidebar().textContent).toContain('Suspected issue at line 2');
  expect(requests.some(request => request.url.endsWith('/snapshot'))).toBe(false);
});

test('a late poll reply cannot restore a cancelled message', async () => {
  jest.useFakeTimers();
  let resolvePoll;
  sendMessage = async config => {
    saved = { ...saved, messages: [{ ...JSON.parse(config.data), id: 'message-1', conversationId: saved.id, snapshot: fixture.snapshot, status: 'running', createdAt: timestamp, updatedAt: timestamp }] };
    return { conversation: saved };
  };
  await open();
  await runCloud();
  const stale = saved;
  getDetail = () => new Promise(resolve => { resolvePoll = resolve; });
  await act(async () => { jest.advanceTimersByTime(1600); await flush(); });
  await click(button('Cancel analysis'));
  await act(async () => { resolvePoll({ conversation: stale }); await flush(); });
  expect(sidebar().textContent).toContain('Analysis cancelled.');
  expect(latestContext.running).toBe(false);
});

test('local process zero omits remote connection and provider detection failures recover on refresh', async () => {
  getProviders = async () => { throw { response: { data: { error: 'Synthetic provider discovery failed' } } }; };
  getSnapshot = async () => ({ ...fixture, snapshot: { ...fixture.snapshot, processId: 0, source: 'local' } });
  await renderProvider();
  await act(async () => { latestContext.openAnalysis({ processId: 0, processName: 'Local fixture' }); await flush(); });
  expect(sidebar().textContent).toContain('Synthetic provider discovery failed');
  expect(JSON.parse(requests.find(request => request.url.endsWith('/snapshot')).data)).toEqual({ processId: 0 });
  expect(requests.find(request => request.url.endsWith('/conversations')).params).toEqual({ processId: 0, limit: 20 });
  getProviders = async () => ({ providers: [ollama] });
  await click(button('Refresh providers'));
  expect(button('Analyze logs').disabled).toBe(false);
  await act(async () => { latestContext.openAnalysis({ processId: -1 }); latestContext.openAnalysis({ processId: NaN }); await flush(); });
  expect(latestContext.target.processId).toBe(0);
});

test('history pagination preserves scoped entries and malformed providers cannot be selected', async () => {
  getProviders = async () => ({ providers: [null] });
  getHistory = async config => config.params.cursor
    ? { conversations: [{ ...saved, id: 'conversation-2' }] }
    : { conversations: [saved], nextCursor: 'next-page' };
  await open();
  expect(sidebar().textContent).toContain('Invalid analysis provider response');
  expect(button('Analyze logs').disabled).toBe(true);
  await click(button('Load more'));
  expect(sidebar().querySelectorAll('li button')).toHaveLength(2);
  expect(requests.filter(request => request.url.endsWith('/conversations'))[1].params).toEqual({ processId: 17, connectionId: 'fixture-remote', limit: 20, cursor: 'next-page' });
});

test('changing language preserves a pending unsaved snapshot and the draft model and question', async () => {
  let resolveSnapshot;
  getSnapshot = () => new Promise(resolve => { resolveSnapshot = resolve; });
  await open();
  await change(sidebar().querySelector('textarea'), 'Retain this draft');
  await change(sidebar().querySelector('input[aria-label="Cloud model (optional)"]'), 'draft-cloud-model');
  const snapshotRequest = requests.find(request => request.url.endsWith('/snapshot'));
  require('react-i18next').__changeTranslation();
  await renderProvider();
  expect(sidebar().textContent).toContain('Translated analysis description');
  expect(snapshotRequest.signal.aborted).toBe(false);
  expect(sidebar().querySelector('textarea').value).toBe('Retain this draft');
  expect(sidebar().querySelector('input[aria-label="Cloud model (optional)"]').value).toBe('draft-cloud-model');
  expect(requests.filter(request => request.url.endsWith('/snapshot'))).toHaveLength(1);
  await act(async () => { resolveSnapshot(fixture); await flush(); });
  expect(sidebar().textContent).not.toContain('Loading and redacting recent logs');
  expect(sidebar().querySelector('pre').textContent).toContain('Synthetic EADDRINUSE fixture');
  await click(sidebar().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(false);
});

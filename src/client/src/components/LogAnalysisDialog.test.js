import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import LogAnalysisDialog from './LogAnalysisDialog';
import { installAuthInterceptors, setToken, clearToken } from '../auth';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-i18next', () => {
  const messages = require('../locales/en/translation.json');
  const t = (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  };
  return { useTranslation: () => ({ t }) };
});

const cloud = { id: 'codex', name: 'Codex', available: true, kind: 'cloud' };
const ollama = {
  id: 'ollama', name: 'Ollama', available: true, kind: 'local',
  models: [{ name: 'hosted-only', local: false }, { name: 'fixture-local', local: true }],
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
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
let root;
let container;
let requests;
let getProviders;
let getSnapshot;
let getAnalysis;

beforeEach(() => {
  requests = [];
  getProviders = async () => ({ providers: [cloud] });
  getSnapshot = async () => fixture;
  getAnalysis = async () => analysisFixture;
  axios.defaults.adapter = async config => {
    requests.push(config);
    let data;
    if (config.url.endsWith('/providers')) data = await getProviders(config);
    else if (config.url.endsWith('/snapshot')) data = await getSnapshot(config);
    else if (config.url.endsWith('/analyze')) data = await getAnalysis(config);
    else throw new Error('Unexpected fixture request');
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
});

const dialog = () => document.body.querySelector('[role="dialog"]');
const button = text => [...dialog().querySelectorAll('button')].find(element => element.textContent.trim() === text);
const analyzeRequests = () => requests.filter(request => request.url.endsWith('/analyze'));
async function renderDialog(props = {}) {
  await act(async () => {
    root.render(<LogAnalysisDialog open processId={17} processName="Fixture application" connectionId="fixture-remote" onClose={() => {}} {...props} />);
    await flush();
  });
}
async function click(element) { await act(async () => { element.click(); await flush(); }); }
async function select(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
  });
}

test('reviews raw snapshot and requires explicit cloud consent; authenticated output remains plain text', async () => {
  await renderDialog();
  expect(analyzeRequests()).toHaveLength(0);
  expect(button('Analyze logs').disabled).toBe(true);
  expect(dialog().textContent).toContain('independent of viewer filters');
  expect(dialog().querySelector('select[aria-label="Provider"]')).not.toBeNull();
  expect(dialog().textContent.match(/Synthetic partial history warning/g)).toHaveLength(1);
  expect(dialog().textContent).toContain('Synthetic unique snapshot note');
  expect(dialog().querySelector('details[open] pre').textContent).toContain('2. [stderr] Synthetic EADDRINUSE fixture');
  const snapshotRequest = requests.find(request => request.url.endsWith('/snapshot'));
  expect(JSON.parse(snapshotRequest.data)).toEqual({ processId: 17, connectionId: 'fixture-remote' });
  expect(snapshotRequest.headers.get('Authorization')).toBe('Bearer synthetic-test-session');
  await click(dialog().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(false);
  await click(button('Analyze logs'));
  expect(analyzeRequests()).toHaveLength(1);
  expect(JSON.parse(analyzeRequests()[0].data)).toEqual({ provider: 'codex', snapshot: fixture.snapshot, allowCloud: true });
  expect(analyzeRequests()[0].headers.get('Authorization')).toBe('Bearer synthetic-test-session');
  expect(dialog().querySelector('img')).toBeNull();
  expect(dialog().textContent).toContain('<img src=x onerror=alert(1)>');
  expect(dialog().textContent).toContain('2 lines analyzed · redacted values: 3');
  expect(dialog().textContent).toContain('AI findings are advisory');
});

test('prefers an installed local Ollama model, excludes hosted models, and resets consent when provider changes', async () => {
  getProviders = async () => ({ providers: [cloud, ollama] });
  await renderDialog({ connectionId: undefined });
  const [providerSelect, modelSelect] = dialog().querySelectorAll('select');
  expect(providerSelect.value).toBe('ollama');
  expect(modelSelect.value).toBe('fixture-local');
  expect(modelSelect.getAttribute('aria-label')).toBe('Local model');
  expect([...modelSelect.options].map(option => option.value)).toEqual(['fixture-local']);
  expect(dialog().querySelector('input[type="checkbox"]')).toBeNull();
  expect(button('Analyze logs').disabled).toBe(false);
  await click(button('Analyze logs'));
  expect(JSON.parse(analyzeRequests()[0].data)).toEqual({ provider: 'ollama', model: 'fixture-local', snapshot: fixture.snapshot, allowCloud: false });
  await select(providerSelect, 'codex');
  await click(dialog().querySelector('input[type="checkbox"]'));
  await select(providerSelect, 'ollama');
  await select(providerSelect, 'codex');
  expect(dialog().querySelector('input[type="checkbox"]').checked).toBe(false);
  expect(button('Analyze logs').disabled).toBe(true);
});

test('Ollama without local models falls back to available cloud and blocks analysis if no provider can run', async () => {
  getProviders = async () => ({ providers: [{ ...ollama, models: [] }, cloud] });
  await renderDialog();
  expect(dialog().querySelector('select').value).toBe('codex');
  getProviders = async () => ({ providers: [{ ...cloud, available: false, reason: 'Synthetic missing executable' }] });
  await click(button('Refresh providers'));
  expect(button('Analyze logs').disabled).toBe(true);
  expect(dialog().textContent).toContain('Synthetic missing executable');
  expect(dialog().textContent).toContain('Installation and sign-in guidance');
  expect(dialog().textContent).toContain('claude auth login');
  expect(dialog().textContent).toContain('codex login');
  expect(dialog().textContent).toContain('agent login or cursor-agent login');
  expect(dialog().textContent).toContain('copilot login');
  expect(dialog().textContent).toContain('Existing CLI authentication is reused');
  expect(dialog().textContent).toContain('CURSOR_API_KEY is optional');
  expect(dialog().textContent).toContain('Analysis runs through ollama run');
});

test('snapshot and analysis failures expose recovery, and empty snapshots cannot be analyzed', async () => {
  getSnapshot = async () => { throw { response: { data: { error: 'Synthetic remote disconnected' } } }; };
  await renderDialog();
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('Synthetic remote disconnected');
  expect(button('Analyze logs').disabled).toBe(true);
  getSnapshot = async () => fixture;
  await click(button('Retry'));
  await click(dialog().querySelector('input[type="checkbox"]'));
  getAnalysis = async () => { throw { response: { data: { error: 'Synthetic provider sign-in needed' } } }; };
  await click(button('Analyze logs'));
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('Synthetic provider sign-in needed');
  expect(button('Analyze logs').disabled).toBe(false);
  await renderDialog({ open: false });
  getSnapshot = async () => ({ ...fixture, snapshot: { ...fixture.snapshot, logs: [] } });
  await renderDialog();
  await click(dialog().querySelector('input[type="checkbox"]'));
  expect(button('Analyze logs').disabled).toBe(true);
  expect(dialog().textContent).toContain('No recent log lines are available');
});

test('cancel and close abort outstanding requests and ignore late results', async () => {
  let resolveAnalysis;
  getAnalysis = () => new Promise(resolve => { resolveAnalysis = resolve; });
  const onClose = jest.fn();
  await renderDialog({ onClose });
  await click(dialog().querySelector('input[type="checkbox"]'));
  await click(button('Analyze logs'));
  expect(button('Cancel analysis')).toBeDefined();
  await click(button('Cancel analysis'));
  expect(analyzeRequests()[0].signal.aborted).toBe(true);
  await act(async () => { resolveAnalysis(analysisFixture); await flush(); });
  expect(dialog().textContent).toContain('Analysis cancelled');
  expect(dialog().textContent).not.toContain('Suspected issue at line 2');
  await click(button('Analyze logs'));
  await click(dialog().querySelector('button[aria-label="Close"]'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(analyzeRequests()[1].signal.aborted).toBe(true);
  await act(async () => { resolveAnalysis(analysisFixture); await flush(); });
  expect(dialog().textContent).not.toContain('Suspected issue at line 2');
});

test('closing while discovery and snapshot are pending aborts both without starting analysis', async () => {
  const onClose = jest.fn();
  getProviders = () => new Promise(() => {});
  getSnapshot = () => new Promise(() => {});
  await renderDialog({ onClose });
  await click(dialog().querySelector('button[aria-label="Close"]'));
  expect(requests).toHaveLength(2);
  expect(requests.every(request => request.signal.aborted)).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(analyzeRequests()).toHaveLength(0);
});

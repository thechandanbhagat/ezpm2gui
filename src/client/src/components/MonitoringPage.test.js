import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import MonitoringPage from './MonitoringPage';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('react-i18next', () => {
  const messages = { monitoring: require('../locales/en/monitoring.json') };
  const t = (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  };
  return { useTranslation: () => ({ t }) };
});
const check = { id: 'api-health', name: 'API health', enabled: true, kind: 'http', url: 'https://example.com/health', expectedStatus: 200, intervalSeconds: 30, timeoutSeconds: 5, unhealthyAfter: 3 };
const rule = { id: 'api-rule', name: 'API down', enabled: true, source: 'health', connectionId: 'local', processName: '', healthCheckId: check.id, threshold: 1, durationSeconds: 30, windowSeconds: 600, cooldownSeconds: 900, webhookUrl: '' };
const target = { connectionId: 'local', name: 'Local server', connected: true, processes: [{ id: 1, name: 'api', status: 'online', cpu: 2, memoryMb: 50, restarts: 0 }, { id: 2, name: 'api', status: 'online', cpu: 3, memoryMb: 60, restarts: 0 }] };
let root, container, snapshot, targets;
const textButton = text => [...container.querySelectorAll('button')].find(button => button.textContent.trim() === text);
const click = async element => { await act(async () => element.click()); };
const change = async (element, value) => {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const submit = async () => { await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); };
const render = async () => { await act(async () => root.render(<MonitoringPage />)); };
const selectField = name => [...container.querySelectorAll('label')].find(label => label.querySelector('span')?.textContent === name)?.querySelector('select');

beforeEach(() => {
  jest.useFakeTimers(); jest.resetAllMocks();
  snapshot = { config: { revision: 0, healthChecks: [], rules: [], maintenanceUntil: null }, healthResults: [], ruleStates: [], events: [] };
  targets = [target];
  axios.get.mockImplementation(url => Promise.resolve({ data: url === '/api/monitoring' ? snapshot : targets }));
  axios.put.mockImplementation((url, config) => {
    snapshot = { ...snapshot, config: { ...config, revision: config.revision + 1 } };
    return Promise.resolve({ data: snapshot });
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); });

test('creates an HTTP check with its base revision and displays the saved check', async () => {
  await render();
  expect(container.textContent).toContain('Checks run from the EZPM2GUI server');
  await click(textButton('Add health check'));
  await change(container.querySelector('input[name="name"]'), 'Public API');
  await change(container.querySelector('input[name="url"]'), 'https://api.example.com/health');
  await submit();
  expect(axios.put).toHaveBeenCalledWith('/api/monitoring/config', expect.objectContaining({ revision: 0, healthChecks: [expect.objectContaining({ name: 'Public API', kind: 'http', url: 'https://api.example.com/health', expectedStatus: 200, enabled: true })] }));
  expect(container.querySelector('form')).toBeNull();
  expect(container.textContent).toContain('Public API');
  expect(container.textContent).toContain('Unknown');
});

test('creates a TCP check and requires timeout to be shorter than its interval', async () => {
  await render(); await click(textButton('Add health check'));
  await change(container.querySelector('input[name="name"]'), 'Database');
  await change(selectField('Protocol'), 'tcp');
  await change(container.querySelector('input[name="host"]'), 'db.example.com');
  await change(container.querySelector('input[name="port"]'), '5432');
  await change(container.querySelector('input[name="interval"]'), '10');
  await change(container.querySelector('input[name="timeout"]'), '10');
  await submit();
  expect(axios.put).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('timeout must be shorter');
  await change(container.querySelector('input[name="timeout"]'), '5'); await submit();
  expect(axios.put.mock.calls[0][1].healthChecks[0]).toEqual(expect.objectContaining({ kind: 'tcp', host: 'db.example.com', port: 5432, timeoutSeconds: 5 }));
});

test('polling preserves the draft and prevents overwriting a concurrent config change', async () => {
  snapshot.config.healthChecks = [check]; await render();
  await click(container.querySelector('button[aria-label="Edit API health"]'));
  await change(container.querySelector('input[name="name"]'), 'My unfinished edit');
  snapshot = { ...snapshot, config: { ...snapshot.config, revision: 1, healthChecks: [{ ...check, name: 'Changed elsewhere' }] }, healthResults: [{ checkId: check.id, status: 'unhealthy', checkedAt: Date.now(), latencyMs: 123, consecutiveFailures: 3, message: 'Timed out' }] };
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(container.querySelector('input[name="name"]').value).toBe('My unfinished edit');
  expect(container.textContent).toContain('Changed elsewhere'); expect(container.textContent).toContain('123 ms');
  expect(container.textContent).toContain('Configuration changed while you were editing.');
  expect(textButton('Save health check').disabled).toBe(true); expect(axios.put).not.toHaveBeenCalled();
  await click(textButton('Cancel'));
  await click(container.querySelector('button[aria-label="Edit Changed elsewhere"]'));
  expect(container.querySelector('input[name="name"]').value).toBe('Changed elsewhere');
});

test('preserves a draft when a save returns an edit conflict', async () => {
  snapshot.config.healthChecks = [check]; await render();
  await click(container.querySelector('button[aria-label="Edit API health"]'));
  await change(container.querySelector('input[name="name"]'), 'Unsaved name');
  axios.put.mockRejectedValueOnce({ response: { status: 409 } }); await submit();
  expect(container.querySelector('input[name="name"]').value).toBe('Unsaved name');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Configuration changed elsewhere');
  expect(textButton('Cancel').disabled).toBe(false);
});

test('groups process names and saves a restart rule for a connected remote server', async () => {
  targets.push({ ...target, connectionId: 'production', name: 'Production' }); await render();
  await click(textButton('Add alert rule'));
  await change(container.querySelector('input[name="name"]'), 'Restart storm');
  await change(selectField('Condition'), 'restarts'); await change(selectField('Server'), 'production');
  const processSelect = selectField('Process name');
  expect([...processSelect.options].filter(option => option.value === 'api')).toHaveLength(1);
  await change(processSelect, 'api'); await submit();
  expect(axios.put.mock.calls[0][1].rules[0]).toEqual(expect.objectContaining({ name: 'Restart storm', source: 'restarts', connectionId: 'production', processName: 'api', threshold: 5, windowSeconds: 600, cooldownSeconds: 900 }));
});

test('explicitly confirms removal of a check and its dependent rules', async () => {
  snapshot.config.healthChecks = [check]; snapshot.config.rules = [rule]; await render();
  await click(container.querySelector('button[aria-label="Delete API health"]'));
  expect(axios.put).not.toHaveBeenCalled(); expect(container.textContent).toContain('also deletes 1 linked alert rules');
  await click(textButton('Confirm deletion'));
  expect(axios.put).toHaveBeenCalledWith('/api/monitoring/config', { revision: 0, healthChecks: [], rules: [], maintenanceUntil: null });
  expect(container.querySelector('[aria-label="Confirm deletion"]')).toBeNull();
});

test('pauses and resumes notifications while retaining checks and rules', async () => {
  snapshot.config.healthChecks = [check]; snapshot.config.rules = [rule]; await render();
  const before = Date.now(); await click(textButton('Pause for 1 hour'));
  expect(axios.put.mock.calls[0][1]).toEqual(expect.objectContaining({ healthChecks: [check], rules: [rule], maintenanceUntil: before + 3600000 }));
  expect(container.textContent).toContain('Checks and alert evaluation continue.');
  await click(textButton('Resume notifications'));
  expect(axios.put.mock.calls[1][1]).toEqual(expect.objectContaining({ revision: 1, maintenanceUntil: null }));
});

test('shows unknown, pending, suppressed and delivery failure distinctly', async () => {
  snapshot.config.healthChecks = [check]; snapshot.config.rules = [rule, { ...rule, id: 'disabled-rule', name: 'Disabled rule', enabled: false }];
  snapshot.ruleStates = [{ ruleId: rule.id, status: 'pending', since: Date.now(), updatedAt: Date.now(), value: 1, message: 'Waiting for duration' }];
  snapshot.events = [{ id: 'evt-1', timestamp: Date.now(), ruleId: rule.id, ruleName: rule.name, kind: 'firing', message: 'Health check failed', value: 1, delivery: 'failed' }];
  await render();
  expect(container.querySelector('.monitoring-status-unknown').textContent).toBe('Unknown');
  expect(container.querySelector('.monitoring-status-pending').textContent).toBe('Pending');
  expect(container.querySelector('.monitoring-status-suppressed').textContent).toBe('Suppressed');
  expect(container.querySelector('.monitoring-delivery-failed').textContent).toBe('Webhook: Failed');
});

test('labels numeric process values with units and omits health and offline values', async () => {
  const sources = ['cpu', 'memory', 'restarts', 'health', 'offline'];
  snapshot.config.healthChecks = [check];
  snapshot.config.rules = sources.map(source => ({ ...rule, id: source, name: source, source }));
  snapshot.ruleStates = sources.map((source, index) => ({ ruleId: source, status: 'ok', since: Date.now(), updatedAt: Date.now(), value: [85, 512, 5, 123, 1][index], message: 'Condition evaluated' }));
  snapshot.events = [{ id: 'suppressed', timestamp: Date.now(), ruleId: rule.id, ruleName: rule.name, kind: 'firing', message: 'Condition met', value: 1, delivery: 'suppressed' }];
  await render();
  expect(container.textContent).toContain('Observed: 85% CPU');
  expect(container.textContent).toContain('Observed: 512 MB');
  expect(container.textContent).toContain('Restart count: 5');
  expect(container.textContent).not.toContain('Observed: 123');
  expect(container.textContent).not.toContain('Observed: 1');
  expect(container.querySelector('.monitoring-delivery-suppressed').textContent).toContain('Suppressed during maintenance or cooldown');
});

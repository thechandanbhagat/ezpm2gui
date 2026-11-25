import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-i18next', () => {
  const messages = {
    ...require('../locales/en/translation.json'),
    monitoring: require('../locales/en/monitoring.json'),
    commandPalette: require('../locales/en/command-palette.json'),
  };
  return { useTranslation: () => ({ t: (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  } }) };
});

const { MemoryRouter, useLocation } = require('react-router-dom');
const CommandPalette = require('./CommandPalette').default;
const CurrentPage = () => <output data-testid="current-path">{useLocation().pathname}</output>;
let root, container;

const dialog = () => document.querySelector('[role="dialog"]');
const search = () => document.querySelector('[role="combobox"]');
const options = () => [...document.querySelectorAll('[role="option"]')];
const pathname = () => container.querySelector('[data-testid="current-path"]').textContent;
const trigger = () => container.querySelector('button[aria-label="Open command palette"]');
const settle = async () => { await act(async () => { jest.advanceTimersByTime(500); }); };
const key = async (init, target = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => { target.dispatchEvent(event); });
  await settle();
  return event;
};
const click = async element => { await act(async () => { element.click(); }); await settle(); };
const query = async value => {
  await act(async () => {
    const input = search();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
};
// React DOM's root.render requires act to flush updates.
const mountPalette = async (props = {}) => {
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/processes']}>
      <input aria-label="Page search" />
      <CommandPalette {...props} />
      <CurrentPage />
    </MemoryRouter>);
  });
  await settle();
};
const sampleProcesses = [
  { pm_id: 0, name: 'checkout-api', pm2_env: { namespace: 'payments', status: 'online' } },
  { pm_id: 7, name: 'background-worker', pm2_env: { namespace: 'jobs', status: 'stopped' } },
];
const openProcess = async (name = 'checkout-api') => {
  await key({ key: 'k', metaKey: true });
  await query(name);
  expect(options()).toHaveLength(1);
  await key({ key: 'Enter' }, search());
};
const option = label => options().find(item => item.textContent.trim() === label);

beforeEach(async () => {
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await mountPalette();
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); jest.runOnlyPendingTimers(); });
  container.remove();
  jest.useRealTimers();
});

test.each([
  ['Mac Command', { key: 'k', code: 'KeyK', metaKey: true }],
  ['uppercase Mac Command', { key: 'K', metaKey: true }],
  ['physical K key on another layout', { key: 'κ', code: 'KeyK', metaKey: true }],
  ['Control', { key: 'k', code: 'KeyK', ctrlKey: true }],
])('%s opens and focuses the palette while cancelling the browser shortcut', async (_, shortcut) => {
  const event = await key(shortcut);
  expect(event.defaultPrevented).toBe(true);
  expect(dialog()).not.toBeNull();
  expect(dialog().textContent).toContain('Command palette');
  expect(document.activeElement).toBe(search());
  expect(options().some(option => option.textContent.includes('Processes'))).toBe(true);
});

test.each([
  ['unmodified K', { key: 'k', code: 'KeyK' }],
  ['another command', { key: 'j', code: 'KeyJ', metaKey: true }],
  ['Alt modifier', { key: 'k', code: 'KeyK', metaKey: true, altKey: true }],
  ['Shift modifier', { key: 'K', code: 'KeyK', metaKey: true, shiftKey: true }],
  ['IME composition', { key: 'k', code: 'KeyK', metaKey: true, isComposing: true }],
])('%s leaves browser and typing behavior alone', async (_, shortcut) => {
  const event = await key(shortcut);
  expect(event.defaultPrevented).toBe(false);
  expect(dialog()).toBeNull();
});

test('holding Cmd+K keeps the palette open and continues cancelling the browser shortcut', async () => {
  await key({ key: 'k', code: 'KeyK', metaKey: true });
  const repeated = await key({ key: 'k', code: 'KeyK', metaKey: true, repeat: true }, search());
  expect(repeated.defaultPrevented).toBe(true);
  expect(dialog()).not.toBeNull();
  expect(document.activeElement).toBe(search());
});

test('opens from a focused form input, Escape restores focus, and a second shortcut closes', async () => {
  const pageInput = container.querySelector('input[aria-label="Page search"]');
  pageInput.focus();
  await key({ key: 'k', metaKey: true }, pageInput);
  expect(document.activeElement).toBe(search());
  await key({ key: 'Escape' }, search());
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(pageInput);
  await key({ key: 'k', metaKey: true }, pageInput);
  await key({ key: 'k', metaKey: true }, search());
  expect(dialog()).toBeNull();
});

test('filters pages and Enter navigates to the matching page', async () => {
  await key({ key: 'k', metaKey: true });
  await query('health');
  expect(options()).toHaveLength(1);
  expect(options()[0].textContent).toContain('Health & alerts');
  await key({ key: 'Enter' }, search());
  expect(pathname()).toBe('/monitoring');
  expect(dialog()).toBeNull();
});

test('arrow keys wrap the active option without moving focus out of the search field', async () => {
  await key({ key: 'k', metaKey: true });
  const rows = options();
  expect(rows.length).toBeGreaterThan(1);
  expect(search().getAttribute('aria-activedescendant')).toBe(rows[0].id);
  await key({ key: 'ArrowUp' }, search());
  expect(search().getAttribute('aria-activedescendant')).toBe(rows[rows.length - 1].id);
  await key({ key: 'ArrowDown' }, search());
  expect(search().getAttribute('aria-activedescendant')).toBe(rows[0].id);
  await key({ key: 'ArrowDown' }, search());
  expect(search().getAttribute('aria-activedescendant')).toBe(rows[1].id);
  expect(document.activeElement).toBe(search());
});

test('Enter with no matching page keeps the palette open and does not navigate', async () => {
  await key({ key: 'k', metaKey: true });
  await query('no-such-page-9385');
  expect(options()).toHaveLength(0);
  await key({ key: 'Enter' }, search());
  expect(pathname()).toBe('/processes');
  expect(dialog()).not.toBeNull();
});

test('the visible toolbar button opens the palette and clicking a result navigates', async () => {
  await click(trigger());
  expect(dialog()).not.toBeNull();
  await query('settings');
  const settings = options().find(option => option.textContent.includes('Settings'));
  expect(settings).toBeDefined();
  await click(settings);
  expect(pathname()).toBe('/settings');
  expect(dialog()).toBeNull();
});

test('unmount removes the global shortcut listener', async () => {
  await act(async () => { root.unmount(); jest.runOnlyPendingTimers(); });
  root = null;
  const event = await key({ key: 'k', code: 'KeyK', metaKey: true });
  expect(event.defaultPrevented).toBe(false);
  expect(dialog()).toBeNull();
});

test.each([
  ['name', 'checkout'],
  ['PM2 ID zero', '0'],
  ['namespace', 'payments'],
])('searches a process by %s and exposes its actions', async (_, term) => {
  await mountPalette({ processes: sampleProcesses, serverName: 'Local server', onProcessAction: jest.fn() });
  await key({ key: 'k', metaKey: true });
  await query(term);
  expect(options()).toHaveLength(1);
  expect(options()[0].textContent).toContain('checkout-api');
  expect(options()[0].textContent).toContain('0');
  expect(options()[0].textContent).toContain('payments');
  await key({ key: 'Enter' }, search());
  expect(dialog().textContent).toContain('checkout-api');
  expect(dialog().textContent).toContain('Local server');
  expect(options().map(item => item.textContent.trim())).toEqual(['View Logs', 'Restart', 'Stop']);
  expect(document.activeElement).toBe(search());
});

test.each([
  ['local', 'Local server', '/logs/0'],
  ['remote/blue', 'Production', '/logs/remote/remote%2Fblue/0'],
])('View Logs opens process zero on the selected %s server', async (serverId, serverName, expectedPath) => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, serverId, serverName, onProcessAction });
  await openProcess();
  expect(option('View Logs').getAttribute('aria-selected')).toBe('true');
  await key({ key: 'Enter' }, search());
  expect(pathname()).toBe(expectedPath);
  expect(dialog()).toBeNull();
  expect(onProcessAction).not.toHaveBeenCalled();
});

test.each([
  ['Restart', 'restart'],
  ['Stop', 'stop'],
])('%s requests the existing process action once after selection', async (label, action) => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await openProcess();
  // Selecting a process or filtering actions alone must not run a lifecycle action.
  expect(onProcessAction).not.toHaveBeenCalled();
  await query(label);
  expect(options()).toHaveLength(1);
  expect(onProcessAction).not.toHaveBeenCalled();
  await key({ key: 'Enter' }, search());
  expect(onProcessAction).toHaveBeenCalledTimes(1);
  expect(onProcessAction).toHaveBeenCalledWith(0, action);
  expect(dialog()).toBeNull();
  expect(pathname()).toBe('/processes');
});

test('clicking a process and action works without keyboard navigation', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await click(trigger());
  await query('background-worker');
  await click(options()[0]);
  await click(option('Restart'));
  expect(onProcessAction).toHaveBeenCalledWith(7, 'restart');
  expect(onProcessAction).toHaveBeenCalledTimes(1);
  expect(dialog()).toBeNull();
});

test('an action search with no matches cannot invoke a previously selected action', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await openProcess();
  await key({ key: 'ArrowDown' }, search());
  await query('no-such-action-9385');
  expect(options()).toHaveLength(0);
  await key({ key: 'Enter' }, search());
  expect(dialog()).not.toBeNull();
  expect(pathname()).toBe('/processes');
  expect(onProcessAction).not.toHaveBeenCalled();
});

test('Back to search and Escape restore the prior process query without running an action', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await openProcess();
  const back = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === 'Back to search' || item.textContent.trim() === 'Back to search');
  expect(back).toBeDefined();
  await click(back);
  expect(search().value).toBe('checkout-api');
  expect(options()).toHaveLength(1);
  await key({ key: 'Enter' }, search());
  await key({ key: 'Escape' }, search());
  expect(dialog()).not.toBeNull();
  expect(search().value).toBe('checkout-api');
  await key({ key: 'Escape' }, search());
  expect(dialog()).toBeNull();
  expect(onProcessAction).not.toHaveBeenCalled();
});

test('switching servers closes and clears a selected process so it cannot act on the new server', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, serverId: 'local', onProcessAction });
  await openProcess();
  await mountPalette({ processes: sampleProcesses, serverId: 'production', serverName: 'Production', onProcessAction });
  expect(dialog()).toBeNull();
  expect(onProcessAction).not.toHaveBeenCalled();
  await key({ key: 'k', metaKey: true });
  expect(search().value).toBe('');
  expect(option('Restart')).toBeUndefined();
});

test('a process removed while its actions are open returns to search without dispatching a stale action', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await openProcess();
  await mountPalette({ processes: sampleProcesses.filter(item => item.pm_id !== 0), onProcessAction });
  expect(dialog()).not.toBeNull();
  expect(dialog().textContent).toContain('This process is no longer available. Search for another process.');
  expect(option('Restart')).toBeUndefined();
  await key({ key: 'Enter' }, search());
  expect(onProcessAction).not.toHaveBeenCalled();
});

test('a different process reusing the selected PM2 ID cannot inherit the pending action choices', async () => {
  const onProcessAction = jest.fn();
  await mountPalette({ processes: sampleProcesses, onProcessAction });
  await openProcess();
  await mountPalette({
    processes: [{ ...sampleProcesses[0], name: 'replacement-api' }, sampleProcesses[1]],
    onProcessAction,
  });
  expect(dialog()).not.toBeNull();
  expect(dialog().textContent).toContain('This process is no longer available. Search for another process.');
  expect(option('Restart')).toBeUndefined();
  await key({ key: 'Enter' }, search());
  expect(onProcessAction).not.toHaveBeenCalled();
});

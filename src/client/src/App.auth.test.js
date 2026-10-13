import 'whatwg-fetch';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({
  connected: false, on: jest.fn(), off: jest.fn(), connect: jest.fn(), disconnect: jest.fn(),
})) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({
  t: key => key, i18n: { language: 'en', changeLanguage: jest.fn() },
}) }));

// Keep the app's actual auth, settings form, lock screen, effects, and router.
// Data-heavy pages are irrelevant to session lifecycle and stay out of this fixture.
for (const component of [
  'ProcessDetailPage', 'ConfirmationDialog', 'DeployApplication', 'ModuleManagement',
  'EcosystemGenerator', 'ProcessConfiguration', 'ClusterManagement', 'LogStreamEnhanced',
  'SidebarMenu', 'LoadBalancingGuide', 'RemoteConnections', 'CronJobsPage', 'MetricsPage',
  'ServerSwitcher', 'WhatsNew', 'StatusBar', 'LanguageSwitcher',
]) {
  jest.doMock(`./components/${component}`, () => ({ __esModule: true, default: () => null }));
}
jest.doMock('./components/MainDashboard', () => ({ __esModule: true, default: () => <p>Test dashboard</p> }));
jest.doMock('./components/WhatsNewModal', () => ({
  __esModule: true, default: () => null, shouldShowWhatsNew: () => false, markWhatsNewSeen: () => {},
}));

jest.doMock('./components/LogAnalysisContext', () => ({
  LogAnalysisProvider: ({ children }) => children,
}));
jest.doMock('./components/LogAnalysisSidebar', () => ({
  LogAnalysisContent: ({ children }) => children,
}));

const App = require('./App').default;
const auth = require('./auth');
const axios = require('axios');
const { io } = require('socket.io-client');
const socket = io.mock.results[0].value;
const response = (status, body) => ({ status, json: async () => body, clone: () => response(status, body) });
const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };

async function fill(container, placeholder, value) {
  const input = container.querySelector(`input[placeholder="${placeholder}"]`);
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(container, text) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  expect(button).toBeDefined();
  await act(async () => { button.click(); await flush(); });
}

test('first password stays signed in; locked and expired sessions stop polling without reloading', async () => {
  jest.useFakeTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/settings?section=security');
  let configured = false;
  let validToken = null;
  const requests = [];
  window.fetch = jest.fn(async (url, init) => {
    requests.push(url);
    if (url === '/api/auth/status') return response(200, { passwordSet: configured, pinSet: false, autoLockMinutes: 0 });
    if (url === '/api/auth/set') {
      configured = true;
      validToken = 'first-session';
      return response(200, { success: true, token: validToken });
    }
    if (url === '/api/auth/verify') {
      if (JSON.parse(init.body).password !== 'test-only-password') return response(401, { error: 'Incorrect password' });
      validToken = 'verified-session';
      return response(200, { success: true, token: validToken });
    }
    return response(200, { success: true, data: { currentVersion: 'test' } });
  });
  axios.defaults.adapter = async config => {
    requests.push(config.url);
    if (configured && config.headers.get('Authorization') !== `Bearer ${validToken}`) {
      throw { config, response: { status: 401, data: { authRequired: true } } };
    }
    const data = config.url === '/api/metrics'
      ? { loadAvg: [0, 0, 0], memory: { total: 0, free: 0, used: 0 }, uptime: 0, cpus: 0 } : [];
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  auth.installAuthInterceptors();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  try {
    await act(async () => { root.render(<App />); await flush(); });
    await fill(container, 'New password', 'test-only-password');
    await fill(container, 'Confirm password', 'test-only-password');
    socket.connect.mockClear();
    await click(container, 'settings.buttons.enable');
    expect(container.textContent).toContain('settings.messages.passwordEnabled');
    expect(container.querySelector('input[placeholder="passwordGate.passwordPlaceholder"]')).toBeNull();
    expect(auth.getToken()).toBe('first-session');
    expect(socket.connect).toHaveBeenCalledTimes(1);

    // Locking must unmount Settings and stop protected timers.
    await act(async () => { container.querySelector('button[title="header.lockApp"]').click(); await flush(); });
    expect(container.querySelector('input[placeholder="passwordGate.passwordPlaceholder"]')).not.toBeNull();
    const count = requests.length;
    await act(async () => { jest.advanceTimersByTime(15000); await flush(); });
    expect(requests).toHaveLength(count);
    await fill(container, 'passwordGate.passwordPlaceholder', 'wrong');
    await click(container, 'passwordGate.unlock');
    expect(container.textContent).toContain('Incorrect password');
    await fill(container, 'passwordGate.passwordPlaceholder', 'test-only-password');
    await click(container, 'passwordGate.unlock');
    expect(auth.getToken()).toBe('verified-session');
    expect(container.querySelector('input[placeholder="New password"]')).not.toBeNull();

    // Expiry returns to the gate once and leaves it stable.
    validToken = 'revoked';
    await act(async () => { await axios.get('/api/processes').catch(() => {}); await flush(); });
    expect(auth.getToken()).toBeNull();
    expect(container.querySelector('input[placeholder="passwordGate.passwordPlaceholder"]')).not.toBeNull();
    const lockedCount = requests.length;
    await act(async () => { jest.advanceTimersByTime(15000); await flush(); });
    expect(requests).toHaveLength(lockedCount);

    // A fresh page with a configured password must fetch status only, not protected data.
    await act(async () => { root.unmount(); });
    requests.length = 0;
    socket.connect.mockClear();
    root = createRoot(container);
    await act(async () => { root.render(<App />); await flush(); });
    expect(requests).toEqual(['/api/auth/status']);
    expect(socket.connect).not.toHaveBeenCalled();
    expect(container.querySelector('input[placeholder="passwordGate.passwordPlaceholder"]')).not.toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  }
});

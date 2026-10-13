import 'whatwg-fetch';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TextEncoder, TextDecoder } from 'util';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { Notification, StatusBarStatus } from './components/StatusBar';
import type { PM2Process } from './types/pm2';
import type { RemoteConnection } from './types/remote';
import { ACTIVE_SERVER_STORAGE_KEY, REMOTE_CONNECTIONS_CHANGED_EVENT } from './utils/server-selection';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });

jest.doMock('socket.io-client', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    listeners,
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
    off: jest.fn((event: string) => listeners.delete(event)),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
  return { io: jest.fn(() => socket) };
});
jest.doMock('react-i18next', () => {
  const t = (key: string) => key;
  const i18n = { language: 'en', changeLanguage: jest.fn() };
  return { useTranslation: () => ({ t, i18n }) };
});

for (const component of [
  'ProcessDetailPage', 'ConfirmationDialog', 'DeployApplication', 'EcosystemGenerator',
  'ProcessConfiguration', 'ClusterManagement', 'LogStreamEnhanced', 'SidebarMenu',
  'Settings', 'PasswordGate', 'Help', 'LoadBalancingGuide', 'RemoteConnections',
  'CronJobsPage', 'MetricsPage', 'WhatsNew', 'LanguageSwitcher',
]) {
  jest.doMock(`./components/${component}`, () => ({ __esModule: true, default: () => null }));
}
jest.doMock('./components/MainDashboard', () => ({
  __esModule: true,
  default: ({ processes }: { processes: PM2Process[] }) => (
    <div data-testid="processes">{processes.map(process => process.name).join(',')}</div>
  ),
}));
jest.doMock('./components/ModuleManagement', () => ({
  __esModule: true,
  default: ({ onNotify }: { onNotify: (message: string, type: Notification['type']) => void }) => (
    <button onClick={() => onNotify('Manual operation failed', 'error')}>Notify manually</button>
  ),
}));
jest.doMock('./components/ServerSwitcher', () => ({
  __esModule: true,
  default: ({ onSwitch }: { onSwitch: (serverId: string) => void }) => (
    <button onClick={() => onSwitch('local')}>Switch to local</button>
  ),
}));
jest.doMock('./components/WhatsNewModal', () => ({
  __esModule: true, default: () => null, shouldShowWhatsNew: () => false, markWhatsNewSeen: () => {},
}));
jest.doMock('./components/StatusBar', () => ({
  __esModule: true,
  default: ({ notifications, onDismiss, status }: {
    notifications: Notification[];
    onDismiss: (id: string) => void;
    status: StatusBarStatus;
  }) => (
    <div>
      <span data-testid="connection-status">{status.connected ? 'connected' : 'disconnected'}</span>
      <span data-testid="active-server">{status.activeServer}</span>
      <ul data-testid="notifications">
        {notifications.map(notification => (
          <li key={notification.id} data-notification-type={notification.type}>
            {notification.message}
            <button onClick={() => onDismiss(notification.id)}>Dismiss {notification.message}</button>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

jest.doMock('./components/LogAnalysisContext', () => ({
  LogAnalysisProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.doMock('./components/LogAnalysisSidebar', () => ({
  LogAnalysisContent: ({ children }: { children: React.ReactNode }) => children,
}));

const App: React.FC = require('./App').default;
const axios: typeof import('axios')['default'] = require('axios');
const { io } = require('socket.io-client');
const socket: {
  connected: boolean;
  listeners: Map<string, (...args: unknown[]) => void>;
  on: { mockImplementation: (handler: (event: string, listener: (...args: unknown[]) => void) => unknown) => void };
  off: { mockImplementation: (handler: (event: string) => unknown) => void };
} = io.mock.results[0].value;

const DISCONNECT_DEBOUNCE_MS = 5000;
const RETRY_DEBOUNCE_MS = 3000;
const REMOTE_POLL_MS = 3000;
const CONNECTION_REFRESH_MS = 5000;
const TIMER_BOUNDARY_MS = 1;
const RETRY_COUNT = 4;
const MICROTASK_FLUSH_COUNT = 15;
const SOCKET_WARNING = 'errors.connectionLost';
const REMOTE_WARNING = 'errors.failedFetchRemote';
const REMOTE_SERVER_ID = '192.168.50.200-22-oll-dev';
const connections: RemoteConnection[] = [{
  id: REMOTE_SERVER_ID,
  name: 'Development server',
  host: '192.168.50.200',
  port: 22,
  username: 'oll-dev',
  connected: true,
}];

let container: HTMLDivElement;
let root: Root;
let remoteRequest: () => Promise<PM2Process[]>;

const response = (body: unknown): Response => ({
  status: 200,
  json: async () => body,
} as Response);

const flush = async (): Promise<void> => {
  for (let index = 0; index < MICROTASK_FLUSH_COUNT; index += 1) await Promise.resolve();
};

const advance = async (milliseconds: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
    await flush();
  });
};

const emit = async (event: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    if (event === 'connect') socket.connected = true;
    if (event === 'disconnect') socket.connected = false;
    const listener = socket.listeners.get(event);
    expect(listener).toBeDefined();
    listener!(...args);
    await flush();
  });
};

const mount = async (serverId = 'local', route = '/'): Promise<void> => {
  localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, serverId);
  window.history.replaceState(null, '', route);
  await act(async () => {
    root.render(<App />);
    await flush();
  });
};

const notifications = (message?: string): HTMLLIElement[] =>
  [...container.querySelectorAll<HTMLLIElement>('[data-testid="notifications"] li')]
    .filter(notification => !message || notification.textContent?.includes(message));

const click = async (text: string): Promise<void> => {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
    await flush();
  });
};

const failRemote = async (): Promise<PM2Process[]> => {
  throw new Error('Remote server disconnected');
};

const disconnectWithWarning = async (): Promise<void> => {
  await advance(DISCONNECT_DEBOUNCE_MS + TIMER_BOUNDARY_MS);
  await emit('disconnect', 'transport close');
  await advance(DISCONNECT_DEBOUNCE_MS);
  expect(notifications(SOCKET_WARNING)).toHaveLength(1);
};

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  socket.connected = true;
  socket.listeners.clear();
  socket.on.mockImplementation((event, listener) => socket.listeners.set(event, listener));
  socket.off.mockImplementation(event => socket.listeners.delete(event));
  remoteRequest = async () => [];
  window.fetch = jest.fn(async (url: RequestInfo | URL) => response(
    url === '/api/auth/status'
      ? { passwordSet: false, pinSet: false, autoLockMinutes: 0 }
      : { success: true, data: { currentVersion: 'test' } },
  )) as typeof fetch;
  axios.defaults.adapter = async config => {
    const data = config.url === '/api/remote/connections'
      ? connections.map(connection => ({ ...connection }))
      : config.url === `/api/remote/${REMOTE_SERVER_ID}/processes`
        ? await remoteRequest()
        : config.url === '/api/metrics'
          ? { loadAvg: [0, 0, 0], memory: { total: 0, free: 0, used: 0 }, uptime: 0, cpus: 0 }
          : [];
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('socket retries retain one warning for the outage', async () => {
  await mount();
  await disconnectWithWarning();
  expect(container.querySelector('[data-testid="connection-status"]')?.textContent).toBe('disconnected');
  for (let retry = 0; retry < RETRY_COUNT; retry += 1) {
    await emit('connect_error');
    await advance(RETRY_DEBOUNCE_MS + TIMER_BOUNDARY_MS);
    await emit('disconnect', 'transport close');
    await advance(DISCONNECT_DEBOUNCE_MS);
  }
  expect(notifications(SOCKET_WARNING)).toHaveLength(1);
});

test('dismissing a socket warning keeps it dismissed throughout retries', async () => {
  await mount();
  await disconnectWithWarning();
  await click(`Dismiss ${SOCKET_WARNING}`);
  for (let retry = 0; retry < RETRY_COUNT; retry += 1) {
    await emit('connect_error');
    await advance(RETRY_DEBOUNCE_MS + TIMER_BOUNDARY_MS);
  }
  expect(notifications(SOCKET_WARNING)).toHaveLength(0);
});

test('socket recovery clears its warning and permits a warning for the next outage', async () => {
  await mount();
  await disconnectWithWarning();
  await emit('connect');
  expect(notifications(SOCKET_WARNING)).toHaveLength(0);
  expect(container.querySelector('[data-testid="connection-status"]')?.textContent).toBe('connected');
  await disconnectWithWarning();
  expect(notifications(SOCKET_WARNING)).toHaveLength(1);
});

test('socket recovery before the debounce finishes produces no warning', async () => {
  await mount();
  await advance(DISCONNECT_DEBOUNCE_MS + TIMER_BOUNDARY_MS);
  await emit('disconnect', 'transport close');
  await advance(DISCONNECT_DEBOUNCE_MS - TIMER_BOUNDARY_MS);
  await emit('connect');
  await advance(RETRY_DEBOUNCE_MS + DISCONNECT_DEBOUNCE_MS);
  expect(notifications(SOCKET_WARNING)).toHaveLength(0);
});

test('remote polling and connection-list refreshes retain one warning per outage', async () => {
  remoteRequest = failRemote;
  await mount(REMOTE_SERVER_ID);
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
  for (let retry = 0; retry < RETRY_COUNT; retry += 1) {
    await advance(CONNECTION_REFRESH_MS);
    await act(async () => {
      window.dispatchEvent(new Event(REMOTE_CONNECTIONS_CHANGED_EVENT));
      await flush();
    });
  }
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
  await click(`Dismiss ${REMOTE_WARNING}`);
  await advance(CONNECTION_REFRESH_MS + REMOTE_POLL_MS);
  expect(notifications(REMOTE_WARNING)).toHaveLength(0);
});

test('successful remote polling clears its warning and resets the next outage', async () => {
  remoteRequest = failRemote;
  await mount(REMOTE_SERVER_ID);
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
  remoteRequest = async () => [];
  await advance(REMOTE_POLL_MS);
  expect(notifications(REMOTE_WARNING)).toHaveLength(0);
  remoteRequest = failRemote;
  await advance(CONNECTION_REFRESH_MS);
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
});

test('switching servers ignores a pending remote polling failure', async () => {
  let rejectPending!: (reason: Error) => void;
  remoteRequest = () => new Promise((resolve, reject) => { rejectPending = reject; });
  await mount(REMOTE_SERVER_ID);
  await click('Switch to local');
  await act(async () => {
    rejectPending(new Error('Previous server disconnected'));
    await flush();
  });
  expect(container.querySelector('[data-testid="active-server"]')?.textContent).toBe('local');
  expect(notifications(REMOTE_WARNING)).toHaveLength(0);
});

test('switching servers ignores a pending remote polling success', async () => {
  let resolvePending!: (value: PM2Process[]) => void;
  remoteRequest = () => new Promise(resolve => { resolvePending = resolve; });
  await mount(REMOTE_SERVER_ID);
  await click('Switch to local');
  await act(async () => {
    resolvePending([{ name: 'Previous remote process', pm_id: 1, pm2_env: { status: 'online' } } as PM2Process]);
    await flush();
  });
  expect(container.querySelector('[data-testid="processes"]')?.textContent).toBe('');
});

test('slow remote polling stays sequential through repeated refreshes and recovery', async () => {
  remoteRequest = failRemote;
  await mount(REMOTE_SERVER_ID);
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
  let resolvePending!: (value: PM2Process[]) => void;
  const pendingRequest = jest.fn(() => new Promise<PM2Process[]>(resolve => { resolvePending = resolve; }));
  remoteRequest = pendingRequest;
  await advance(REMOTE_POLL_MS);
  expect(pendingRequest).toHaveBeenCalledTimes(1);
  for (let retry = 0; retry < RETRY_COUNT; retry += 1) await advance(CONNECTION_REFRESH_MS);
  expect(pendingRequest).toHaveBeenCalledTimes(1);
  expect(notifications(REMOTE_WARNING)).toHaveLength(1);
  await act(async () => {
    resolvePending([]);
    await flush();
  });
  expect(notifications(REMOTE_WARNING)).toHaveLength(0);
});

test('socket recovery preserves unrelated manually generated notifications', async () => {
  await mount('local', '/modules');
  await click('Notify manually');
  await disconnectWithWarning();
  await emit('connect');
  expect(notifications(SOCKET_WARNING)).toHaveLength(0);
  expect(notifications('Manual operation failed')).toHaveLength(1);
});

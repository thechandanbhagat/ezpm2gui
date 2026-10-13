import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import axios from 'axios';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { SpyInstance } from 'jest-mock';
import { run } from 'axe-core';
import { REMOTE_CONNECTIONS_CHANGED_EVENT } from '../utils/server-selection';
import { AUTH_CONFIG_CHANGED_EVENT, AUTH_REQUIRED_EVENT, AUTH_SESSION_CHANGED_EVENT, clearToken, notifyAuthConfigChanged } from '../auth';

jest.doMock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/remote' }),
  useNavigate: () => jest.fn(),
}));
jest.doMock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, values?: { name: string }) => values ? `${key} ${values.name}` : key,
}) }));

const SidebarMenu: React.FC = require('./SidebarMenu').default;
const REFRESH_MS = 5000;
const MICROTASK_FLUSH_COUNT = 20;
const REMOTE_ID = '192.168.50.200-22-oll-dev';
const connection = { id: REMOTE_ID, name: 'Remote server', connected: false };
const process = { pm_id: 17, name: 'booking-manager', status: 'online' };
let root: Root;
let container: HTMLDivElement;
let connections = [connection];
let remoteProcesses = [process];
let get: SpyInstance<ReturnType<typeof axios.get>, Parameters<typeof axios.get>>;
let post: SpyInstance<ReturnType<typeof axios.post>, Parameters<typeof axios.post>>;
let errors: SpyInstance<ReturnType<typeof console.error>, Parameters<typeof console.error>>;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < MICROTASK_FLUSH_COUNT; index += 1) await Promise.resolve();
  });
}

async function renderSidebar(): Promise<void> {
  await act(async () => { root.render(<SidebarMenu />); });
  await flush();
}

async function changeConnections(detail?: unknown): Promise<void> {
  await act(async () => { window.dispatchEvent(new CustomEvent(REMOTE_CONNECTIONS_CHANGED_EVENT, { detail })); });
  await flush();
}

function connectButton(name = connection.name): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="sidebar.connectTo ${name}"]`);
  if (!button) throw new Error('Missing Connect button');
  return button;
}

function deferredConnection() {
  let resolve: (value: { data: unknown }) => void = () => { throw new Error('Missing resolver'); };
  let reject: (error: unknown) => void = () => { throw new Error('Missing rejecter'); };
  const promise = new Promise<{ data: unknown }>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expandRemote(): void {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === connection.name);
  if (!button) throw new Error('Missing remote server');
  act(() => { button.click(); });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  jest.useFakeTimers();
  localStorage.clear();
  connections = [connection];
  remoteProcesses = [process];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  get = jest.spyOn(axios, 'get').mockImplementation(async url => {
    if (url === '/api/processes') return { data: [] };
    if (url === '/api/remote/connections') return { data: connections.map(item => ({ ...item })) };
    if (url === `/api/remote/${REMOTE_ID}/processes`) return { data: remoteProcesses.map(item => ({ ...item })) };
    throw new Error(`Unexpected URL: ${url}`);
  });
  post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('Unexpected Connect request'));
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
  localStorage.clear();
});

test('shows a disconnected saved server initially', async () => {
  await renderSidebar();
  expandRemote();
  expect(container.textContent).toContain('sidebar.notConnected');
  expect(get.mock.calls.some(([url]) => url === `/api/remote/${REMOTE_ID}/processes`)).toBe(false);
});

test('loads processes when an existing disconnected server connects without remounting', async () => {
  await renderSidebar();
  expandRemote();
  connections = [{ ...connection, connected: true }];
  await changeConnections({ connectionId: REMOTE_ID, connected: true });
  expect(container.textContent).toContain(process.name);
  expect(container.textContent).not.toContain('sidebar.notConnected');
});

test('removes stale processes on explicit disconnect and removes deleted servers', async () => {
  connections = [{ ...connection, connected: true }];
  await renderSidebar();
  expandRemote();
  expect(container.textContent).toContain(process.name);
  connections = [connection];
  await changeConnections({ connectionId: REMOTE_ID, connected: false });
  expect(container.textContent).not.toContain(process.name);
  expect(container.textContent).toContain('sidebar.notConnected');
  connections = [];
  await changeConnections({ deletedConnectionId: REMOTE_ID });
  expect(container.textContent).not.toContain(connection.name);
});

test('refreshes process changes and reconnects from the server without a browser reload', async () => {
  connections = [{ ...connection, connected: true }];
  await renderSidebar();
  expandRemote();
  remoteProcesses = [{ ...process, name: 'new-worker' }];
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await flush();
  expect(container.textContent).toContain('new-worker');
  expect(container.textContent).not.toContain(process.name);
  connections = [connection];
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await flush();
  expect(container.textContent).toContain('sidebar.notConnected');
  connections = [{ ...connection, connected: true }];
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await flush();
  expect(container.textContent).toContain('new-worker');
});

test('ignores an old process response after disconnect and queues a fresh connection refresh', async () => {
  let resolveOld: (value: { data: typeof remoteProcesses }) => void = () => { throw new Error('Missing resolver'); };
  const oldResponse = new Promise<{ data: typeof remoteProcesses }>(resolve => { resolveOld = resolve; });
  get.mockImplementation(async url => {
    if (url === '/api/processes') return { data: [] };
    if (url === '/api/remote/connections') return { data: connections.map(item => ({ ...item })) };
    if (url === `/api/remote/${REMOTE_ID}/processes`) return oldResponse;
    throw new Error(`Unexpected URL: ${url}`);
  });
  connections = [{ ...connection, connected: true }];
  await renderSidebar();
  expandRemote();
  connections = [connection];
  await changeConnections({ connectionId: REMOTE_ID, connected: false });
  expect(container.textContent).toContain('sidebar.notConnected');
  resolveOld({ data: [process] });
  await flush();
  expect(container.textContent).not.toContain(process.name);
  expect(container.textContent).toContain('sidebar.notConnected');
  expect(get.mock.calls.filter(([url]) => url === '/api/remote/connections')).toHaveLength(2);
});

test('does not overlap periodic requests and stops after unmount', async () => {
  let resolveConnections: (value: { data: typeof connections }) => void = () => { throw new Error('Missing resolver'); };
  const response = new Promise<{ data: typeof connections }>(resolve => { resolveConnections = resolve; });
  get.mockImplementation(async url => url === '/api/processes' ? { data: [] } : response);
  await renderSidebar();
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS * 3); });
  expect(get.mock.calls.filter(([url]) => url === '/api/remote/connections')).toHaveLength(1);
  resolveConnections({ data: [] });
  await flush();
  await act(async () => { root.unmount(); });
  root = createRoot(container);
  const requestCount = get.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await changeConnections();
  expect(get.mock.calls).toHaveLength(requestCount);
});

test('ignores an old-session completion after logout and aborts its requests', async () => {
  let resolveOld: (value: { data: typeof remoteProcesses }) => void = () => { throw new Error('Missing resolver'); };
  const oldResponse = new Promise<{ data: typeof remoteProcesses }>(resolve => { resolveOld = resolve; });
  localStorage.setItem('ezpm2_token', 'first-session');
  get.mockImplementation(async url => {
    if (url === '/api/processes') return { data: [] };
    if (url === '/api/remote/connections') return { data: [{ ...connection, connected: true }] };
    return oldResponse;
  });
  await renderSidebar();
  expandRemote();
  await act(async () => {
    localStorage.removeItem('ezpm2_token');
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
  });
  resolveOld({ data: [process] });
  await flush();
  expect(container.textContent).not.toContain(process.name);
  const remoteRequest = get.mock.calls.find(([url]) => url === `/api/remote/${REMOTE_ID}/processes`);
  expect(remoteRequest?.[1]?.signal?.aborted).toBe(true);
});

test('refreshes the mounted sidebar and allows a null-session Connect after removing password protection', async () => {
  localStorage.setItem('ezpm2_token', 'first-session');
  const oldResponse = deferredConnection();
  post.mockImplementationOnce(async () => oldResponse.promise).mockImplementationOnce(async () => {
    connections = [{ ...connection, connected: true }];
    return { data: { success: true } };
  });
  await renderSidebar();
  act(() => { connectButton().click(); });
  const oldSignal = post.mock.calls[0][2]?.signal;
  const requestCount = get.mock.calls.length;
  const changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  try {
    await act(async () => {
      clearToken();
      notifyAuthConfigChanged({ passwordSet: false, pinSet: false, autoLockMinutes: 0 });
    });
    await flush();
    expect(localStorage.getItem('ezpm2_token')).toBeNull();
    expect(oldSignal?.aborted).toBe(true);
    expect(get.mock.calls.length).toBeGreaterThan(requestCount);
    expect(container.textContent).toContain('nav.localServer');
    expect(container.textContent).toContain(connection.name);
    expect(connectButton().disabled).toBe(false);
    oldResponse.resolve({ data: { success: true } });
    await flush();
    expect(changed).not.toHaveBeenCalled();
    act(() => { connectButton().click(); });
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(process.name);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
    await flush();
    expect(container.textContent).toContain(process.name);
  } finally {
    window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  }
});

test('ignores a pre-removal process read and fetches new process groups after password protection is disabled', async () => {
  localStorage.setItem('ezpm2_token', 'first-session');
  connections = [{ ...connection, connected: true }];
  let resolveOld: (value: { data: typeof remoteProcesses }) => void = () => { throw new Error('Missing resolver'); };
  const oldResponse = new Promise<{ data: typeof remoteProcesses }>(resolve => { resolveOld = resolve; });
  let firstRemoteRead = true;
  get.mockImplementation(async url => {
    if (url === '/api/processes') return { data: [] };
    if (url === '/api/remote/connections') return { data: connections.map(item => ({ ...item })) };
    if (url === `/api/remote/${REMOTE_ID}/processes`) {
      if (firstRemoteRead) {
        firstRemoteRead = false;
        return oldResponse;
      }
      return { data: [{ ...process, name: 'current-worker' }] };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  await renderSidebar();
  expandRemote();
  await act(async () => {
    clearToken();
    notifyAuthConfigChanged({ passwordSet: false, pinSet: false, autoLockMinutes: 0 });
  });
  const oldSignal = get.mock.calls.find(([url]) => url === `/api/remote/${REMOTE_ID}/processes`)?.[1]?.signal;
  expect(oldSignal?.aborted).toBe(true);
  resolveOld({ data: [process] });
  await flush();
  expect(container.textContent).not.toContain(process.name);
  expect(container.textContent).toContain('current-worker');
  expect(get.mock.calls.filter(([url]) => url === `/api/remote/${REMOTE_ID}/processes`)).toHaveLength(2);
});

test.each(['logout', 'authentication required', 'password enforcement enabled'])('keeps the sidebar suspended after %s', async reason => {
  localStorage.setItem('ezpm2_token', 'first-session');
  const response = deferredConnection();
  post.mockImplementation(async () => response.promise);
  await renderSidebar();
  act(() => { connectButton().click(); });
  await act(async () => {
    if (reason === 'authentication required') window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    else clearToken();
    if (reason === 'password enforcement enabled') notifyAuthConfigChanged({ passwordSet: true, pinSet: false, autoLockMinutes: 0 });
  });
  await flush();
  expect(post.mock.calls[0][2]?.signal?.aborted).toBe(true);
  expect(container.textContent).not.toContain(connection.name);
  const requestCount = get.mock.calls.length;
  await changeConnections({ connectionId: REMOTE_ID, connected: true });
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS * 2); });
  for (const detail of [null, undefined, {}, { passwordSet: true }, { passwordSet: 'false' }]) {
    await act(async () => { window.dispatchEvent(new CustomEvent(AUTH_CONFIG_CHANGED_EVENT, { detail })); });
  }
  response.resolve({ data: { success: true } });
  await flush();
  expect(get.mock.calls).toHaveLength(requestCount);
  expect(container.textContent).not.toContain(connection.name);
  expect(container.textContent).not.toContain(process.name);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('reports a polling outage once and recovers on the next refresh', async () => {
  get.mockRejectedValue(new Error('Connection unavailable'));
  await renderSidebar();
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await flush();
  expect(errors).toHaveBeenCalledTimes(2);
  get.mockImplementation(async url => ({ data: url === '/api/remote/connections' ? connections : [] }));
  await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
  await flush();
  expect(container.textContent).toContain(connection.name);
});

test('offers Connect for a disconnected server even with its process tree collapsed', async () => {
  await renderSidebar();
  const header = Array.from(container.querySelectorAll('button')).find(button => button.textContent === connection.name);
  expect(header?.getAttribute('aria-expanded')).toBe('false');
  expect(connectButton().textContent).toBe('sidebar.connect');
  expect(connectButton().disabled).toBe(false);
  expect(connectButton().parentElement?.querySelector('button button')).toBeNull();
  expect(connectButton().className).toContain('focus-visible:outline');
  connections = [{ ...connection, connected: true }];
  await changeConnections();
  expect(container.querySelector('button[aria-label^="sidebar.connectTo"]')).toBeNull();
  connections = [];
  await changeConnections();
  expect(container.querySelector('button[aria-label^="sidebar.connectTo"]')).toBeNull();
});

test('connects with the existing API and immediately expands and refreshes the process list', async () => {
  post.mockImplementation(async () => {
    connections = [{ ...connection, connected: true }];
    return { data: { success: true } };
  });
  const changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  try {
    await renderSidebar();
    act(() => { connectButton().click(); });
    await flush();
    expect(post).toHaveBeenCalledWith(`/api/remote/${encodeURIComponent(REMOTE_ID)}/connect`, undefined, {
      signal: expect.any(AbortSignal),
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ connectionId: REMOTE_ID, connected: true });
    expect(container.textContent).toContain(process.name);
    expect(container.textContent).not.toContain('sidebar.notConnected');
    expect(container.querySelector('button[aria-label^="sidebar.connectTo"]')).toBeNull();
    const headers = Array.from(container.querySelectorAll('button')).filter(button => [connection.name, 'nav.localServer'].includes(button.textContent ?? ''));
    expect(headers.map(button => button.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
  } finally {
    window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  }
});

test('disables Connect while pending and ignores duplicate clicks before the state render', async () => {
  const response = deferredConnection();
  post.mockImplementation(async () => response.promise);
  await renderSidebar();
  const button = connectButton();
  act(() => { button.click(); button.click(); });
  expect(post).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe('sidebar.connecting');
  expect(button.getAttribute('aria-label')).toBe(`sidebar.connectingTo ${connection.name}`);
  expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(button.querySelector('svg')?.getAttribute('class')).toContain('motion-reduce:animate-none');
  response.resolve({ data: { success: true } });
  await flush();
  expect(connectButton().disabled).toBe(false);
});

test('shows an inline error and allows a successful retry', async () => {
  post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: 'SSH authentication failed' } } });
  await renderSidebar();
  act(() => { connectButton().click(); });
  await flush();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('SSH authentication failed');
  expect(connectButton().disabled).toBe(false);
  expect(errors).not.toHaveBeenCalled();
  post.mockImplementation(async () => {
    connections = [{ ...connection, connected: true }];
    return { data: { success: true } };
  });
  act(() => { connectButton().click(); });
  await flush();
  expect(post).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain(process.name);
});

test.each([null, { success: false }, {}, { success: 'true' }])('treats invalid success response %p as a boundary failure', async data => {
  post.mockImplementation(async () => ({ data }));
  const changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  try {
    await renderSidebar();
    act(() => { connectButton().click(); });
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('sidebar.connectFailed');
    expect(connectButton().disabled).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  }
});

test('starts independent connection requests for different servers', async () => {
  const secondConnection = { ...connection, id: 'office-server', name: 'Office server' };
  connections = [connection, secondConnection];
  const response = deferredConnection();
  post.mockImplementation(async () => response.promise);
  await renderSidebar();
  act(() => { connectButton().click(); connectButton(secondConnection.name).click(); });
  expect(post.mock.calls.map(([url]) => url)).toEqual([
    `/api/remote/${encodeURIComponent(REMOTE_ID)}/connect`,
    `/api/remote/${encodeURIComponent(secondConnection.id)}/connect`,
  ]);
  expect(container.querySelectorAll('button[aria-label^="sidebar.connectingTo"]')).toHaveLength(2);
  response.reject(new Error('Connection unavailable'));
  await flush();
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
});

test.each(['logout', 'new session', 'delete', 'polled deletion', 'disconnect', 'unmount'])('aborts a pending Connect on %s and ignores its stale success', async reason => {
  localStorage.setItem('ezpm2_token', 'first-session');
  const response = deferredConnection();
  post.mockImplementation(async () => response.promise);
  await renderSidebar();
  act(() => { connectButton().click(); });
  const signal = post.mock.calls[0][2]?.signal;
  if (reason === 'logout' || reason === 'new session') {
    await act(async () => {
      if (reason === 'logout') localStorage.removeItem('ezpm2_token');
      else localStorage.setItem('ezpm2_token', 'next-session');
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
    });
  } else if (reason === 'delete') {
    connections = [];
    await changeConnections({ deletedConnectionId: REMOTE_ID });
  } else if (reason === 'polled deletion') {
    connections = [];
    await act(async () => { jest.advanceTimersByTime(REFRESH_MS); });
    await flush();
  } else if (reason === 'disconnect') {
    await changeConnections({ connectionId: REMOTE_ID, connected: false });
  } else {
    await act(async () => { root.unmount(); });
    root = createRoot(container);
  }
  const changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  try {
    expect(signal?.aborted).toBe(true);
    response.resolve({ data: { success: true } });
    await flush();
    expect(changed).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(process.name);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    if (reason === 'disconnect' || reason === 'new session') expect(connectButton().disabled).toBe(false);
  } finally {
    window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  }
});

test('does not let a superseded request reset a newer Connect attempt', async () => {
  const firstResponse = deferredConnection();
  const nextResponse = deferredConnection();
  post.mockImplementationOnce(async () => firstResponse.promise).mockImplementationOnce(async () => nextResponse.promise);
  await renderSidebar();
  act(() => { connectButton().click(); });
  await changeConnections({ connectionId: REMOTE_ID, connected: false });
  act(() => { connectButton().click(); });
  firstResponse.resolve({ data: { success: true } });
  await flush();
  expect(container.querySelector<HTMLButtonElement>('button[aria-label^="sidebar.connectingTo"]')?.disabled).toBe(true);
  nextResponse.reject(new Error('Second request failed'));
  await flush();
  expect(connectButton().disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Second request failed');
});

test('ignores a completion after token rotation without a session event and releases its pending state', async () => {
  localStorage.setItem('ezpm2_token', 'first-session');
  const response = deferredConnection();
  post.mockImplementation(async () => response.promise);
  await renderSidebar();
  act(() => { connectButton().click(); });
  localStorage.setItem('ezpm2_token', 'next-session');
  const changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  try {
    response.resolve({ data: { success: true } });
    await flush();
    expect(changed).not.toHaveBeenCalled();
    expect(connectButton().disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain(process.name);
  } finally {
    window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  }
});

test('keeps the disconnected server action accessible', async () => {
  await renderSidebar();
  const statusRow = connectButton().parentElement?.parentElement;
  if (!statusRow) throw new Error('Missing connection status row');
  jest.useRealTimers();
  const results = await run(statusRow, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
});

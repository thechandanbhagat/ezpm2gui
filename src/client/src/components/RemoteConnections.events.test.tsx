import 'whatwg-fetch';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { REMOTE_CONNECTIONS_CHANGED_EVENT } from '../utils/server-selection';

jest.doMock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.doMock('socket.io-client', () => ({ io: () => ({ on: jest.fn(), disconnect: jest.fn() }) }));
jest.doMock('./LogStatusBar', () => () => null);
jest.doMock('@mui/icons-material', () => Object.fromEntries([
  'Add', 'Delete', 'Edit', 'PlayArrow', 'Stop', 'Refresh', 'ExpandMore', 'ExpandLess', 'Visibility',
].map(name => [name, () => null])));
jest.doMock('@mui/material', () => {
  const element = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ...Object.fromEntries(['Box', 'Typography', 'Grid', 'Table', 'TableBody', 'TableCell', 'TableHead',
      'TableRow', 'Paper', 'Chip', 'Alert', 'CircularProgress', 'Tabs', 'Tab', 'DialogTitle',
      'DialogContent', 'DialogActions', 'FormControlLabel'].map(name => [name, element])),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
    IconButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
    TextField: () => <input />,
    Checkbox: () => <input type="checkbox" />,
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
    Collapse: ({ children, in: visible }: { children: React.ReactNode; in: boolean }) => visible ? <div>{children}</div> : null,
  };
});

const RemoteConnections: React.FC = require('./RemoteConnections').default;
const REMOTE_ID = '192.168.50.200-22-oll-dev';
let root: Root;
let container: HTMLDivElement;
let changed: Mock<void, [Event]>;
let connected: boolean;

beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  connected = false;
  changed = jest.fn();
  window.addEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  jest.spyOn(window, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url === '/api/remote/connections') return new Response(JSON.stringify([{ id: REMOTE_ID, name: 'Remote server', host: '192.168.50.200', port: 22, username: 'developer', connected }]));
    if (url.endsWith('/connect')) { connected = true; return new Response(JSON.stringify({ success: true })); }
    if (url.endsWith('/disconnect')) { connected = false; return new Response(JSON.stringify({ success: true })); }
    if (url.endsWith('/processes')) return new Response(JSON.stringify([]));
    if (url.endsWith('/system-info')) return new Response(JSON.stringify({ hostname: 'remote-server' }));
    throw new Error(`Unexpected URL: ${url}`);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  window.removeEventListener(REMOTE_CONNECTIONS_CHANGED_EVENT, changed);
  container.remove();
  jest.restoreAllMocks();
});

async function click(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => { button.click(); });
}

test('notifies mounted consumers immediately after successful connect and disconnect', async () => {
  await act(async () => { root.render(<RemoteConnections />); });
  await click('remoteConnections.connect');
  expect(changed).toHaveBeenCalledTimes(1);
  expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ connectionId: REMOTE_ID, connected: true });
  await click('remoteConnections.disconnect');
  expect(changed).toHaveBeenCalledTimes(2);
  expect((changed.mock.calls[1][0] as CustomEvent).detail).toEqual({ connectionId: REMOTE_ID, connected: false });
});

test('does not announce a failed connection as connected', async () => {
  await act(async () => { root.render(<RemoteConnections />); });
  jest.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Host unavailable' }), { status: 503 }));
  await click('remoteConnections.connect');
  expect(changed).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Host unavailable');
});

test('announces a connected server while its process details are still loading', async () => {
  await act(async () => { root.render(<RemoteConnections />); });
  let resolveProcesses: (response: Response) => void = () => { throw new Error('Missing resolver'); };
  const processResponse = new Promise<Response>(resolve => { resolveProcesses = resolve; });
  jest.spyOn(window, 'fetch').mockImplementation(async input => {
    if (String(input).endsWith('/processes')) return processResponse;
    return new Response(JSON.stringify({ hostname: 'remote-server' }));
  });
  await click('remoteConnections.connect');
  expect(changed).toHaveBeenCalledTimes(1);
  expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ connectionId: REMOTE_ID, connected: true });
  await act(async () => { resolveProcesses(new Response(JSON.stringify([]))); });
});

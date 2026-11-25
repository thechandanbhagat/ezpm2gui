import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextDecoder, TextEncoder } from 'util';
import { ACTIVE_SERVER_STORAGE_KEY } from './utils/server-selection';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('socket.io-client', () => ({ io: () => ({
  connected: false, on: jest.fn(), off: jest.fn(), connect: jest.fn(), disconnect: jest.fn(),
}) }));
jest.mock('react-i18next', () => {
  const t = key => key;
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) };
});
jest.mock('react-chartjs-2', () => ({ Line: () => null }));

// Exercise the routes, confirmations, and real page controls without rendering unrelated views.
for (const component of [
  'MainDashboard', 'ProcessDetailPage', 'DeployApplication', 'ModuleManagement', 'EcosystemGenerator',
  'ProcessConfiguration', 'LogStreamEnhanced', 'SidebarMenu', 'Settings', 'LoadBalancingGuide',
  'RemoteConnections', 'CronJobsPage', 'WhatsNew', 'StatusBar', 'LanguageSwitcher', 'Help',
]) {
  jest.doMock(`./components/${component}`, () => ({ __esModule: true, default: () => null }));
}
jest.doMock('./components/WhatsNewModal', () => ({
  __esModule: true, default: () => null, shouldShowWhatsNew: () => false, markWhatsNewSeen: () => {},
}));
jest.doMock('./components/LogAnalysisContext', () => ({ LogAnalysisProvider: ({ children }) => children }));
jest.doMock('./components/LogAnalysisSidebar', () => ({ LogAnalysisContent: ({ children }) => children }));

const App = require('./App').default;
const axios = require('axios').default;
const remoteId = 'prod/eu';
const remotePath = `/api/remote/${encodeURIComponent(remoteId)}`;
const remoteActions = `/api/remote/pm2/action/${encodeURIComponent(remoteId)}`;
const metrics = { loadAvg: [0, 0, 0], memory: { total: 1024, free: 512, used: 512 }, uptime: 10, cpus: 1 };
const worker = name => ({
  pm_id: 0, name, pid: 100, monit: { cpu: 0, memory: 1024 }, pm2_env: { namespace: 'default', status: 'online' },
});
let localWorker, remoteWorker, root, container;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, remoteId);
  localWorker = worker('local-worker');
  remoteWorker = worker('remote-worker');
  const cluster = name => ({ pm_id: 0, name, instances: 1, exec_mode: 'cluster_mode', isCluster: true });
  axios.get.mockReset().mockImplementation(async url => {
    switch (url) {
      case '/api/processes': return { data: [localWorker] };
      case '/api/metrics': return { data: metrics };
      case '/api/remote/connections': return { data: [{ id: remoteId, name: 'Production EU', connected: true }] };
      case `${remotePath}/processes`: return { data: [remoteWorker] };
      case `${remotePath}/cluster/0`: return { data: cluster(remoteWorker.name) };
      case '/api/cluster/0': return { data: cluster(localWorker.name) };
      default: throw new Error(`Unexpected read ${url}`);
    }
  });
  axios.post.mockReset().mockResolvedValue({ data: { success: true } });
  window.fetch = jest.fn(async () => ({ json: async () => ({ passwordSet: false, pinSet: false, autoLockMinutes: 0 }) }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

async function openPage(path) {
  window.history.replaceState(null, '', path);
  // root.render is the React DOM API and requires act to flush effects.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => root.render(<App />));
}

const metricsButton = title => container.querySelector(`main button[title="${title}"]`);
const button = label => [...container.querySelectorAll('button')].find(element => element.textContent === label);
async function click(element) {
  expect(element).toBeTruthy();
  await act(async () => element.click());
}

test('Metrics starts only the selected server’s process 0', async () => {
  localWorker.pm2_env.status = remoteWorker.pm2_env.status = 'stopped';
  await openPage('/metrics');
  await click(metricsButton('Start'));
  expect(axios.post.mock.calls).toEqual([[`${remoteActions}/start`, { processId: 0 }]]);
  await click(button('header.switchToLocal'));
  axios.post.mockClear();
  await click(metricsButton('Start'));
  expect(axios.post.mock.calls).toEqual([['/api/process/0/start']]);
});

test.each(['Restart', 'Stop', 'Delete'])('Metrics keeps %s on the confirmed server when both have process 0', async title => {
  const action = title.toLowerCase();
  await openPage('/metrics');
  expect(container.querySelector('main').textContent).toContain(remoteWorker.name);
  await click(metricsButton(title));
  expect(axios.post).not.toHaveBeenCalled();
  expect(container.textContent).toContain('remote-worker (#0 · Production EU)');

  await click(button('header.switchToLocal'));
  expect(container.querySelector('main').textContent).toContain(localWorker.name);
  await click(button('Confirm'));
  expect(axios.post.mock.calls).toEqual([[`${remoteActions}/${action}`, { processId: 0 }]]);
  axios.post.mockClear();
  await click(metricsButton(title));
  expect(container.textContent).toContain('local-worker (#0 · serverSwitcher.local)');
  await click(button('Confirm'));
  expect(axios.post.mock.calls).toEqual([[`/api/process/0/${action}`]]);
});

test('Cluster Management refreshes the server whose process 0 was reloaded', async () => {
  await openPage('/cluster');
  for (const [name, clusterPath, listPath] of [
    [remoteWorker.name, `${remotePath}/cluster/0`, `${remotePath}/processes`],
    [localWorker.name, '/api/cluster/0', '/api/processes'],
  ]) {
    const select = container.querySelector('main select');
    expect(select.value).toBe('');
    await act(async () => {
      select.value = '0';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('main tbody').textContent).toContain(name);
    axios.get.mockClear();
    axios.post.mockClear();
    await click(button('cluster.gracefulReload'));
    expect(axios.post.mock.calls.map(([url]) => url)).toEqual([`${clusterPath}/reload`]);
    const listReads = axios.get.mock.calls.map(([url]) => url)
      .filter(url => url === '/api/processes' || url === `${remotePath}/processes`);
    expect(listReads).toEqual([listPath]);
    if (name === remoteWorker.name) await click(button('header.switchToLocal'));
  }
});

test.each(['restart', 'stop'])('command palette keeps %s on the selected remote worker after switching hosts', async action => {
  const read = axios.get.getMockImplementation();
  remoteWorker.name = 'queue';
  axios.get.mockImplementation(async (url, config) => url === `${remotePath}/processes`
    ? { data: [remoteWorker, { ...remoteWorker, pm_id: 1 }] }
    : read(url, config));
  await openPage('/processes');
  await click(container.querySelector('button[aria-label="commandPalette.open"]'));
  const options = () => [...document.querySelectorAll('[role="option"]')];
  await click(options().find(element => element.textContent.includes('queue#1')));
  await click(options().find(element => element.textContent === `actions.${action}`));
  expect(axios.post).not.toHaveBeenCalled();
  expect(container.textContent).toContain('queue (#1 · Production EU)');
  await click(button('header.switchToLocal'));
  await click(button('Confirm'));
  expect(axios.post.mock.calls).toEqual([[`${remoteActions}/${action}`, { processId: 1 }]]);
});

test('canceling a command palette action leaves the process alone', async () => {
  await openPage('/processes');
  await click(container.querySelector('button[aria-label="commandPalette.open"]'));
  const options = () => [...document.querySelectorAll('[role="option"]')];
  await click(options().find(element => element.textContent.includes('remote-worker#0')));
  await click(options().find(element => element.textContent === 'actions.stop'));
  await click(button('Cancel'));
  expect(axios.post).not.toHaveBeenCalled();
});

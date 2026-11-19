import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import ClusterManagement from './ClusterManagement';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

const remoteId = 'east/production';
const localUrl = '/api/cluster/0';
const remoteUrl = '/api/remote/east%2Fproduction/cluster/0';
const localProcess = { pm_id: 0, name: 'local-worker', instances: 1, exec_mode: 'fork_mode', isCluster: false };
const remoteProcess = { ...localProcess, name: 'remote-worker', instances: 3, exec_mode: 'cluster_mode', isCluster: true };
let root, container, onRefresh;

const renderServer = async serverId => {
  const proc = serverId === 'local' ? localProcess : remoteProcess;
  // React DOM's root.render needs act to flush effects.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => root.render(
    <ClusterManagement key={serverId} serverId={serverId} processes={[proc]} onRefresh={onRefresh} />
  ));
};

const selectZero = async () => {
  const select = container.querySelector('select');
  await act(async () => {
    select.value = '0';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const clickButton = async label => {
  const button = [...container.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  await act(async () => button.click());
};

beforeEach(() => {
  jest.resetAllMocks();
  axios.get.mockImplementation(async url => {
    if (url === localUrl) return { data: localProcess };
    if (url === remoteUrl) return { data: remoteProcess };
    throw new Error(`Unexpected request to ${url}`);
  });
  axios.post.mockResolvedValue({ data: { success: true } });
  onRefresh = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('fetches details, scales, changes mode and reloads process 0 on the selected server', async () => {
  for (const [serverId, url, proc, mode] of [
    ['local', localUrl, localProcess, 'cluster'],
    [remoteId, remoteUrl, remoteProcess, 'fork'],
  ]) {
    await renderServer(serverId);
    expect(container.querySelector('select').value).toBe('');
    await selectZero();
    expect(container.querySelector('tbody').textContent).toContain(proc.name);
    await clickButton('+');
    await clickButton('cluster.scale');
    await clickButton(mode === 'fork' ? 'cluster.switchToFork' : 'cluster.switchToCluster');
    await clickButton('cluster.gracefulReload');

    expect(axios.get.mock.calls.map(([path]) => path)).toEqual([url, url, url]);
    expect(axios.post.mock.calls).toEqual([
      [`${url}/scale`, { instances: proc.instances + 1 }],
      [`${url}/exec-mode`, { mode }],
      [`${url}/reload`, undefined],
    ]);
    axios.get.mockClear();
    axios.post.mockClear();
  }
});

test('a local request completing after the switch leaves remote process 0 selected', async () => {
  let deliverLocalDetails;
  axios.get.mockImplementationOnce(() => new Promise(resolve => { deliverLocalDetails = resolve; }));
  await renderServer('local');
  await selectZero();
  await renderServer(remoteId);
  await selectZero();
  await act(async () => deliverLocalDetails({ data: localProcess }));

  expect(container.querySelector('tbody').textContent).toContain(remoteProcess.name);
  await clickButton('cluster.gracefulReload');
  expect(axios.post.mock.calls).toEqual([[`${remoteUrl}/reload`, undefined]]);
});

test('a completed action on the previous server does not refresh the current selection', async () => {
  let finishScale;
  axios.post.mockImplementationOnce(() => new Promise(resolve => { finishScale = resolve; }));
  await renderServer(remoteId);
  await selectZero();
  await clickButton('cluster.scale');
  await renderServer('local');
  await selectZero();
  await act(async () => finishScale({ data: { success: true } }));

  expect(onRefresh).not.toHaveBeenCalled();
  expect(axios.get.mock.calls.map(([url]) => url)).toEqual([remoteUrl, localUrl]);
  expect(container.querySelector('tbody').textContent).toContain(localProcess.name);
});

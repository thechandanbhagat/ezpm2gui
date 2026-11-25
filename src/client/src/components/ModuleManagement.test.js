import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import ModuleManagement from './ModuleManagement';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');
jest.mock('react-i18next', () => {
  const messages = require('../locales/en/translation.json');
  return { useTranslation: () => ({ t: (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  } }) };
});

const moduleName = '@thechandanbhagat/pm2-notifier';
const modulePath = '/api/modules/%40thechandanbhagat%2Fpm2-notifier';
const installedModule = { name: moduleName, version: '1.0.0', status: 'online' };
let root;
let container;
let onNotify;

const click = async element => { await act(async () => element.click()); };
const namedButton = name => container.querySelector(`button[aria-label="${name}"]`);
const textButton = label => [...container.querySelectorAll('button')].find(item => item.textContent.trim() === label);
const render = async () => {
  await act(async () => root.render(<ModuleManagement onNotify={onNotify} />));
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.resetAllMocks();
  axios.get.mockResolvedValue({ data: [] });
  axios.post.mockResolvedValue({ data: {} });
  axios.put.mockResolvedValue({ data: {} });
  axios.delete.mockResolvedValue({ data: {} });
  onNotify = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('installs the scoped package once, prevents duplicate requests through refresh, and then offers configuration', async () => {
  const install = deferred();
  const refresh = deferred();
  axios.post.mockReturnValueOnce(install.promise);
  axios.get.mockResolvedValueOnce({ data: [] }).mockReturnValueOnce(refresh.promise);
  await render();

  const installButton = namedButton('Install pm2-notifier');
  expect(installButton.disabled).toBe(false);
  await click(installButton);

  expect(axios.post).toHaveBeenCalledWith('/api/modules/install', { moduleName });
  expect(installButton.disabled).toBe(true);
  expect(installButton.getAttribute('aria-busy')).toBe('true');
  await click(installButton);
  await click(namedButton('Install pm2-logrotate'));
  expect(axios.post).toHaveBeenCalledTimes(1);

  await act(async () => install.resolve({ data: {} }));
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(installButton.disabled).toBe(true);
  await click(installButton);
  expect(axios.post).toHaveBeenCalledTimes(1);

  await act(async () => refresh.resolve({ data: [installedModule] }));
  expect(namedButton('Install pm2-notifier')).toBeNull();
  expect(namedButton('Configure pm2-notifier').disabled).toBe(false);
  expect(onNotify).toHaveBeenCalledWith(`Installed: ${moduleName}`, 'success');
});

test('reports an installation failure and allows the same scoped package to be retried', async () => {
  const install = deferred();
  axios.post.mockReturnValueOnce(install.promise);
  await render();

  await click(namedButton('Install pm2-notifier'));
  await act(async () => install.reject({ response: { data: { error: 'Registry unavailable' } } }));

  expect(onNotify).toHaveBeenCalledWith('Registry unavailable', 'error');
  expect(namedButton('Install pm2-notifier').disabled).toBe(false);
  expect(namedButton('Install pm2-notifier').getAttribute('aria-busy')).toBe('false');
  expect(axios.get).toHaveBeenCalledTimes(1);

  axios.get.mockResolvedValueOnce({ data: [installedModule] });
  await click(namedButton('Install pm2-notifier'));
  expect(axios.post).toHaveBeenNthCalledWith(2, '/api/modules/install', { moduleName });
  expect(namedButton('Configure pm2-notifier')).not.toBeNull();
});

test('configures and uninstalls an installed scoped module using encoded API paths', async () => {
  const config = { servername: 'production' };
  axios.get.mockImplementation(url => Promise.resolve({
    data: url === '/api/modules' ? [installedModule] : { config },
  }));
  await render();

  expect(namedButton('Install pm2-notifier')).toBeNull();
  await click(namedButton('Configure pm2-notifier'));
  expect(axios.get).toHaveBeenCalledWith(`${modulePath}/config`);
  expect(container.querySelector('input[placeholder="key"]').value).toBe('servername');
  expect(container.querySelector('input[placeholder="value"]').value).toBe('production');

  await click(textButton('save'));
  expect(axios.put).toHaveBeenCalledWith(`${modulePath}/config`, { config });

  await click(container.querySelector('button[title="Configure"]'));
  expect(axios.get).toHaveBeenLastCalledWith(`${modulePath}/config`);
  await click(textButton('cancel'));

  axios.get.mockResolvedValueOnce({ data: [] });
  await click(container.querySelector('button[title="Uninstall"]'));
  expect(axios.delete).toHaveBeenCalledWith(modulePath);
  expect(namedButton('Install pm2-notifier').disabled).toBe(false);
  expect(axios.post).not.toHaveBeenCalled();
});

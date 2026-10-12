import 'whatwg-fetch';
const response = (status, body) => ({ status, json: async () => body, clone: () => response(status, body) });
let auth, axios, transport, locked;
beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  transport = jest.fn(async () => response(200, {}));
  window.fetch = transport;
  auth = require('./auth');
  axios = require('axios');
  auth.installAuthInterceptors();
  locked = jest.fn();
  window.addEventListener(auth.AUTH_REQUIRED_EVENT, locked);
});
afterEach(() => window.removeEventListener(auth.AUTH_REQUIRED_EVENT, locked));

test('protected 401 locks once when several requests fail', async () => {
  auth.setToken('expired');
  transport.mockImplementation(async () => response(401, { authRequired: true }));
  await Promise.all([fetch('/api/processes'), fetch('/api/metrics')]);
  expect(auth.getToken()).toBeNull();
  expect(localStorage.getItem('ezpm2_unlocked')).toBeNull();
  expect(locked).toHaveBeenCalledTimes(1);
});

test.each(['/api/auth/verify', '/api/auth/pin/verify', '/api/auth/set', '/api/auth/remove'])(
  'credential errors from %s stay with the form', async url => {
    auth.setToken('valid');
    transport.mockResolvedValue(response(401, { success: false, error: 'Incorrect password' }));
    const result = await fetch(url, { method: 'POST' });
    expect((await result.json()).error).toBe('Incorrect password');
    expect(auth.getToken()).toBe('valid');
    expect(locked).not.toHaveBeenCalled();
  }
);

test('a delayed fetch failure cannot erase the newly issued token', async () => {
  auth.setToken('old');
  let rejectOldRequest;
  transport.mockImplementation(() => new Promise(resolve => { rejectOldRequest = resolve; }));
  const pending = fetch('/api/processes');
  auth.setToken('new');
  rejectOldRequest(response(401, { authRequired: true }));
  await pending;
  expect(auth.getToken()).toBe('new');
  expect(locked).not.toHaveBeenCalled();
});

test('first-password setup defers polling failures until the token arrives', async () => {
  transport.mockResolvedValue(response(401, { authRequired: true }));
  await auth.withAuthSessionChange(async () => {
    await fetch('/api/processes');
    expect(locked).not.toHaveBeenCalled();
    auth.setToken('first-session');
  });
  expect(auth.getToken()).toBe('first-session');
  expect(localStorage.getItem('ezpm2_unlocked')).toBe('1');
  expect(locked).not.toHaveBeenCalled();
});

test('a failed password save still locks an invalid session', async () => {
  auth.setToken('expired');
  transport.mockResolvedValue(response(401, { authRequired: true }));
  await expect(auth.withAuthSessionChange(async () => {
    await fetch('/api/processes');
    throw new Error('Save failed');
  })).rejects.toThrow('Save failed');
  expect(auth.getToken()).toBeNull();
  expect(locked).toHaveBeenCalledTimes(1);
});

test('Axios ignores stale failures but locks on a current-session denial', async () => {
  auth.setToken('old');
  let rejectRequest, started;
  const ready = new Promise(resolve => { started = resolve; });
  axios.defaults.adapter = config => new Promise((_, reject) => {
    rejectRequest = () => reject({ config, response: { status: 401, data: { authRequired: true } } });
    started();
  });
  const pending = axios.get('/api/processes').catch(error => error);
  await ready;
  auth.setToken('new');
  rejectRequest();
  await pending;
  expect(auth.getToken()).toBe('new');
  expect(locked).not.toHaveBeenCalled();
  axios.defaults.adapter = async config => {
    throw { config, response: { status: 401, data: { authRequired: true } } };
  };
  await axios.get('/api/processes').catch(() => {});
  expect(auth.getToken()).toBeNull();
  expect(locked).toHaveBeenCalledTimes(1);
});

test('non-API and external failures neither receive nor clear the app token', async () => {
  auth.setToken('private-session');
  transport.mockResolvedValue(response(401, { authRequired: true }));
  for (const url of ['https://elsewhere.example/api/data', '/apiary']) {
    await fetch(url);
    expect(transport.mock.calls.at(-1)[1]?.headers?.get('Authorization')).toBeUndefined();
  }
  axios.defaults.adapter = async config => {
    expect(config.headers.get('Authorization')).toBeUndefined();
    throw { config, response: { status: 401, data: { authRequired: true } } };
  };
  await axios.get('https://elsewhere.example/api/data').catch(() => {});
  expect(auth.getToken()).toBe('private-session');
  expect(locked).not.toHaveBeenCalled();
});

test('installing interceptors twice does not wrap fetch twice', () => {
  const wrapped = window.fetch;
  auth.installAuthInterceptors();
  expect(window.fetch).toBe(wrapped);
});

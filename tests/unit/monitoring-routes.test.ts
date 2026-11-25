import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import type { MonitoringConfig, MonitoringSnapshot, MonitoringTarget } from '../../src/server/services/monitoring-types';

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-monitoring-routes-'));
  const previousConfig = process.env.EZPM2GUI_CONFIG_DIR;
  process.env.EZPM2GUI_CONFIG_DIR = directory;
  await fs.writeFile(path.join(directory, '.ezpm2gui-migration-complete'), 'test');
  const { createMonitoringRouter, guardMonitoringAccess, monitoringBodyError } = await import('../../src/server/routes/monitoring');
  const { MonitoringService } = await import('../../src/server/services/MonitoringService');
  const { requireAuth } = await import('../../src/server/middleware/requireAuth');
  const { saveAuthConfig, removeAuthConfig } = await import('../../src/server/utils/auth-state');
  const { issueToken, revokeAllTokens } = await import('../../src/server/utils/auth-tokens');

  const targets: MonitoringTarget[] = [{ connectionId: 'local', name: 'Local server', connected: true,
    processes: [{ id: 0, name: 'api', status: 'online', cpu: 1, memoryMb: 32, restarts: 0 }] }];
  let updates = 0;
  let targetCalls = 0;
  let unknownFailure = false;
  const monitoring = new MonitoringService({ filePath: path.join(directory, 'monitoring.json'),
    collectTargets: async () => { targetCalls++; return targets; } });
  let snapshot: MonitoringSnapshot = monitoring.getSnapshot();
  const initialConfig: MonitoringConfig = snapshot.config;
  const service = {
    getSnapshot: () => {
      if (unknownFailure) throw new Error('secret webhook token and private server path');
      return monitoring.getSnapshot();
    },
    updateConfig: (config: MonitoringConfig) => {
      updates++;
      snapshot = monitoring.updateConfig(config);
      return snapshot;
    },
    getTargets: () => monitoring.getTargets(),
  };
  const app = express();
  // Match the application's upstream parser and real token authentication boundary.
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/monitoring', createMonitoringRouter(service));
  app.use('/api/monitoring', monitoringBodyError);
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api/monitoring`;
  const request = (route = '', options: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }>((resolve, reject) => {
      const payload = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const headers = { ...(payload === undefined ? {} : {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
      }), ...options.headers };
      // Raw HTTP preserves custom Host headers for the DNS rebinding boundary tests.
      const req = http.request(`${base}${route}`, { method: options.method || 'GET', headers }, response => {
        let text = '';
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode!, headers: response.headers, body: JSON.parse(text) }); }
          catch (error) { reject(error); }
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  const put = (body: unknown, headers?: Record<string, string>) => request('/config', { method: 'PUT', body, headers });

  try {
    const initial = await request();
    assert.equal(initial.status, 200);
    assert.equal(initial.headers['cache-control'], 'no-store');
    assert.deepEqual(initial.body, snapshot);
    const available = await request('/targets');
    assert.equal(available.status, 200);
    assert.equal(available.headers['cache-control'], 'no-store');
    assert.deepEqual(available.body, targets);

    const saved = await put(initialConfig, { Origin: `http://localhost:${port + 1}` });
    assert.equal(saved.status, 200, 'loopback development origins can save configuration');
    assert.equal(saved.body.config.revision, 1);
    assert.equal(saved.headers['cache-control'], 'no-store');
    const conflict = await put(initialConfig);
    assert.equal(conflict.status, 409, 'stale revision errors are preserved');
    assert.match(conflict.body.error, /reload|changed|revision/i);
    assert.equal(snapshot.config.revision, 1, 'conflict does not replace the saved configuration');
    const invalid = await put({ revision: 1 });
    assert.equal(invalid.status, 400, 'service validation errors are preserved');
    assert.equal(typeof invalid.body.error, 'string');
    assert.equal(invalid.headers['cache-control'], 'no-store');
    const callsBeforeRejections = updates;
    assert.equal((await put([])).status, 400);
    assert.equal((await put(null)).status, 400);
    assert.equal((await put('invalid')).status, 400);
    const malformed = await request('/config', { method: 'PUT', rawBody: '{"secret":"private-token",' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(malformed.body).includes('private-token'), 'parser errors do not echo request contents');
    const tooLarge = await request('/config', { method: 'PUT', body: { value: 'x'.repeat(110000) } });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.headers['cache-control'], 'no-store');
    assert.equal((await put(snapshot.config, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('/config', { method: 'PUT' })).status, 415);

    for (const headers of [
      { Origin: 'https://unrelated.example' },
      { Origin: 'null' },
      { Origin: `file://localhost:${port}` },
      { Host: 'rebound.example', Origin: 'http://rebound.example' },
      { Host: 'invalid@localhost' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const denied = await put(snapshot.config, headers);
      assert.equal(denied.status, 403);
      assert.equal(denied.headers['cache-control'], 'no-store');
    }
    assert.equal((await request('', { headers: { Host: 'rebound.example' } })).status, 403);
    assert.equal((await request('/targets', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal(updates, callsBeforeRejections, 'invalid bodies and origins do not reach configuration mutation');
    assert.equal(targetCalls, 1, 'denied discovery does not reach the target collector');

    // Exercise the actual peer address separately; forwarded headers cannot turn a remote peer into loopback.
    const access = (remoteAddress: string, host: string, password = false, extraHeaders: Record<string, string> = {}) => {
      let status = 0;
      let allowed = false;
      const headers: Record<string, string> = { host, ...extraHeaders };
      const req = { method: 'GET', socket: { remoteAddress }, get: (key: string) => headers[key] } as unknown as Request;
      const res = { status(code: number) { status = code; return this; }, json() {} } as unknown as Response;
      guardMonitoringAccess(() => password)(req, res, (() => { allowed = true; }) as NextFunction);
      return { status, allowed };
    };
    assert.deepEqual(access('192.0.2.1', 'localhost', false, { 'x-forwarded-for': '127.0.0.1' }), { status: 403, allowed: false });
    assert.deepEqual(access('127.0.0.1', 'remote.example'), { status: 403, allowed: false });
    assert.deepEqual(access('::1', '[::1]:3001'), { status: 0, allowed: true });
    assert.deepEqual(access('::ffff:127.0.0.1', 'localhost'), { status: 0, allowed: true });
    assert.deepEqual(access('192.0.2.1', 'gui.example', true, { origin: 'https://gui.example' }), { status: 0, allowed: true });

    unknownFailure = true;
    const failed = await request();
    assert.equal(failed.status, 500);
    assert.equal(failed.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(failed.body).includes('secret'));
    assert.ok(!JSON.stringify(failed.body).includes('private'));
    unknownFailure = false;

    saveAuthConfig({ hash: 'synthetic-hash', salt: 'synthetic-salt' });
    const token = issueToken();
    const protectedHeaders = { Host: 'gui.example', Origin: 'https://gui.example' };
    const updatesBeforeAuth = updates;
    for (const route of ['', '/targets']) {
      assert.equal((await request(route, { headers: protectedHeaders })).status, 401);
      assert.equal((await request(route, { headers: { ...protectedHeaders, Authorization: 'Bearer invalid' } })).status, 401);
    }
    assert.equal((await put(snapshot.config, protectedHeaders)).status, 401);
    assert.equal(updates, updatesBeforeAuth, 'missing tokens cannot mutate protected monitoring');
    const authorizedHeaders = { ...protectedHeaders, Authorization: `Bearer ${token}` };
    assert.equal((await request('', { headers: authorizedHeaders })).status, 200);
    assert.deepEqual((await request('/targets', { headers: authorizedHeaders })).body, targets);
    assert.equal((await put(snapshot.config, authorizedHeaders)).status, 200);
    assert.equal((await put(snapshot.config, { ...authorizedHeaders, Origin: 'https://evil.example' })).status, 403,
      'valid authentication does not bypass the origin boundary');
    assert.equal((await put(snapshot.config, { ...authorizedHeaders, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    revokeAllTokens();
    assert.equal((await request('', { headers: authorizedHeaders })).status, 401);
    console.log('monitoring route tests passed (authentication, access boundaries, revisions, JSON validation, safe errors, targets)');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    removeAuthConfig();
    revokeAllTokens();
    if (previousConfig === undefined) delete process.env.EZPM2GUI_CONFIG_DIR;
    else process.env.EZPM2GUI_CONFIG_DIR = previousConfig;
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

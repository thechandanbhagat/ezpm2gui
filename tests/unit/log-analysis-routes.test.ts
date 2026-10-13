import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import express from 'express';
import http from 'http';
import { EventEmitter } from 'events';

const MAX_CONNECTION_ID_LENGTH = 128;
const TEST_SSH_PORT = 22;
const REMOTE_HOSTS = ['192.0.2.10', 'pm2.example.test', '2001:db8::10'] as const;
const INVALID_CONNECTION_IDS: unknown[] = [
  '', null, 0, true, {}, [], '../remote', 'remote\\server', 'remote server',
  ' remote', 'remote ', 'remote\n', 'remote\r', 'remote\t', 'remote\0',
  'a'.repeat(MAX_CONNECTION_ID_LENGTH + 1),
];

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-analysis-routes-'));
  const previousConfig = process.env.EZPM2GUI_CONFIG_DIR;
  const previousPm2Home = process.env.PM2_HOME;
  process.env.EZPM2GUI_CONFIG_DIR = directory;
  process.env.PM2_HOME = path.join(directory, 'pm2');
  // Isolate both configuration and PM2 from the developer's real processes/credentials.
  await fs.writeFile(path.join(directory, '.ezpm2gui-migration-complete'), 'test');
  const { createLogAnalysisRouter } = await import('../../src/server/routes/logAnalysis');
  const { LogAnalysisError } = await import('../../src/server/services/LogAnalysisService');
  const { collectLogAnalysisSnapshot, readLocalLogTail, splitLogTail, quoteRemoteLogPath, validateSnapshotSelection } =
    await import('../../src/server/services/LogAnalysisSnapshot');
  const { RemoteConnection, remoteConnectionManager } = await import('../../src/server/utils/remote-connection');
  const remoteConnectionIds = REMOTE_HOSTS.map(host => remoteConnectionManager.createConnection({
    host, port: TEST_SSH_PORT, username: 'test_user',
  }));
  let passwordConfigured = false;
  let snapshotCalls = 0;
  let providerRefreshCalls = 0;
  let analyzeCalls = 0;
  let aborted = false;
  const collectedConnectionIds: (string | undefined)[] = [];
  const snapshot = {
    processId: 0, processName: 'test', source: 'local' as const,
    logs: [{ stream: 'stderr' as const, message: 'ENOENT: missing config\n    at loadConfig (app.js:5)' }],
  };
  const app = express();
  app.use(express.json());
  app.use('/api/log-analysis', createLogAnalysisRouter({
    passwordConfigured: () => passwordConfigured,
    providers: async () => [{ id: 'ollama', name: 'Ollama', available: false, kind: 'local' as const }],
    refreshProviders: async () => {
      providerRefreshCalls++;
      return [{ id: 'codex', name: 'Codex', available: true, kind: 'cloud' as const }];
    },
    snapshot: async selection => {
      snapshotCalls++;
      assert.equal(selection.processId, 0);
      collectedConnectionIds.push(selection.connectionId);
      return { snapshot, redactionCount: 0, truncated: false, warnings: [] };
    },
    analyze: async (input, signal) => {
      analyzeCalls++;
      if (input.provider === 'delay') return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new LogAnalysisError('Cancelled', 499));
        }, { once: true });
      });
      if (input.provider === 'failure') throw new Error('secret application path and token');
      if (input.allowCloud !== true) throw new LogAnalysisError('Confirm cloud processing.', 400);
      return { provider: input.provider, analysis: 'Suspected missing config; see line 1.', lineCount: 1,
        redactionCount: 0, truncated: false };
    },
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api/log-analysis`;
  const post = (route: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    // http.request preserves custom Host; Fetch normalizes it in newer Node versions.
    const request = http.request(`${base}/${route}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach(header => responseHeaders.append(name, header));
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        resolve(new Response(text, { status: response.statusCode, headers: responseHeaders }));
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(payload);
  });
  try {
    const providerResponse = await fetch(`${base}/providers`);
    assert.equal(providerResponse.status, 200);
    assert.equal(providerResponse.headers.get('cache-control'), 'no-store');
    assert.equal((await providerResponse.json()).providers[0].id, 'ollama');

    const refreshedProviders = await post('providers/refresh', {});
    assert.equal(refreshedProviders.status, 200);
    assert.equal(refreshedProviders.headers.get('cache-control'), 'no-store');
    assert.equal((await refreshedProviders.json()).providers[0].id, 'codex');
    assert.equal(providerRefreshCalls, 1);
    for (const invalidRefresh of [null, [], 'refresh', 1, { force: true }]) {
      assert.equal((await post('providers/refresh', invalidRefresh)).status, 400);
    }
    assert.equal((await post('providers/refresh', {}, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await post('providers/refresh', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await post('providers/refresh', {}, { Host: 'rebound.example' })).status, 403);
    assert.equal((await fetch(`${base}/providers/refresh`, { method: 'POST', body: '{}' })).status, 415);
    assert.equal(providerRefreshCalls, 1, 'Invalid and cross-origin refresh requests cannot invoke a provider scan');

    assert.equal((await post('snapshot', { processId: 0 }, { Origin: `http://localhost:${port + 1}` })).status, 200,
      'loopback development proxy origins are allowed');
    assert.equal((await post('snapshot', { processId: 0 }, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await post('snapshot', { processId: 0 }, { Host: 'rebound.example' })).status, 403,
      'an unprotected server cannot invoke agents through a rebound hostname');
    assert.equal((await post('snapshot', { processId: 0 }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await fetch(`${base}/snapshot`, { method: 'POST', body: JSON.stringify({ processId: 0 }) })).status, 415);
    assert.equal((await post('snapshot', { processId: '0' })).status, 400);
    assert.equal((await post('snapshot', { processId: -1 })).status, 400);
    for (const connectionId of INVALID_CONNECTION_IDS) {
      const response = await post('snapshot', { processId: 0, connectionId });
      assert.equal(response.status, 400, `invalid connection ID ${JSON.stringify(connectionId)}`);
      assert.equal((await response.json()).error, 'Select a valid remote connection.');
    }
    assert.equal(snapshotCalls, 1, 'invalid/cross-origin selections do not reach the collector');
    for (const connectionId of remoteConnectionIds) {
      assert.equal((await post('snapshot', { processId: 0, connectionId })).status, 200,
        `manager-generated connection ID ${connectionId} reaches the collector`);
      assert.equal(collectedConnectionIds[collectedConnectionIds.length - 1], connectionId,
        'connection IDs are passed unchanged to the collector');
    }

    const denied = await post('analyze', { provider: 'claude', snapshot, allowCloud: false });
    assert.equal(denied.status, 400);
    const success = await post('analyze', { provider: 'claude', snapshot, allowCloud: true });
    assert.equal(success.status, 200);
    assert.match((await success.json()).analysis, /line 1/);
    assert.equal((await post('analyze', [])).status, 400);
    const failed = await post('analyze', { provider: 'failure', snapshot });
    assert.equal(failed.status, 500);
    assert.ok(!JSON.stringify(await failed.json()).includes('secret'));
    assert.equal(analyzeCalls, 3);

    // Token validation happens in the parent /api middleware; this tests the extra origin boundary.
    passwordConfigured = true;
    assert.equal((await post('snapshot', { processId: 0 }, { Host: 'gui.example', Origin: 'https://gui.example' })).status, 200);
    assert.equal((await post('snapshot', { processId: 0 }, { Host: 'gui.example', Origin: 'https://evil.example' })).status, 403);

    const controller = new AbortController();
    const pending = fetch(`${base}/analyze`, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'delay', snapshot }) });
    await new Promise<void>(resolve => {
      const timer = setInterval(() => { if (analyzeCalls === 4) { clearInterval(timer); resolve(); } }, 5);
    });
    controller.abort();
    await assert.rejects(pending, /abort/i);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(aborted, 'disconnect cancels the backend provider operation');

    const logPath = path.join(directory, 'app.log');
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    lines.push('ENOENT: missing file', '    at loadConfig (app.js:5)', 'errno: -2', 'syscall: open');
    await fs.writeFile(logPath, `${lines.join('\n')}\n`);
    const tail = await readLocalLogTail(logPath);
    assert.equal(tail.lines.length, 200);
    assert.ok(tail.truncated);
    assert.deepEqual(tail.lines.slice(-4), lines.slice(-4), 'raw filesystem evidence and stack frames survive');
    await fs.writeFile(logPath, `${'x'.repeat(100000)}\nlast complete line\n`);
    assert.deepEqual((await readLocalLogTail(logPath)).lines, ['last complete line'], 'partial giant lines are dropped');
    assert.deepEqual(splitLogTail('partial\ncomplete\r\n', true).lines, ['complete']);
    assert.equal(quoteRemoteLogPath("/tmp/a'$(touch nope).log"), "'/tmp/a'\\''$(touch nope).log'");
    assert.throws(() => quoteRemoteLogPath('/tmp/\0.log'), /invalid log path/);
    assert.deepEqual(validateSnapshotSelection({ processId: 0, ignored: 'secret' }), { processId: 0 });
    for (const connectionId of [...remoteConnectionIds, 'a'.repeat(MAX_CONNECTION_ID_LENGTH)]) {
      assert.deepEqual(validateSnapshotSelection({ processId: 0, connectionId }), { processId: 0, connectionId });
    }
    for (const connectionId of INVALID_CONNECTION_IDS) {
      assert.throws(() => validateSnapshotSelection({ processId: 0, connectionId }), (error: unknown) =>
        error instanceof LogAnalysisError && error.status === 400 && error.message === 'Select a valid remote connection.');
    }
    for (const connectionId of remoteConnectionIds) {
      const remote = remoteConnectionManager.getConnection(connectionId)!;
      const originalPM2Command = remote.executePM2Command;
      const originalCommand = remote.executeCommand;
      const commands: string[] = [];
      (remote as any)._isConnected = true;
      remote.executePM2Command = async command => {
        assert.equal(command, 'jlist');
        return { stdout: JSON.stringify([{ pm_id: 0, name: 'remote-test', pm2_env: {
          status: 'online', pm_out_log_path: '/tmp/remote-test.log',
        } }]), stderr: '', code: 0 };
      };
      remote.executeCommand = async command => {
        commands.push(command);
        return { stdout: 'remote snapshot evidence\n', stderr: '', code: 0 };
      };
      try {
        const result = await collectLogAnalysisSnapshot({ processId: 0, connectionId });
        assert.equal(result.snapshot.source, 'remote');
        assert.equal(result.snapshot.processName, 'remote-test');
        assert.deepEqual(result.snapshot.logs, [{ stream: 'stdout', message: 'remote snapshot evidence' }]);
        assert.equal(commands.length, 1, 'the registered remote reads its log without opening SSH');
        assert.match(commands[0], /^tail -c \d+ -- '\/tmp\/remote-test\.log' 2>\/dev\/null$/);
      } finally {
        remote.executePM2Command = originalPM2Command;
        remote.executeCommand = originalCommand;
        (remote as any)._isConnected = false;
      }
    }

    const fakeRemote = () => {
      const channel: any = new EventEmitter();
      channel.stderr = new EventEmitter();
      channel.stdin = { write() {}, end() {} };
      let closed = false;
      channel.close = () => { closed = true; channel.emit('close'); };
      const remote = new RemoteConnection({ host: 'test.invalid', port: 22, username: 'test' });
      (remote as any)._isConnected = true;
      (remote as any).client = { exec(_command: string, callback: Function) { callback(null, channel); } };
      return { remote, channel, closed: () => closed };
    };
    const cancelledRemote = fakeRemote();
    const remoteController = new AbortController();
    const remotePending = cancelledRemote.remote.executeCommand('tail', undefined, {
      signal: remoteController.signal, timeoutMs: 1000, maxOutputBytes: 100, logCommand: false,
    });
    remoteController.abort();
    await assert.rejects(remotePending, /cancelled/);
    assert.ok(cancelledRemote.closed(), 'cancellation closes only the SSH command channel');
    const slowRemote = fakeRemote();
    await assert.rejects(slowRemote.remote.executeCommand('tail', undefined, { timeoutMs: 5, logCommand: false }), /timed out/);
    assert.ok(slowRemote.closed());
    const largeRemote = fakeRemote();
    const largePending = largeRemote.remote.executeCommand('tail', undefined, { maxOutputBytes: 4, logCommand: false });
    largeRemote.channel.emit('data', Buffer.from('12345'));
    await assert.rejects(largePending, /exceeded the limit/);
    assert.ok(largeRemote.closed());
    const successfulRemote = fakeRemote();
    const successfulPending = successfulRemote.remote.executeCommand('tail', undefined, { logCommand: false });
    successfulRemote.channel.emit('data', Buffer.from('ENOENT\n'));
    successfulRemote.channel.stderr.emit('data', Buffer.from('warning'));
    successfulRemote.channel.emit('exit', 0);
    successfulRemote.channel.emit('close');
    assert.deepEqual(await successfulPending, { stdout: 'ENOENT\n', stderr: 'warning', code: 0 });
    const unicodeRemote = fakeRemote();
    const unicodePending = unicodeRemote.remote.executeCommand('tail', undefined, { logCommand: false });
    const unicode = Buffer.from('配置失败 😀');
    unicodeRemote.channel.emit('data', unicode.subarray(0, 2));
    unicodeRemote.channel.emit('data', unicode.subarray(2));
    unicodeRemote.channel.emit('exit', 0);
    unicodeRemote.channel.emit('close');
    assert.equal((await unicodePending).stdout, '配置失败 😀', 'SSH byte chunks preserve complete UTF-8 evidence');
    console.log('log-analysis route tests passed (access boundaries, validation, cancellation, bounded raw evidence)');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (previousConfig === undefined) delete process.env.EZPM2GUI_CONFIG_DIR;
    else process.env.EZPM2GUI_CONFIG_DIR = previousConfig;
    if (previousPm2Home === undefined) delete process.env.PM2_HOME;
    else process.env.PM2_HOME = previousPm2Home;
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

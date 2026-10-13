import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import http from 'http';
import {
  AnalysisSnapshot, createLogAnalysisService, LogAnalysisError, prepareSnapshot, ProcessRequest,
  providerEnvironment, redactLogText, requestLoopbackJson, resolveInstalledExecutable, resolveNpmCliEntrypoint, runBoundedProcess
} from '../../src/server/services/LogAnalysisService';

const snapshot: AnalysisSnapshot = {
  processId: 7, processName: 'worker', source: 'local', status: 'online', restarts: 3,
  logs: [{ stream: 'stderr', message: 'Error ECONNREFUSED 127.0.0.1:5432' }]
};
const help = 'Cursor Claude Copilot Codex --safe-mode --tools --no-session-persistence --strict-mcp-config '
  + '--ignore-user-config --ignore-rules --ephemeral --sandbox --mode --print --output-format --trust '
  + '--available-tools --deny-tool --no-custom-instructions --disable-builtin-mcps --log-dir --log-level '
  + '--nowordwrap --keepalive --hidethinking';
const localTag = { name: 'llama:local', size: 123456, digest: 'a'.repeat(64), details: { format: 'gguf' } };
const localShow = { details: { format: 'gguf' }, model_info: { 'general.architecture': 'llama', 'general.parameter_count': 1000000 },
  modelfile: `FROM /Users/test/.ollama/models/blobs/sha256-${'b'.repeat(64)}` };
const executable = async (id: string) => ({ executable: { file: `/installed/${id}`, args: [] } });
const input = (provider = 'claude') => ({ provider, snapshot, allowCloud: true });

async function rejectsStatus(promise: Promise<unknown>, status: number, expression?: RegExp) {
  await assert.rejects(promise, error => error instanceof LogAnalysisError && error.status === status && (!expression || expression.test(error.message)));
}

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals: string[] = [];
  kill(signal: string) { this.signals.push(signal); setImmediate(() => this.emit('close', null)); return true; }
}

function fakeSpawn(callback: (child: FakeChild, options: SpawnOptions, args: string[]) => void) {
  let child: FakeChild;
  return {
    spawn: (_file: string, args: string[], options: SpawnOptions) => {
      child = new FakeChild();
      setImmediate(() => callback(child, options, args));
      return child as unknown as ChildProcess;
    },
    child: () => child
  };
}

const processRequest: ProcessRequest = { executable: { file: '/installed/test', args: ['fixed-entry.js'] }, args: ['--test'],
  cwd: os.tmpdir(), env: {}, timeoutMs: 1000, input: 'redacted prompt' };

async function main() {
  const secrets = [
    'DB_PASSWORD=hunter2', 'DATABASE_PASSWORD="two words"', 'MY_API_KEY=supersecret', 'AWS_SECRET_ACCESS_KEY=0123456789abcdef',
    '{"CLIENT_SECRET":"quoted-secret", "access_token":"access-value"}',
    'Authorization: Bearer auth-secret', 'Cookie: sid=cookie-secret; other=secret',
    'https://alice:uri-secret@example.com/db', `github_pat_${'z'.repeat(25)}`, `sk-proj-${'z'.repeat(25)}`,
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.signaturestring',
    '-----BEGIN RSA PRIVATE KEY-----\nprivate material\n-----END RSA PRIVATE KEY-----'
  ];
  for (const secret of secrets) {
    const redacted = redactLogText(secret);
    assert.ok(redacted.count > 0, `Expected redaction for ${secret.split(/[=:]/)[0]}`);
    assert.ok(redacted.text.includes('[REDACTED'));
    const again = redactLogText(redacted.text);
    assert.equal(again.text, redacted.text, 'Redaction must be idempotent for snapshot preview and dispatch');
    assert.equal(again.count, 0, 'Already-redacted placeholders must not be counted again');
  }
  assert.equal(redactLogText('\u001b[31mfailed\u001b[0m\u0000\u202e').text, 'failed');
  assert.equal(redactLogText('Error ECONNREFUSED 127.0.0.1:5432').count, 0);
  const prepared = prepareSnapshot({ ...snapshot, processName: 'password=process-secret',
    notes: ['Earlier stderr unavailable', 'DB_PASSWORD=notes-secret'], environment: { SECRET: 'must not be included' },
    logs: [{ stream: 'stderr', message: '-----BEGIN PRIVATE KEY-----' }, { stream: 'stdout', message: 'private material' },
      { stream: 'stderr', message: '-----END PRIVATE KEY-----' }, { stream: 'stdout', message: 'DB_PASSWORD=log-secret' }] });
  assert.equal(prepared.snapshot.logs.length, 4);
  assert.ok(!JSON.stringify(prepared).includes('private material'));
  assert.ok(!JSON.stringify(prepared).includes('log-secret'));
  assert.ok(!JSON.stringify(prepared).includes('notes-secret'));
  assert.ok(!('environment' in prepared.snapshot));
  assert.equal(prepared.redactionCount, 4);
  assert.deepEqual(prepareSnapshot({ ...snapshot, logs: [] }).snapshot.logs, []);
  assert.throws(() => prepareSnapshot({ ...snapshot, processId: '7' }), /valid process/);
  assert.throws(() => prepareSnapshot({ ...snapshot, logs: [{ stream: 'other', message: 'bad' }] }), /stdout\/stderr/);
  const limited = prepareSnapshot({ ...snapshot, logs: Array.from({ length: 500 }, (_, index) => ({ stream: 'stdout', message: `line ${index}` })) });
  assert.equal(limited.snapshot.logs.length, 400);
  assert.equal(limited.snapshot.logs[0].message, 'line 100');
  assert.equal(limited.truncated, true);
  assert.ok(limited.snapshot.notes.some(note => note.includes('Earlier history')));
  const byteLimited = prepareSnapshot({ ...snapshot, logs: [{ stream: 'stdout', message: '😀\\\t'.repeat(30000) }] });
  assert.ok(Buffer.byteLength(JSON.stringify(byteLimited.snapshot)) <= 60 * 1024);
  assert.ok(!byteLimited.snapshot.logs[0].message.includes('\ufffd'));
  assert.equal(byteLimited.truncated, true);
  assert.throws(() => prepareSnapshot({ ...snapshot, logs: [{ stream: 'stdout', message: 'x'.repeat(2 * 1024 * 1024 + 1) }] }), /too large/);

  const requests: ProcessRequest[] = [];
  const service = createLogAnalysisService({ resolveExecutable: executable, env: { CURSOR_API_KEY: 'test-cursor-key', COPILOT_GITHUB_TOKEN: 'test-copilot-token' },
    requestJson: async request => request.endpoint === '/api/tags' ? { models: [localTag] } : localShow,
    runProcess: async request => {
      if (request.args.includes('--help')) return help;
      requests.push(request);
      assert.equal(fs.existsSync(request.cwd), true);
      if (request.executable.file.endsWith('/cursor')) {
        assert.equal(request.input, '');
        assert.ok(!request.args.some(arg => arg.includes('ECONNREFUSED')));
        assert.ok(fs.readFileSync(path.join(request.cwd, 'snapshot.txt'), 'utf8').includes('ECONNREFUSED'));
        assert.ok(!request.env.CURSOR_CONFIG_DIR.startsWith(request.cwd), 'Authentication must stay outside the model workspace');
        const config = JSON.parse(fs.readFileSync(path.join(request.env.CURSOR_CONFIG_DIR, 'cli-config.json'), 'utf8'));
        assert.equal(config.sandbox.readBoundary, 'workspace');
        assert.deepEqual(config.permissions.deny, ['Shell(*)', 'Write(**)', 'WebFetch(*)', 'Mcp(*:*)']);
      } else {
        assert.ok(request.input.includes('untrusted data'));
        assert.ok(request.input.includes('"line":1'));
        assert.ok(!request.input.includes('dispatch-secret'));
      }
      return request.executable.file.endsWith('/claude') || request.executable.file.endsWith('/cursor')
        ? JSON.stringify({ result: 'Suspected database outage; line 1 contains ECONNREFUSED.', is_error: false }) : 'Suspected database outage at line 1.';
    } });
  await rejectsStatus(service.analyzeSnapshot({ ...input(), allowCloud: false }), 400, /cloud/);
  await rejectsStatus(service.analyzeSnapshot({ ...input(), allowCloud: 'true' as any }), 400, /cloud/);
  await rejectsStatus(service.analyzeSnapshot({ ...input(), model: 'model; rm -rf' }), 400, /model name/);
  await rejectsStatus(service.analyzeSnapshot({ ...input(), provider: '../../evil' }), 400);
  await rejectsStatus(service.analyzeSnapshot({ ...input(), snapshot: { ...snapshot, logs: [] } }), 400, /no log lines/);
  assert.equal(requests.length, 0, 'Invalid inputs and missing cloud consent must never invoke inference');
  for (const provider of ['claude', 'codex', 'cursor', 'copilot']) {
    const result = await service.analyzeSnapshot({ ...input(provider), model: 'safe-model', snapshot: { ...snapshot,
      logs: [{ stream: 'stderr', message: 'Error ECONNREFUSED; DB_PASSWORD=dispatch-secret' }] } });
    assert.equal(result.provider, provider);
    assert.equal(result.model, 'safe-model');
    assert.equal(result.lineCount, 1);
    assert.equal(result.redactionCount, 1);
    assert.equal(fs.existsSync(requests[requests.length - 1].cwd), false, 'Temporary prompts/config must be removed');
  }
  const [claude, codex, cursor, copilot] = requests;
  assert.ok(claude.args.includes('--safe-mode') && claude.args.includes('--no-session-persistence'));
  assert.equal(claude.args[claude.args.indexOf('--tools') + 1], '');
  assert.ok(!claude.args.includes('--bare') && !claude.args.includes('--dangerously-skip-permissions'));
  assert.equal(codex.args[codex.args.length - 1], '-');
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral']) assert.ok(codex.args.includes(flag));
  for (const config of ['features.shell_tool=false', 'features.unified_exec=false', 'features.hooks=false', 'web_search="disabled"']) assert.ok(codex.args.includes(config));
  assert.equal(cursor.args[cursor.args.indexOf('--mode') + 1], 'ask');
  assert.equal(cursor.args[cursor.args.indexOf('--sandbox') + 1], 'enabled');
  assert.ok(!cursor.args.includes('--force'));
  assert.ok(copilot.args.includes('--deny-tool=read,shell,write,url,memory'));
  assert.ok(!copilot.args.includes('-p') && !copilot.args.includes('--allow-all-tools'));
  assert.equal(copilot.env.COPILOT_ALLOW_ALL, 'false');
  assert.ok(!copilot.env.COPILOT_HOME.startsWith(copilot.cwd));
  assert.equal(fs.existsSync(copilot.env.COPILOT_HOME), false, 'Temporary authentication settings must be cleaned up');
  assert.ok(copilot.args.includes('--no-remote-export'));
  const sanitizedEnv = providerEnvironment('copilot', { PATH: '/bin', HOME: '/home/user', GITHUB_TOKEN: 'auth-only',
    COPILOT_PLAN_THEN_AUTOPILOT: 'true', COPILOT_PROVIDER_API_KEY_COMMAND: 'dangerous', COPILOT_SKILLS_DIRS: '/untrusted',
    COPILOT_PROVIDERS_CONFIG: '/untrusted', COPILOT_ALLOW_ALL: 'true', NODE_OPTIONS: '--require /untrusted',
    SECRET_APPLICATION_PASSWORD: 'unrelated-secret' });
  assert.equal(sanitizedEnv.GITHUB_TOKEN, 'auth-only');
  assert.equal(sanitizedEnv.HOME, '/home/user');
  for (const key of ['COPILOT_PLAN_THEN_AUTOPILOT', 'COPILOT_PROVIDER_API_KEY_COMMAND', 'COPILOT_SKILLS_DIRS', 'COPILOT_PROVIDERS_CONFIG', 'NODE_OPTIONS', 'SECRET_APPLICATION_PASSWORD']) {
    assert.equal(sanitizedEnv[key], undefined);
  }
  assert.equal(sanitizedEnv.COPILOT_ALLOW_ALL, 'false');

  const unavailable = createLogAnalysisService({ resolveExecutable: executable, runProcess: async () => 'old help', env: {}, requestJson: async () => { throw new Error('offline'); } });
  const catalog = await unavailable.listProviders();
  assert.equal(catalog.length, 5);
  assert.ok(catalog.every(provider => !provider.available));
  assert.match(catalog.find(provider => provider.id === 'cursor').reason, /Update|not Cursor/);
  const installedWithoutKeys = createLogAnalysisService({ resolveExecutable: executable, runProcess: async () => help,
    env: {}, requestJson: async () => ({ models: [] }) });
  const withoutKeys = await installedWithoutKeys.listProviders();
  assert.ok(withoutKeys.filter(provider => ['claude', 'codex', 'cursor', 'copilot'].includes(provider.id)).every(provider => provider.available),
    'Installed supported agent CLIs must not require new API keys or token environment variables');
  await rejectsStatus(unavailable.analyzeSnapshot(input()), 503, /Update/);
  const missing = createLogAnalysisService({ resolveExecutable: async () => ({ reason: 'Install the CLI.' }) });
  await rejectsStatus(missing.analyzeSnapshot(input()), 503, /Install/);
  await rejectsStatus(createLogAnalysisService({ resolveExecutable: executable, runProcess: async request => request.args.includes('--help') ? help : '{bad json}' }).analyzeSnapshot(input()), 502, /invalid/);
  await rejectsStatus(createLogAnalysisService({ resolveExecutable: executable, runProcess: async request => request.args.includes('--help') ? help : '{"is_error":true,"result":"failed"}' }).analyzeSnapshot(input()), 502);

  const ollamaRequests: any[] = [];
  let ollamaInference = false;
  const ollama = createLogAnalysisService({ resolveExecutable: executable, env: {}, runProcess: async request => {
    if (request.args.includes('--help')) return help;
    ollamaInference = true;
    assert.deepEqual(request.args, ['run', localTag.name, '--nowordwrap', '--hidethinking', '--keepalive', '0']);
    assert.equal(request.env.OLLAMA_HOST, '127.0.0.1:11434');
    assert.equal(request.env.OLLAMA_NOHISTORY, '1');
    assert.ok(request.input.includes('ECONNREFUSED'));
    return 'Check database connectivity (line 1).';
  }, requestJson: async request => {
    ollamaRequests.push(request);
    if (request.endpoint === '/api/tags') return { models: [localTag] };
    if (request.endpoint === '/api/show') return localShow;
    throw new Error('Ollama inference must use the installed CLI');
  } });
  const localResult = await ollama.analyzeSnapshot({ ...input('ollama'), model: localTag.name, allowCloud: false });
  assert.equal(localResult.provider, 'ollama');
  assert.deepEqual(ollamaRequests.map(request => request.endpoint), ['/api/tags', '/api/show']);
  assert.equal(ollamaInference, true);
  const unsafeModels: Array<[any, any]> = [
    [{ ...localTag, remote_host: 'https://ollama.com' }, localShow],
    [localTag, { ...localShow, remote_model: 'remote-alias' }],
    [{ ...localTag, size: 0 }, localShow],
    [localTag, { details: { format: 'gguf' } }],
    [{ ...localTag, name: 'llama:cloud' }, localShow]
  ];
  for (const [tag, show] of unsafeModels) {
    let inference = false;
    const cloud = createLogAnalysisService({ resolveExecutable: executable, env: {}, runProcess: async request => {
      if (request.args.includes('--help')) return help;
      inference = true;
      return 'Should never run';
    }, requestJson: async request => {
      if (request.endpoint === '/api/chat') { inference = true; return {}; }
      return request.endpoint === '/api/tags' ? { models: [tag] } : show;
    } });
    await rejectsStatus(cloud.analyzeSnapshot({ ...input('ollama'), model: tag.name, allowCloud: false }), 400, /local|cloud/);
    assert.equal(inference, false, 'Cloud consent and local weight verification must precede inference');
  }
  let release: (text: string) => void;
  const busy = createLogAnalysisService({ resolveExecutable: executable, env: { GITHUB_TOKEN: 'test-token' }, runProcess: async request => {
    if (request.args.includes('--help')) return help;
    return new Promise<string>(resolve => { release = resolve; });
  } });
  const running = busy.analyzeSnapshot(input('copilot'));
  await rejectsStatus(busy.analyzeSnapshot(input()), 429);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release('Evidence at line 1.');
  await running;
  const retry = busy.analyzeSnapshot(input('copilot'));
  release = undefined;
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release('Evidence at line 1.');
  await retry;

  const success = fakeSpawn((child, options, args) => {
    assert.equal(options.shell, false);
    assert.deepEqual(args, ['fixed-entry.js', '--test']);
    const unicode = Buffer.from('Diagnosis 😀');
    child.stdout.write(unicode.subarray(0, unicode.length - 2));
    child.stdout.write(unicode.subarray(unicode.length - 2));
    child.emit('close', 0);
  });
  assert.equal(await runBoundedProcess(processRequest, success.spawn), 'Diagnosis 😀');
  const failure = fakeSpawn(child => child.emit('close', 1));
  await rejectsStatus(runBoundedProcess(processRequest, failure.spawn), 502, /sign-in/);
  const large = fakeSpawn(child => child.stdout.write('x'.repeat(1000)));
  await rejectsStatus(runBoundedProcess({ ...processRequest, maxOutputBytes: 16 }, large.spawn), 502, /too much output/);
  assert.ok(large.child().signals.includes('SIGTERM'));
  const slow = fakeSpawn(() => undefined);
  await rejectsStatus(runBoundedProcess({ ...processRequest, timeoutMs: 10 }, slow.spawn), 504, /timed out/);
  assert.ok(slow.child().signals.includes('SIGTERM'));
  const controller = new AbortController();
  const cancellable = fakeSpawn(() => controller.abort());
  await rejectsStatus(runBoundedProcess({ ...processRequest, signal: controller.signal }, cancellable.spawn), 499, /cancelled/);
  assert.ok(cancellable.child().signals.includes('SIGTERM'));
  let spawned = false;
  await rejectsStatus(runBoundedProcess({ ...processRequest, signal: controller.signal }, () => { spawned = true; throw new Error(); }), 499);
  assert.equal(spawned, false);

  // Native Windows tree termination is asynchronous: wait for taskkill, not just parent close.
  let taskkillStarted = 0;
  let taskkillFinished = 0;
  const windowsChild = new FakeChild();
  (windowsChild as any).pid = 4242;
  const windowsSpawn = (file: string, args: string[], options: SpawnOptions): ChildProcess => {
    if (file.endsWith('taskkill.exe')) {
      taskkillStarted++;
      assert.deepEqual(args, ['/PID', '4242', '/T', '/F']);
      assert.equal(options.shell, false);
      const killer = new FakeChild();
      setImmediate(() => windowsChild.emit('close', null));
      setTimeout(() => { taskkillFinished++; killer.emit('close', 0); }, 650);
      return killer as unknown as ChildProcess;
    }
    assert.equal(options.detached, false);
    return windowsChild as unknown as ChildProcess;
  };
  await rejectsStatus(runBoundedProcess({ ...processRequest, timeoutMs: 10 }, windowsSpawn, 'win32'), 504);
  assert.ok(taskkillStarted >= 1);
  assert.equal(taskkillFinished, taskkillStarted, 'Authentication cleanup must wait for every Windows tree-termination command');

  // Exercise a real wrapper spawning a descendant, without invoking any AI provider.
  if (process.platform !== 'win32') {
    let descendantPid: number;
    const spawnWithObservation = (file: string, args: string[], options: SpawnOptions) => {
      const child = spawn(file, args, options);
      child.stdout.on('data', data => { const found = data.toString().match(/descendant=(\d+)/); if (found) descendantPid = Number(found[1]); });
      return child;
    };
    const script = 'const {spawn}=require("child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"});console.log("descendant="+child.pid);setInterval(()=>{},1000);';
    await rejectsStatus(runBoundedProcess({ ...processRequest, executable: { file: process.execPath, args: [] }, args: ['-e', script], timeoutMs: 300 }, spawnWithObservation), 504);
    assert.ok(descendantPid > 0, 'The lifecycle test must create a real descendant');
    let alive = true;
    for (let attempts = 0; attempts < 40 && alive; attempts++) {
      try { process.kill(descendantPid, 0); await new Promise(resolve => setTimeout(resolve, 50)); }
      catch { alive = false; }
    }
    if (alive) process.kill(descendantPid, 'SIGKILL');
    assert.equal(alive, false, 'Cancelling the wrapper must terminate its descendant');

    const shutdownDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-shutdown-write-'));
    const lateWrite = 'const fs=require("fs");const dir=process.argv[1];process.on("SIGTERM",()=>setTimeout(()=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+"/auth.json","synthetic-credential");},50));console.log("ready");setInterval(()=>{},1000);';
    let began = false;
    const observeShutdown = (file: string, args: string[], options: SpawnOptions) => {
      const child = spawn(file, args, options);
      child.stdout.on('data', () => { began = true; });
      return child;
    };
    try {
      await rejectsStatus(runBoundedProcess({ ...processRequest, executable: { file: process.execPath, args: [] },
        args: ['-e', lateWrite, shutdownDirectory], timeoutMs: 300 }, observeShutdown), 504);
      assert.ok(began);
      fs.rmSync(shutdownDirectory, { recursive: true, force: true });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(fs.existsSync(shutdownDirectory), false, 'Provider termination must precede authentication cleanup; shutdown writes cannot recreate credentials');
    } finally { fs.rmSync(shutdownDirectory, { recursive: true, force: true }); }
  }
  const emptyPath = await resolveInstalledExecutable('copilot', process.platform, { PATH: '' });
  assert.equal(emptyPath.executable, undefined);
  const malicious = await resolveInstalledExecutable('$(touch bad)', process.platform, { PATH: process.env.PATH });
  assert.equal(malicious.executable, undefined);

  // Standard Windows npm shims are bypassed, never interpreted by cmd.exe.
  const npmFixture = await fs.promises.realpath(fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui npm $(literal)-')));
  try {
    const directory = path.join(npmFixture, 'copilot');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'index.js'), '// fixture entrypoint');
    const manifest = (name: string, bin: string) => fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, bin: { copilot: bin } }));
    manifest('@github/copilot', 'index.js');
    assert.deepEqual(await resolveNpmCliEntrypoint(directory, 'copilot', '@github/copilot'),
      { file: process.execPath, args: [fs.realpathSync(path.join(directory, 'index.js'))] });
    manifest('untrusted-package', 'index.js');
    assert.equal(await resolveNpmCliEntrypoint(directory, 'copilot', '@github/copilot'), undefined);
    fs.writeFileSync(path.join(npmFixture, 'outside.js'), '// must not execute');
    manifest('@github/copilot', '../outside.js');
    assert.equal(await resolveNpmCliEntrypoint(directory, 'copilot', '@github/copilot'), undefined);
    if (process.platform === 'win32') {
      const outsideDirectory = path.join(npmFixture, 'outside-directory');
      fs.mkdirSync(outsideDirectory);
      fs.writeFileSync(path.join(outsideDirectory, 'index.js'), '// must not execute');
      fs.symlinkSync(outsideDirectory, path.join(directory, 'linked-directory'), 'junction');
      manifest('@github/copilot', 'linked-directory/index.js');
    } else {
      fs.symlinkSync(path.join(npmFixture, 'outside.js'), path.join(directory, 'linked.js'));
      manifest('@github/copilot', 'linked.js');
    }
    assert.equal(await resolveNpmCliEntrypoint(directory, 'copilot', '@github/copilot'), undefined);
  } finally { fs.rmSync(npmFixture, { recursive: true, force: true }); }

  let httpDestroyed = false;
  const fakeHttp = (statusCode: number, respond: (response: PassThrough) => void) =>
    (options: http.RequestOptions, callback: (response: http.IncomingMessage) => void) => {
      assert.equal(options.hostname, '127.0.0.1');
      assert.equal(options.port, 11434);
      assert.equal(options.path, '/api/chat');
      assert.equal(options.method, 'POST');
      const request = new EventEmitter() as any;
      request.destroy = () => { httpDestroyed = true; };
      request.end = (body: string) => {
        assert.deepEqual(JSON.parse(body), { model: 'local', stream: false });
        setImmediate(() => {
          const response = new PassThrough() as any;
          response.statusCode = statusCode;
          callback(response);
          respond(response);
        });
      };
      return request as http.ClientRequest;
    };
  const httpRequest = { endpoint: '/api/chat' as const, body: { model: 'local', stream: false }, timeoutMs: 1000 };
  const httpResult = await requestLoopbackJson(httpRequest, fakeHttp(200, response => {
    const bytes = Buffer.from('{"message":{"content":"Diagnosis 😀"}}');
    const boundary = bytes.indexOf(Buffer.from('😀')) + 2;
    response.write(bytes.subarray(0, boundary));
    response.end(bytes.subarray(boundary));
  }));
  assert.equal(httpResult.message.content, 'Diagnosis 😀');
  await rejectsStatus(requestLoopbackJson(httpRequest, fakeHttp(307, response => response.end())), 503);
  await rejectsStatus(requestLoopbackJson(httpRequest, fakeHttp(200, response => response.end('not-json'))), 502);
  await rejectsStatus(requestLoopbackJson({ ...httpRequest, timeoutMs: 10 }, fakeHttp(200, () => undefined)), 504);
  assert.equal(httpDestroyed, true);
  const httpController = new AbortController();
  httpDestroyed = false;
  await rejectsStatus(requestLoopbackJson({ ...httpRequest, signal: httpController.signal }, fakeHttp(200, () => httpController.abort())), 499);
  assert.equal(httpDestroyed, true);
  console.log('log-analysis provider tests passed (redaction, bounded snapshots, consent, adapters, local models, execution and lifecycle)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

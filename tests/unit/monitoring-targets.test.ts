import assert from 'assert/strict';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createMonitoringTargetCollector, normalizeProcesses, ProcessSource, readMonitoringRemoteProcesses } from '../../src/server/services/MonitoringTargets';
import type { CommandResult, RemoteCommandOptions } from '../../src/server/utils/remote-connection';

const sample = (cpu = 12) => [{ pm_id: 0, name: 'api', pm2_env: { status: 'online', restart_time: 3 },
  monit: { cpu, memory: 128 * 1_048_576 } }];

async function main() {
  assert.equal(normalizeProcesses(sample())[0].memoryMb, 128);
  assert.throws(() => normalizeProcesses({ error: 'not a process list' }));
  assert.throws(() => normalizeProcesses(sample(NaN)));
  assert.throws(() => normalizeProcesses([{ pm_id: 0, name: 'api', pm2_env: { status: 'online', restart_time: 0 } }]),
    'missing live metrics must not look like zero usage');
  for (const restart_time of [undefined, null, -1, 0.5, NaN, '3']) {
    assert.throws(() => normalizeProcesses([{ ...sample()[0], pm2_env: { status: 'online', restart_time } }]),
      'missing or invalid restart counters must not establish a zero baseline');
  }

  let remoteResult: CommandResult = { code: 0, stdout: JSON.stringify(sample()), stderr: '' };
  const remote = {
    isConnected: () => true,
    executePM2Command: async (command: string, options: RemoteCommandOptions) => {
      assert.equal(command, 'jlist');
      assert.equal(options.timeoutMs, 4000);
      assert.equal(options.maxOutputBytes, 2 * 1024 * 1024);
      assert.equal(options.logCommand, false);
      assert.equal(options.signal.aborted, false);
      return remoteResult;
    },
  };
  assert.deepEqual(await readMonitoringRemoteProcesses(remote), sample());
  remoteResult = { code: 0, stdout: '[]', stderr: '' };
  assert.deepEqual(await readMonitoringRemoteProcesses(remote), [], 'an explicit empty array is valid');
  for (const result of [
    { code: 1, stdout: '[]', stderr: 'private command diagnostic' },
    { code: null, stdout: '[]', stderr: '' },
    { code: 0, stdout: 'not JSON: private-value', stderr: '' },
    { code: 0, stdout: '[PM2] unknown output\n[]', stderr: '' },
    { code: 0, stdout: '{"error":"private-value"}', stderr: '' },
    { code: 0, stdout: `[]${' '.repeat(2 * 1024 * 1024)}`, stderr: '' },
  ]) {
    remoteResult = result;
    await assert.rejects(readMonitoringRemoteProcesses(remote), error => {
      assert.ok(!String(error).includes('private'));
      return true;
    });
  }
  remoteResult = { code: 0, stdout: '[{"pm_id":0,"name":"api","pm2_env":{"status":"online","restart_time":0}}]', stderr: '' };
  const raw = await readMonitoringRemoteProcesses(remote);
  assert.equal((raw[0] as any).monit, undefined, 'raw reads preserve missing metrics');
  assert.throws(() => normalizeProcesses(raw));
  await assert.rejects(readMonitoringRemoteProcesses({ isConnected: () => false,
    executePM2Command: async () => { throw new Error('should not connect'); } }), /unavailable/);

  // Use real remote command handling with a fake SSH channel: the total deadline
  // must cancel the active fallback and prevent remaining builder attempts.
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-monitoring-ssh-'));
  const previousConfig = process.env.EZPM2GUI_CONFIG_DIR;
  const previousSecret = process.env.EZPM2GUI_SECRET;
  process.env.EZPM2GUI_CONFIG_DIR = fixture;
  process.env.EZPM2GUI_SECRET = 'synthetic-monitoring-test-secret';
  await fs.writeFile(path.join(fixture, '.ezpm2gui-migration-complete'), 'test');
  try {
    const { RemoteConnection } = await import('../../src/server/utils/remote-connection');
    const ssh = new RemoteConnection({ host: 'fixture.invalid', port: 22, username: 'fixture' });
    (ssh as any)._isConnected = true;
    let channelCalls = 0;
    let activeChannelClosed = false;
    (ssh as any).client = { exec(_command: string, callback: Function) {
      channelCalls++;
      const channel: any = new EventEmitter();
      channel.stderr = new EventEmitter();
      channel.stdin = { write() {}, end() {} };
      channel.close = () => { activeChannelClosed = true; channel.emit('close'); };
      callback(null, channel);
      if (channelCalls === 1) setImmediate(() => { channel.emit('exit', 127); channel.emit('close'); });
    } };
    await assert.rejects(readMonitoringRemoteProcesses(ssh, 20), /timed out|cancelled/);
    assert.equal(channelCalls, 2, 'one deadline covers every fallback builder');
    assert.equal(activeChannelClosed, true, 'timeout closes the active SSH channel');
  } finally {
    if (previousConfig === undefined) delete process.env.EZPM2GUI_CONFIG_DIR;
    else process.env.EZPM2GUI_CONFIG_DIR = previousConfig;
    if (previousSecret === undefined) delete process.env.EZPM2GUI_SECRET;
    else process.env.EZPM2GUI_SECRET = previousSecret;
    await fs.rm(fixture, { recursive: true, force: true });
  }

  let now = 1000;
  let calls = 0;
  const source: ProcessSource = { connectionId: 'local', name: 'Local', connected: true,
    list: async () => { calls++; return sample(); } };
  const collect = createMonitoringTargetCollector({ sources: () => [source], now: () => now });
  const [first, second] = await Promise.all([collect(), collect()]);
  assert.equal(calls, 1, 'concurrent UI and engine reads share an operation');
  assert.deepEqual(first, second);
  assert.equal(first[0].processes[0].cpu, 12);
  await collect();
  assert.equal(calls, 1, 'fresh cache avoids extra PM2/SSH requests');
  source.connected = false;
  assert.equal((await collect())[0].connected, false, 'disconnect overrides cached availability');
  source.connected = true;
  source.list = async () => { throw new Error('private SSH diagnostic'); };
  assert.deepEqual((await collect())[0], { connectionId: 'local', name: 'Local', connected: false, processes: [] });
  now += 5000;
  source.list = async () => [];
  assert.deepEqual((await collect())[0], { connectionId: 'local', name: 'Local', connected: true, processes: [] },
    'empty PM2 list is distinct from failed collection');

  let resolveSlow: (value: unknown) => void = () => {};
  let slowCalls = 0;
  const slow: ProcessSource = { connectionId: 'remote', name: 'Slow remote', connected: true,
    list: () => { slowCalls++; return new Promise(resolve => { resolveSlow = resolve; }); } };
  const bounded = createMonitoringTargetCollector({ sources: () => [slow, source], timeoutMs: 20, cacheMs: 0 });
  assert.equal((await bounded())[0].connected, false, 'hung connection does not block local monitoring');
  await bounded();
  assert.equal(slowCalls, 1, 'do not stack requests behind a hung SSH operation');
  resolveSlow(sample(99));
  await new Promise(resolve => setImmediate(resolve));
  slow.list = async () => sample(7);
  assert.equal((await bounded())[0].processes[0].cpu, 7, 'late samples are discarded and a new sample is read');

  slow.list = () => new Promise(resolve => { resolveSlow = resolve; });
  assert.equal((await bounded())[0].connected, false);
  slow.connected = false;
  await bounded();
  slow.connected = true;
  slow.list = async () => sample(8);
  assert.equal((await bounded())[0].processes[0].cpu, 8, 'reconnecting clears a permanently hung request');
  resolveSlow(sample(99));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await bounded())[0].processes[0].cpu, 8, 'old connection completion cannot overwrite the new connection');
  console.log('Monitoring target tests passed (raw remote data, cancellation, coalescing, timeouts, stale data, disconnects)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

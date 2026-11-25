import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import net from 'net';
import dns from 'dns';
import { MonitoringError, MonitoringService, validateMonitoringConfig } from '../../src/server/services/MonitoringService';
import { deliverMonitoringWebhook, isAllowedAddress, parseMonitoringUrl, probeHealthCheck } from '../../src/server/services/monitoring-network';
import { AlertRule, HealthCheck, MonitoringConfig, MonitoringEvent, MonitoringTarget } from '../../src/server/services/monitoring-types';

const check = (values: Partial<HealthCheck> = {}): HealthCheck => ({ id: 'health', name: 'API health', enabled: true,
  kind: 'http', url: 'http://127.0.0.1/health?token=keep-private', expectedStatus: 200, intervalSeconds: 10,
  timeoutSeconds: 1, unhealthyAfter: 2, ...values });
const rule = (values: Partial<AlertRule> = {}): AlertRule => ({ id: 'rule', name: 'API CPU', enabled: true,
  source: 'cpu', connectionId: 'local', processName: 'api', healthCheckId: '', threshold: 80,
  durationSeconds: 0, windowSeconds: 60, cooldownSeconds: 60, webhookUrl: '', ...values });
const config = (values: Partial<MonitoringConfig> = {}): MonitoringConfig => ({ revision: 0,
  healthChecks: [], rules: [], maintenanceUntil: null, ...values });
const target = (values: Partial<MonitoringTarget> = {}): MonitoringTarget => ({ connectionId: 'local', name: 'Local', connected: true,
  processes: [{ id: 1, name: 'api', status: 'online', cpu: 10, memoryMb: 20, restarts: 1000 }], ...values });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-monitoring-'));
let sequence = 0;
const nextFile = () => path.join(root, `monitoring-${sequence++}.json`);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function expect400(callback: () => unknown) { assert.throws(callback, error => error instanceof MonitoringError && error.status === 400); }
function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  try {
    // Strict complete-object validation and revision conflicts leave persisted data intact.
    const filePath = nextFile();
    const persistence = new MonitoringService({ filePath });
    assert.equal(fs.existsSync(filePath), false, 'Read-only construction must not create monitoring data');
    const saved = persistence.updateConfig(config({ healthChecks: [check()], rules: [rule()] }));
    assert.equal(saved.config.revision, 1);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    saved.config.rules[0].name = 'external mutation';
    assert.equal(persistence.getSnapshot().config.rules[0].name, 'API CPU');
    assert.throws(() => persistence.updateConfig(config()), error => error instanceof MonitoringError && error.status === 409);
    for (const invalid of [
      null, [], { ...config(), revision: '0' }, config({ maintenanceUntil: NaN }),
      config({ healthChecks: [check({ intervalSeconds: 9 })] }),
      config({ healthChecks: [check({ timeoutSeconds: 10 })] }),
      config({ healthChecks: [check({ unhealthyAfter: 0 })] }),
      config({ healthChecks: [check({ expectedStatus: 600 })] }),
      config({ healthChecks: [check({ intervalSeconds: Infinity })] }),
      config({ healthChecks: [check({ intervalSeconds: 10.5 })] }),
      config({ healthChecks: [check(), check()] }),
      config({ rules: [rule(), rule()] }), config({ rules: [rule({ source: 'health', healthCheckId: 'missing' })] }),
      config({ rules: [rule({ threshold: NaN })] }), config({ rules: [rule({ cooldownSeconds: -1 })] }),
      config({ rules: [rule({ source: 'memory', threshold: 0 })] }),
      config({ rules: [rule({ source: 'restarts', threshold: 1.5 })] }),
      config({ rules: [rule({ webhookUrl: 'file:///private/file' })] }),
      config({ healthChecks: Array.from({ length: 51 }, (_, i) => check({ id: `check-${i}` })) }),
      config({ rules: Array.from({ length: 101 }, (_, i) => rule({ id: `rule-${i}` })) })
    ]) expect400(() => validateMonitoringConfig(invalid));
    for (const url of ['ftp://localhost/path', 'http://u:p@localhost/', 'http://localhost/#fragment', 'http://localhost/#',
      'http://169.254.169.254/latest/meta-data', 'http://[::ffff:a9fe:a9fe]/', 'http://0.0.0.0/', 'http://localhost:0/']) {
      expect400(() => validateMonitoringConfig(config({ healthChecks: [check({ url })] })));
    }
    assert.equal(new MonitoringService({ filePath }).getSnapshot().config.rules[0].name, 'API CPU');
    const malformed = nextFile();
    fs.writeFileSync(malformed, '{bad json');
    assert.throws(() => new MonitoringService({ filePath: malformed }), /could not be loaded/);
    assert.equal(fs.readFileSync(malformed, 'utf8'), '{bad json');
    const blockedDirectory = path.join(root, 'not-a-directory');
    fs.writeFileSync(blockedDirectory, 'existing data');
    const writeFailure = new MonitoringService({ filePath: path.join(blockedDirectory, 'monitoring.json') });
    assert.throws(() => writeFailure.updateConfig(config({ rules: [rule()] })), error => error instanceof MonitoringError && error.status === 500);
    assert.equal(writeFailure.getSnapshot().config.revision, 0, 'A failed durable save must leave the live configuration unchanged');
    assert.equal(fs.readFileSync(blockedDirectory, 'utf8'), 'existing data');

    // Resource dwell resets on unavailable data; a firing alert never falsely recovers.
    let now = 1000;
    let host = target();
    const resources = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host] });
    resources.updateConfig(config({ rules: [rule({ durationSeconds: 10 })] }));
    host.processes[0].cpu = 90;
    await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates[0].status, 'pending');
    now += 9000; host.connected = false;
    await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates[0].status, 'unknown');
    now += 1000; host.connected = true;
    await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates[0].status, 'pending');
    now += 9999; await resources.tick();
    assert.equal(resources.getSnapshot().events.length, 0);
    now++; await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates[0].status, 'firing');
    await resources.tick();
    assert.equal(resources.getSnapshot().events.length, 1, 'Only transitions create events');
    host.processes = []; now += 1000; await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates[0].status, 'unknown');
    assert.equal(resources.getSnapshot().events.length, 1);
    host = target(); await resources.tick();
    assert.equal(resources.getSnapshot().events[0].kind, 'recovered');
    host.processes = [target().processes[0], { ...target().processes[0], id: 2, cpu: 70, memoryMb: 60 }];
    host.processes[0].cpu = 70; host.processes[0].memoryMb = 60;
    resources.updateConfig({ ...resources.getSnapshot().config,
      rules: [rule({ durationSeconds: 0 }), rule({ id: 'memory', source: 'memory', threshold: 100 })] });
    await resources.tick();
    assert.ok(resources.getSnapshot().ruleStates.every(state => state.status === 'ok'), 'CPU/memory use maximum instance value, not sum');
    host.processes[1].memoryMb = 101; await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates.find(state => state.ruleId === 'memory').status, 'firing');
    host.processes[0].memoryMb = NaN; await resources.tick();
    assert.equal(resources.getSnapshot().ruleStates.find(state => state.ruleId === 'memory').status, 'unknown');

    // Missing processes are offline only when the server was sampled successfully.
    host = target({ processes: [] });
    const offline = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host] });
    offline.updateConfig(config({ rules: [rule({ source: 'offline' })] }));
    await offline.tick();
    assert.equal(offline.getSnapshot().ruleStates[0].status, 'firing');
    host.connected = false; await offline.tick();
    assert.equal(offline.getSnapshot().events.length, 1);
    host = target(); host.processes.push({ ...host.processes[0], id: 2, status: 'stopped' }); await offline.tick();
    assert.equal(offline.getSnapshot().ruleStates[0].status, 'firing');
    host.processes[1].status = 'online'; await offline.tick();
    assert.equal(offline.getSnapshot().events[0].kind, 'recovered');

    // Restart alerts use deltas per ID, handle counter resets, and age out the window.
    now = 1000; host = target();
    const restarts = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host] });
    restarts.updateConfig(config({ rules: [rule({ source: 'restarts', threshold: 3, windowSeconds: 10 })] }));
    await restarts.tick();
    assert.equal(restarts.getSnapshot().ruleStates[0].value, 0, 'Lifetime restart counter is a baseline');
    now += 1000; host.processes[0].restarts += 2; await restarts.tick();
    assert.equal(restarts.getSnapshot().ruleStates[0].value, 2);
    host.processes.push({ ...host.processes[0], id: 2, restarts: 10000 }); now += 1000; await restarts.tick();
    assert.equal(restarts.getSnapshot().ruleStates[0].value, 2, 'New IDs establish a baseline');
    now += 1000; host.processes[1].restarts++; await restarts.tick();
    assert.equal(restarts.getSnapshot().ruleStates[0].status, 'firing');
    host.processes[0].restarts = 0; now += 1000; await restarts.tick();
    assert.equal(restarts.getSnapshot().ruleStates[0].value, 3, 'Counter resets neither add restarts nor erase recent observed deltas');
    host.connected = false; now += 20000; await restarts.tick();
    assert.equal(restarts.getSnapshot().events.length, 1, 'Missing samples cannot recover an alarm');
    host.connected = true; await restarts.tick();
    assert.equal(restarts.getSnapshot().events[0].kind, 'recovered');

    // Failed health checks need the configured consecutive failures; probes do not overlap.
    now = 1000;
    let healthy = false; let probeCalls = 0;
    const health = new MonitoringService({ filePath: nextFile(), now: () => now,
      probe: async () => { probeCalls++; return { healthy, latencyMs: 12, message: healthy ? 'HTTP 200' : 'HTTP 503' }; } });
    health.updateConfig(config({ healthChecks: [check()], rules: [rule({ source: 'health', healthCheckId: 'health' })] }));
    await health.tick();
    assert.equal(health.getSnapshot().healthResults[0].status, 'unknown');
    await health.tick();
    assert.equal(probeCalls, 1);
    now += 10000; await health.tick();
    assert.equal(health.getSnapshot().healthResults[0].status, 'unhealthy');
    assert.equal(health.getSnapshot().events[0].kind, 'firing');
    healthy = true; now += 10000; await health.tick();
    assert.equal(health.getSnapshot().healthResults[0].status, 'healthy');
    assert.equal(health.getSnapshot().events[0].kind, 'recovered');
    health.updateConfig({ ...health.getSnapshot().config, healthChecks: [check({ enabled: false })] });
    await health.tick();
    assert.equal(health.getSnapshot().ruleStates[0].status, 'unknown');

    // Fast probes retain their own completion time when another check is slow.
    now = 1000;
    const slow = deferred<{ healthy: boolean; latencyMs: number; message: string }>();
    const freshness = new MonitoringService({ filePath: nextFile(), now: () => now,
      probe: async item => item.id === 'slow' ? slow.promise : { healthy: true, latencyMs: 1, message: 'HTTP 200' } });
    freshness.updateConfig(config({ healthChecks: [check(), check({ id: 'slow', intervalSeconds: 60, timeoutSeconds: 30 })],
      rules: [rule({ source: 'health', healthCheckId: 'health' })] }));
    const batch = freshness.tick(); await flush();
    now = 25000; slow.resolve({ healthy: true, latencyMs: 24000, message: 'HTTP 200' }); await batch;
    assert.equal(freshness.getSnapshot().healthResults.find(result => result.checkId === 'health').checkedAt, 1000);
    assert.equal(freshness.getSnapshot().ruleStates[0].status, 'unknown');

    // Cooldown suppresses flap notifications while retaining all transitions; a
    // still-firing condition is reconciled when cooldown or maintenance ends.
    now = 1000; host = target(); host.processes[0].cpu = 90;
    const notifications: MonitoringEvent[] = [];
    const alarms = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host],
      notify: async (_url, event) => { notifications.push(event); } });
    alarms.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook?token=private' })] }));
    await alarms.tick(); await flush();
    assert.equal(notifications.length, 1); assert.equal(alarms.getSnapshot().events[0].delivery, 'sent');
    host.processes[0].cpu = 10; now += 1000; await alarms.tick(); await flush();
    assert.equal(notifications[1].kind, 'recovered');
    host.processes[0].cpu = 90; now += 1000; await alarms.tick(); await flush();
    assert.equal(notifications.length, 2); assert.equal(alarms.getSnapshot().events[0].delivery, 'suppressed');
    now = 61000; await alarms.tick(); await flush();
    assert.equal(notifications.length, 3); assert.equal(alarms.getSnapshot().events.length, 3);
    assert.ok(!JSON.stringify(alarms.getSnapshot().events).includes('token=private'));
    alarms.updateConfig({ ...alarms.getSnapshot().config, maintenanceUntil: 100000 });
    host.processes[0].cpu = 10; now = 62000; await alarms.tick(); await flush();
    assert.equal(alarms.getSnapshot().events[0].delivery, 'suppressed');
    assert.equal(notifications.length, 3);
    now = 100000; await alarms.tick(); await flush();
    assert.equal(notifications.length, 4); assert.equal(notifications[3].kind, 'recovered');
    const maintained = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host],
      notify: async (_url, event) => { notifications.push(event); } });
    maintained.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook' })], maintenanceUntil: 120000 }));
    host.processes[0].cpu = 90; await maintained.tick(); await flush();
    assert.equal(maintained.getSnapshot().events[0].delivery, 'suppressed');
    now = 120000; await maintained.tick(); await flush();
    assert.equal(maintained.getSnapshot().events[0].delivery, 'sent');
    assert.equal(maintained.getSnapshot().events.length, 1);
    let transientNotifications = 0;
    const transient = new MonitoringService({ filePath: nextFile(), now: () => now, collectTargets: async () => [host],
      notify: async () => { transientNotifications++; } });
    transient.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook' })], maintenanceUntil: 130000 }));
    await transient.tick();
    host.processes[0].cpu = 10; now++; await transient.tick();
    now = 130000; await transient.tick(); await flush();
    assert.equal(transientNotifications, 0, 'An incident entirely inside maintenance must not send an orphan recovery');
    assert.equal(transient.getSnapshot().events.length, 2);

    // Slow deliveries never stall sampling, remain ordered per rule, and are
    // interrupted durably on configuration edits and shutdown.
    now = 1000; host = target(); host.processes[0].cpu = 90;
    const blocked = deferred<void>();
    let calls = 0; let samples = 0;
    const pendingFile = nextFile();
    const pending = new MonitoringService({ filePath: pendingFile, now: () => now,
      collectTargets: async () => { samples++; return [host]; }, notify: async () => { calls++; await blocked.promise; } });
    pending.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook' })] }));
    await pending.tick(); await flush();
    assert.equal(calls, 1); assert.equal(pending.getSnapshot().events[0].delivery, 'pending');
    host.processes[0].cpu = 10; now++; await pending.tick();
    assert.equal(samples, 2); assert.equal(calls, 1, 'Recovery waits behind its rule\'s firing notification');
    assert.equal(pending.getSnapshot().events[0].kind, 'recovered');
    pending.updateConfig({ ...pending.getSnapshot().config, maintenanceUntil: 100000 });
    assert.ok(pending.getSnapshot().events.every(event => event.delivery === 'failed'));
    blocked.resolve(); await flush();
    assert.equal(calls, 1, 'Config changes cancel queued notifications');
    assert.ok(new MonitoringService({ filePath: pendingFile }).getSnapshot().events.every(event => event.delivery === 'failed'));
    const stopDelivery = deferred<void>();
    host.processes[0].cpu = 90;
    const stopping = new MonitoringService({ filePath: nextFile(), collectTargets: async () => [host], notify: () => stopDelivery.promise });
    stopping.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook' })] }));
    await stopping.tick(); stopping.stop();
    assert.equal(stopping.getSnapshot().events[0].delivery, 'failed');
    stopDelivery.resolve(); await flush();
    assert.equal(stopping.getSnapshot().events[0].delivery, 'failed');
    const failure = new MonitoringService({ filePath: nextFile(), collectTargets: async () => [host],
      notify: async () => { throw new Error('do not expose ?token=secret'); } });
    failure.updateConfig(config({ rules: [rule({ webhookUrl: 'http://localhost/hook' })] }));
    await failure.tick(); await flush();
    assert.equal(failure.getSnapshot().events[0].delivery, 'failed');
    assert.ok(!JSON.stringify(failure.getSnapshot().events).includes('secret'));
    const queueGates = Array.from({ length: 6 }, () => deferred<void>());
    let concurrent = 0; let peak = 0; let queuedCalls = 0;
    const queue = new MonitoringService({ filePath: nextFile(), collectTargets: async () => [host],
      notify: async (_url, event) => {
        queuedCalls++; concurrent++; peak = Math.max(peak, concurrent);
        await queueGates[Number(event.ruleId.slice(-1))].promise;
        concurrent--;
      } });
    queue.updateConfig(config({ rules: Array.from({ length: 6 }, (_, i) => rule({ id: `rule-${i}`, webhookUrl: 'http://localhost/hook' })) }));
    await queue.tick(); await flush();
    assert.equal(queuedCalls, 4); assert.equal(peak, 4);
    queueGates[0].resolve(); await flush();
    assert.equal(queuedCalls, 5); assert.equal(peak, 4);
    queue.stop(); queueGates.forEach(gate => gate.resolve()); await flush();
    assert.equal(queuedCalls, 5, 'Stopping cancels queued delivery before it can start');
    assert.ok(queue.getSnapshot().events.every(event => event.delivery !== 'pending'));

    // In-flight probes cannot write results after stop/config changes; ticks coalesce.
    for (const mode of ['stop', 'config']) {
      const gate = deferred<{ healthy: boolean; latencyMs: number; message: string }>();
      let count = 0;
      const raceFile = nextFile();
      const race = new MonitoringService({ filePath: raceFile,
        probe: async () => { count++; return gate.promise; } });
      race.updateConfig(config({ healthChecks: [check({ unhealthyAfter: 1 })],
        rules: [rule({ source: 'health', healthCheckId: 'health' })] }));
      const inFlight = race.tick(); await flush(); await race.tick();
      assert.equal(count, 1);
      if (mode === 'stop') race.stop();
      else race.updateConfig({ ...race.getSnapshot().config, healthChecks: [check({ enabled: false })] });
      const before = fs.readFileSync(raceFile, 'utf8');
      gate.resolve({ healthy: false, latencyMs: 1, message: 'HTTP 503' }); await inFlight;
      assert.equal(race.getSnapshot().events.length, 0);
      assert.equal(fs.readFileSync(raceFile, 'utf8'), before);
    }

    // Persisted history remains bounded while configuration revisions stay unchanged.
    const historyFile = nextFile();
    const oldEvent: MonitoringEvent = { id: 'old', timestamp: 1, ruleId: 'rule', ruleName: 'API CPU', kind: 'recovered',
      message: 'Recovered', value: 0, delivery: 'none' };
    fs.writeFileSync(historyFile, JSON.stringify({ version: 1, config: config({ rules: [rule()] }),
      events: Array.from({ length: 1000 }, (_, i) => ({ ...oldEvent, id: `old-${i}` })) }));
    const history = new MonitoringService({ filePath: historyFile, collectTargets: async () => [host] });
    await history.tick();
    assert.equal(history.getSnapshot().events.length, 1000);
    assert.equal(history.getSnapshot().events[0].kind, 'firing');
    assert.equal(history.getSnapshot().config.revision, 0);

    await networkFixtures();
    console.log('monitoring-service tests passed (validation, persistence, health probes, resource/restart/offline rules, cooldown, maintenance, delivery and lifecycle)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function networkFixtures() {
  for (const blocked of ['0.0.0.0', '169.254.169.254', '224.0.0.1', '255.255.255.255', '100.100.100.200', '168.63.129.16',
    '::', 'fe80::1', 'febf::1', 'ff02::1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:0:0', 'fd00:ec2::254',
    '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::']) assert.equal(isAllowedAddress(blocked), false, blocked);
  for (const allowed of ['127.0.0.1', '10.1.2.3', '192.168.1.2', '172.20.0.2', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.equal(isAllowedAddress(allowed), true, allowed);
  }
  assert.throws(() => parseMonitoringUrl('http://localhost/#'));
  const requests: string[] = [];
  let webhookBody: unknown;
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/ok' }); response.end(); }
    else if (request.url === '/slow') { /* Request intentionally never gets headers. */ }
    else if (request.url === '/hook') {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => { webhookBody = JSON.parse(body); response.writeHead(204); response.end(); });
    } else { response.writeHead(request.url.startsWith('/error') ? 503 : 200); response.end('private response body'); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as net.AddressInfo).port;
  try {
    const live = (url: string) => check({ url: `http://127.0.0.1:${port}${url}` });
    const success = await probeHealthCheck(live('/ok'));
    assert.equal(success.healthy, true); assert.ok(success.latencyMs >= 0);
    const rejected = await probeHealthCheck(live('/error?token=private'));
    assert.equal(rejected.healthy, false); assert.equal(rejected.message, 'HTTP 503; expected 200');
    const previous = requests.length;
    assert.equal((await probeHealthCheck(live('/redirect'))).healthy, false);
    assert.equal(requests.length, previous + 1, 'HTTP redirects must never be followed');
    assert.equal((await probeHealthCheck(check({ kind: 'tcp', host: '127.0.0.1', port }))).healthy, true);
    assert.equal((await probeHealthCheck(live('/slow'))).message, 'Check timed out');
    const event: MonitoringEvent = { id: 'event', timestamp: 100, ruleId: 'rule', ruleName: 'API CPU', kind: 'firing', message: 'High CPU', value: 90, delivery: 'pending' };
    await deliverMonitoringWebhook(`http://127.0.0.1:${port}/hook`, event);
    assert.deepEqual(webhookBody, { source: 'ezpm2gui', event: {
      id: 'event', timestamp: 100, ruleId: 'rule', ruleName: 'API CPU', kind: 'firing', message: 'High CPU', value: 90
    } });
    await assert.rejects(deliverMonitoringWebhook(`http://127.0.0.1:${port}/redirect`, event));

    // The total timeout includes DNS, and a mixed DNS result cannot select a
    // safe-looking address while hiding a metadata destination.
    const lookup = dns.promises.lookup;
    try {
      dns.promises.lookup = (async () => [{ address: '127.0.0.1', family: 4 }, { address: '169.254.169.254', family: 4 }]) as any;
      const count = requests.length;
      assert.equal((await probeHealthCheck(check({ url: `http://test.example:${port}/ok` }))).healthy, false);
      assert.equal(requests.length, count);
      dns.promises.lookup = (() => new Promise(() => {})) as any;
      const before = Date.now();
      assert.equal((await probeHealthCheck(check({ url: 'http://slow-dns.example/' }))).message, 'Check timed out');
      assert.ok(Date.now() - before < 2000, 'DNS must share the deadline');
    } finally { dns.promises.lookup = lookup; }
    const cancelled = new AbortController(); cancelled.abort();
    assert.equal((await probeHealthCheck(live('/ok'), cancelled.signal)).healthy, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

// Isolated recording fixture. This serves the real built UI with synthetic data.
// It never connects to PM2, reads user configuration, discovers CLIs, or runs AI.
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { prepareSnapshot } = require('../../dist/server/services/LogAnalysisService');

const root = path.resolve(__dirname, '../..');
const clientBuild = path.join(root, 'src/client/build');
const version = require('../../package.json').version;
const demoTime = Date.parse('2026-10-12T10:24:00Z');
const MB = 1024 * 1024;
const logHistory = {
  out: [
    '2026-10-12T10:24:00.120Z INFO checkout-api starting; NODE_ENV=production',
    '2026-10-12T10:24:00.144Z INFO database URL=postgres://demo-user:demo-password@127.0.0.1:5432/checkout',
    '2026-10-12T10:24:00.146Z DEBUG DB_PASSWORD=demo-password-only',
    '2026-10-12T10:24:00.149Z INFO waiting for database before listening on port 3000',
  ],
  err: [
    '2026-10-12T10:24:00.251Z ERROR connect ECONNREFUSED 127.0.0.1:5432',
    '    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16)',
    '    at async connectDatabase (/srv/checkout-api/dist/database.js:42:5)',
    '    at async bootstrap (/srv/checkout-api/dist/index.js:18:3)',
    '2026-10-12T10:24:00.254Z FATAL startup aborted: database connection failed; exit code 1',
    '2026-10-12T10:24:04.601Z WARN PM2 restart attempt 8; checkout-api failed during startup',
    '2026-10-12T10:24:04.741Z ERROR connect ECONNREFUSED 127.0.0.1:5432',
    '2026-10-12T10:24:04.745Z ERROR checkout endpoint unavailable: application has not started',
  ],
};

function processFixture(id, name, status, memory, cpu, restarts) {
  return {
    pid: status === 'online' ? 48210 + id : 0,
    pm_id: id,
    name,
    monit: { memory: memory * MB, cpu },
    pm2_env: {
      pm_id: id, name, namespace: 'demo', version: '1.0.0', versioning: null,
      pm_uptime: demoTime - (status === 'online' ? 7200000 : 4500),
      created_at: demoTime - 7200000, pm_cwd: `/srv/${name}`,
      pm_exec_path: `/srv/${name}/dist/index.js`, exec_interpreter: 'node',
      exec_mode: 'fork_mode', instances: 1,
      pm_out_log_path: `/demo/logs/${name}-out.log`,
      pm_err_log_path: `/demo/logs/${name}-error.log`, node_args: [], status,
      restart_time: restarts, unstable_restarts: status === 'errored' ? restarts : 0,
      autorestart: true, watch: false, env: { NODE_ENV: 'production' },
    },
  };
}

const processes = [
  processFixture(0, 'checkout-api', 'errored', 0, 0, 8),
  processFixture(1, 'background-worker', 'online', 86, 1.4, 0),
  processFixture(2, 'event-stream', 'online', 64, 0.8, 0),
];
const metrics = {
  loadAvg: [0.42, 0.38, 0.35],
  memory: { total: 16 * 1024 * MB, used: 5.2 * 1024 * MB, free: 10.8 * 1024 * MB },
  uptime: 86400 * 3, cpus: 8,
};
const providers = [
  { id: 'ollama', name: 'Ollama', available: true, kind: 'local', models: [{ name: 'qwen2.5:7b', local: true }] },
  { id: 'claude', name: 'Claude Code', available: true, kind: 'cloud' },
  { id: 'codex', name: 'Codex', available: true, kind: 'cloud' },
  { id: 'cursor', name: 'Cursor CLI', available: true, kind: 'cloud' },
  { id: 'copilot', name: 'GitHub Copilot CLI', available: true, kind: 'cloud' },
];
const sampleReport = [
  'SAMPLE REPORT · simulated analysis for this demo',
  '',
  'Likely issue: PostgreSQL is unreachable at 127.0.0.1:5432.',
  'Confidence: high for the refused connection; the reason the database is unreachable is unconfirmed.',
  '',
  'Evidence',
  '• Lines 5 and 11: repeated ECONNREFUSED at the configured database address.',
  '• Lines 7–9: connectDatabase fails during bootstrap and startup exits with code 1.',
  '• Process metadata: checkout-api is errored after 8 restarts.',
  '',
  'Impact: checkout-api has not completed startup, so checkout requests are unavailable.',
  '',
  'Suggested manual checks',
  '1. Confirm PostgreSQL is running and listening on port 5432.',
  '2. Verify the configured database host from the application’s runtime. In a container, 127.0.0.1 refers to that container.',
  '3. Check network reachability and the database service address.',
  '4. After correcting the connection, restart checkout-api and confirm successful startup in fresh logs.',
  '',
  'No changes have been applied. Review these suggestions before taking action.',
].join('\n');

function makeSnapshot(processId = 0) {
  const proc = processes.find(item => item.pm_id === processId);
  if (!proc) return null;
  const raw = {
    processId, processName: proc.name, source: 'local', status: proc.pm2_env.status,
    restarts: proc.pm2_env.restart_time, cpuPercent: proc.monit.cpu, memoryBytes: proc.monit.memory,
    notes: ['stdout and stderr are separate log tails. Line numbers identify evidence; they do not establish cross-stream chronology.'],
    logs: processId === 0 ? [
      ...logHistory.out.map(message => ({ stream: 'stdout', message })),
      ...logHistory.err.map(message => ({ stream: 'stderr', message })),
    ] : [{ stream: 'stdout', message: '2026-10-12T10:24:04.000Z INFO service healthy' }],
  };
  // Use the shipped implementation for real secret redaction and line numbering.
  return { ...prepareSnapshot(raw), warnings: [] };
}

function createFixtureServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.set('X-Ezpm2gui-Demo', 'synthetic-fixture');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/demo', (req, res) => res.json({ synthetic: true, simulatedAnalysis: true, label: 'SAMPLE LOGS · SIMULATED ANALYSIS' }));
  app.get('/api/auth/status', (req, res) => res.json({ passwordSet: false, pinSet: false, autoLockMinutes: 0 }));
  app.get('/api/processes', (req, res) => res.json(processes));
  app.get('/api/metrics', (req, res) => res.json(metrics));
  app.get('/api/remote/connections', (req, res) => res.json([]));
  app.get('/api/modules', (req, res) => res.json([]));
  app.get('/api/cron-jobs/status', (req, res) => res.json({ success: true, data: [] }));
  app.get('/api/metrics/history', (req, res) => res.json([]));
  app.get('/api/remote-metrics/connections', (req, res) => res.json({ success: true, connections: [] }));
  app.get('/api/update/current', (req, res) => res.json({ success: true, data: { currentVersion: version } }));
  app.get('/api/update/check', (req, res) => res.json({ success: true, data: { updateAvailable: false, currentVersion: version, latestVersion: version } }));
  app.get('/api/process/:id/stats', (req, res) => {
    const proc = processes.find(item => item.pm_id === Number(req.params.id));
    if (!proc) return res.status(404).json({ error: 'Demo process not found.' });
    res.json(Array.from({ length: 24 }, (_, index) => ({
      timestamp: demoTime - (23 - index) * 5000,
      cpu: proc.monit.cpu, memory: proc.monit.memory,
    })));
  });
  app.get('/api/logs/:id/:type', (req, res) => {
    const proc = processes.find(item => item.pm_id === Number(req.params.id));
    if (!proc || !['out', 'err'].includes(req.params.type)) return res.status(404).json({ error: 'Demo log not found.' });
    const logs = proc.pm_id === 0 ? logHistory[req.params.type] : req.params.type === 'out'
      ? ['2026-10-12T10:24:04.000Z INFO service healthy'] : [];
    res.json({ logs, totalLines: logs.length, logPath: `/demo/logs/${proc.name}-${req.params.type}.log` });
  });
  app.get('/api/log-analysis/providers', (req, res) => res.json({ providers }));
  app.post('/api/log-analysis/snapshot', (req, res) => {
    const snapshot = makeSnapshot(req.body.processId);
    if (!snapshot) return res.status(404).json({ error: 'Demo process not found.' });
    res.json(snapshot);
  });
  app.post('/api/log-analysis/analyze', (req, res) => {
    const provider = providers.find(item => item.id === req.body.provider);
    if (!provider) return res.status(400).json({ error: 'Select a supported demo provider.' });
    if (provider.kind === 'cloud' && req.body.allowCloud !== true) return res.status(400).json({ error: 'Cloud consent is required.' });
    if (provider.id === 'ollama' && req.body.model !== 'qwen2.5:7b') return res.status(400).json({ error: 'Select the demo local model.' });
    let prepared;
    try { prepared = prepareSnapshot(req.body.snapshot); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
    const timer = setTimeout(() => {
      if (res.destroyed) return;
      res.json({ provider: provider.id, ...(provider.id === 'ollama' ? { model: req.body.model } : {}),
        analysis: sampleReport, lineCount: prepared.snapshot.logs.length,
        redactionCount: prepared.redactionCount, truncated: prepared.truncated,
      });
    }, 1800);
    res.on('close', () => clearTimeout(timer));
  });
  // Recording mistakes must never fall through to any production backend.
  app.use('/api', (req, res) => res.status(404).json({ error: `No synthetic fixture for ${req.method} ${req.path}.` }));
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));

  io.on('connection', socket => {
    socket.emit('processes', processes);
    socket.emit('metrics', metrics);
    const ticker = setInterval(() => {
      socket.emit('processes', processes);
      socket.emit('metrics', metrics);
    }, 2000);
    // History is already delivered over REST. A live socket keeps the UI's
    // streaming state accurate without inventing extra failure evidence.
    socket.on('subscribe-logs', selection => {
      if (Number(selection?.processId) === 0 && ['out', 'err'].includes(selection?.logType)) {
        socket.emit('demo-log-subscription', { ...selection, synthetic: true });
      }
    });
    socket.on('disconnect', () => clearInterval(ticker));
  });
  return { app, server, io };
}

if (require.main === module) {
  if (!fs.existsSync(path.join(clientBuild, 'index.html'))) throw new Error('Build the client before starting the demo fixture.');
  const port = Number(process.env.EZPM2GUI_DEMO_PORT || 3117);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo port.');
  const { server, io } = createFixtureServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Synthetic log-analysis demo: http://127.0.0.1:${port}`);
    console.log('Sample logs and simulated provider discovery/report only. No PM2 or agents run.');
  });
  const shutdown = () => io.close(() => server.close(() => process.exit(0)));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = { createFixtureServer, makeSnapshot, processes, providers, sampleReport };

import assert from 'assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { AnalysisInput, AnalysisResult, AnalysisSnapshot, LogAnalysisError } from '../../src/server/services/LogAnalysisService';
import type { ConversationDetail } from '../../src/server/services/LogAnalysisHistory';

const PROCESS_ID = 7;
const SNAPSHOT_SECRET = 'snapshot-secret-value';
const QUESTION_SECRET = 'question-secret-value';
const RESPONSE_SECRET = 'response-secret-value';
const ERROR_SECRET = 'error-secret-value';
const MAX_QUESTION_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 200;
const MAX_CONTEXT_MESSAGES = 10;
const MAX_RESULT_BYTES = 256 * 1024;
const snapshot: AnalysisSnapshot = {
  processId: PROCESS_ID, processName: 'worker', source: 'local', status: 'online',
  logs: [{ stream: 'stderr', message: `password=${SNAPSHOT_SECRET}\nError ECONNREFUSED` }],
};
const request = { provider: 'claude', model: 'sonnet', question: 'Analyze these logs', allowCloud: true };

function result(analysis = 'Check the database connection; see line 2.'): AnalysisResult {
  return { provider: 'claude', model: 'sonnet', analysis, lineCount: 2, redactionCount: 0, truncated: false };
}

function throwsStatus(operation: () => unknown, status: number): void {
  assert.throws(operation, (error: unknown) => error instanceof LogAnalysisError && error.status === status);
}

async function settled(read: () => ConversationDetail): Promise<ConversationDetail> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const detail = read();
    if (detail.messages.every(message => message.status !== 'running')) return detail;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  throw new Error('Analysis did not finish');
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-analysis-history-'));
  const previousConfig = process.env.EZPM2GUI_CONFIG_DIR;
  const previousPm2Home = process.env.PM2_HOME;
  process.env.EZPM2GUI_CONFIG_DIR = directory;
  process.env.PM2_HOME = path.join(directory, 'pm2');
  await fs.writeFile(path.join(directory, '.ezpm2gui-migration-complete'), 'test');
  const { createLogAnalysisHistory } = await import('../../src/server/services/LogAnalysisHistory');
  const { createLogAnalysisRouter } = await import('../../src/server/routes/logAnalysis');
  const dbPath = path.join(directory, 'history.db');
  const metrics = new Database(dbPath);
  metrics.exec('CREATE TABLE remote_metrics (id INTEGER PRIMARY KEY, value TEXT)');
  metrics.prepare('INSERT INTO remote_metrics (value) VALUES (?)').run('existing metrics');
  metrics.close();
  const analyzed: AnalysisInput[] = [];
  let aborted = false;
  let resolveDelayed: ((response: AnalysisResult) => void) | undefined;
  let completeTeardown: (() => void) | undefined;
  const analyze = async (input: AnalysisInput, signal?: AbortSignal): Promise<AnalysisResult> => {
    analyzed.push(input);
    if (input.question === 'delay') return new Promise((resolve, reject) => {
      resolveDelayed = resolve;
      signal?.addEventListener('abort', () => { aborted = true; reject(new LogAnalysisError('Cancelled', 499)); }, { once: true });
    });
    if (input.question === 'known failure') throw new LogAnalysisError(`Authorization: Bearer ${ERROR_SECRET}`, 503);
    if (input.question === 'unknown failure') throw new Error(`Do not expose ${ERROR_SECRET}`);
    if (input.question === 'huge response') return result('界'.repeat(MAX_RESULT_BYTES));
    if (input.question === 'invalid response') return { ...result(), analysis: '' };
    return result(`password=${RESPONSE_SECRET}\nCheck line 2.`);
  };
  let clock = Date.parse('2026-10-13T12:00:00.000Z');
  const store = createLogAnalysisHistory({ dbPath, analyze, now: () => new Date(clock++) });
  const closeables = [store];
  let server: http.Server | undefined;
  try {
    const local = store.createConversation({ snapshot, redactionCount: 2, truncated: true, warnings: ['token=warning-secret'] });
    assert.equal(local.redactionCount, 3);
    assert.equal(local.truncated, true);
    assert.match(local.warnings[0], /\[REDACTED\]/);
    assert.equal(local.messages.length, 0);
    assert.equal(local.connectionId, undefined);
    assert.match(local.snapshot.logs[0].message, /\[REDACTED\]/);
    assert.ok(!JSON.stringify(local).includes(SNAPSHOT_SECRET));
    snapshot.logs[0].message = 'changed live logs';
    assert.ok(!JSON.stringify(store.getConversation(local.id)).includes('changed live logs'), 'saved snapshots do not follow mutable/live logs');
    const remote = store.createConversation({ snapshot: { ...snapshot, source: 'remote' }, connectionId: '192.0.2.10-22-user' });
    const secondRemote = store.createConversation({ snapshot: { ...snapshot, source: 'remote' }, connectionId: 'pm2.example.test-22-user' });
    assert.deepEqual(store.listConversations({ processId: PROCESS_ID }).conversations.map(row => row.id), [local.id]);
    assert.deepEqual(store.listConversations({ processId: PROCESS_ID, connectionId: remote.connectionId }).conversations.map(row => row.id), [remote.id]);
    assert.deepEqual(store.listConversations({ processId: PROCESS_ID, connectionId: secondRemote.connectionId }).conversations.map(row => row.id), [secondRemote.id]);
    assert.deepEqual(store.listConversations({ processId: PROCESS_ID + 1 }), { conversations: [], nextCursor: null });
    throwsStatus(() => store.createConversation(null), 400);
    throwsStatus(() => store.createConversation([]), 400);
    throwsStatus(() => store.createConversation({ snapshot: null }), 400);
    throwsStatus(() => store.createConversation({ snapshot: { ...snapshot, processId: 2147483648 } }), 400);
    throwsStatus(() => store.createConversation({ snapshot, connectionId: remote.connectionId }), 400);
    throwsStatus(() => store.createConversation({ snapshot: { ...snapshot, source: 'remote' } }), 400);
    for (const connectionId of [null, '', '../remote', ['remote']]) {
      throwsStatus(() => store.createConversation({ snapshot, connectionId }), 400);
    }
    for (const metadata of [{ redactionCount: -1 }, { redactionCount: 1_000_001 }, { redactionCount: null },
      { truncated: 'true' }, { warnings: Array(9).fill('warning') }, { warnings: [null] }, { warnings: ['x'.repeat(4097)] }]) {
      throwsStatus(() => store.createConversation({ snapshot, ...metadata }), 400);
    }
    throwsStatus(() => store.getConversation('../path'), 400);
    throwsStatus(() => store.getConversation(randomUUID()), 404);
    for (const limit of [0, -1, 101, null, 1.5, '20']) throwsStatus(() => store.listConversations({ processId: PROCESS_ID, limit: limit as number }), 400);
    for (const cursor of ['', 'not-a-cursor', 'x'.repeat(513), Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({ updatedAt: 'no date', id: local.id })).toString('base64url')]) {
      throwsStatus(() => store.listConversations({ processId: PROCESS_ID, cursor }), 400);
    }
    throwsStatus(() => store.listConversations({ processId: null }), 400);
    throwsStatus(() => store.listConversations({ processId: PROCESS_ID, connectionId: '' }), 400);
    const paginated = Array.from({ length: 4 }, () => store.createConversation({ snapshot }));
    const firstPage = store.listConversations({ processId: PROCESS_ID, limit: 2 });
    assert.equal(firstPage.conversations.length, 2);
    assert.ok(firstPage.nextCursor);
    const secondPage = store.listConversations({ processId: PROCESS_ID, limit: 2, cursor: firstPage.nextCursor! });
    const lastPage = store.listConversations({ processId: PROCESS_ID, limit: 2, cursor: secondPage.nextCursor! });
    assert.deepEqual([...firstPage.conversations, ...secondPage.conversations, ...lastPage.conversations].map(row => row.id),
      [...paginated].reverse().map(row => row.id).concat(local.id));
    assert.equal(lastPage.nextCursor, null);

    for (const body of [null, [], {}, { ...request, provider: 'unknown' }, { ...request, model: '--unsafe' },
      { ...request, allowCloud: false }, { ...request, allowCloud: undefined }, { ...request, allowCloud: 'yes' },
      { ...request, question: undefined }, { ...request, question: null }, { ...request, question: '   ' },
      { ...request, question: 4 }, { ...request, clientRequestId: '../no' }, { ...request, provider: 'ollama', model: undefined }]) {
      throwsStatus(() => store.addMessage(local.id, body), 400);
    }
    throwsStatus(() => store.addMessage(local.id, { ...request, question: 'x'.repeat(MAX_QUESTION_CHARS + 1) }), 413);
    throwsStatus(() => store.addMessage(randomUUID(), request), 404);
    const empty = store.createConversation({ snapshot: { ...snapshot, logs: [] } });
    throwsStatus(() => store.addMessage(empty.id, request), 400);
    const initial = store.addMessage(local.id, { ...request, question: `password=${QUESTION_SECRET}\nAnalyze` });
    assert.equal(initial.messages[0].status, 'running');
    assert.ok(!JSON.stringify(initial).includes(QUESTION_SECRET));
    throwsStatus(() => store.addMessage(local.id, request), 409);
    const completed = await settled(() => store.getConversation(local.id));
    assert.equal(completed.messages[0].status, 'completed');
    assert.ok(!JSON.stringify(completed).includes(RESPONSE_SECRET));
    assert.equal(completed.messages[0].result!.redactionCount, 2);
    assert.equal(completed.messages[0].result!.lineCount, 2);
    assert.deepEqual(analyzed[0].snapshot, local.snapshot);
    const requestId = randomUUID();
    store.addMessage(local.id, { ...request, question: 'follow up', clientRequestId: requestId });
    const retried = store.addMessage(local.id, { ...request, question: 'follow up', clientRequestId: requestId });
    assert.equal(retried.messages[1].clientRequestId, requestId, 'opaque request IDs allow acceptance reconciliation');
    assert.equal(retried.messages.length, 2,
      'retrying an accepted request does not charge twice');
    throwsStatus(() => store.addMessage(local.id, { ...request, question: 'another question', clientRequestId: requestId }), 409);
    await settled(() => store.getConversation(local.id));
    assert.equal(analyzed[1].history?.length, 1);
    assert.equal(analyzed[1].history?.[0].analysis, completed.messages[0].result!.analysis);
    assert.ok(!JSON.stringify(analyzed).includes(QUESTION_SECRET));
    for (const question of ['known failure', 'unknown failure', 'invalid response']) {
      store.addMessage(local.id, { ...request, question });
      const failed = (await settled(() => store.getConversation(local.id))).messages.at(-1)!;
      assert.equal(failed.status, 'failed');
      assert.ok(!failed.error!.includes(ERROR_SECRET));
    }
    store.addMessage(local.id, { ...request, question: 'delay' });
    await new Promise<void>(resolve => setImmediate(resolve));
    const delayedId = store.getConversation(local.id).messages.at(-1)!.id;
    throwsStatus(() => store.cancelMessage(remote.id, delayedId), 404);
    throwsStatus(() => store.cancelMessage(local.id, '../invalid'), 400);
    assert.equal(store.cancelMessage(local.id, delayedId).messages.at(-1)!.status, 'cancelled');
    assert.ok(aborted);
    assert.equal(store.cancelMessage(local.id, delayedId).messages.at(-1)!.status, 'cancelled');
    await new Promise<void>(resolve => setImmediate(resolve));
    resolveDelayed?.(result('Late result must not replace cancellation'));
    assert.equal(store.getConversation(local.id).messages.at(-1)!.status, 'cancelled');

    let teardownCalls = 0;
    let teardownAborted = false;
    const teardownStore = createLogAnalysisHistory({ dbPath: path.join(directory, 'teardown.db'),
      analyze: async (_input, signal) => {
        teardownCalls++;
        if (teardownCalls > 1) return result();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => { teardownAborted = true; }, { once: true });
          completeTeardown = () => reject(new LogAnalysisError('Cancelled', 499));
        });
      },
    });
    closeables.push(teardownStore);
    const teardownConversation = teardownStore.createConversation({ snapshot });
    const teardownRunning = teardownStore.addMessage(teardownConversation.id, request);
    await new Promise<void>(resolve => setImmediate(resolve));
    teardownStore.cancelMessage(teardownConversation.id, teardownRunning.messages[0].id);
    assert.ok(teardownAborted);
    throwsStatus(() => teardownStore.addMessage(teardownConversation.id, { ...request, question: 'after cancel' }), 409);
    assert.equal(teardownStore.getConversation(teardownConversation.id).messages.length, 1,
      'provider teardown blocks resend without persisting an extra failed exchange');
    assert.equal(teardownCalls, 1);
    completeTeardown!();
    await new Promise<void>(resolve => setImmediate(resolve));
    const afterTeardown = teardownStore.addMessage(teardownConversation.id, { ...request, question: 'after cancel' });
    assert.equal(afterTeardown.messages.length, 2);
    assert.equal((await settled(() => teardownStore.getConversation(teardownConversation.id))).messages[1].status, 'completed');
    assert.equal(teardownCalls, 2);

    const contextConversation = store.createConversation({ snapshot });
    for (let turn = 0; turn < MAX_CONTEXT_MESSAGES + 2; turn++) {
      store.addMessage(contextConversation.id, { ...request, question: `turn ${turn}` });
      await settled(() => store.getConversation(contextConversation.id));
    }
    const lastInput = analyzed.at(-1)!;
    assert.equal(lastInput.history!.length, MAX_CONTEXT_MESSAGES);
    assert.equal(lastInput.history![0].question, 'turn 1');
    store.addMessage(contextConversation.id, { ...request, question: 'huge response' });
    const huge = (await settled(() => store.getConversation(contextConversation.id))).messages.at(-1)!;
    assert.ok(huge.result!.truncated);
    assert.ok(Buffer.byteLength(huge.result!.analysis) <= MAX_RESULT_BYTES);
    assert.ok(!huge.result!.analysis.includes('�'));
    store.addMessage(contextConversation.id, { ...request, question: 'after huge response' });
    await settled(() => store.getConversation(contextConversation.id));
    assert.ok(Buffer.byteLength(analyzed.at(-1)!.history!.at(-1)!.analysis) <= 64 * 1024);
    assert.match(analyzed.at(-1)!.history!.at(-1)!.analysis, /truncated/);
    const full = store.createConversation({ snapshot });
    const inspection = new Database(dbPath);
    const fixture = inspection.prepare(`INSERT INTO log_analysis_messages
      (id, conversation_id, question, provider, snapshot_json, allow_cloud, status, created_at, updated_at)
      VALUES (?, ?, 'test', 'claude', ?, 1, 'completed', ?, ?)`);
    inspection.transaction(() => {
      for (let index = 0; index < MAX_HISTORY_MESSAGES; index++) fixture.run(randomUUID(), full.id, JSON.stringify(full.snapshot), full.createdAt, full.createdAt);
    })();
    throwsStatus(() => store.addMessage(full.id, request), 413);
    assert.equal((inspection.prepare('SELECT value FROM remote_metrics').get() as { value: string }).value, 'existing metrics');
    assert.equal(inspection.pragma('journal_mode', { simple: true }), 'wal');
    const persistedRows = JSON.stringify(inspection.prepare('SELECT * FROM log_analysis_messages').all());
    for (const secret of [SNAPSHOT_SECRET, QUESTION_SECRET, RESPONSE_SECRET, ERROR_SECRET]) assert.ok(!persistedRows.includes(secret));
    inspection.close();
    await store.close();
    await store.close();
    throwsStatus(() => store.getConversation(local.id), 503);
    const crashed = new Database(dbPath);
    crashed.prepare(`UPDATE log_analysis_messages SET status = 'running', result_json = NULL WHERE id = ?`).run(huge.id);
    crashed.close();
    const restored = createLogAnalysisHistory({ dbPath, analyze });
    closeables.push(restored);
    const reopened = restored.getConversation(local.id);
    assert.equal(reopened.messages[0].result!.analysis, completed.messages[0].result!.analysis);
    assert.equal(reopened.messages[1].clientRequestId, requestId);
    assert.equal(reopened.redactionCount, local.redactionCount);
    assert.equal(reopened.truncated, true);
    const interrupted = restored.getConversation(contextConversation.id).messages.find(turn => turn.id === huge.id)!;
    assert.equal(interrupted.status, 'interrupted');
    assert.match(interrupted.error!, /restarted/);
    const beforeRestartFollowup = analyzed.length;
    restored.addMessage(local.id, { ...request, question: 'after restart' });
    await settled(() => restored.getConversation(local.id));
    assert.equal(analyzed.length, beforeRestartFollowup + 1, 'restart does not retry cloud requests');
    assert.ok(analyzed.at(-1)!.history!.length > 0);

    let passwordConfigured = false;
    const routePath = path.join(directory, 'routes.db');
    const routeStore = createLogAnalysisHistory({ dbPath: path.join(directory, 'injected.db'), analyze });
    closeables.push(routeStore);
    const app = express();
    app.use(express.json());
    app.use('/api/log-analysis', (req, res, next) => {
      if (passwordConfigured && req.get('authorization') !== 'Bearer test-auth') { res.status(401).json({ error: 'Unauthorized' }); return; }
      next();
    });
    app.use('/api/log-analysis', createLogAnalysisRouter({ history: routeStore, passwordConfigured: () => passwordConfigured,
      providers: async () => [], analyze }));
    const lazyRouter = createLogAnalysisRouter({ historyPath: routePath, passwordConfigured: () => false,
      providers: async () => [], analyze });
    app.use('/lazy', lazyRouter);
    const shutdownPath = path.join(directory, 'shutdown.db');
    const shutdownRouter = createLogAnalysisRouter({ historyPath: shutdownPath, passwordConfigured: () => false,
      providers: async () => [], analyze });
    app.use('/shutdown', shutdownRouter);
    server = http.createServer(app);
    await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const api = `${base}/api/log-analysis`;
    const post = (route: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${api}/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    assert.equal((await fetch(`${base}/lazy/providers`)).status, 200);
    await lazyRouter.closeHistory();
    await assert.rejects(fs.stat(routePath), { code: 'ENOENT' }, 'old endpoints do not create a history database');
    assert.equal((await post('conversations', { snapshot }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('conversations', { snapshot }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await fetch(`${api}/conversations`, { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await post('conversations', [])).status, 400);
    const createdResponse = await post('conversations', { snapshot, redactionCount: 1, warnings: [], truncated: false });
    assert.equal(createdResponse.status, 201);
    assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
    const created = (await createdResponse.json()).conversation as ConversationDetail;
    const listResponse = await fetch(`${api}/conversations?processId=${PROCESS_ID}&limit=1`);
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).conversations[0].id, created.id);
    for (const query of ['', 'processId=x', 'processId=-1', 'processId=7&limit=1x', 'processId=7&limit=0', 'processId=7&connectionId=']) {
      assert.equal((await fetch(`${api}/conversations?${query}`)).status, 400, query);
    }
    assert.equal((await fetch(`${api}/conversations/${randomUUID()}`)).status, 404);
    assert.equal((await fetch(`${api}/conversations/invalid`)).status, 400);
    const accepted = await post(`conversations/${created.id}/messages`, { ...request, question: 'delay' });
    assert.equal(accepted.status, 202);
    const acceptedConversation = (await accepted.json()).conversation as ConversationDetail;
    assert.equal(acceptedConversation.messages[0].status, 'running');
    assert.equal((await post(`conversations/${created.id}/messages`, request)).status, 409);
    assert.equal((await fetch(`${api}/conversations/${created.id}`)).status, 200);
    assert.equal(routeStore.getConversation(created.id).messages[0].status, 'running', 'HTTP response closing does not abort persistent work');
    resolveDelayed!(result('Response survives sidebar dismissal and reload.'));
    const finished = await settled(() => routeStore.getConversation(created.id));
    assert.equal(finished.messages[0].status, 'completed');
    const cancelledConversation = (await (await post(`conversations/${created.id}/messages`, { ...request, question: 'delay' })).json()).conversation as ConversationDetail;
    const cancelResponse = await post(`conversations/${created.id}/messages/${cancelledConversation.messages.at(-1)!.id}/cancel`, {});
    assert.equal(cancelResponse.status, 200);
    assert.equal((await cancelResponse.json()).conversation.messages.at(-1).status, 'cancelled');
    assert.equal((await post(`conversations/${created.id}/messages/${randomUUID()}/cancel`, {})).status, 404);
    const shutdownCreatedResponse = await fetch(`${base}/shutdown/conversations`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
    const shutdownCreated = (await shutdownCreatedResponse.json()).conversation as ConversationDetail;
    const shutdownAccepted = await fetch(`${base}/shutdown/conversations/${shutdownCreated.id}/messages`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, question: 'delay' }) });
    assert.equal(shutdownAccepted.status, 202);
    aborted = false;
    await Promise.all([shutdownRouter.closeHistory(), shutdownRouter.closeHistory()]);
    assert.ok(aborted, 'server shutdown aborts running inference');
    const shutdownHistory = createLogAnalysisHistory({ dbPath: shutdownPath, analyze });
    closeables.push(shutdownHistory);
    assert.equal(shutdownHistory.getConversation(shutdownCreated.id).messages[0].status, 'interrupted');
    passwordConfigured = true;
    assert.equal((await fetch(`${api}/conversations?processId=${PROCESS_ID}`)).status, 401, 'history remains behind parent authentication');
    assert.equal((await fetch(`${api}/conversations?processId=${PROCESS_ID}`, { headers: { Authorization: 'Bearer test-auth' } })).status, 200);
    console.log('log-analysis history tests passed (durability, identity isolation, redaction, pagination, background jobs, cancellation, validation, guards)');
  } finally {
    completeTeardown?.();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server!.close(() => resolve()));
    }
    for (const item of closeables) await item.close();
    if (previousConfig === undefined) delete process.env.EZPM2GUI_CONFIG_DIR;
    else process.env.EZPM2GUI_CONFIG_DIR = previousConfig;
    if (previousPm2Home === undefined) delete process.env.PM2_HOME;
    else process.env.PM2_HOME = previousPm2Home;
    const relativeDirectory = path.relative(os.tmpdir(), path.resolve(directory));
    assert.ok(relativeDirectory && !relativeDirectory.startsWith('..') && !path.isAbsolute(relativeDirectory));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'assert/strict';
import { getEventListeners } from 'events';
import {
  AnalysisProvider, AnalysisSnapshot, createLogAnalysisService, LogAnalysisDependencies, LogAnalysisError, ProcessRequest
} from '../../src/server/services/LogAnalysisService';

type JsonRequest = Parameters<NonNullable<LogAnalysisDependencies['requestJson']>>[0];

const PROVIDER_COUNT = 5;
const CLOUD_PROVIDER_COUNT = 4;
const MAX_DISCOVERED_MODELS = 20;
const WAIT_POLL_INTERVAL_MS = 10;
const MAX_WAIT_POLLS = 200;
const CANCELLED_STATUS = 499;
const UNAVAILABLE_STATUS = 503;
const CONSENT_REQUIRED_STATUS = 400;
const help = 'Cursor Claude Copilot Codex --safe-mode --tools --no-session-persistence --strict-mcp-config '
  + '--ignore-user-config --ignore-rules --ephemeral --sandbox --mode --print --output-format --trust '
  + '--available-tools --deny-tool --no-custom-instructions --disable-builtin-mcps --log-dir --log-level '
  + '--nowordwrap --keepalive --hidethinking';
const localTag = { name: 'llama:local', size: 123456, digest: 'a'.repeat(64), details: { format: 'gguf' } };
const localShow = {
  details: { format: 'gguf' }, model_info: { 'general.architecture': 'llama', 'general.parameter_count': 1000000 },
  modelfile: `FROM /Users/test/.ollama/models/blobs/sha256-${'b'.repeat(64)}`
};
const snapshot: AnalysisSnapshot = {
  processId: 7, processName: 'worker', source: 'local',
  logs: [{ stream: 'stderr', message: 'Error ECONNREFUSED 127.0.0.1:5432' }]
};

function deferred() {
  let release: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release: () => release() };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < MAX_WAIT_POLLS; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
  }
  assert.fail('Expected injected provider operation did not start.');
}

async function rejectsStatus(pending: Promise<unknown>, status: number, expression?: RegExp) {
  await assert.rejects(pending, error => error instanceof LogAnalysisError && error.status === status
    && (!expression || expression.test(error.message)));
}

function fixture() {
  const state = {
    installed: true,
    resolveFailure: undefined as Error | undefined,
    gate: undefined as ReturnType<typeof deferred> | undefined,
    cliHelp: help,
    models: [localTag] as unknown[],
    show: localShow as unknown
  };
  const resolvedIds: string[] = [];
  const checks: ProcessRequest[] = [];
  const inference: ProcessRequest[] = [];
  const modelRequests: JsonRequest[] = [];
  const service = createLogAnalysisService({
    env: {},
    resolveExecutable: async id => {
      resolvedIds.push(id);
      if (state.resolveFailure && id === 'claude') throw state.resolveFailure;
      return state.installed ? { executable: { file: `/installed/${id}`, args: [] } } : { reason: 'Install the CLI.' };
    },
    runProcess: async request => {
      if (request.args.includes('--help')) {
        checks.push(request);
        await state.gate?.promise;
        return state.cliHelp;
      }
      inference.push(request);
      return request.executable.file.endsWith('/claude')
        ? JSON.stringify({ result: 'Investigate connection failures at line 1.', is_error: false })
        : 'Investigate connection failures at line 1.';
    },
    requestJson: async request => {
      modelRequests.push(request);
      return request.endpoint === '/api/tags' ? { models: state.models } : state.show;
    }
  });
  return { service, state, resolvedIds, checks, inference, modelRequests };
}

function ollama(catalog: AnalysisProvider[]) {
  const provider = catalog.find(entry => entry.id === 'ollama');
  assert.ok(provider);
  return provider;
}

async function main() {
  {
    const test = fixture();
    const gate = deferred();
    test.state.gate = gate;
    const first = test.service.listProviders();
    const second = test.service.listProviders();
    const refresh = test.service.refreshProviders();
    await waitFor(() => test.checks.length === CLOUD_PROVIDER_COUNT);
    assert.equal(test.resolvedIds.length, CLOUD_PROVIDER_COUNT);
    gate.release();
    const [catalog, parallel, refreshed] = await Promise.all([first, second, refresh]);
    assert.equal(test.checks.length, PROVIDER_COUNT, 'Concurrent cold reads and refresh must share one discovery scan.');
    assert.deepEqual(catalog, parallel);
    assert.deepEqual(catalog, refreshed);
    assert.notEqual(catalog, parallel);
    assert.notEqual(ollama(catalog).models, ollama(parallel).models);
    const cached = await test.service.listProviders();
    assert.deepEqual(cached, catalog);
    assert.equal(test.resolvedIds.length, PROVIDER_COUNT);
    assert.equal(test.modelRequests.length, 2);
    assert.ok([...test.checks, ...test.modelRequests].every(request => request.signal === undefined),
      'Discovery must not inherit a caller abort signal.');

    catalog[0].available = false;
    catalog[0].name = 'corrupted';
    ollama(catalog).models[0].name = 'corrupted';
    ollama(catalog).models.push({ name: 'untrusted', local: false, kind: 'cloud', available: true });
    catalog.pop();
    const untouched = await test.service.listProviders();
    assert.equal(untouched.length, PROVIDER_COUNT);
    assert.equal(untouched[0].available, true);
    assert.equal(untouched[0].name, 'Claude Code');
    assert.deepEqual(ollama(untouched).models, [{ name: localTag.name, local: true, kind: 'local', available: true }]);
  }

  {
    const test = fixture();
    test.state.installed = false;
    const unavailable = await test.service.listProviders();
    assert.ok(unavailable.every(provider => !provider.available));
    test.state.installed = true;
    assert.deepEqual(await test.service.listProviders(), unavailable, 'Unavailable provider catalogs remain cached.');
    assert.equal(test.resolvedIds.length, PROVIDER_COUNT);
    const installed = await test.service.refreshProviders();
    assert.ok(installed.every(provider => provider.available));
    assert.equal(test.resolvedIds.length, PROVIDER_COUNT * 2);
  }

  {
    const test = fixture();
    test.state.models = [];
    const empty = await test.service.listProviders(null);
    assert.deepEqual(ollama(empty).models, []);
    assert.equal(ollama(empty).available, false);
    test.state.models = [localTag];
    assert.deepEqual(await test.service.listProviders(), empty, 'An empty Ollama model list is a valid cached result.');
    assert.equal(test.modelRequests.length, 1);
    assert.equal(ollama(await test.service.refreshProviders()).available, true);
    assert.equal(test.modelRequests.length, 3);
  }

  {
    const test = fixture();
    test.state.models = Array.from({ length: MAX_DISCOVERED_MODELS + 1 }, (_, index) => ({ ...localTag, name: `local-${index}` }));
    const catalog = await test.service.listProviders();
    assert.equal(ollama(catalog).models.length, MAX_DISCOVERED_MODELS);
    assert.equal(test.modelRequests.length, MAX_DISCOVERED_MODELS + 1);
    await test.service.listProviders();
    assert.equal(test.modelRequests.length, MAX_DISCOVERED_MODELS + 1);
  }

  {
    const test = fixture();
    const catalog = await test.service.listProviders();
    const gate = deferred();
    const controller = new AbortController();
    test.state.gate = gate;
    test.state.models = [{ name: 'new-model:cloud', size: 0 }];
    const cancelled = rejectsStatus(test.service.refreshProviders(controller.signal), CANCELLED_STATUS);
    const first = test.service.refreshProviders();
    const second = test.service.refreshProviders();
    await waitFor(() => test.checks.length === PROVIDER_COUNT + CLOUD_PROVIDER_COUNT);
    assert.deepEqual(await test.service.listProviders(), catalog, 'Normal reads keep the successful catalog while refresh runs.');
    controller.abort();
    await cancelled;
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    gate.release();
    const [updated, parallel] = await Promise.all([first, second]);
    assert.deepEqual(updated, parallel);
    assert.equal(test.checks.length, PROVIDER_COUNT * 2, 'Parallel explicit refreshes must share one scan.');
    assert.equal(ollama(updated).models[0].name, 'new-model:cloud');
    assert.deepEqual(await test.service.listProviders(), updated);
    assert.equal(test.checks.length, PROVIDER_COUNT * 2);
  }

  {
    const test = fixture();
    const gate = deferred();
    const firstController = new AbortController();
    const secondController = new AbortController();
    test.state.gate = gate;
    const first = test.service.listProviders(firstController.signal);
    const rejected = rejectsStatus(first, CANCELLED_STATUS, /cancelled/);
    const second = test.service.listProviders(secondController.signal);
    await waitFor(() => test.checks.length === CLOUD_PROVIDER_COUNT);
    assert.equal(getEventListeners(firstController.signal, 'abort').length, 1);
    firstController.abort();
    await rejected;
    assert.equal(getEventListeners(firstController.signal, 'abort').length, 0);
    assert.ok(test.checks.every(request => request.signal === undefined));
    const later = test.service.listProviders();
    gate.release();
    const [catalog, joined] = await Promise.all([second, later]);
    assert.deepEqual(catalog, joined);
    assert.equal(test.checks.length, PROVIDER_COUNT);
    assert.equal(getEventListeners(secondController.signal, 'abort').length, 0);
    assert.deepEqual(await test.service.listProviders(), catalog);
    assert.equal(test.checks.length, PROVIDER_COUNT);
  }

  {
    const test = fixture();
    const gate = deferred();
    test.state.gate = gate;
    const controllers = [new AbortController(), new AbortController()];
    const waiting = controllers.map(controller => rejectsStatus(test.service.listProviders(controller.signal), CANCELLED_STATUS));
    await waitFor(() => test.checks.length === CLOUD_PROVIDER_COUNT);
    controllers.forEach(controller => controller.abort());
    await Promise.all(waiting);
    assert.ok(controllers.every(controller => getEventListeners(controller.signal, 'abort').length === 0));
    gate.release();
    await waitFor(() => test.modelRequests.length === 2);
    const catalog = await test.service.listProviders();
    assert.equal(catalog.length, PROVIDER_COUNT);
    assert.equal(test.checks.length, PROVIDER_COUNT, 'Discovery continues and caches its result even when all callers cancel.');
    assert.ok(test.modelRequests.every(request => request.signal === undefined));
  }

  {
    const test = fixture();
    const cancelled = new AbortController();
    cancelled.abort();
    await rejectsStatus(test.service.listProviders(cancelled.signal), CANCELLED_STATUS);
    await rejectsStatus(test.service.refreshProviders(cancelled.signal), CANCELLED_STATUS);
    assert.equal(test.resolvedIds.length, 0, 'Already cancelled callers must not begin discovery.');
    const cached = await test.service.listProviders();
    await rejectsStatus(test.service.listProviders(cancelled.signal), CANCELLED_STATUS);
    await rejectsStatus(test.service.refreshProviders(cancelled.signal), CANCELLED_STATUS);
    assert.deepEqual(await test.service.listProviders(), cached);
    assert.equal(test.resolvedIds.length, PROVIDER_COUNT, 'Already cancelled refreshes must leave the cached catalog unchanged.');
  }

  {
    const test = fixture();
    const controller = new AbortController();
    const failure = new Error('Discovery failed at executable resolution.');
    test.state.resolveFailure = failure;
    const first = test.service.listProviders(controller.signal);
    const second = test.service.listProviders();
    await Promise.all([assert.rejects(first, error => error === failure), assert.rejects(second, error => error === failure)]);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(test.resolvedIds.length, CLOUD_PROVIDER_COUNT);
    test.state.resolveFailure = undefined;
    const recovered = await test.service.listProviders();
    assert.equal(recovered.length, PROVIDER_COUNT);
    assert.equal(test.resolvedIds.length, CLOUD_PROVIDER_COUNT + PROVIDER_COUNT);
    test.state.resolveFailure = failure;
    await assert.rejects(test.service.refreshProviders(), error => error === failure);
    assert.deepEqual(await test.service.listProviders(), recovered, 'Failed refresh must preserve the previous successful catalog.');
    test.state.resolveFailure = undefined;
    test.state.models = [];
    assert.deepEqual(ollama(await test.service.refreshProviders()).models, []);
  }

  {
    const test = fixture();
    await test.service.listProviders();
    const cachedCheckCount = test.checks.length;
    const cachedModelRequestCount = test.modelRequests.length;
    test.state.show = { ...localShow, remote_host: 'https://ollama.com' };
    await rejectsStatus(test.service.analyzeSnapshot({ provider: 'ollama', model: localTag.name, snapshot, allowCloud: false }),
      CONSENT_REQUIRED_STATUS, /cloud/);
    assert.equal(test.checks.length, cachedCheckCount + 1);
    assert.equal(test.modelRequests.length, cachedModelRequestCount + 2);
    assert.equal(test.inference.length, 0, 'Cached local model discovery must not bypass updated cloud consent checks.');
    assert.equal(ollama(await test.service.listProviders()).models[0].kind, 'local');
    await test.service.analyzeSnapshot({ provider: 'ollama', model: localTag.name, snapshot, allowCloud: true });
    assert.equal(test.inference.length, 1);
    test.state.cliHelp = 'Old unsupported CLI';
    await rejectsStatus(test.service.analyzeSnapshot({ provider: 'claude', snapshot, allowCloud: true }), UNAVAILABLE_STATUS, /Update/);
    assert.equal(test.inference.length, 1, 'Inference must revalidate the selected CLI after a cached supported capability check.');
    assert.equal((await test.service.listProviders()).find(provider => provider.id === 'claude').available, true);
  }

  console.log('log-analysis provider cache tests passed (single scans, refresh, defensive copies, cancellation, failure recovery and inference revalidation)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

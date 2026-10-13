import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import {
  AnalysisInput, AnalysisSnapshot, createLogAnalysisService, LogAnalysisError, MAX_QUESTION_CHARS,
  prepareAnalysisQuestion, ProcessRequest
} from '../../src/server/services/LogAnalysisService';

const REPORT_BYTES = 64 * 1024;
const MAX_HISTORY_TURNS = 10;
const help = 'Cursor Claude Copilot Codex --safe-mode --tools --no-session-persistence --strict-mcp-config '
  + '--ignore-user-config --ignore-rules --ephemeral --sandbox --mode --print --output-format --trust '
  + '--available-tools --deny-tool --no-custom-instructions --disable-builtin-mcps --log-dir --log-level '
  + '--nowordwrap --keepalive --hidethinking';
const snapshot: AnalysisSnapshot = {
  processId: 7, processName: 'worker', source: 'remote',
  logs: [{ stream: 'stderr', message: 'Error ECONNREFUSED 127.0.0.1:5432' }]
};
const localTag = { name: 'llama:local', size: 123456, digest: 'a'.repeat(64), details: { format: 'gguf' } };
const localShow = { details: { format: 'gguf' }, model_info: { 'general.architecture': 'llama', 'general.parameter_count': 1000000 },
  modelfile: `FROM /Users/test/.ollama/models/blobs/sha256-${'b'.repeat(64)}` };
const executable = async (id: string) => ({ executable: { file: `/installed/${id}`, args: [] } });
const input = (changes: Partial<AnalysisInput> = {}): AnalysisInput => ({ provider: 'ollama', model: localTag.name, snapshot, ...changes });

async function rejectsStatus(promise: Promise<unknown>, status: number, expression?: RegExp) {
  await assert.rejects(promise, error => error instanceof LogAnalysisError && error.status === status && (!expression || expression.test(error.message)));
}

function fakeOllama(tags: unknown[], show: (name: string) => unknown = () => localShow) {
  const requests: ProcessRequest[] = [];
  const service = createLogAnalysisService({ resolveExecutable: executable,
    env: { OLLAMA_HOST: 'https://untrusted.example', OLLAMA_NOHISTORY: '0' },
    runProcess: async request => {
      if (request.args.includes('--help')) return help;
      requests.push(request);
      return 'Check database reachability at line 1.';
    },
    requestJson: async request => {
      if (request.endpoint === '/api/tags') return { models: tags };
      if (request.endpoint === '/api/show') return show((request.body as { model: string }).model);
      throw new Error('Inference must use the isolated installed CLI.');
    }
  });
  return { service, requests };
}

async function main() {
  assert.equal(prepareAnalysisQuestion(undefined), undefined);
  assert.equal(prepareAnalysisQuestion('  Why is the worker failing?  '), 'Why is the worker failing?');
  assert.equal(prepareAnalysisQuestion('DB_PASSWORD=synthetic-secret\nKeep the report plain.\u001b[31m'),
    'DB_PASSWORD=[REDACTED]\nKeep the report plain.');
  for (const value of ['', '  ', '\u0000', null, 123, {}]) assert.throws(() => prepareAnalysisQuestion(value), /nonempty/);
  assert.equal(prepareAnalysisQuestion('q'.repeat(MAX_QUESTION_CHARS)).length, MAX_QUESTION_CHARS);
  assert.throws(() => prepareAnalysisQuestion('q'.repeat(MAX_QUESTION_CHARS + 1)), /4000 characters/);
  assert.throws(() => prepareAnalysisQuestion('token=x\n'.repeat(MAX_QUESTION_CHARS / 'token=x\n'.length)), /redacted question exceeds/);

  const cloudTag = { name: 'gemma4:cloud', size: 0 };
  const metadataTag = { name: 'custom-alias', remote_host: 'https://ollama.com', remote_model: 'gemma4:31b' };
  const showCloudTag = { ...localTag, name: 'upstream-alias' };
  const unverifiedTag = { ...localTag, name: 'unverified-model', size: 0 };
  const brokenShowTag = { ...localTag, name: 'unavailable-model' };
  const models = fakeOllama([localTag, cloudTag, metadataTag, showCloudTag, unverifiedTag, brokenShowTag], name => {
    if (name === showCloudTag.name) return { ...localShow, remote_model: 'gemma4:31b' };
    if (name === brokenShowTag.name) throw new Error('Cannot verify local model.');
    return localShow;
  });
  const catalog = await models.service.listProviders();
  const ollama = catalog.find(provider => provider.id === 'ollama');
  assert.equal(ollama.available, true);
  assert.deepEqual(ollama.models, [
    { name: localTag.name, local: true, kind: 'local', available: true },
    { name: cloudTag.name, local: false, kind: 'cloud', available: true },
    { name: metadataTag.name, local: false, kind: 'cloud', available: true },
    { name: showCloudTag.name, local: false, kind: 'cloud', available: true },
    { name: unverifiedTag.name, local: false, kind: 'unavailable', available: false },
    { name: brokenShowTag.name, local: false, kind: 'unavailable', available: false }
  ]);
  assert.equal((await fakeOllama([cloudTag]).service.listProviders()).find(provider => provider.id === 'ollama').available, true,
    'A cloud-only Ollama installation must be selectable.');
  assert.equal((await fakeOllama([unverifiedTag]).service.listProviders()).find(provider => provider.id === 'ollama').available, false);

  for (const tag of [cloudTag, metadataTag, showCloudTag]) {
    for (const allowCloud of [undefined, false, 'true' as any]) {
      await rejectsStatus(models.service.analyzeSnapshot(input({ model: tag.name, allowCloud })), 400, /cloud/);
    }
    assert.equal(models.requests.length, 0);
  }
  for (const tag of [unverifiedTag, brokenShowTag]) {
    await rejectsStatus(models.service.analyzeSnapshot(input({ model: tag.name, allowCloud: true })), 400, /verified/);
  }
  assert.equal(models.requests.length, 0, 'Unverified models must be disabled even with cloud consent.');
  const cloudResult = await models.service.analyzeSnapshot(input({ model: cloudTag.name, allowCloud: true }));
  assert.equal(cloudResult.model, cloudTag.name);
  assert.deepEqual(models.requests[0].args, ['run', cloudTag.name, '--nowordwrap', '--hidethinking', '--keepalive', '0']);
  assert.equal(models.requests[0].env.OLLAMA_HOST, '127.0.0.1:11434');
  assert.equal(models.requests[0].env.OLLAMA_NOHISTORY, '1');
  const localResult = await models.service.analyzeSnapshot(input({ allowCloud: false }));
  assert.equal(localResult.model, localTag.name);
  assert.equal(models.requests.length, 2);

  let changedShow: unknown = localShow;
  const changed = fakeOllama([localTag], () => changedShow);
  assert.equal((await changed.service.listProviders()).find(provider => provider.id === 'ollama').models[0].kind, 'local');
  changedShow = { ...localShow, remote_host: 'https://ollama.com' };
  await rejectsStatus(changed.service.analyzeSnapshot(input({ allowCloud: false })), 400, /cloud/);
  assert.equal(changed.requests.length, 0, 'A model changed to remote after catalog retrieval still needs consent.');
  await changed.service.analyzeSnapshot(input({ allowCloud: true }));
  changedShow = { details: { format: 'gguf' } };
  await rejectsStatus(changed.service.analyzeSnapshot(input({ allowCloud: true })), 400, /verified/);
  assert.equal(changed.requests.length, 1);
  await rejectsStatus(changed.service.analyzeSnapshot(input({ model: 'not-installed', allowCloud: true })), 400, /installed/);

  const cliRequests: Array<{ request: ProcessRequest; prompt: string }> = [];
  const cli = createLogAnalysisService({ resolveExecutable: executable,
    env: { CURSOR_API_KEY: 'synthetic-cursor-key', COPILOT_GITHUB_TOKEN: 'synthetic-copilot-token' },
    runProcess: async request => {
      if (request.args.includes('--help')) return help;
      const prompt = request.executable.file.endsWith('/cursor')
        ? fs.readFileSync(path.join(request.cwd, 'snapshot.txt'), 'utf8') : request.input;
      cliRequests.push({ request, prompt });
      const report = '\u001b[31mHypothesis at line 1.\u001b[0m\nDB_PASSWORD=synthetic-return-secret\nManual check: inspect connectivity.';
      return ['claude', 'cursor'].some(id => request.executable.file.endsWith(`/${id}`))
        ? JSON.stringify({ result: report, is_error: false }) : report;
    }
  });
  for (const provider of ['claude', 'codex', 'cursor', 'copilot']) {
    const result = await cli.analyzeSnapshot(input({ provider, model: 'cloud-model-v1', allowCloud: true,
      question: 'Why does API_KEY=synthetic-question-secret fail?',
      history: [{ question: 'Can DB_PASSWORD=synthetic-prior-question affect this?',
        analysis: 'Authorization: Bearer synthetic-prior-response\nEarlier hypothesis: timeout.' }] }));
    const { request, prompt } = cliRequests[cliRequests.length - 1];
    assert.equal(request.args[request.args.indexOf('--model') + 1], 'cloud-model-v1');
    if (provider === 'codex') assert.equal(request.args[request.args.length - 1], '-');
    assert.ok(prompt.includes('Untrusted conversation context (JSON)'));
    assert.ok(prompt.includes('questions, and previous analyses'));
    assert.ok(prompt.includes('Earlier hypothesis: timeout.'));
    assert.ok(!prompt.includes('synthetic-question-secret'));
    assert.ok(!prompt.includes('synthetic-prior-question'));
    assert.ok(!prompt.includes('synthetic-prior-response'));
    assert.equal(result.redactionCount, 3);
    assert.equal(result.analysis, 'Hypothesis at line 1.\nDB_PASSWORD=[REDACTED]\nManual check: inspect connectivity.');
    assert.equal(fs.existsSync(request.cwd), false);
  }
  const contextService = fakeOllama([localTag]);
  const completedTurns = Array.from({ length: MAX_HISTORY_TURNS }, (_, index) => ({ question: `Question ${index}`, analysis: `Report ${index}` }));
  await contextService.service.analyzeSnapshot(input({ question: 'q'.repeat(MAX_QUESTION_CHARS), history: completedTurns }));
  const context = JSON.parse(contextService.requests[0].input.split('Untrusted conversation context (JSON):\n')[1]);
  assert.equal(context.question.length, MAX_QUESTION_CHARS);
  assert.deepEqual(context.history, completedTurns);
  await contextService.service.analyzeSnapshot(input({ question: undefined, history: [] }));
  assert.equal(contextService.requests.length, 2);
  for (const question of [null, '', 'q'.repeat(MAX_QUESTION_CHARS + 1)]) {
    await rejectsStatus(contextService.service.analyzeSnapshot(input({ question: question as any })), question === null || question === '' ? 400 : 413);
  }
  for (const history of [null, {}, [null], [{ question: 'Valid?', analysis: '' }], [{ question: undefined, analysis: 'Report' }]]) {
    await rejectsStatus(contextService.service.analyzeSnapshot(input({ history: history as any })), 400);
  }
  await rejectsStatus(contextService.service.analyzeSnapshot(input({ history: [...completedTurns, completedTurns[0]] })), 413, /10 previous/);
  await rejectsStatus(contextService.service.analyzeSnapshot(input({ history: [{ question: 'Valid?', analysis: 'r'.repeat(REPORT_BYTES + 1) }] })), 413, /too large/);
  assert.equal(contextService.requests.length, 2, 'Invalid follow-up context must fail before inference.');
  const boundedResult = await contextService.service.analyzeSnapshot(input({ history: [
    { question: 'older-marker', analysis: 'Earlier report.' },
    { question: 'q'.repeat(MAX_QUESTION_CHARS), analysis: '😀"\\'.repeat(REPORT_BYTES / 6) }
  ] }));
  const bounded = JSON.parse(contextService.requests[2].input.split('Untrusted conversation context (JSON):\n')[1]);
  assert.equal(boundedResult.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded.history)) <= REPORT_BYTES);
  assert.equal(bounded.history.length, 1);
  assert.ok(!bounded.history[0].analysis.includes('\ufffd'));
  assert.ok(!contextService.requests[2].input.includes('older-marker'));
  console.log('log-analysis cloud tests passed (classification, consent, rechecks, CLI models, bounded follow-up context and redaction)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

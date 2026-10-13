import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prepareCliAuthentication } from '../../src/server/services/CliAuthentication';

async function main() {
  const fixture = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-auth-test-'));
  const home = path.join(fixture, 'user');
  const workspace = path.join(fixture, 'workspace');
  const cursor = path.join(home, '.cursor');
  await fs.promises.mkdir(cursor, { recursive: true });
  await fs.promises.mkdir(workspace);
  await fs.promises.writeFile(path.join(cursor, 'hooks.json'), '{"hooks":{"sessionStart":[{"command":"never execute"}]}}');
  await fs.promises.writeFile(path.join(cursor, 'auth.json'), '{"accessToken":"synthetic-old","refreshToken":"synthetic-refresh","metadata":"keep"}', { mode: 0o600 });
  const cleanups: Array<() => Promise<void>> = [];
  try {
    const source: NodeJS.ProcessEnv = { HOME: home, AGENT_CLI_CREDENTIAL_STORE: 'file', CURSOR_API_KEY: 'synthetic-optional' };
    const child: NodeJS.ProcessEnv = { CURSOR_API_KEY: source.CURSOR_API_KEY };
    let finish: (() => Promise<void>) | undefined;
    try {
      finish = await prepareCliAuthentication('cursor', source, child, workspace, 'darwin');
    } catch (error) {
      assert.equal(process.platform, 'win32');
      assert.equal((error as NodeJS.ErrnoException).code, 'EPERM');
      assert.equal(fs.existsSync(child.HOME!), false, 'Denied fixture symlinks must clean up isolated credentials');
    }
    if (finish) {
      cleanups.push(finish);
      assert.notEqual(child.HOME, source.HOME);
      assert.ok(path.relative(workspace, child.HOME!).startsWith('..'));
      assert.equal(child.DIRENV_DISABLE, '1');
      assert.equal(child.CURSOR_API_KEY, source.CURSOR_API_KEY);
      assert.equal(child.AGENT_CLI_CREDENTIAL_STORE, 'file');
      const linkedAuth = path.join(child.HOME!, '.cursor', 'auth.json');
      assert.equal(await fs.promises.readlink(linkedAuth), path.join(cursor, 'auth.json'));
      assert.equal(fs.existsSync(path.join(child.HOME!, '.cursor', 'hooks.json')), false);
      assert.deepEqual(await fs.promises.readdir(child.CURSOR_CONFIG_DIR!), []);
      assert.deepEqual(await fs.promises.readdir(child.CURSOR_DATA_DIR!), []);
      // Model-independent fixture: the CLI's direct auth-file write reaches its original store.
      await fs.promises.writeFile(linkedAuth, '{"accessToken":"synthetic-refreshed","metadata":"keep"}', { mode: 0o600 });
      assert.equal(JSON.parse(await fs.promises.readFile(path.join(cursor, 'auth.json'), 'utf8')).accessToken, 'synthetic-refreshed');
      await finish();
      assert.equal(fs.existsSync(child.HOME!), false);
      assert.equal(fs.existsSync(path.join(cursor, 'auth.json')), true);
    }

    for (const [platform, extras, expectedKey, expectedValue] of [
      ['linux', { XDG_CONFIG_HOME: path.join(fixture, 'custom-xdg') }, 'XDG_CONFIG_HOME', path.join(fixture, 'custom-xdg')],
      ['linux', {}, 'XDG_CONFIG_HOME', path.join(home, '.config')],
      ['win32', { APPDATA: path.join(fixture, 'roaming') }, 'APPDATA', path.join(fixture, 'roaming')],
      ['win32', {}, 'APPDATA', path.join(home, 'AppData', 'Roaming')]
    ] as const) {
      const environment: NodeJS.ProcessEnv = {};
      cleanups.push(await prepareCliAuthentication('cursor', { HOME: home, ...extras }, environment, workspace, platform));
      assert.equal(environment[expectedKey], expectedValue);
      assert.notEqual(environment.HOME, home);
      assert.equal(environment.AGENT_CLI_CREDENTIAL_STORE, undefined);
    }
    const keychain: NodeJS.ProcessEnv = {};
    cleanups.push(await prepareCliAuthentication('cursor', { HOME: home }, keychain, workspace, 'darwin'));
    assert.equal(fs.existsSync(path.join(keychain.HOME!, '.cursor', 'auth.json')), false, 'Default macOS auth uses the CLI keychain');

    const copilotHome = path.join(fixture, 'custom-copilot');
    await fs.promises.mkdir(copilotHome);
    const account = { host: 'https://github.com', login: 'fixture-user_org' };
    await fs.promises.writeFile(path.join(copilotHome, 'config.json'), '// Automatically managed state\n' + JSON.stringify({
      lastLoggedInUser: { ...account, arbitraryPolicy: 'never inherit' }, loggedInUsers: [account],
      copilotTokens: { 'fixture-key': 'synthetic-oauth' }, installedPlugins: [{ command: 'never execute' }],
      trustedFolders: ['*'], hooks: { sessionStart: 'never execute' }, model: 'never inherit'
    }), { mode: 0o600 });
    await fs.promises.writeFile(path.join(copilotHome, 'settings.json'), '{"storeTokenPlaintext":true,"disableAllHooks":false,"enabledPlugins":{"fixture":true}}');
    const copilot: NodeJS.ProcessEnv = { GH_TOKEN: 'synthetic-env-token' };
    cleanups.push(await prepareCliAuthentication('copilot', { HOME: home, COPILOT_HOME: copilotHome,
      GH_CONFIG_DIR: path.join(fixture, 'github-auth') }, copilot, workspace, 'darwin'));
    assert.notEqual(copilot.HOME, home);
    assert.ok(path.relative(workspace, copilot.COPILOT_HOME!).startsWith('..'));
    assert.equal(copilot.GH_TOKEN, 'synthetic-env-token');
    assert.equal(copilot.GH_CONFIG_DIR, path.join(fixture, 'github-auth'));
    assert.equal(copilot.COPILOT_CACHE_HOME, path.join(home, 'Library', 'Caches', 'copilot'));
    const authState = JSON.parse(await fs.promises.readFile(path.join(copilot.COPILOT_HOME!, 'config.json'), 'utf8'));
    assert.deepEqual(authState, { lastLoggedInUser: account, loggedInUsers: [account], copilotTokens: { 'fixture-key': 'synthetic-oauth' } });
    const settings = JSON.parse(await fs.promises.readFile(path.join(copilot.COPILOT_HOME!, 'settings.json'), 'utf8'));
    assert.equal(settings.disableAllHooks, true);
    assert.equal(settings.storeTokenPlaintext, true);
    assert.equal(settings.enabledPlugins, undefined);
    const savedAuthStat = await fs.promises.stat(path.join(copilot.COPILOT_HOME!, 'config.json'));
    assert.ok(savedAuthStat.isFile());
    if (process.platform !== 'win32') assert.equal(savedAuthStat.mode & 0o777, 0o600);
    assert.deepEqual((await fs.promises.readdir(copilot.COPILOT_HOME!)).sort(), ['config.json', 'settings.json']);

    await fs.promises.writeFile(path.join(copilotHome, 'settings.json'), '{"storeTokenPlaintext":false}');
    for (const raw of ['{"copilot_tokens":{"fixture-key":"synthetic-legacy"},"last_logged_in_user":{"host":"https://github.com","login":"fixture-user_org"}}',
      '{"loggedInUsers":[{"host":"https://github.com","login":"fixture-user_org"}]}', '{ malformed', 'x'.repeat(64 * 1024 + 1)]) {
      await fs.promises.writeFile(path.join(copilotHome, 'config.json'), raw, { mode: 0o600 });
      const environment: NodeJS.ProcessEnv = {};
      cleanups.push(await prepareCliAuthentication('copilot', { HOME: home, COPILOT_HOME: copilotHome }, environment, workspace, 'linux'));
      const state = JSON.parse(await fs.promises.readFile(path.join(environment.COPILOT_HOME!, 'config.json'), 'utf8'));
      if (raw.includes('synthetic-legacy')) assert.equal(state.copilotTokens['fixture-key'], 'synthetic-legacy');
      else if (raw.includes('loggedInUsers')) assert.deepEqual(state.loggedInUsers, [account]);
      else assert.deepEqual(state, {});
      const config = JSON.parse(await fs.promises.readFile(path.join(environment.COPILOT_HOME!, 'settings.json'), 'utf8'));
      assert.equal(config.storeTokenPlaintext, undefined, 'Saved tokens remain fallback to the native keychain by default');
    }
    for (const provider of ['cursor', 'copilot'] as const) {
      cleanups.push(await prepareCliAuthentication(provider, {}, {}, workspace));
    }
    console.log('CLI authentication tests passed');
  } finally {
    await Promise.all(cleanups.map(cleanup => cleanup()));
    await fs.promises.rm(fixture, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exit(1); });

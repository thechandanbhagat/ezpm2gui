import fs from 'fs';
import os from 'os';
import path from 'path';

const MAX_STATE_BYTES = 64 * 1024;

function absolute(value: string | undefined): string | undefined {
  return value && path.isAbsolute(value) ? value : undefined;
}

function originalHome(environment: NodeJS.ProcessEnv): string | undefined {
  return absolute(environment.HOME) || absolute(environment.USERPROFILE);
}

async function regularStateFile(file: string): Promise<boolean> {
  try {
    const state = await fs.promises.lstat(file);
    return state.isFile() && state.size <= MAX_STATE_BYTES
      && (typeof process.getuid !== 'function' || state.uid === process.getuid());
  } catch { return false; }
}

async function boundedState(file: string): Promise<Record<string, unknown> | undefined> {
  if (!await regularStateFile(file)) return undefined;
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const state = await handle.stat();
    if (!state.isFile() || state.size > MAX_STATE_BYTES
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) return undefined;
    const bytes = Buffer.alloc(MAX_STATE_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_STATE_BYTES) return undefined;
    // Copilot's automatically managed config starts with whole-line JSON comments.
    const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8').replace(/^\s*\/\/[^\r\n]*$/gm, ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch { return undefined; }
  finally { await handle?.close(); }
}

function identity(value: unknown): { host: string; login: string } | undefined {
  const account = value as any;
  if (!account || typeof account.host !== 'string' || account.host.length > 512
    || typeof account.login !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(account.login)) return undefined;
  try {
    const host = new URL(account.host);
    if (host.protocol !== 'https:' || host.username || host.password || host.search || host.hash) return undefined;
    return { host: account.host, login: account.login };
  } catch { return undefined; }
}

async function prepareCopilot(source: NodeJS.ProcessEnv, child: NodeJS.ProcessEnv, root: string, platform: NodeJS.Platform) {
  const home = originalHome(source);
  const sourceDirectory = absolute(source.COPILOT_HOME) || (home && path.join(home, '.copilot'));
  const state = sourceDirectory && await boundedState(path.join(sourceDirectory, 'config.json'));
  const settings = sourceDirectory && await boundedState(path.join(sourceDirectory, 'settings.json'));
  const plaintextPreference = settings?.storeTokenPlaintext ?? settings?.store_token_plaintext
    ?? state?.storeTokenPlaintext ?? state?.store_token_plaintext;
  const output: Record<string, unknown> = {};
  if (state) {
    const last = identity(state.lastLoggedInUser ?? state.last_logged_in_user);
    if (last) output.lastLoggedInUser = last;
    const users = state.loggedInUsers ?? state.logged_in_users;
    if (Array.isArray(users)) output.loggedInUsers = users.slice(0, 32).map(identity).filter(Boolean);
    const tokens = state.copilotTokens ?? state.copilot_tokens;
    if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
      const selected: Record<string, string> = Object.create(null);
      for (const [key, value] of Object.entries(tokens).slice(0, 32)) {
        if (key.length <= 2048 && typeof value === 'string' && /^[^\u0000-\u001f]{1,16384}$/.test(value)) selected[key] = value;
      }
      if (Object.keys(selected).length > 0) output.copilotTokens = selected;
    }
  }
  child.COPILOT_HOME = path.join(root, 'copilot');
  await fs.promises.mkdir(child.COPILOT_HOME, { mode: 0o700 });
  const serialized = JSON.stringify(output);
  await fs.promises.writeFile(path.join(child.COPILOT_HOME, 'config.json'),
    Buffer.byteLength(serialized) <= MAX_STATE_BYTES ? serialized : '{}', { mode: 0o600 });
  await fs.promises.writeFile(path.join(child.COPILOT_HOME, 'settings.json'), JSON.stringify({
    disableAllHooks: true, autoUpdate: false, memory: false, connectors: false,
    ide: { autoConnect: false }, ...(plaintextPreference === true ? { storeTokenPlaintext: true } : {})
  }), { mode: 0o600 });
  // The native launcher keeps its installed JavaScript runtime in this cache.
  // Preserve its location so an isolated HOME does not trigger a fresh download.
  const cacheBase = platform === 'darwin' ? home && path.join(home, 'Library', 'Caches')
    : (platform === 'win32' ? absolute(source.LOCALAPPDATA) : absolute(source.XDG_CACHE_HOME))
      || (home && path.join(home, '.cache'));
  child.COPILOT_CACHE_HOME = absolute(source.COPILOT_CACHE_HOME)
    || (cacheBase && path.join(cacheBase, 'copilot')) || path.join(root, 'copilot-cache');
  child.COPILOT_MCP_TOOL_CACHE = 'false';
  child.GH_CONFIG_DIR = absolute(source.GH_CONFIG_DIR)
    || (absolute(source.XDG_CONFIG_HOME) && path.join(source.XDG_CONFIG_HOME!, 'gh'))
    || (platform === 'win32' && absolute(source.APPDATA) && path.join(source.APPDATA!, 'GitHub CLI'))
    || (home && path.join(home, '.config', 'gh')) || path.join(root, 'gh');
  child.GH_PROMPT_DISABLED = '1';
  child.GH_NO_UPDATE_NOTIFIER = '1';
  // libsecret needs the original desktop session bus to reach the user's keyring.
  for (const key of ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR']) {
    if (source[key]) child[key] = source[key];
  }
}

/** Reuse the CLI's credential store while keeping agent customizations outside the workspace. */
export async function prepareCliAuthentication(provider: 'cursor' | 'copilot', source: NodeJS.ProcessEnv,
  child: NodeJS.ProcessEnv, _workspace: string, platform: NodeJS.Platform = process.platform): Promise<() => Promise<void>> {
  // A separate temporary root keeps credentials outside Cursor's workspace read boundary.
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ezpm2gui-cli-auth-'));
  const cleanup = () => fs.promises.rm(root, { recursive: true, force: true });
  try {
    const isolatedHome = path.join(root, 'home');
    await fs.promises.mkdir(isolatedHome, { mode: 0o700 });
    child.HOME = isolatedHome;
    child.USERPROFILE = isolatedHome;
    if (platform === 'win32') {
      const parsed = path.win32.parse(isolatedHome);
      child.HOMEDRIVE = parsed.root.replace(/[\\/]$/, '');
      child.HOMEPATH = isolatedHome.slice(parsed.root.length - 1);
    }
    if (provider === 'copilot') await prepareCopilot(source, child, root, platform);
    else {
      const home = originalHome(source);
      if (platform === 'win32') {
        // Cursor's file credential store uses APPDATA, independently of its config directory.
        child.APPDATA = absolute(source.APPDATA) || (home && path.join(home, 'AppData', 'Roaming')) || path.join(root, 'appdata');
      } else if (platform !== 'darwin') {
        // Config is overridden below; this path is retained only for native saved credentials.
        child.XDG_CONFIG_HOME = absolute(source.XDG_CONFIG_HOME) || (home && path.join(home, '.config')) || path.join(root, 'xdg');
      }
      child.CURSOR_CONFIG_DIR = path.join(root, 'cursor-config');
      child.CURSOR_DATA_DIR = path.join(root, 'cursor-data');
      child.DIRENV_DISABLE = '1';
      await fs.promises.mkdir(child.CURSOR_CONFIG_DIR, { mode: 0o700 });
      await fs.promises.mkdir(child.CURSOR_DATA_DIR, { mode: 0o700 });
      if (source.AGENT_CLI_CREDENTIAL_STORE === 'file') child.AGENT_CLI_CREDENTIAL_STORE = 'file';
      else delete child.AGENT_CLI_CREDENTIAL_STORE;
      if (platform === 'darwin' && child.AGENT_CLI_CREDENTIAL_STORE === 'file' && home) {
        const credentials = path.join(home, '.cursor', 'auth.json');
        if (await regularStateFile(credentials)) {
          const isolatedCursor = path.join(isolatedHome, '.cursor');
          await fs.promises.mkdir(isolatedCursor, { mode: 0o700 });
          // The CLI follows this file link when refreshing tokens, preserving the existing login.
          await fs.promises.symlink(credentials, path.join(isolatedCursor, 'auth.json'));
        }
      }
    }
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

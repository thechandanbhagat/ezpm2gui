import assert from 'assert/strict';
import childProcess from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mock } from 'node:test';
import type { Router } from 'express';

function request(router: Router, method: string, url: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const response = { status() { return this; }, json: resolve };
    (router as any).handle({ method, url, body }, response, (error?: Error) =>
      reject(error || new Error(`Unhandled ${method} ${url}`)));
  });
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-module-config-'));
  const previousHome = process.env.PM2_HOME;
  const previousConfig = process.env.PM2_MODULE_CONF_FILE;
  process.env.PM2_HOME = directory;
  delete process.env.PM2_MODULE_CONF_FILE;
  try {
    const router = (await import('../../src/server/routes/modules')).default;
    const name = '@thechandanbhagat/pm2-notifier';
    const configUrl = `/${encodeURIComponent(name)}/config`;
    const configPath = '/srv/PM2 Alerts/"production team"/config.json';
    fs.writeFileSync(path.join(directory, 'module_conf.json'), JSON.stringify({ [name]: { configPath } }));
    assert.deepEqual(await request(router, 'GET', configUrl), { config: { configPath } });

    const calls: string[][] = [];
    mock.method(childProcess, 'execFile', (file: string, args: string[], _options: object, callback: Function) => {
      assert.equal(file, process.execPath);
      assert.equal(args[0], require.resolve('pm2/bin/pm2'));
      calls.push(args.slice(1));
      callback(null, '', '');
    });

    const config = { envFile: '/srv/PM2 Alerts/production.env', configPath };
    assert.equal((await request(router, 'PUT', configUrl, { config })).success, true);
    assert.equal((await request(router, 'POST', '/install', { moduleName: name })).success, true);
    assert.equal((await request(router, 'DELETE', `/${encodeURIComponent(name)}`)).success, true);
    assert.deepEqual(calls, [
      ['set', `${name}:envFile`, config.envFile],
      ['set', `${name}:configPath`, configPath],
      ['install', name],
      ['uninstall', name],
    ]);
    console.log('PM2 module route tests passed (scoped names, custom PM2 home, literal configuration values).');
  } finally {
    mock.restoreAll();
    if (previousHome === undefined) delete process.env.PM2_HOME;
    else process.env.PM2_HOME = previousHome;
    if (previousConfig === undefined) delete process.env.PM2_MODULE_CONF_FILE;
    else process.env.PM2_MODULE_CONF_FILE = previousConfig;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

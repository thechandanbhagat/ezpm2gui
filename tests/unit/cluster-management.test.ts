import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Router } from 'express';

const request = (router: Router, method: string, url: string, body?: object, connectionId?: string) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    let status = 200;
    const response = {
      status(value: number) { status = value; return this; },
      json(result: unknown) { resolve({ status, body: result }); },
    };
    (router as any).handle({ method, url, body, params: { connectionId } }, response, (err?: Error) =>
      reject(err ?? new Error(`Unhandled route ${method} ${url}`)));
  });

async function main() {
  // Import PM2 with a disposable home. Both test targets are in-memory doubles.
  const previousHome = process.env.PM2_HOME;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-cluster-'));
  process.env.PM2_HOME = directory;
  try {
    const { createClusterRouter } = await import('../../src/server/routes/clusterManagement');
    const createTarget = (name: string) => {
      const calls: unknown[][] = [];
      const processes = [{ pm_id: 0, name, pm2_env: {
        namespace: 'default', pm_exec_path: '/srv/api.js', instances: 1, exec_mode: 'fork_mode',
      } }];
      return {
        calls, processes,
        list: async () => processes,
        workingDirectory: () => '/srv',
        scale: async (app: string, instances: number) => { calls.push(['scale', app, instances]); },
        reload: async (id: string | number) => { calls.push(['reload', id]); },
        changeMode: async (id: number, mode: string) => { calls.push(['exec-mode', id, mode]); },
      };
    };
    const local = createTarget('local-api');
    const remote = createTarget('remote-api');
    const localRouter = createClusterRouter(() => local);
    const remoteRouter = createClusterRouter(id => id === 'production' ? remote : undefined);
    for (const [router, target, connectionId] of [
      [remoteRouter, remote, 'production'], [localRouter, local, undefined],
    ] as const) {
      const info = await request(router, 'GET', '/0', undefined, connectionId);
      assert.equal(info.status, 200);
      assert.equal(info.body.pm_id, 0);
      assert.equal(info.body.name, target.processes[0].name);
      assert.equal((await request(router, 'POST', '/0/reload', {}, connectionId)).status, 200);
      assert.equal((await request(router, 'POST', '/0/scale', { instances: 2 }, connectionId)).status, 200);
      assert.equal((await request(router, 'POST', '/0/exec-mode', { mode: 'cluster' }, connectionId)).status, 200);
      assert.deepEqual(target.calls, [['reload', 0], ['scale', target.processes[0].name, 2], ['exec-mode', 0, 'cluster']]);
      if (target === remote) assert.deepEqual(local.calls, []);
    }

    assert.equal((await request(remoteRouter, 'POST', '/0/reload', {}, 'removed')).status, 404);
    assert.equal((await request(remoteRouter, 'POST', '/1/reload', {}, 'production')).status, 404);
    assert.equal((await request(remoteRouter, 'POST', '/all/reload', {}, 'production')).status, 400);
    assert.equal((await request(remoteRouter, 'POST', '/0/scale', { instances: -1 }, 'production')).status, 400);
    assert.equal((await request(remoteRouter, 'POST', '/0/exec-mode', { mode: 'other' }, 'production')).status, 400);

    const proc = remote.processes[0];
    remote.processes.push({ ...proc, pm_id: 1, pm2_env: { ...proc.pm2_env, namespace: 'other' } });
    assert.equal((await request(remoteRouter, 'POST', '/0/scale', { instances: 2 }, 'production')).status, 409);
    remote.processes[1] = { ...proc, pm_id: 1, name: 'different-app',
      pm2_env: { ...proc.pm2_env, pm_exec_path: '/srv/remote-api' } };
    assert.equal((await request(remoteRouter, 'POST', '/0/scale', { instances: 2 }, 'production')).status, 409);
    remote.reload = async () => { throw new Error('SSH disconnected'); };
    assert.equal((await request(remoteRouter, 'POST', '/0/reload', {}, 'production')).status, 500);
    assert.equal(local.calls.length, 3);
    assert.equal(remote.calls.length, 3);
    console.log('Cluster management server targeting tests passed.');
  } finally {
    if (previousHome === undefined) delete process.env.PM2_HOME;
    else process.env.PM2_HOME = previousHome;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

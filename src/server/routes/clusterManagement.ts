import { Request, Response, Router } from 'express';
import path from 'path';
import pm2 from 'pm2';
import { executePM2Command } from '../utils/pm2-connection';
import type { RemoteConnection } from '../utils/remote-connection';

type ExecutionMode = 'cluster' | 'fork';

interface ClusterProcess {
  pm_id: number;
  name: string;
  pm2_env: {
    namespace?: string;
    pm_exec_path?: string;
    exec_mode: string;
  };
}

interface ClusterTarget {
  list(): Promise<ClusterProcess[]>;
  workingDirectory(): string | Promise<string>;
  scale(name: string, instances: number): Promise<void>;
  reload(id: number | string): Promise<void>;
  changeMode(id: number, mode: ExecutionMode): Promise<void>;
}

const localTarget: ClusterTarget = {
  list: () => executePM2Command(callback => pm2.list(callback)),
  workingDirectory: () => process.cwd(),
  scale: (name, instances) => executePM2Command(callback => (pm2 as any).scale(name, instances, callback)),
  reload: id => executePM2Command(callback => pm2.reload(String(id), err => callback(err))),
  changeMode: (id, mode) => executePM2Command(callback => {
    // The high-level restart API drops exec_mode. The daemon applies current_conf
    // to this single worker and retains its ID, arguments, environment and paths.
    (pm2 as any).Client.executeRemote('restartProcessId', {
      id, env: { current_conf: { exec_mode: mode + '_mode' } },
    }, callback);
  }),
};

export const remoteClusterTarget = (connection: RemoteConnection): ClusterTarget => ({
  list: () => connection.getPM2Processes(),
  workingDirectory: () => connection.clusterWorkingDirectory(),
  scale: (name, instances) => connection.runClusterCommand(['scale', '--', name, String(instances)]),
  reload: id => connection.runClusterCommand(['reload', String(id)]),
  changeMode: (id, mode) => connection.changeClusterMode(id, mode),
});

export function createClusterRouter(resolveTarget: (connectionId?: string) => ClusterTarget | undefined): Router {
  const router = Router({ mergeParams: true });

  async function handle(req: Request, res: Response) {
    const { connectionId, id, action } = req.params;
    const target = resolveTarget(connectionId);
    if (!target) return res.status(404).json({ error: 'Connection not found' });
    const numericId = /^\d+$/.test(id);
    if (connectionId && (!numericId || !Number.isSafeInteger(Number(id)))) {
      return res.status(400).json({ error: 'A numeric PM2 process ID is required' });
    }

    try {
      const processes = await target.list();
      // Older local API callers can also identify an application by name.
      const selected = processes.find(proc => numericId ? proc.pm_id === Number(id) : proc.name === id)
        ?? (!numericId && action === 'scale' ? processes.find(proc => proc.pm2_env.pm_exec_path === path.resolve(id)) : undefined);
      if (action === 'reload') {
        if (numericId && !selected) return res.status(404).json({ error: 'Process not found' });
        // Local API clients can also use PM2's named reload selectors, including "all".
        await target.reload(numericId ? Number(id) : id);
        return res.json({ success: true, message: `Process ${id} reloaded with zero-downtime` });
      }
      if (!selected) return res.status(404).json({ error: 'Process not found' });
      const { pm2_env: env, name, pm_id } = selected;
      const appInstances = processes.filter(proc => proc.name === name &&
        proc.pm2_env.namespace === env.namespace && proc.pm2_env.pm_exec_path === env.pm_exec_path);

      if (req.method === 'GET') {
        return res.json({ pm_id, name, instances: appInstances.length, exec_mode: env.exec_mode, isCluster: env.exec_mode === 'cluster_mode' });
      }

      if (action === 'scale') {
        const value = req.body?.instances;
        const instances = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
        if (!Number.isSafeInteger(instances) || instances < 0) {
          return res.status(400).json({ error: 'Valid number of instances is required' });
        }
        // PM2 scale accepts an app name and matches it globally, across namespaces.
        const pathApi = connectionId ? path.posix : path;
        const scaleSelector = numericId ? name : id;
        const scalePath = pathApi.resolve(await target.workingDirectory(), scaleSelector);
        const ambiguous = processes.some(other => !appInstances.includes(other) &&
          (other.name === scaleSelector || other.pm2_env.pm_exec_path === scalePath));
        if (ambiguous) return res.status(409).json({ error: 'Multiple applications match this name on the selected server' });
        await target.scale(scaleSelector, instances);
        return res.json({ success: true, message: `Process ${id} scaled to ${instances} instances` });
      }

      if (action === 'exec-mode') {
        const mode = req.body?.mode;
        if (mode !== 'fork' && mode !== 'cluster') {
          return res.status(400).json({ error: 'Valid execution mode (fork or cluster) is required' });
        }
        if (env.exec_mode !== mode + '_mode') await target.changeMode(pm_id, mode);
        return res.json({ success: true, message: `Process ${name} execution mode changed to ${mode}` });
      }
      return res.status(404).json({ error: 'Unknown cluster action' });
    } catch {
      return res.status(500).json({ error: 'PM2 could not complete the cluster request on the selected server' });
    }
  }

  router.get('/:id', handle);
  router.post('/:id/:action(scale|reload|exec-mode)', handle);
  return router;
}

export default createClusterRouter(() => localTarget);

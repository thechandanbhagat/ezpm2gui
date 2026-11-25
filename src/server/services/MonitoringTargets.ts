import { MonitoringTarget, ProcessSample } from './monitoring-types';
import type { CommandResult, RemoteCommandOptions } from '../utils/remote-connection';

export interface ProcessSource {
  connectionId: string;
  name: string;
  connected: boolean;
  list: () => Promise<unknown>;
}

interface MonitoringRemoteConnection {
  isConnected(): boolean;
  executePM2Command(command: string, options?: RemoteCommandOptions): Promise<CommandResult>;
}

/** Read raw metrics without the display adapter's empty-list and zero-value fallbacks. */
export async function readMonitoringRemoteProcesses(
  connection: MonitoringRemoteConnection,
  timeoutMs = 8000,
): Promise<unknown[]> {
  if (!connection.isConnected()) throw new Error('Remote process samples are unavailable.');
  const controller = new AbortController();
  const maxOutputBytes = 2 * 1024 * 1024;
  let timer: ReturnType<typeof setTimeout>;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Remote process collection timed out.'));
      }, timeoutMs);
    });
    // The shared abort signal bounds all shell/path fallback attempts together and
    // closes the active SSH channel, while each individual attempt is also bounded.
    const result = await Promise.race([deadline, connection.executePM2Command('jlist', {
      signal: controller.signal, timeoutMs: Math.min(timeoutMs, 4000), maxOutputBytes, logCommand: false,
    })]);
    if (!connection.isConnected() || result.code !== 0 || typeof result.stdout !== 'string'
      || Buffer.byteLength(result.stdout) > maxOutputBytes) throw new Error('Remote process samples are unavailable.');
    let parsed: unknown;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('Remote process output is invalid.'); }
    if (!Array.isArray(parsed)) throw new Error('Remote process output is invalid.');
    return parsed;
  } finally { clearTimeout(timer!); }
}

/** A failed/disconnected collector is unknown, never an empty healthy server. */
export function normalizeProcesses(value: unknown): ProcessSample[] {
  if (!Array.isArray(value)) throw new Error('Process list is unavailable.');
  return value.map(process => {
    if (!process || typeof process.name !== 'string' || !Number.isSafeInteger(process.pm_id) || process.pm_id < 0
      || typeof process.pm2_env?.status !== 'string') throw new Error('Invalid process sample.');
    if (!Number.isSafeInteger(process.pm2_env.restart_time) || process.pm2_env.restart_time < 0) {
      throw new Error('Process restart samples are unavailable.');
    }
    if (process.pm2_env.status === 'online' &&
      (typeof process.monit?.cpu !== 'number' || typeof process.monit?.memory !== 'number')) {
      throw new Error('Process metrics are unavailable.');
    }
    const sample: ProcessSample = {
      id: process.pm_id,
      name: process.name,
      status: process.pm2_env.status,
      cpu: process.monit?.cpu ?? 0,
      memoryMb: (process.monit?.memory ?? 0) / 1_048_576,
      restarts: process.pm2_env.restart_time,
    };
    if (![sample.cpu, sample.memoryMb, sample.restarts].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
      throw new Error('Invalid process metrics.');
    }
    return sample;
  });
}

/** Coalesce browser/background reads and bound how long a hung SSH call delays monitoring. */
export function createMonitoringTargetCollector(options: {
  sources: () => ProcessSource[];
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}): () => Promise<MonitoringTarget[]> {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { timestamp: number; target: MonitoringTarget }>();
  const pending = new Map<string, Promise<MonitoringTarget>>();
  const timedOut = new Set<string>();
  const epochs = new Map<string, number>();
  const unavailable = (source: ProcessSource): MonitoringTarget => ({
    connectionId: source.connectionId, name: source.name, connected: false, processes: [],
  });
  const invalidate = (id: string) => {
    cache.delete(id);
    pending.delete(id);
    timedOut.delete(id);
    epochs.set(id, (epochs.get(id) ?? 0) + 1);
  };

  async function read(source: ProcessSource): Promise<MonitoringTarget> {
    if (!source.connected) {
      invalidate(source.connectionId);
      return unavailable(source);
    }
    const epoch = epochs.get(source.connectionId) ?? 0;
    if (timedOut.has(source.connectionId)) return unavailable(source);
    const saved = cache.get(source.connectionId);
    if (saved && now() - saved.timestamp < (options.cacheMs ?? 4000)) return saved.target;
    let operation = pending.get(source.connectionId);
    if (!operation) {
      operation = Promise.resolve().then(source.list).then(value => ({
        connectionId: source.connectionId, name: source.name, connected: true,
        processes: normalizeProcesses(value),
      })).catch(() => unavailable(source)).then(target => {
        // A late response must not be treated as a fresh sample after a timeout.
        if (pending.get(source.connectionId) === operation) {
          if (!timedOut.has(source.connectionId)) cache.set(source.connectionId, { timestamp: now(), target });
          pending.delete(source.connectionId);
          timedOut.delete(source.connectionId);
        }
        return target;
      });
      pending.set(source.connectionId, operation);
    }
    let timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        operation,
        new Promise<MonitoringTarget>(resolve => {
          timer = setTimeout(() => {
            if (pending.get(source.connectionId) === operation) {
              timedOut.add(source.connectionId);
              cache.delete(source.connectionId);
            }
            resolve(unavailable(source));
          }, options.timeoutMs ?? 8000);
        }),
      ]);
      return (epochs.get(source.connectionId) ?? 0) === epoch ? result : unavailable(source);
    } finally { clearTimeout(timer!); }
  }

  return async () => {
    const sources = options.sources();
    const activeIds = new Set(sources.map(source => source.connectionId));
    for (const key of new Set([...cache.keys(), ...pending.keys(), ...timedOut])) {
      if (!activeIds.has(key)) invalidate(key);
    }
    return Promise.all(sources.map(read));
  };
}

import fs from 'fs/promises';
import pm2 from 'pm2';
import { executePM2Command } from '../utils/pm2-connection';
import { remoteConnectionManager } from '../utils/remote-connection';
import { AnalysisSnapshot, LogAnalysisError, prepareSnapshot, PreparedSnapshot } from './LogAnalysisService';

const TAIL_BYTES = 64 * 1024;
const STREAM_LINES = 200;

export interface SnapshotSelection { processId: number; connectionId?: string }
export interface CollectedSnapshot extends PreparedSnapshot { warnings: string[] }

export function validateSnapshotSelection(value: unknown): SnapshotSelection {
  const input = value as Partial<SnapshotSelection> | null;
  if (!input || !Number.isSafeInteger(input.processId) || input.processId! < 0 || input.processId! > 2147483647) {
    throw new LogAnalysisError('Select a valid PM2 process.', 400);
  }
  if (input.connectionId !== undefined && (typeof input.connectionId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(input.connectionId))) {
    throw new LogAnalysisError('Select a valid remote connection.', 400);
  }
  return { processId: input.processId!, ...(input.connectionId ? { connectionId: input.connectionId } : {}) };
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LogAnalysisError('Log analysis was cancelled.', 499);
}

// A bounded byte tail prevents huge files or single-line logs from exhausting memory.
export function splitLogTail(text: string, byteTailTruncated: boolean): { lines: string[]; truncated: boolean } {
  let lines = text.replace(/\r\n/g, '\n').split('\n');
  // The first line of a byte tail may begin inside an error, credential, or UTF-8 sequence.
  if (byteTailTruncated) lines.shift();
  lines = lines.filter(line => line.trim() !== '');
  return { lines: lines.slice(-STREAM_LINES), truncated: byteTailTruncated || lines.length > STREAM_LINES };
}

export async function readLocalLogTail(logPath: string): Promise<{ lines: string[]; truncated: boolean }> {
  const handle = await fs.open(logPath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) return { lines: [], truncated: false };
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const buffer = Buffer.alloc(Math.min(stat.size, TAIL_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return splitLogTail(buffer.subarray(0, bytesRead).toString('utf8'), start > 0);
  } finally {
    await handle.close();
  }
}

export function quoteRemoteLogPath(value: string): string {
  if (!value || value.includes('\0')) throw new LogAnalysisError('The remote process has an invalid log path.', 400);
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function processMetadata(processId: number, source: 'local' | 'remote', descriptor: any): AnalysisSnapshot {
  // Never copy pm2_env: it contains application credentials and environment variables.
  return {
    processId,
    processName: typeof descriptor.name === 'string' ? descriptor.name : `Process ${processId}`,
    source,
    status: descriptor.pm2_env?.status,
    restarts: descriptor.pm2_env?.restart_time,
    cpuPercent: descriptor.monit?.cpu,
    memoryBytes: descriptor.monit?.memory,
    logs: [],
  };
}

export async function collectLogAnalysisSnapshot(selection: SnapshotSelection, signal?: AbortSignal): Promise<CollectedSnapshot> {
  const { processId, connectionId } = validateSnapshotSelection(selection);
  checkCancelled(signal);
  let descriptor: any;
  let connection: ReturnType<typeof remoteConnectionManager.getConnection>;
  if (connectionId) {
    connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) throw new LogAnalysisError('Remote connection not found.', 404);
    if (!connection.isConnected()) throw new LogAnalysisError('Connect to the remote server before analyzing logs.', 400);
    const result = await connection.executePM2Command('jlist', { signal, timeoutMs: 15000, maxOutputBytes: 4 * 1024 * 1024, logCommand: false });
    checkCancelled(signal);
    if (result.code !== 0) throw new LogAnalysisError('Could not read the remote PM2 process list.', 502);
    try {
      const start = result.stdout.indexOf('[');
      const end = result.stdout.lastIndexOf(']');
      const processes = JSON.parse(result.stdout.slice(start, end + 1));
      if (!Array.isArray(processes)) throw new Error('Invalid process list');
      descriptor = processes.find((process: any) => process.pm_id === processId);
    } catch {
      throw new LogAnalysisError('Could not parse the remote PM2 process list.', 502);
    }
  } else {
    const processes = await executePM2Command<any[]>(callback => pm2.describe(processId, callback));
    checkCancelled(signal);
    descriptor = processes?.[0];
  }
  if (!descriptor) throw new LogAnalysisError('PM2 process not found. Refresh the process list.', 404);

  const snapshot = processMetadata(processId, connectionId ? 'remote' : 'local', descriptor);
  const warnings: string[] = [];
  let truncated = false;
  const seenPaths = new Set<string>();
  // Keep streams separate. Without real timestamps their chronological order is unknown.
  for (const stream of ['stdout', 'stderr'] as const) {
    checkCancelled(signal);
    const logPath = descriptor.pm2_env?.[stream === 'stdout' ? 'pm_out_log_path' : 'pm_err_log_path'];
    if (typeof logPath !== 'string' || !logPath) {
      warnings.push(`${stream} log history is unavailable for this process.`);
      continue;
    }
    if (seenPaths.has(logPath)) {
      warnings.push('stdout and stderr share a log file; its contents are included once and may contain both streams.');
      continue;
    }
    seenPaths.add(logPath);
    try {
      let tail: { lines: string[]; truncated: boolean };
      if (connection) {
        const quoted = quoteRemoteLogPath(logPath);
        // Read raw log files, preserving stack frames filtered by live streaming.
        const options = { signal, timeoutMs: 15000, maxOutputBytes: TAIL_BYTES + 4096, logCommand: false };
        let result = await connection.executeCommand(`tail -c ${TAIL_BYTES} -- ${quoted} 2>/dev/null`, undefined, options);
        if (result.code !== 0) result = await connection.executeCommand(`sudo -n tail -c ${TAIL_BYTES} -- ${quoted} 2>/dev/null`, undefined, options);
        checkCancelled(signal);
        if (result.code !== 0) throw new Error('Unreadable log');
        tail = splitLogTail(result.stdout, Buffer.byteLength(result.stdout, 'utf8') >= TAIL_BYTES);
      } else {
        tail = await readLocalLogTail(logPath);
      }
      checkCancelled(signal);
      truncated ||= tail.truncated;
      snapshot.logs.push(...tail.lines.map(message => ({ stream, message })));
    } catch (error) {
      checkCancelled(signal);
      // Do not leak paths, SSH commands, or application contents in errors.
      warnings.push(`${stream} log history could not be read. Check log file permissions or whether the file exists.`);
    }
  }
  snapshot.notes = ['stdout and stderr are separate log tails. Line numbers identify evidence; they do not establish cross-stream chronology.', ...warnings];
  if (truncated) snapshot.notes.push('Only a bounded tail of recent log history is included. Older or partial lines were omitted.');
  const prepared = prepareSnapshot(snapshot);
  return { ...prepared, truncated: truncated || prepared.truncated, warnings };
}

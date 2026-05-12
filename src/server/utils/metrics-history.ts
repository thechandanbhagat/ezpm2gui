import os from 'os';

// @group Types : Shape of a single recorded metric data point
export interface MetricPoint {
  timestamp: number;    // Unix ms
  cpu: number;          // 0–100 percentage (as reported by PM2)
  memory: number;       // bytes
  memoryMB: number;     // MB (2 dp)
  memoryPercent: number; // 0–100 percentage of total system RAM
}

// @group Types : Per-process history entry
export interface ProcessHistory {
  pm_id: number;
  name: string;
  status: string;
  history: MetricPoint[];
}

// @group Constants : Ring-buffer capacity — 60 points × 3 s = 3 minutes of history
const MAX_POINTS = 60;

// @group MetricsHistory : In-memory ring buffer; key = pm_id (string)
class MetricsHistoryStore {
  private readonly store = new Map<number, ProcessHistory>();

  // @group MetricsHistory : Record a snapshot from the PM2 process list
  record(processList: any[]): void {
    const totalMem = os.totalmem();
    const seen = new Set<number>();

    for (const proc of processList) {
      const pm_id: number = proc.pm_id;
      seen.add(pm_id);

      const cpu: number    = proc.monit?.cpu    ?? 0;
      const memory: number = proc.monit?.memory ?? 0;

      const point: MetricPoint = {
        timestamp:     Date.now(),
        cpu:           parseFloat(cpu.toFixed(2)),
        memory,
        memoryMB:      parseFloat((memory / 1_048_576).toFixed(2)),
        memoryPercent: parseFloat(((memory / totalMem) * 100).toFixed(2)),
      };

      if (!this.store.has(pm_id)) {
        this.store.set(pm_id, {
          pm_id,
          name:    proc.name ?? String(pm_id),
          status:  proc.pm2_env?.status ?? 'unknown',
          history: [],
        });
      }

      const entry = this.store.get(pm_id)!;
      // Refresh mutable fields on every poll
      entry.name   = proc.name ?? entry.name;
      entry.status = proc.pm2_env?.status ?? entry.status;

      // Append point, trim to ring-buffer size
      entry.history.push(point);
      if (entry.history.length > MAX_POINTS) {
        entry.history.shift();
      }
    }

    // Remove processes that no longer exist in PM2
    for (const id of this.store.keys()) {
      if (!seen.has(id)) {
        this.store.delete(id);
      }
    }
  }

  // @group MetricsHistory : Return history for a single process; null if not found
  getOne(pm_id: number): ProcessHistory | null {
    return this.store.get(pm_id) ?? null;
  }

  // @group MetricsHistory : Return history for all tracked processes
  getAll(): ProcessHistory[] {
    return Array.from(this.store.values());
  }
}

// @group Exports : Singleton instance used across the server
export const metricsHistory = new MetricsHistoryStore();

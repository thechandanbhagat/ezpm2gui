import { remoteConnectionManager } from './remote-connection';
import { remoteMetricsDB } from './remote-metrics-db';

// @group Configuration : Polling interval in milliseconds
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// @group RemoteMetricsPoller : Background service that samples PM2 metrics for every connected remote server
class RemoteMetricsPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  // @group RemoteMetricsPoller : Start the periodic polling loop
  start(): void {
    if (this.timer) return; // already running
    console.log('[RemoteMetricsPoller] Starting — polling every', POLL_INTERVAL_MS / 1000, 's');
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  // @group RemoteMetricsPoller : Stop the polling loop
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // @group RemoteMetricsPoller : Poll all currently-connected remote servers and persist metrics
  private async poll(): Promise<void> {
    const connectionsMap = remoteConnectionManager.getAllConnections();
    const connected = Array.from(connectionsMap.entries()).filter(([, c]) => c.isConnected());

    if (connected.length === 0) return;

    const now = Date.now();

    for (const [connectionId, conn] of connected) {
      try {
        const processes: any[] = await conn.getPM2Processes();
        if (!Array.isArray(processes) || processes.length === 0) continue;

        const rows = processes
          .filter(p => p && p.name)
          .map(p => ({
            connection_id:   connectionId,
            connection_name: conn.name ?? conn.host,
            process_name:    p.name as string,
            pm_id:           (p.pm_id as number) ?? -1,
            timestamp:       now,
            cpu:             parseFloat(((p.monit?.cpu ?? 0) as number).toFixed(2)),
            memory_bytes:    (p.monit?.memory ?? 0) as number,
            memory_mb:       parseFloat((((p.monit?.memory ?? 0) as number) / 1_048_576).toFixed(2)),
          }));

        if (rows.length > 0) {
          remoteMetricsDB.insertBatch(rows);
        }
      } catch (err: any) {
        // Non-fatal — log and continue with other servers
        console.warn(`[RemoteMetricsPoller] Failed to poll ${conn.host}:`, err?.message ?? err);
      }
    }
  }
}

// @group Exports : Singleton poller started once when the server boots
export const remoteMetricsPoller = new RemoteMetricsPoller();

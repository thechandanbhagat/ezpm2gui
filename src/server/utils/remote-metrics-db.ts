import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// @group Configuration : SQLite DB lives alongside other server config files
const DB_DIR  = path.join(__dirname, '../config');
const DB_PATH = path.join(DB_DIR, 'remote-metrics.db');

// @group Types : Single recorded data-point for a remote process
export interface RemoteMetricRow {
  id: number;
  connection_id: string;
  connection_name: string;
  process_name: string;
  pm_id: number;
  timestamp: number;   // Unix ms
  cpu: number;         // 0–100 %
  memory_bytes: number;
  memory_mb: number;
}

// @group RemoteMetricsDB : SQLite-backed persistent store for remote process metrics
class RemoteMetricsDB {
  private db: Database.Database;

  constructor() {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.purgeOld();
  }

  // @group RemoteMetricsDB : Create tables and indexes on first run
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS remote_metrics (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id   TEXT    NOT NULL,
        connection_name TEXT    NOT NULL,
        process_name    TEXT    NOT NULL,
        pm_id           INTEGER NOT NULL,
        timestamp       INTEGER NOT NULL,
        cpu             REAL    NOT NULL,
        memory_bytes    INTEGER NOT NULL,
        memory_mb       REAL    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rmet_conn_proc_ts
        ON remote_metrics (connection_id, process_name, timestamp);

      CREATE INDEX IF NOT EXISTS idx_rmet_conn_ts
        ON remote_metrics (connection_id, timestamp);
    `);
  }

  // @group RemoteMetricsDB : Delete records older than 30 days to keep DB lean
  private purgeOld(): void {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM remote_metrics WHERE timestamp < ?').run(cutoff);
  }

  // @group RemoteMetricsDB : Persist a single data-point
  insert(row: Omit<RemoteMetricRow, 'id'>): void {
    this.db.prepare(`
      INSERT INTO remote_metrics
        (connection_id, connection_name, process_name, pm_id, timestamp, cpu, memory_bytes, memory_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.connection_id, row.connection_name, row.process_name, row.pm_id,
      row.timestamp, row.cpu, row.memory_bytes, row.memory_mb,
    );
  }

  // @group RemoteMetricsDB : Bulk-insert multiple data-points in one transaction (efficient)
  insertBatch(rows: Omit<RemoteMetricRow, 'id'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO remote_metrics
        (connection_id, connection_name, process_name, pm_id, timestamp, cpu, memory_bytes, memory_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        stmt.run(
          row.connection_id, row.connection_name, row.process_name, row.pm_id,
          row.timestamp, row.cpu, row.memory_bytes, row.memory_mb,
        );
      }
    });
    tx();
  }

  // @group RemoteMetricsDB : Return all (connection_id, connection_name) pairs that have data
  getConnectionsWithData(): { id: string; name: string }[] {
    return this.db.prepare(`
      SELECT DISTINCT connection_id AS id, connection_name AS name
      FROM remote_metrics
      ORDER BY name
    `).all() as { id: string; name: string }[];
  }

  // @group RemoteMetricsDB : Return distinct process names recorded for a connection
  getProcessNames(connectionId: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT process_name
      FROM remote_metrics
      WHERE connection_id = ?
      ORDER BY process_name
    `).all(connectionId) as { process_name: string }[];
    return rows.map(r => r.process_name);
  }

  // @group RemoteMetricsDB : Return metric rows for a specific process within a time range
  getMetrics(
    connectionId: string,
    processName: string,
    from: number,
    to: number,
    maxPoints = 500,
  ): RemoteMetricRow[] {
    // Bucket-reduce to avoid sending thousands of points for long ranges
    const total = (this.db.prepare(`
      SELECT COUNT(*) AS cnt FROM remote_metrics
      WHERE connection_id = ? AND process_name = ? AND timestamp BETWEEN ? AND ?
    `).get(connectionId, processName, from, to) as { cnt: number }).cnt;

    if (total <= maxPoints) {
      return this.db.prepare(`
        SELECT * FROM remote_metrics
        WHERE connection_id = ? AND process_name = ? AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `).all(connectionId, processName, from, to) as RemoteMetricRow[];
    }

    // Downsample: pick every Nth row so we stay under maxPoints
    const step = Math.ceil(total / maxPoints);
    return this.db.prepare(`
      SELECT * FROM remote_metrics
      WHERE connection_id = ? AND process_name = ? AND timestamp BETWEEN ? AND ?
        AND (id % ?) = 0
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(connectionId, processName, from, to, step, maxPoints) as RemoteMetricRow[];
  }

  // @group RemoteMetricsDB : Return latest snapshot for all processes on a connection
  getLatestSnapshot(connectionId: string): RemoteMetricRow[] {
    return this.db.prepare(`
      SELECT r.*
      FROM remote_metrics r
      INNER JOIN (
        SELECT process_name, MAX(timestamp) AS max_ts
        FROM remote_metrics
        WHERE connection_id = ?
        GROUP BY process_name
      ) latest ON r.process_name = latest.process_name AND r.timestamp = latest.max_ts
      WHERE r.connection_id = ?
      ORDER BY r.process_name
    `).all(connectionId, connectionId) as RemoteMetricRow[];
  }

  close(): void {
    this.db.close();
  }
}

// @group Exports : Singleton used across the server
export const remoteMetricsDB = new RemoteMetricsDB();

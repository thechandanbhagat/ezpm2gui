import express, { Router } from 'express';
import { remoteMetricsDB } from '../utils/remote-metrics-db';

const router: Router = express.Router();

// @group Constants : Default and maximum query bounds
const DEFAULT_RANGE_MS = 3_600_000;   // 1 hour
const MAX_RANGE_MS     = 7 * 24 * 3_600_000; // 7 days
const MAX_POINTS       = 500;

// @group Utilities : Parse and clamp a query-string integer
const parseIntParam = (raw: unknown, fallback: number, min: number, max: number): number => {
  const n = parseInt(raw as string, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

/**
 * List all remote connections that have recorded metrics
 * GET /api/remote-metrics/connections
 */
router.get('/connections', (_req, res) => {
  try {
    const connections = remoteMetricsDB.getConnectionsWithData();
    res.json({ success: true, connections });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List all process names recorded for a connection
 * GET /api/remote-metrics/:connectionId/processes
 */
router.get('/:connectionId/processes', (req, res) => {
  try {
    const { connectionId } = req.params;
    const names = remoteMetricsDB.getProcessNames(connectionId);
    res.json({ success: true, processes: names });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Latest snapshot (most recent metric point per process) for a connection
 * GET /api/remote-metrics/:connectionId/snapshot
 */
router.get('/:connectionId/snapshot', (req, res) => {
  try {
    const { connectionId } = req.params;
    const snapshot = remoteMetricsDB.getLatestSnapshot(connectionId);
    res.json({ success: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Time-series metrics for one process on a connection
 * GET /api/remote-metrics/:connectionId/:processName
 *   ?from=<unix-ms>  (default: now - 1h)
 *   ?to=<unix-ms>    (default: now)
 *   ?maxPoints=<n>   (default: 500, max: 1000)
 */
router.get('/:connectionId/:processName', (req, res) => {
  try {
    const { connectionId, processName } = req.params;

    const now  = Date.now();
    const to   = parseIntParam(req.query.to,        now,                      0, now + 60_000);
    const from = parseIntParam(req.query.from,      to - DEFAULT_RANGE_MS,    0, now);
    // Clamp range to max window
    const clampedFrom = Math.max(from, to - MAX_RANGE_MS);
    const maxPoints   = parseIntParam(req.query.maxPoints, MAX_POINTS, 50, 1000);

    const metrics = remoteMetricsDB.getMetrics(connectionId, processName, clampedFrom, to, maxPoints);
    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

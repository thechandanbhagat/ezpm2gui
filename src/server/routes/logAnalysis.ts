import express, { NextFunction, Request, Response } from 'express';
import { isPasswordConfigured } from '../utils/auth-state';
import { analyzeSnapshot, listProviders, LogAnalysisError } from '../services/LogAnalysisService';
import { collectLogAnalysisSnapshot, validateSnapshotSelection } from '../services/LogAnalysisSnapshot';

function isLoopback(value: string): boolean {
  return value === 'localhost' || value === '::1' || value === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) || /^::ffff:127\./i.test(value);
}

// The parent /api middleware validates tokens when a password is configured.
// An open GUI may invoke installed agents only over loopback, from its own UI.
export function guardLogAnalysisAccess(passwordConfigured = isPasswordConfigured) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let host: URL;
    try { host = new URL(`http://${req.get('host') || ''}`); }
    catch { res.status(403).json({ error: 'Invalid application host.' }); return; }
    const local = isLoopback(req.socket.remoteAddress || '') && isLoopback(host.hostname);
    if (!passwordConfigured() && !local) {
      res.status(403).json({ error: 'Set a GUI password before using AI log analysis from another machine.' });
      return;
    }
    const origin = req.get('origin');
    if (origin) {
      let source: URL;
      try { source = new URL(origin); }
      catch { res.status(403).json({ error: 'Open log analysis from the application.' }); return; }
      const sameHost = ['http:', 'https:'].includes(source.protocol) && source.host === host.host;
      const localDev = local && ['http:', 'https:'].includes(source.protocol) && isLoopback(source.hostname);
      if (!sameHost && !localDev) {
        res.status(403).json({ error: 'Open log analysis from the application.' });
        return;
      }
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ error: 'Open log analysis from the application.' });
      return;
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'Log analysis requests must use JSON.' });
      return;
    }
    next();
  };
}

interface Dependencies {
  passwordConfigured: () => boolean;
  providers: typeof listProviders;
  snapshot: typeof collectLogAnalysisSnapshot;
  analyze: typeof analyzeSnapshot;
}

export function createLogAnalysisRouter(overrides: Partial<Dependencies> = {}): express.Router {
  const dependencies: Dependencies = {
    passwordConfigured: isPasswordConfigured,
    providers: listProviders,
    snapshot: collectLogAnalysisSnapshot,
    analyze: analyzeSnapshot,
    ...overrides,
  };
  const router = express.Router();
  router.use(guardLogAnalysisAccess(dependencies.passwordConfigured));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const run = (operation: (req: Request, signal: AbortSignal) => Promise<unknown>, timeoutMs?: number) =>
    async (req: Request, res: Response): Promise<void> => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once('aborted', abort);
      res.once('close', abort);
      const timer = timeoutMs ? setTimeout(() => {
        if (!res.destroyed && !res.headersSent) res.status(504).json({ error: 'Reading log history timed out. Check the server connection and try again.' });
        controller.abort();
      }, timeoutMs) : undefined;
      try {
        const result = await operation(req, controller.signal);
        if (!controller.signal.aborted && !res.destroyed) res.json(result);
      } catch (error) {
        if (!controller.signal.aborted && !res.destroyed) {
          const known = error instanceof LogAnalysisError;
          res.status(known ? error.status : 500).json({
            error: known ? error.message : 'Could not complete log analysis. Check the provider setup and try again.',
          });
        }
      } finally {
        if (timer) clearTimeout(timer);
        req.off('aborted', abort);
        res.off('close', abort);
      }
    };

  router.get('/providers', run(async (_req, signal) => ({ providers: await dependencies.providers(signal) })));
  router.post('/snapshot', run((req, signal) => dependencies.snapshot(validateSnapshotSelection(req.body), signal), 30000));
  router.post('/analyze', run((req, signal) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new LogAnalysisError('Choose a provider and log snapshot.', 400);
    }
    return dependencies.analyze(req.body, signal);
  }));
  return router;
}

export default createLogAnalysisRouter();

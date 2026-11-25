import express, { NextFunction, Request, Response } from 'express';
import { MonitoringError, MonitoringService } from '../services/MonitoringService';
import { isPasswordConfigured } from '../utils/auth-state';

function isLoopback(value: string): boolean {
  return value === 'localhost' || value === '::1' || value === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) || /^::ffff:127\./i.test(value);
}

// The parent /api middleware validates tokens when a password is configured.
// Without a password, probes and webhook configuration are restricted to the local UI.
export function guardMonitoringAccess(passwordConfigured = isPasswordConfigured) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let host: URL;
    try {
      host = new URL(`http://${req.get('host') || ''}`);
      if (host.username || host.password || host.pathname !== '/' || host.search || host.hash) throw new Error();
    } catch {
      res.status(403).json({ error: 'Invalid application host.' });
      return;
    }
    const local = isLoopback(req.socket.remoteAddress || '') && isLoopback(host.hostname);
    if (!passwordConfigured() && !local) {
      res.status(403).json({ error: 'Set a GUI password before using monitoring from another machine.' });
      return;
    }
    const origin = req.get('origin');
    if (origin) {
      let source: URL;
      try { source = new URL(origin); }
      catch { res.status(403).json({ error: 'Open monitoring from the application.' }); return; }
      const webOrigin = ['http:', 'https:'].includes(source.protocol) && !source.username && !source.password;
      const sameHost = webOrigin && source.host === host.host;
      const localDev = webOrigin && local && isLoopback(source.hostname);
      if (!sameHost && !localDev) {
        res.status(403).json({ error: 'Open monitoring from the application.' });
        return;
      }
    }
    if (req.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
      res.status(403).json({ error: 'Open monitoring from the application.' });
      return;
    }
    if (req.method === 'PUT' && !req.is('application/json')) {
      res.status(415).json({ error: 'Monitoring configuration requests must use JSON.' });
      return;
    }
    next();
  };
}

type MonitoringOperations = Pick<MonitoringService, 'getSnapshot' | 'updateConfig' | 'getTargets'>;

// Mount this after the router as well when express.json() runs at application level.
export function monitoringBodyError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  const parserError = error as { type?: string };
  if (parserError?.type === 'entity.parse.failed' || parserError?.type === 'entity.too.large') {
    res.setHeader('Cache-Control', 'no-store');
    const tooLarge = parserError.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'Monitoring configuration is too large.' : 'Provide valid JSON for the monitoring configuration.',
    });
    return;
  }
  next(error);
}

export function createMonitoringRouter(
  service: MonitoringOperations,
  overrides: { passwordConfigured?: () => boolean } = {},
): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(guardMonitoringAccess(overrides.passwordConfigured));
  router.use(express.json({ limit: '100kb' }));

  const run = (operation: (req: Request) => unknown) => async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await operation(req));
    } catch (error) {
      const known = error instanceof MonitoringError;
      res.status(known ? error.status : 500).json({
        error: known ? error.message : 'Could not complete the monitoring request. Please try again.',
      });
    }
  };

  router.get('/', run(() => service.getSnapshot()));
  router.get('/targets', run(() => service.getTargets()));
  router.put('/config', run(req => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new MonitoringError('Provide a monitoring configuration object.', 400);
    }
    return service.updateConfig(req.body);
  }));

  router.use(monitoringBodyError);
  return router;
}

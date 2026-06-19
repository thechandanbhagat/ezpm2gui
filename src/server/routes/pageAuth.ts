import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import {
  AuthConfig,
  loadAuthConfig,
  saveAuthConfig,
  removeAuthConfig,
  hashPassword,
  timingSafeHexEqual,
} from '../utils/auth-state';
import { issueToken, revokeAllTokens } from '../utils/auth-tokens';
import { authLimiter } from '../utils/login-limiter';

// @group Router : Express router for password-protection endpoints
const router: Router = express.Router();

// @group Utilities : Per-client key for attempt limiting (remote address)
function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// @group Authentication : Reject + report when the caller is locked out. Returns true if blocked.
function isRateLimited(req: Request, res: Response): boolean {
  const { locked, retryAfterMs } = authLimiter.check(clientKey(req));
  if (!locked) return false;
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  res.set('Retry-After', String(retryAfterSec));
  res.status(429).json({
    success: false,
    error: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
  });
  return true;
}

// @group Endpoints : GET /api/auth/status — is a password/PIN configured?
router.get('/status', (_req: Request, res: Response) => {
  const config = loadAuthConfig();
  res.json({
    passwordSet: config !== null,
    pinSet: !!(config?.pinHash),
    autoLockMinutes: config?.autoLockMinutes ?? 0,
  });
});

// @group Endpoints : PATCH /api/auth/settings — update non-password settings (e.g. autoLockMinutes)
router.patch('/settings', (req: Request, res: Response) => {
  const { autoLockMinutes } = req.body as { autoLockMinutes?: number };

  const config = loadAuthConfig();
  if (!config) {
    return res.status(400).json({ success: false, error: 'No password set — configure a password first' });
  }

  const minutes = typeof autoLockMinutes === 'number' && autoLockMinutes >= 0 ? Math.floor(autoLockMinutes) : config.autoLockMinutes ?? 0;
  saveAuthConfig({ ...config, autoLockMinutes: minutes });
  res.json({ success: true, autoLockMinutes: minutes });
});

// @group Endpoints : POST /api/auth/set — set or change the password
router.post('/set', (req: Request, res: Response) => {
  if (isRateLimited(req, res)) return;
  const { password, currentPassword } = req.body as { password?: string; currentPassword?: string };

  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
  }

  const existing = loadAuthConfig();

  // If a password is already set, require the current one before changing
  if (existing) {
    if (!currentPassword) {
      return res.status(401).json({ success: false, error: 'Current password required to change password' });
    }
    const currentHash = hashPassword(currentPassword, existing.salt);
    if (!timingSafeHexEqual(currentHash, existing.hash)) {
      authLimiter.recordFailure(clientKey(req));
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
  }

  authLimiter.recordSuccess(clientKey(req));
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, salt);
  // Preserve PIN and autoLock settings when changing password
  saveAuthConfig({
    hash,
    salt,
    autoLockMinutes: existing?.autoLockMinutes ?? 0,
    ...(existing?.pinHash ? { pinHash: existing.pinHash, pinSalt: existing.pinSalt } : {}),
  });
  // Revoke any previously issued tokens, then hand the caller a fresh one so
  // they stay signed in after setting/changing the password.
  revokeAllTokens();
  res.json({ success: true, token: issueToken() });
});

// @group Endpoints : POST /api/auth/verify — verify a password attempt
router.post('/verify', (req: Request, res: Response) => {
  if (isRateLimited(req, res)) return;
  const { password } = req.body as { password?: string };

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  const config = loadAuthConfig();
  if (!config) {
    // No password set — treat as unlocked
    return res.json({ success: true, token: issueToken() });
  }

  const hash = hashPassword(password, config.salt);
  if (!timingSafeHexEqual(hash, config.hash)) {
    authLimiter.recordFailure(clientKey(req));
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  authLimiter.recordSuccess(clientKey(req));
  res.json({ success: true, token: issueToken() });
});

// @group Endpoints : DELETE /api/auth/remove — remove the password (requires current password)
router.delete('/remove', (req: Request, res: Response) => {
  if (isRateLimited(req, res)) return;
  const { password } = req.body as { password?: string };

  const config = loadAuthConfig();
  if (!config) {
    return res.json({ success: true }); // nothing to remove
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Current password required' });
  }

  const hash = hashPassword(password, config.salt);
  if (!timingSafeHexEqual(hash, config.hash)) {
    authLimiter.recordFailure(clientKey(req));
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  authLimiter.recordSuccess(clientKey(req));
  removeAuthConfig();
  // Removing the password disables enforcement — invalidate all sessions.
  revokeAllTokens();
  res.json({ success: true });
});

// @group Endpoints : POST /api/auth/pin/set — set or change the PIN (4-digit)
router.post('/pin/set', (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };

  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, error: 'PIN must be exactly 4 digits' });
  }

  const config = loadAuthConfig();
  if (!config) {
    return res.status(400).json({ success: false, error: 'Set a password first before adding a PIN' });
  }

  const pinSalt = crypto.randomBytes(32).toString('hex');
  const pinHash = hashPassword(pin, pinSalt);
  saveAuthConfig({ ...config, pinHash, pinSalt });
  res.json({ success: true });
});

// @group Endpoints : POST /api/auth/pin/verify — verify a PIN attempt
router.post('/pin/verify', (req: Request, res: Response) => {
  if (isRateLimited(req, res)) return;
  const { pin } = req.body as { pin?: string };

  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ success: false, error: 'PIN is required' });
  }

  const config = loadAuthConfig();
  if (!config?.pinHash || !config?.pinSalt) {
    return res.status(400).json({ success: false, error: 'No PIN configured' });
  }

  const hash = hashPassword(pin, config.pinSalt);
  if (!timingSafeHexEqual(hash, config.pinHash)) {
    authLimiter.recordFailure(clientKey(req));
    return res.status(401).json({ success: false, error: 'Incorrect PIN' });
  }

  authLimiter.recordSuccess(clientKey(req));
  res.json({ success: true, token: issueToken() });
});

// @group Endpoints : DELETE /api/auth/pin/remove — remove PIN (requires current password)
router.delete('/pin/remove', (req: Request, res: Response) => {
  if (isRateLimited(req, res)) return;
  const { password } = req.body as { password?: string };

  const config = loadAuthConfig();
  if (!config) {
    return res.json({ success: true }); // nothing to remove
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Current password required to remove PIN' });
  }

  const hash = hashPassword(password, config.salt);
  if (!timingSafeHexEqual(hash, config.hash)) {
    authLimiter.recordFailure(clientKey(req));
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  authLimiter.recordSuccess(clientKey(req));
  const { pinHash: _ph, pinSalt: _ps, ...rest } = config;
  saveAuthConfig(rest as AuthConfig);
  res.json({ success: true });
});

export default router;

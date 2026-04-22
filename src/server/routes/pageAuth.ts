import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// @group Configuration : Path to the stored auth config file
const AUTH_FILE = path.join(__dirname, '../config/auth.json');

// @group Types : Shape of the persisted auth config
interface AuthConfig {
  hash: string;             // PBKDF2 hex digest for password
  salt: string;             // random 32-byte hex salt for password
  autoLockMinutes?: number; // 0 = disabled
  pinHash?: string;         // PBKDF2 hex digest for PIN
  pinSalt?: string;         // random 32-byte hex salt for PIN
}

// @group Utilities : Load auth config — returns null when no password is set
function loadAuthConfig(): AuthConfig | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as AuthConfig;
  } catch {
    return null;
  }
}

// @group Utilities : Persist auth config to disk
function saveAuthConfig(config: AuthConfig): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(config), 'utf8');
}

// @group Utilities : Hash a plaintext password with PBKDF2 + salt
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
}

// @group Router : Express router for password-protection endpoints
const router: Router = express.Router();

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
    if (!crypto.timingSafeEqual(Buffer.from(currentHash, 'hex'), Buffer.from(existing.hash, 'hex'))) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, salt);
  // Preserve PIN and autoLock settings when changing password
  saveAuthConfig({
    hash,
    salt,
    autoLockMinutes: existing?.autoLockMinutes ?? 0,
    ...(existing?.pinHash ? { pinHash: existing.pinHash, pinSalt: existing.pinSalt } : {}),
  });
  res.json({ success: true });
});

// @group Endpoints : POST /api/auth/verify — verify a password attempt
router.post('/verify', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  const config = loadAuthConfig();
  if (!config) {
    // No password set — treat as unlocked
    return res.json({ success: true });
  }

  const hash = hashPassword(password, config.salt);
  const match = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.hash, 'hex'));

  if (!match) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  res.json({ success: true });
});

// @group Endpoints : DELETE /api/auth/remove — remove the password (requires current password)
router.delete('/remove', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  const config = loadAuthConfig();
  if (!config) {
    return res.json({ success: true }); // nothing to remove
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Current password required' });
  }

  const hash = hashPassword(password, config.salt);
  const match = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.hash, 'hex'));

  if (!match) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  fs.unlinkSync(AUTH_FILE);
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
  const { pin } = req.body as { pin?: string };

  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ success: false, error: 'PIN is required' });
  }

  const config = loadAuthConfig();
  if (!config?.pinHash || !config?.pinSalt) {
    return res.status(400).json({ success: false, error: 'No PIN configured' });
  }

  const hash  = hashPassword(pin, config.pinSalt);
  const match = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.pinHash, 'hex'));

  if (!match) {
    return res.status(401).json({ success: false, error: 'Incorrect PIN' });
  }

  res.json({ success: true });
});

// @group Endpoints : DELETE /api/auth/pin/remove — remove PIN (requires current password)
router.delete('/pin/remove', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  const config = loadAuthConfig();
  if (!config) {
    return res.json({ success: true }); // nothing to remove
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Current password required to remove PIN' });
  }

  const hash  = hashPassword(password, config.salt);
  const match = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.hash, 'hex'));

  if (!match) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  const { pinHash: _ph, pinSalt: _ps, ...rest } = config;
  saveAuthConfig(rest as AuthConfig);
  res.json({ success: true });
});

export default router;

/**
 * Single source of truth for the persisted auth configuration.
 *
 * Kept separate from the route module so middleware can depend on it without
 * creating a circular import, and so the route layer imports these helpers
 * rather than re-reading/parsing the file itself.
 *
 * The config is cached in memory: this process is the only writer (every
 * mutation goes through saveAuthConfig/removeAuthConfig), so the cache stays
 * authoritative and the middleware avoids a synchronous disk read on every
 * request.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// @group Constants : Path to the stored auth config file
export const AUTH_FILE = path.join(__dirname, '../config/auth.json');

// @group Constants : PBKDF2 parameters for password/PIN hashing
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

// @group Types : Shape of the persisted auth config
export interface AuthConfig {
  hash: string;             // PBKDF2 hex digest for password
  salt: string;             // random 32-byte hex salt for password
  autoLockMinutes?: number; // 0 = disabled
  pinHash?: string;         // PBKDF2 hex digest for PIN
  pinSalt?: string;         // random 32-byte hex salt for PIN
}

// @group Configuration : In-memory cache of the auth config.
// `undefined` = not yet loaded; `null` = loaded and no password configured.
let cachedConfig: AuthConfig | null | undefined = undefined;

// @group DatabaseOperations : Read + parse the auth config straight from disk
function readAuthConfigFromDisk(): AuthConfig | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as AuthConfig;
  } catch {
    return null;
  }
}

// @group DatabaseOperations : Load auth config (cached) — returns null when no password is set
export function loadAuthConfig(): AuthConfig | null {
  if (cachedConfig === undefined) {
    cachedConfig = readAuthConfigFromDisk();
  }
  return cachedConfig;
}

// @group DatabaseOperations : Persist auth config to disk and refresh the cache
export function saveAuthConfig(config: AuthConfig): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(config), 'utf8');
  cachedConfig = config;
}

// @group DatabaseOperations : Delete the auth config (disables enforcement) and clear the cache
export function removeAuthConfig(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  } finally {
    cachedConfig = null;
  }
}

// @group Authentication : Hash a plaintext secret (password or PIN) with PBKDF2 + salt
export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
}

// @group Utilities : Constant-time comparison of two hex digests (length-safe)
// timingSafeEqual throws on length mismatch, so guard it to avoid a 500 on a
// truncated/corrupted stored hash.
export function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// @group Authentication : True when a password has been configured (auth enforced)
export function isPasswordConfigured(): boolean {
  return loadAuthConfig() !== null;
}

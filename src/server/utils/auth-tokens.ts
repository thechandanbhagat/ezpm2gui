/**
 * Session token store for API/socket authentication.
 *
 * Tokens are random 256-bit secrets handed to clients after a successful
 * password/PIN verification. Only the SHA-256 hash of each token is persisted
 * to disk, so a leaked store file cannot be replayed against the API.
 *
 * Tokens are long-lived (default 30 days) so mobile clients connecting over a
 * tunnel stay signed in, and are revoked en masse whenever the password or PIN
 * changes or is removed.
 *
 * The store is cached in memory and this process is the only writer, so reads
 * (one per API request / socket handshake) don't hit the disk every time.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// @group Constants : Persisted token store location, lifetime, and cap
const TOKENS_FILE = path.join(__dirname, '../config/auth-tokens.json');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TOKENS = 100;                         // newest-N kept so the store can't grow unbounded

// @group Types : Persisted token record (hash only — never the raw token)
interface TokenRecord {
  hash: string;       // SHA-256 hex of the raw token
  createdAt: number;  // epoch ms
  expiresAt: number;  // epoch ms
}

// @group Configuration : In-memory cache (undefined = not yet loaded)
let cachedTokens: TokenRecord[] | undefined = undefined;

// @group Configuration : Optional hook fired after a mass revoke (e.g. drop live sockets)
let revokeListener: (() => void) | null = null;

// @group Configuration : Register a callback invoked whenever all tokens are revoked
export function setRevokeListener(fn: () => void): void {
  revokeListener = fn;
}

// @group Utilities : SHA-256 hex of a raw token
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// @group DatabaseOperations : Read token records straight from disk
function readTokensFromDisk(): TokenRecord[] {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return [];
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TokenRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// @group DatabaseOperations : Persist token records to disk
function persist(tokens: TokenRecord[]): void {
  const dir = path.dirname(TOKENS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens), 'utf8');
}

// @group DatabaseOperations : Load token records (cached), pruning expired entries
function loadTokens(): TokenRecord[] {
  if (cachedTokens === undefined) {
    cachedTokens = readTokensFromDisk();
  }
  const now = Date.now();
  const live = cachedTokens.filter((t) => t.expiresAt > now);
  if (live.length !== cachedTokens.length) {
    cachedTokens = live;
    persist(live);
  }
  return cachedTokens;
}

// @group Authentication : Issue a new session token and persist its hash
export function issueToken(): string {
  const raw = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const tokens = loadTokens();
  tokens.push({ hash: hashToken(raw), createdAt: now, expiresAt: now + TOKEN_TTL_MS });
  // Keep only the newest MAX_TOKENS sessions so the store stays bounded.
  if (tokens.length > MAX_TOKENS) {
    tokens.sort((a, b) => b.createdAt - a.createdAt);
    tokens.length = MAX_TOKENS;
  }
  cachedTokens = tokens;
  persist(tokens);
  return raw;
}

// @group Authentication : Validate a raw token against the store (timing-safe)
export function validateToken(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const candidateBuf = Buffer.from(hashToken(raw), 'hex');
  const tokens = loadTokens();
  let matched = false;
  for (const record of tokens) {
    const recordBuf = Buffer.from(record.hash, 'hex');
    if (
      recordBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(recordBuf, candidateBuf)
    ) {
      matched = true;
      // keep looping to avoid early-exit timing signal
    }
  }
  return matched;
}

// @group Authentication : Revoke every issued token (used on credential change)
export function revokeAllTokens(): void {
  cachedTokens = [];
  try {
    if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE);
  } catch {
    // best-effort — fall back to writing an empty store
    try {
      persist([]);
    } catch {
      /* ignore */
    }
  }
  try {
    revokeListener?.();
  } catch {
    /* ignore listener errors */
  }
}

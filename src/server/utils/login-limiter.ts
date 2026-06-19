/**
 * In-memory failed-attempt limiter for authentication endpoints.
 *
 * Tracks failures per key (typically the client IP) and enforces a temporary
 * lockout once a threshold is crossed within a rolling window. The lockout
 * duration grows on repeated lockouts. This blunts online brute-forcing of the
 * password and the 4-digit PIN without pulling in an external dependency.
 *
 * State is per-process and intentionally not persisted — a restart clears it.
 */

// @group Constants : Limiter tuning
const MAX_FAILURES = 5;                       // failures allowed in the window before lockout
const WINDOW_MS = 15 * 60 * 1000;             // rolling window for counting failures
const BASE_LOCKOUT_MS = 15 * 60 * 1000;       // first lockout duration
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;   // cap escalating lockouts at 24h
const MAX_KEYS = 10_000;                       // safety cap on tracked keys

// @group Types : Per-key attempt record
interface AttemptRecord {
  failures: number;       // failures inside the current window
  firstFailureAt: number; // epoch ms of the first failure in this window
  lockedUntil: number;    // epoch ms the lockout expires (0 = not locked)
  lockoutCount: number;   // how many times this key has been locked out
}

// @group BusinessLogic : Failed-attempt limiter
export class LoginLimiter {
  private readonly records = new Map<string, AttemptRecord>();

  // @group Authentication : Is this key currently locked out?
  check(key: string): { locked: boolean; retryAfterMs: number } {
    const record = this.records.get(key);
    if (!record) return { locked: false, retryAfterMs: 0 };
    const now = Date.now();
    if (record.lockedUntil > now) {
      return { locked: true, retryAfterMs: record.lockedUntil - now };
    }
    return { locked: false, retryAfterMs: 0 };
  }

  // @group Authentication : Record a failed attempt; locks out past the threshold
  recordFailure(key: string): void {
    const now = Date.now();
    let record = this.records.get(key);

    // Start a fresh window if there's no record or the previous window has elapsed
    if (!record || now - record.firstFailureAt > WINDOW_MS) {
      record = { failures: 0, firstFailureAt: now, lockedUntil: 0, lockoutCount: record?.lockoutCount ?? 0 };
    }

    record.failures += 1;

    if (record.failures >= MAX_FAILURES) {
      const lockout = Math.min(BASE_LOCKOUT_MS * 2 ** record.lockoutCount, MAX_LOCKOUT_MS);
      record.lockedUntil = now + lockout;
      record.lockoutCount += 1;
      record.failures = 0;
      record.firstFailureAt = now;
    }

    this.records.set(key, record);
    this.evictIfNeeded();
  }

  // @group Authentication : Clear a key's failures after a successful auth
  recordSuccess(key: string): void {
    this.records.delete(key);
  }

  // @group Utilities : Drop stale/oldest records so the map can't grow unbounded
  private evictIfNeeded(): void {
    if (this.records.size <= MAX_KEYS) return;
    const now = Date.now();
    for (const [key, rec] of this.records) {
      if (rec.lockedUntil < now && now - rec.firstFailureAt > WINDOW_MS) {
        this.records.delete(key);
      }
    }
    if (this.records.size > MAX_KEYS) {
      const oldestFirst = [...this.records.entries()].sort((a, b) => a[1].firstFailureAt - b[1].firstFailureAt);
      for (let i = 0; i < oldestFirst.length && this.records.size > MAX_KEYS; i++) {
        this.records.delete(oldestFirst[i][0]);
      }
    }
  }
}

// @group Exports : Shared limiter instance for the auth routes
export const authLimiter = new LoginLimiter();

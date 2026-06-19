/**
 * Authentication middleware for REST and Socket.IO.
 *
 * Enforcement is opt-in: when no password has been configured the server stays
 * fully open (preserving the original local-only experience). Once a password
 * is set, every request — except the public auth endpoints used to obtain a
 * token — must present a valid session token.
 *
 * Token sources accepted (in order):
 *   1. Authorization: Bearer <token>   (REST, used by web fetch/axios + mobile)
 *   2. x-auth-token: <token>           (REST convenience header)
 *   3. ?token=<token>                  (SSE / EventSource where headers can't be set)
 */
import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { isPasswordConfigured } from '../utils/auth-state';
import { validateToken } from '../utils/auth-tokens';

// @group Constants : Paths reachable without a token (needed to log in)
const PUBLIC_API_PATHS = new Set<string>([
  '/auth/status',
  '/auth/verify',
  '/auth/pin/verify',
]);

// @group Utilities : Extract a bearer/header/query token from a request
function extractToken(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const headerToken = req.headers['x-auth-token'];
  if (typeof headerToken === 'string' && headerToken) return headerToken;
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken) return queryToken;
  return undefined;
}

// @group Authentication : Express middleware guarding /api routes
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Open server until a password is configured
  if (!isPasswordConfigured()) {
    next();
    return;
  }

  // Allow the public auth endpoints so clients can obtain a token.
  // req.path here is relative to the mount point ('/api').
  if (PUBLIC_API_PATHS.has(req.path)) {
    next();
    return;
  }

  if (validateToken(extractToken(req))) {
    next();
    return;
  }

  res.status(401).json({ success: false, error: 'Authentication required', authRequired: true });
}

// @group Authentication : Socket.IO handshake guard
export function authorizeSocket(
  socket: Socket,
  next: (err?: Error) => void
): void {
  if (!isPasswordConfigured()) {
    next();
    return;
  }

  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  const headerAuth = socket.handshake.headers['authorization'];
  let token: string | undefined;

  if (auth && typeof auth.token === 'string') {
    token = auth.token;
  } else if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
    token = headerAuth.slice(7).trim();
  }

  if (validateToken(token)) {
    next();
    return;
  }

  next(new Error('Authentication required'));
}

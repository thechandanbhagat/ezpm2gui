// @group Authentication : Browser-side session token handling
//
// Stores the session token issued by the server after unlocking, and attaches
// it to every same-origin /api request (both fetch and axios) plus the Socket.IO
// handshake. A current-session authRequired response returns to the lock screen.

import axios from 'axios';

// @group Constants : Storage keys (mirrors the unlock flag used in App.tsx)
const TOKEN_KEY = 'ezpm2_token';
const UNLOCK_KEY = 'ezpm2_unlocked';

export const AUTH_SESSION_CHANGED_EVENT = 'ezpm2_auth_session_changed';
export const AUTH_REQUIRED_EVENT = 'ezpm2_auth_required';
export const AUTH_CONFIG_CHANGED_EVENT = 'ezpm2_auth_config_changed';

export function notifyAuthConfigChanged(config: { passwordSet: boolean; pinSet: boolean; autoLockMinutes: number }): void {
  window.dispatchEvent(new CustomEvent(AUTH_CONFIG_CHANGED_EVENT, { detail: config }));
}

// @group Authentication : Read the stored session token
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// @group Authentication : Persist a session and notify the mounted app
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* ignore storage failures */
  }
  handlingUnauthorized = false;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

// @group Authentication : Clear the stored session token
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

// @group Utilities : True for same-origin requests targeting the API
function isApiUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && (u.pathname === '/api' || u.pathname.startsWith('/api/'));
  } catch {
    return false;
  }
}

// @group Authentication : Defer old-session failures while a password save rotates tokens.
let sessionChanges = 0;
let pendingUnauthorized: string | null | undefined;
export async function withAuthSessionChange<T>(change: () => Promise<T>): Promise<T> {
  sessionChanges += 1;
  try {
    return await change();
  } finally {
    sessionChanges -= 1;
    if (sessionChanges === 0 && pendingUnauthorized !== undefined) {
      const token = pendingUnauthorized;
      pendingUnauthorized = undefined;
      handleUnauthorized(token);
    }
  }
}

// @group ErrorHandling : Lock in place; stale responses cannot clear a newer session.
let handlingUnauthorized = false;
function handleUnauthorized(requestToken: string | null): void {
  if (requestToken !== getToken()) return;
  if (sessionChanges > 0) {
    pendingUnauthorized = requestToken;
    return;
  }
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  clearToken();
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

// @group Configuration : Install fetch + axios interceptors (call once at startup)
let interceptorsInstalled = false;
export function installAuthInterceptors(): void {
  if (interceptorsInstalled) return;
  interceptorsInstalled = true;

  // --- axios: attach token + catch 401 ---
  axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token && isApiUrl(axios.getUri(config))) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });
  axios.interceptors.response.use(
    (res) => res,
    (error) => {
      // Credential-form errors also use 401. Only the auth middleware's explicit
      // authRequired response means the app session is no longer valid.
      if (error?.response?.status === 401 && error.response.data?.authRequired === true &&
          error.config && isApiUrl(axios.getUri(error.config))) {
        const authorization = error.config.headers?.get?.('Authorization');
        handleUnauthorized(typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice(7) : null);
      }
      return Promise.reject(error);
    }
  );

  // --- fetch: attach token + catch 401 ---
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const token = getToken();
    const apiRequest = isApiUrl(url);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (token && apiRequest) {
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }

    const authorization = headers.get('Authorization');
    const requestToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const res = await originalFetch(input, init);
    if (res.status === 401 && apiRequest) {
      const body = await res.clone().json().catch(() => null);
      if (body?.authRequired === true) handleUnauthorized(requestToken);
    }
    return res;
  };
}

// @group Authentication : Browser-side session token handling
//
// Stores the session token issued by the server after unlocking, and attaches
// it to every same-origin /api request (both fetch and axios) plus the Socket.IO
// handshake. On a 401 the local session is cleared and the lock screen returns.

import axios from 'axios';

// @group Constants : Storage keys (mirrors the unlock flag used in App.tsx)
const TOKEN_KEY = 'ezpm2_token';
const UNLOCK_KEY = 'ezpm2_unlocked';

// @group Authentication : Read the stored session token
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// @group Authentication : Persist a session token and apply it to axios
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage failures */
  }
  applyAxiosAuth();
}

// @group Authentication : Clear the stored session token
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  applyAxiosAuth();
}

// @group Authentication : Keep axios' default Authorization header in sync
function applyAxiosAuth(): void {
  const token = getToken();
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
}

// @group Utilities : True for same-origin requests targeting the API
function isApiUrl(url: string): boolean {
  if (url.startsWith('/api')) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith('/api');
  } catch {
    return false;
  }
}

// @group ErrorHandling : Drop the session and return to the lock screen (once)
let handlingUnauthorized = false;
function handleUnauthorized(): void {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  clearToken();
  try {
    localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
  // Reload so App re-reads /api/auth/status and renders the PasswordGate.
  window.location.reload();
}

// @group Configuration : Install fetch + axios interceptors (call once at startup)
export function installAuthInterceptors(): void {
  applyAxiosAuth();

  // --- axios: attach token + catch 401 ---
  axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token && config.url && isApiUrl(config.url)) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });
  axios.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error?.response?.status === 401) handleUnauthorized();
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
    if (token && url && isApiUrl(url)) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }

    const res = await originalFetch(input, init);
    if (res.status === 401 && url && isApiUrl(url)) {
      handleUnauthorized();
    }
    return res;
  };
}

// @group Utilities : Socket.IO backend origin
// CRA inlines REACT_APP_* at build time. A localhost fallback in the published
// package makes browsers connect to the user's machine instead of the server.

export function getSocketUrl(locationOrigin?: string): string | undefined {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    if (locationOrigin) return locationOrigin;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return undefined;
  }

  return 'http://localhost:3101';
}

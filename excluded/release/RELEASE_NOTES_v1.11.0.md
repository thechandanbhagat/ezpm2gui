# Release Notes — v1.11.0

**Released:** June 19, 2026

---

## New Features

### Token-Based Session Authentication
- Added server-issued session tokens for protected access once page password protection is enabled
- Enforced authentication for all `/api/*` routes (except required auth endpoints) and Socket.IO handshakes
- Added token lifecycle support: issue, validate, and revoke all active sessions when password state changes

### Authentication Security Hardening
- Added login attempt limiting with temporary lockouts to reduce brute-force attempts
- Added centralized auth state utilities for loading, saving, and validating auth configuration
- Added timing-safe hash comparison helpers and safer auth config handling

### Client Session Flow
- Added client auth utilities to persist and attach bearer tokens automatically for API requests
- Added global 401 handling to clear invalid tokens and force re-authentication
- Updated unlock flow to reconnect Socket.IO with the newly issued session token

---

## Improvements

### Branding and Web Assets
- Refreshed primary logo SVG used by the app and web assets
- Updated favicon and web app icons (`logo192` and `logo512`)
- Updated web manifest and theme color metadata for a consistent darker shell
- Updated About dialog and What's New modal to show current version `v1.11.0`

### Internationalization
- Expanded Chinese locale coverage across additional screens and actions
- Added Chinese language option to the language switcher
- Updated README language feature summary to include Chinese locale availability

---

## Documentation

- Added a "Previous GitHub Releases" section in README with links to published versions
- Added this release note file under `excluded/release/`

---

## Version Updates

- Root package version bumped to `1.11.0`
- Root `package-lock.json` version metadata aligned to `1.11.0`
- Web client package version bumped to `1.11.0`
- Client `package-lock.json` version metadata aligned to `1.11.0`

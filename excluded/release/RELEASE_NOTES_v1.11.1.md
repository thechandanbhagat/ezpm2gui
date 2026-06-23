# Release Notes — v1.11.1

**Released:** June 23, 2026

---

## New Features

### Live Metrics with Sparklines
- Added a dedicated Metrics page showing per-process rolling 1-hour CPU and memory sparklines, updated every 3 seconds
- Inline micro-graphs are embedded directly in the Metrics table rows for quick at-a-glance scanning without opening a separate view
- Remote process metrics are recorded to a local SQLite history store so CPU and memory trends can be reviewed over time

### Persistent Light/Dark Mode and Accent Color Theming
- Full light and dark mode support across all pages, persisted across sessions via `localStorage`
- Added accent color selection (blue, purple, green, orange, etc.) configurable from Settings
- Accent changes apply instantly via a `CustomEvent` broadcast — no page reload required
- CSS variable palette (`--ez-bg-*`, `--ez-border`, `--ez-accent`, `--ez-text-*`, semantic state colours) covers all components including MUI overrides

### Docker Support
- Added `Dockerfile` for building a self-contained production image
- Added `.dockerignore` to keep image layers lean

### Current Version API
- Added `GET /api/update/current` endpoint that returns the locally installed version without hitting npm, used by the status bar to display the running build version

---

## Improvements

### Status Bar Dynamic Version
- Replaced the hard-coded `v1.6.0` label in the status bar footer with the actual installed version fetched from the new `/api/update/current` endpoint

### Client Utility Modules
- Extracted reusable logic into dedicated utility modules under `src/client/src/utils/`:
  - `theme.ts` — dark/light mode helpers, accent color palette definitions, and CSS variable constants
  - `server-selection.ts` — server switching logic, active server storage key constants, and `REMOTE_CONNECTIONS_CHANGED_EVENT`
  - `app-version.ts` — version label formatting helper for the status bar
  - `release-info.ts` — `APP_RELEASE_VERSION` and `APP_RELEASE_DATE` constants used by What's New surfaces, so version updates are single-source-of-truth

### RemoteConnections CSS Token Migration
- Replaced all hard-coded dark hex colour values in `RemoteConnections.tsx` MUI overrides with CSS variable tokens, making the component fully compatible with both light and dark themes

### What's New Changelog
- Updated What's New page and modal to reflect v1.11.1 highlights: Live Metrics, Metrics History, and Inline Sparklines
- `WhatsNewModal` now derives its `STORAGE_KEY` from `APP_RELEASE_VERSION` so the popup auto-resets for each new release

---

## Tests

- Added unit tests for the three new logic-bearing utility modules (`app-version`, `server-selection`, `theme`) under `tests/unit/`

---

## Internationalization

- Updated English, Nepali, and Chinese translation files for v1.11.1 copy changes

---

## Version Updates

- Root package version bumped to `1.11.1`
- Web client package version bumped to `1.11.1`

# Changelog

All notable changes to EZ PM2 GUI are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.10.0] - 2026-05-28

### Added
- **Full i18n / multi-language support** — entire UI is now internationalised using `i18next` + `react-i18next`. Every page, component, dialog, toast, tooltip, and navbar label is driven by translation keys.
- **English (en) locale** — complete `translation.json` covering all UI strings; serves as the fallback language.
- **Nepali (ne) locale** — full Nepali translation for all UI strings; first non-English language shipped.
- **Language Switcher component** — `LanguageSwitcher.tsx` added to the navbar; selected language persists via `localStorage` (`ezpm2gui-language` key).
- **Contributor translation guide** — `CONTRIBUTING_TRANSLATIONS.md` added to the repository so the community can add new locales.

### Changed
- All hardcoded English strings across Dashboard, System Metrics, Monitoring, Metrics, Log Viewer, Deploy, Cluster, Modules, Cron Jobs, Settings, Remote Connections, and utility dialogs replaced with `t('key')` calls.
- Chinese (zh) locale removed from active language list (translation file retained for future contribution).

---

## [1.9.0] - 2025-07-11

### Added
- **End-to-end password encryption for remote connections** — browser generates a one-time AES-256-GCM key, wraps it with the server's RSA-OAEP public key, and encrypts credentials before transmission. Server decrypts via `decryptTransitPayload()`. Backward-compatible with legacy plain-string fields via `decryptField()`.
- **Sidebar quick-action buttons** — per-process restart, start/stop, and logs buttons revealed on hover in the sidebar process tree.
- **Log viewer search highlighting** — search term matches are highlighted inline in both `LogStreamEnhanced` and `EnhancedLogManagement` components.
- **Log timestamp range filter** — filter log output by start/end timestamp; polling automatically pauses while filter is active to preserve the snapshot.
- **Remote log polling** — logs from remote servers are periodically fetched and displayed in a floating log panel.
- **Configurable dev proxy** — new `setupProxy.js` replaces the static `proxy` field in `src/client/package.json`; reads `REACT_APP_API_URL` or defaults to `http://localhost:3101`.
- **Port and host from environment** — server reads `PORT` and `HOST` from environment variables with sane defaults (`3101` / `localhost`).

### Changed
- Theme and active-server preferences now persist across page reloads via `localStorage`.
- Remote Connections UI: improved start/stop button styling.

### Fixed
- Removed extra blue focus ring on MUI `OutlinedInput` components (CSS override in both `App.tsx` theme and `index.css`).

---

## [1.8.0] - 2024-12-01

### Added
- Advanced Monitoring Dashboard with real-time performance charts and health scoring.
- Metrics page with live per-process sparklines (rolling 1-hour window, updated every 3s).
- Metrics History tab backed by SQLite for long-term CPU and memory charts.
- Remote Server Management — connect and manage PM2 on remote servers via SSH.
- Cron Jobs — schedule recurring tasks with a visual cron expression builder.
- What's New page and in-app changelog viewer.
- Page-level authentication support.

### Changed
- UI migrated to Tailwind CSS for a compact, responsive, dark/light-friendly design.

---

## [1.6.0] - 2024-09-01

### Added
- Enhanced log streaming with WebSocket-based real-time updates.
- Process detail page with per-process performance charts.
- Ecosystem configuration generator.
- PM2 module management.

---

## [1.5.0] - 2024-07-01

### Added
- System metrics dashboard (CPU cores, memory, load averages, uptime).
- Cluster management UI — scale instances, switch fork/cluster mode, zero-downtime reload.

---

## [1.4.0] - 2024-05-01

### Added
- Application deployment form — launch new PM2 processes from the UI.
- Dark/light mode toggle.
- Filter processes by status or name.

---

## [1.3.0] - 2024-03-01

### Added
- Initial public release.
- Real-time process monitoring via WebSocket (Socket.IO).
- Start, stop, restart, and delete PM2 processes from the browser.
- Process CPU and memory charts.

# EZ PM2 GUI Development Guide

## Project Structure

The EZ PM2 GUI application is structured as follows:

- `src/server`: TypeScript server code using Express and Socket.IO
- `src/client`: React-based frontend with TypeScript and Material UI
- `src/types`: TypeScript type definitions
- `bin`: CLI executable scripts 
- `dist`: Compiled server and client code (generated during build)
- `test`: Test utilities

## Features Implemented

1. **Real-time Process Monitoring**
   - Process list with status indicators
   - CPU and memory usage tracking
   - Real-time updates using WebSockets

2. **Process Management**
   - Start, stop, restart, and delete processes
   - Detailed view of process information

3. **System Metrics**
   - System load average
   - Memory usage
   - CPU cores
   - System uptime
   - Visual charts with Chart.js

4. **Process Logs**
   - View standard output and error logs
   - Auto-refresh capability

5. **Modern UI**
   - Material UI components
   - Responsive design
   - Dark/light theme support

6. **TypeScript Implementation**
   - Full type safety
   - Type definitions for PM2

## Development Setup

### Prerequisites

- Node.js (>= 16.x)
- PM2 installed globally (`npm install -g pm2`)

### Installation

1. Run the installation script:
   - Windows: `install.bat`
   - Linux/macOS: `./install.sh`

2. Start the application:
   ```
   npm start
   ```

3. Open in browser:
   ```
   http://localhost:3001
   ```

### Testing with Sample Services

You can create some test PM2 services to experiment with the UI:

```
node test/create-test-services.js
```

## Development Workflow

### Server Development

1. Make changes to files in `src/server`
2. Run `npm run dev:server` to start the server in development mode with auto-reload

### Client Development

1. Make changes to files in `src/client/src`
2. Run `npm run dev:client` to start the React development server

#### TypeScript Type Checking

The project uses TypeScript for type safety. Make sure to:

- Define proper interfaces for your components props
- Use type definitions from `src/client/src/types` directory
- Run TypeScript compiler to check for type errors: `cd src/client && npx tsc --noEmit`

### Running Both in Development Mode

```
npm run dev
```

## Adding a New Language (i18n)

EZ PM2 GUI uses [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) for translations. Adding a new language takes four steps.

### 1. Create the translation file

Copy the English source as your starting point:

```bash
cp src/client/src/locales/en/translation.json \
   src/client/src/locales/<code>/translation.json
```

Replace `<code>` with the [BCP-47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g. `fr` for French, `de` for German, `zh` for Chinese).

Translate every value in the JSON — **do not change the keys**.  
The Chinese draft (`src/client/src/locales/zh/translation.json`) is available as a reference example.

### 2. Register the locale in `src/client/src/i18n.ts`

```ts
import frTranslation from './locales/fr/translation.json';

// inside .init({ resources: { ... } })
fr: { translation: frTranslation },
```

### 3. Add the language to the switcher in `src/client/src/components/LanguageSwitcher.tsx`

```ts
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'fr', label: 'Français' }, // ← add your entry
];
```

Use the **native name** of the language as the label (e.g. `Deutsch`, `Español`, `中文`) so speakers can identify it regardless of the active locale.

### 4. Build and verify

```bash
cd src/client && npm run build
```

The build must complete with **Compiled successfully** and zero ESLint warnings. Open the app, switch to your new language via the globe icon in the navbar, and spot-check a few pages.

### Contribution checklist

- [ ] All keys from `en/translation.json` are present (no missing keys — i18next falls back to `en` silently, hiding gaps)
- [ ] Translations are reviewed by a native speaker
- [ ] Build passes with zero warnings
- [ ] PR title follows the pattern: `feat(i18n): add <Language> translation`

---

## Publishing as an NPM Package

1. Update version in `package.json`
2. Build everything: `npm run build`
3. Publish to npm: `npm publish`

## Usage as a Global Command

After installing globally:

```
npm install -g EZ PM2 GUI
```

You can run:

```
EZ PM2 GUI
```

## Usage as a Module

```javascript
const EZ PM2 GUI = require('EZ PM2 GUI');

// Start with default options
EZ PM2 GUI.start();

// Or with custom options
EZ PM2 GUI.start({
  port: 3030,
  host: '0.0.0.0'
});
```

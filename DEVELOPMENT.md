# ezPM2GUI Development Guide

## Project Structure

The ezPM2GUI application is structured as follows:

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

## Publishing as an NPM Package

1. Update version in `package.json`
2. Build everything: `npm run build`
3. Publish to npm: `npm publish`

## Usage as a Global Command

After installing globally:

```
npm install -g ezpm2gui
```

You can run:

```
ezpm2gui
```

## Usage as a Module

```javascript
const ezpm2gui = require('ezpm2gui');

// Start with default options
ezpm2gui.start();

// Or with custom options
ezpm2gui.start({
  port: 3030,
  host: '0.0.0.0'
});
```

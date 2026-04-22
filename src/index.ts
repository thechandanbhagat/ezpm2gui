// src/index.ts - Main entry point for programmatic usage
import { createServer } from './server/index';

interface StartOptions {
  port?: number;
  host?: string;
}

/**
 * Start the EZ PM2 GUI server
 * @param options Configuration options
 * @returns The HTTP server instance
 */
export function start(options: StartOptions = {}) {
  const port = options.port || process.env.PORT || 3101;
  const host = options.host || process.env.HOST || 'localhost';
  
  process.env.PORT = port.toString();
  process.env.HOST = host;
  
  return createServer();
}

export default { start };

import pm2 from 'pm2';

/**
 * Utility to manage PM2 connections
 * This implements connection pooling to avoid the overhead of
 * repeatedly connecting and disconnecting to PM2
 */

let isConnected = false;
let connectionPromise: Promise<void> | null = null;
let connectionRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Check if PM2 is installed and available
 */
const checkPM2Installation = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('pm2 --version', (error: any) => {
      if (error) {
        console.error('PM2 is not installed or not available in PATH');
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

/**
 * Connect to PM2 if not already connected
 * Returns a promise that resolves when the connection is established
 */
export const connectToPM2 = async (): Promise<void> => {
  // If already connected, return resolved promise
  if (isConnected) {
    return Promise.resolve();
  }

  // If a connection attempt is in progress, return that promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // First check if PM2 is installed
  const isPM2Installed = await checkPM2Installation();
  if (!isPM2Installed) {
    return Promise.reject(new Error(
      'PM2 is not installed or not in your PATH. Please install PM2 globally using: npm install -g pm2'
    ));
  }

  // Start a new connection attempt
  connectionPromise = new Promise<void>((resolve, reject) => {
    pm2.connect((err) => {
      if (err) {
        console.error('Failed to connect to PM2:', err);
        
        // Retry logic
        if (connectionRetries < MAX_RETRIES) {
          connectionRetries++;
          connectionPromise = null;
          
          // Wait and try again
          setTimeout(() => {
            connectToPM2()
              .then(resolve)
              .catch(reject);
          }, RETRY_DELAY);
        } else {
          // Max retries reached
          connectionRetries = 0;
          connectionPromise = null;
          reject(err);
        }
      } else {
        isConnected = true;
        connectionRetries = 0;
        resolve();
      }
    });
  });

  return connectionPromise;
};

/**
 * Safely disconnect from PM2
 * Use this when shutting down the server
 */
export const disconnectFromPM2 = (): Promise<void> => {
  return new Promise((resolve) => {
    if (isConnected) {
      pm2.disconnect();
      isConnected = false;
      connectionPromise = null;
    }
    resolve();
  });
};

/**
 * Execute a PM2 command with automatic connection handling
 * This will connect to PM2 if needed, run the command,
 * and properly handle the result
 */
export const executePM2Command = async <T>(
  command: (callback: (err: Error | null, result?: T) => void) => void
): Promise<T> => {
  try {
    await connectToPM2();
    
    return new Promise<T>((resolve, reject) => {
      command((err, result) => {
        if (err) {
          reject(err);
        } else if (result === undefined) {
          reject(new Error('PM2 command returned undefined result'));
        } else {
          resolve(result);
        }
      });
    });
  } catch (err) {
    // If connection fails, ensure we reset the connection state
    isConnected = false;
    connectionPromise = null;
    throw err;
  }
};

// Handle process termination to clean up PM2 connection
process.on('SIGINT', () => {
  disconnectFromPM2().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  disconnectFromPM2().then(() => {
    process.exit(0);
  });
});

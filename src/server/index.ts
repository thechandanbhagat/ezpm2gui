import path from 'path';
// @group Configuration : Load .env.local first (local overrides), then .env (defaults)
// Must happen before any code reads process.env
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import pm2 from 'pm2';
import os from 'os';
import { execSync } from 'child_process';

// Import routes
import clusterManagementRoutes from './routes/clusterManagement';
import processConfigRoutes from './routes/processConfig';
import deployApplicationRoutes from './routes/deployApplication';
import moduleRoutes from './routes/modules';
import remoteConnectionRoutes from './routes/remoteConnections';
import cronJobsRoutes from './routes/cronJobs';
import updatesRoutes from './routes/updates';
import pageAuthRoutes from './routes/pageAuth';
import { setupLogStreaming } from './routes/logStreaming';
import { executePM2Command, disconnectFromPM2 } from './utils/pm2-connection';
import { remoteConnectionManager } from './utils/remote-connection';

/**
 * Create and configure the express server
 */
export function createServer() {
  // Initialize Express app
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    // Increase ping timeout to prevent false positive disconnections in VPN/remote scenarios
    pingTimeout: 20000,  // How long to wait for a pong response (increased from 10s to 20s)
    pingInterval: 25000, // How often to send ping packets (default: 25000ms)
    // Allow reconnection attempts
    allowEIO3: true,
    // Transport configuration
    transports: ['websocket', 'polling'],
    // Upgrade timeout
    upgradeTimeout: 20000  // Increased from 10s to 20s for slow VPN connections
  });
  
  // Configure middleware
  app.use(express.json());
  
  // Serve static files from the React app build directory
  const staticPath = path.join(__dirname, '../../src/client/build');
  console.log('Serving static files from:', staticPath);
  const fs = require('fs');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
  } else {
    console.error('Static files directory not found at:', staticPath);
  }

  // Register routes  app.use('/api/cluster', clusterManagementRoutes);
  app.use('/api/config', processConfigRoutes);
  app.use('/api/deploy', deployApplicationRoutes);
  app.use('/api/modules', moduleRoutes);
  app.use('/api/remote', remoteConnectionRoutes);
  app.use('/api/cron-jobs', cronJobsRoutes);
  app.use('/api/update', updatesRoutes);
  app.use('/api/auth', pageAuthRoutes);
  
  // Setup log streaming with Socket.IO
  setupLogStreaming(io);  // PM2 API endpoints
  app.get('/api/processes', async (req, res) => {
    try {
      const processList = await executePM2Command<any[]>((callback) => {
        pm2.list(callback);
      });
      res.json(processList);
    } catch (err) {
      console.error('Failed to get PM2 processes:', err);
      
      // Check if error is about PM2 not being installed
      if (err instanceof Error && err.message.includes('PM2 is not installed')) {
        res.status(500).json({ 
          error: 'PM2 is not installed. Please install PM2 globally using: npm install -g pm2',
          pmNotInstalled: true
        });
      } else {
        res.status(500).json({ error: 'Failed to get PM2 processes' });
      }
    }
  });
  
  // Action endpoints (start, stop, restart, delete)
  app.post('/api/process/:id/:action', async (req, res) => {
    const { id, action } = req.params;

    const validActions = ['start', 'stop', 'restart', 'delete'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    try {
      await executePM2Command((callback) => {
        switch (action) {
          case 'start':
            pm2.start(id, callback);
            break;
          case 'stop':
            pm2.stop(id, callback);
            break;
          case 'restart':
            pm2.restart(id, callback);
            break;
          case 'delete':
            (pm2 as any).delete(id, callback);
            break;
        }
      });
      res.json({ success: true, message: `Process ${id} ${action} request received` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `Failed to ${action} process` });
    }
  });
  
  // Get system metrics
  app.get('/api/metrics', (req, res) => {
    const metrics = {
      loadAvg: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      uptime: os.uptime(),
      cpus: os.cpus().length
    };
    
    res.json(metrics);
  });

  // @group LogHistory : Resolve log path from PM2 process descriptor
  const resolveLocalLogPath = async (id: string, logType: 'out' | 'err'): Promise<string | null> => {
    const processDesc = await executePM2Command<any[]>((callback) => {
      pm2.describe(id, callback);
    });
    if (!processDesc || processDesc.length === 0) return null;
    return processDesc[0]?.pm2_env?.[`pm_${logType}_log_path`] ?? null;
  };

  // @group LogHistory : Get log lines — ?lines=N (default 200, 0 = all)
  app.get('/api/logs/:id/:type', async (req, res) => {
    const { id, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';
    const lines = parseInt((req.query.lines as string) || '200', 10);

    try {
      const logPath = await resolveLocalLogPath(id, logType);

      if (!logPath) {
        res.status(404).json({ error: 'Process not found or log path unavailable' });
        return;
      }

      const fs = require('fs');
      if (!fs.existsSync(logPath)) {
        res.json({ logs: [], logPath });
        return;
      }

      const { lines: result, total } = await streamTailLines(fs.createReadStream(logPath), lines);
      res.json({ logs: result, logPath, totalLines: total });
    } catch (err) {
      console.error(`Error reading log file: ${err}`);
      res.status(500).json({ error: 'Failed to read log file' });
    }
  });

  // @group LogHistory : Download full log file
  app.get('/api/logs/:id/:type/download', async (req, res) => {
    const { id, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';

    try {
      const logPath = await resolveLocalLogPath(id, logType);

      if (!logPath) {
        res.status(404).json({ error: 'Process not found or log path unavailable' });
        return;
      }

      const fs = require('fs');
      if (!fs.existsSync(logPath)) {
        res.status(404).json({ error: 'Log file does not exist yet' });
        return;
      }

      const fileName = `${id}-${logType}.log`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      fs.createReadStream(logPath).pipe(res);
    } catch (err) {
      console.error(`Error downloading log file: ${err}`);
      res.status(500).json({ error: 'Failed to download log file' });
    }
  });

  // @group LogHistory : List all log files (current + rotated) for a process
  // Uses /api/log-files/:id to avoid Express matching /:id/:type with type='files'
  app.get('/api/log-files/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const fs   = require('fs')  as typeof import('fs');
      const nodePath = require('path') as typeof import('path');

      const [outPath, errPath] = await Promise.all([
        resolveLocalLogPath(id, 'out'),
        resolveLocalLogPath(id, 'err'),
      ]);

      if (!outPath && !errPath) {
        res.status(404).json({ error: 'Process not found or no log paths available' });
        return;
      }

      // Derive the process base name from the log path (strip -out.log suffix)
      const baseName = outPath
        ? nodePath.basename(outPath).replace(/-out\.log.*$/, '')
        : nodePath.basename(errPath!).replace(/-(error|err)\.log.*$/, '');

      const logDirs = new Set<string>();
      if (outPath) logDirs.add(nodePath.dirname(outPath));
      if (errPath) logDirs.add(nodePath.dirname(errPath));

      const files: any[] = [];
      for (const dir of logDirs) {
        if (!fs.existsSync(dir)) continue;
        for (const fileName of fs.readdirSync(dir)) {
          if (!fileName.startsWith(baseName)) continue;
          const filePath = nodePath.join(dir, fileName);
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;

          let type: 'out' | 'err' | 'unknown' = 'unknown';
          if (fileName.includes('-out'))                          type = 'out';
          else if (fileName.includes('-error') || fileName.includes('-err')) type = 'err';

          files.push({
            name:       fileName,
            path:       filePath,
            size:       stat.size,
            modified:   stat.mtime.toISOString(),
            type,
            compressed: fileName.endsWith('.gz'),
          });
        }
      }

      files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
      res.json({ files });
    } catch (err) {
      console.error('Error listing log files:', err);
      res.status(500).json({ error: 'Failed to list log files' });
    }
  });

  // @group LogHistory : Security helper — block path traversal; allow any absolute log file path
  const isAllowedLogPath = (filePath: string): boolean => {
    const nodePath = require('path') as typeof import('path');
    const norm = nodePath.normalize(filePath);
    // Require absolute path; reject shell-dangerous characters; require log extension
    const SHELL_UNSAFE = /['"`;$|&<>(){}\\\n\r\0]/;
    return (
      nodePath.isAbsolute(norm) &&
      !norm.includes('..') &&
      !SHELL_UNSAFE.test(norm) &&
      /\.(log|gz)$/i.test(norm)
    );
  };

  // @group LogHistory : Stream last N lines from a readable stream (ring buffer, no full-file load)
  const streamTailLines = (inputStream: NodeJS.ReadableStream, maxLines: number): Promise<{ lines: string[]; total: number }> => {
    return new Promise((resolve, reject) => {
      const rl = require('readline').createInterface({ input: inputStream, crlfDelay: Infinity });
      const buffer: string[] = [];
      let total = 0;
      rl.on('line', (line: string) => {
        if (line.trim() === '') return;
        total++;
        if (maxLines > 0) {
          buffer.push(line);
          if (buffer.length > maxLines) buffer.shift();
        } else {
          buffer.push(line);
        }
      });
      rl.on('close', () => resolve({ lines: buffer, total }));
      rl.on('error', reject);
      inputStream.on('error', reject);
    });
  };

  // @group LogHistory : Read a specific log file by path — ?lines=N, supports .gz
  // Uses /api/log-file (singular, top-level) to avoid clashing with /api/logs/:id/:type
  app.get('/api/log-file', async (req, res) => {
    const filePath = req.query.path as string;
    const lines    = parseInt((req.query.lines as string) || '200', 10);

    if (!filePath) { res.status(400).json({ error: 'path query parameter required' }); return; }
    if (!isAllowedLogPath(filePath)) { res.status(403).json({ error: 'Access denied: path is outside PM2 log directories' }); return; }

    try {
      const fs   = require('fs')   as typeof import('fs');
      const zlib = require('zlib') as typeof import('zlib');

      if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }

      const inputStream: NodeJS.ReadableStream = filePath.endsWith('.gz')
        ? fs.createReadStream(filePath).pipe(zlib.createGunzip())
        : fs.createReadStream(filePath);

      const { lines: result, total } = await streamTailLines(inputStream, lines);
      res.json({ logs: result, totalLines: total });
    } catch (err) {
      console.error('Error reading log file:', err);
      res.status(500).json({ error: 'Failed to read log file' });
    }
  });

  // @group LogHistory : Download a specific log file by path (streams .gz as-is)
  app.get('/api/log-file/download', async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path query parameter required' }); return; }
    if (!isAllowedLogPath(filePath)) { res.status(403).json({ error: 'Access denied' }); return; }

    try {
      const fs       = require('fs')   as typeof import('fs');
      const zlib     = require('zlib') as typeof import('zlib');
      const nodePath = require('path') as typeof import('path');
      if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }

      // Decompress .gz server-side so the download is always plain text
      const baseName = nodePath.basename(filePath).replace(/\.gz$/i, '');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      if (filePath.endsWith('.gz')) {
        fs.createReadStream(filePath).pipe(zlib.createGunzip()).pipe(res);
      } else {
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error('Error downloading log file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
  
  // WebSocket for real-time updates
  io.on('connection', (socket) => {
    console.log('Client connected');

    // Send process updates every 3 seconds using shared pooled connection
    const processInterval = setInterval(async () => {
      try {
        const processList = await executePM2Command<any[]>((callback) => {
          pm2.list(callback);
        });
        socket.emit('processes', processList);
      } catch (err) {
        console.error('Failed to list PM2 processes:', err);
      }
    }, 3000);

    // Send system metrics every 2 seconds
    const metricsInterval = setInterval(() => {
      const metrics = {
        loadAvg: os.loadavg(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        },
        uptime: os.uptime(),
        cpus: os.cpus().length
      };
      
      socket.emit('metrics', metrics);
    }, 2000);

    socket.on('disconnect', () => {
      console.log('Client disconnected');
      clearInterval(processInterval);
      clearInterval(metricsInterval);
    });
  });

  // Catch-all route to return the React app
  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../../src/client/build/index.html');
    console.log('Trying to serve index.html from:', indexPath);
    const fs = require('fs');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.error('Index.html file not found at:', indexPath);
      res.status(404).send('File not found. Please check server configuration.');
    }
  });

  // Return the server instance
  return server;
}

// Only start the server if this file is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3101;
  const HOST = process.env.HOST || 'localhost';
  
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    try {
      await disconnectFromPM2();
      await remoteConnectionManager.closeAllConnections();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nGracefully shutting down...');
    try {
      await disconnectFromPM2();
      await remoteConnectionManager.closeAllConnections();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    server.close();
    process.exit(0);
  });
}
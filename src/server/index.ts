import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
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
    // Increase ping timeout to prevent false positive disconnections
    pingTimeout: 10000,  // How long to wait for a pong response (default: 5000ms)
    pingInterval: 25000, // How often to send ping packets (default: 25000ms)
    // Allow reconnection attempts
    allowEIO3: true,
    // Transport configuration
    transports: ['websocket', 'polling'],
    // Upgrade timeout
    upgradeTimeout: 10000
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

  // Get process logs
  app.get('/api/logs/:id/:type', async (req, res) => {
    const { id, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';

    try {
      const processDesc = await executePM2Command<any[]>((callback) => {
        pm2.describe(id, callback);
      });

      if (!processDesc || processDesc.length === 0) {
        res.status(404).json({ error: 'Process not found' });
        return;
      }

      const logPath = processDesc[0]?.pm2_env?.[`pm_${logType}_log_path`];

      if (!logPath) {
        res.status(404).json({ error: `Log file for ${logType} not found` });
        return;
      }

      const fs = require('fs');
      let logContent = '';

      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        const fileSize = stats.size;
        const readSize = Math.min(fileSize, 10 * 1024); // 10KB max
        const position = Math.max(0, fileSize - readSize);

        const buffer = Buffer.alloc(readSize);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buffer, 0, readSize, position);
        fs.closeSync(fd);

        logContent = buffer.toString('utf8');
      }

      const logs = logContent.split('\n').filter((line: string) => line.trim() !== '');
      res.json({ logs });
    } catch (err) {
      console.error(`Error reading log file: ${err}`);
      res.status(500).json({ error: 'Failed to read log file' });
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
  const PORT = process.env.PORT || 3001;
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
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
import { setupLogStreaming } from './routes/logStreaming';
import { executePM2Command, disconnectFromPM2 } from './utils/pm2-connection';

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
    }
  });
  
  // Configure middleware
  app.use(express.json());
  
  // Serve static files from the React app build directory
  const staticPath = 'D:/Personal/ezpm2gui/src/client/build';
  console.log('Serving static files from:', staticPath);
  const fs = require('fs');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
  } else {
    console.error('Static files directory not found at:', staticPath);
  }

  // Register routes
  app.use('/api/cluster', clusterManagementRoutes);
  app.use('/api/config', processConfigRoutes);
  app.use('/api/deploy', deployApplicationRoutes);
  app.use('/api/modules', moduleRoutes);
  
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
  app.post('/api/process/:id/:action', (req, res) => {
    const { id, action } = req.params;
    
    pm2.connect((err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to connect to PM2' });
        return;
      }

      const processAction = (actionName: string, cb: (err: Error | null) => void) => {
        switch (actionName) {
          case 'start':
            pm2.start(id, cb);
            break;
          case 'stop':
            pm2.stop(id, cb);
            break;
          case 'restart':
            pm2.restart(id, cb);
            break;
          case 'delete':
            (pm2 as any).del(id, cb);
            break;
          default:
            cb(new Error('Invalid action'));
        }
      };

      processAction(action, (err) => {
        pm2.disconnect();
        if (err) {
          console.error(err);
          res.status(500).json({ error: `Failed to ${action} process` });
          return;
        }
        res.json({ success: true, message: `Process ${id} ${action} request received` });
      });
    });
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
  app.get('/api/logs/:id/:type', (req, res) => {
    const { id, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';
    
    pm2.connect((err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to connect to PM2' });
        return;
      }

      pm2.describe(id, (err, processDesc: any) => {
        if (err || !processDesc || processDesc.length === 0) {
          pm2.disconnect();
          res.status(404).json({ error: 'Process not found' });
          return;
        }

        const logPath = processDesc[0]?.pm2_env?.[`pm_${logType}_log_path`];
        
        if (!logPath) {
          pm2.disconnect();
          res.status(404).json({ error: `Log file for ${logType} not found` });
          return;
        }

        try {
          // Read the log file using Node.js fs instead of exec
          const fs = require('fs');
          let logContent = '';
          
          if (fs.existsSync(logPath)) {
            // Read the last part of the file (up to 10KB to avoid huge responses)
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
          
          pm2.disconnect();
          res.json({ logs });
        } catch (error) {
          console.error(`Error reading log file: ${error}`);
          pm2.disconnect();
          res.status(500).json({ error: 'Failed to read log file' });
        }
      });
    });
  });
  
  // WebSocket for real-time updates
  io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send process updates every 3 seconds
    const processInterval = setInterval(() => {
      pm2.connect((err) => {
        if (err) {
          console.error(err);
          return;
        }

        pm2.list((err, processList) => {
          pm2.disconnect();
          if (err) {
            console.error(err);
            return;
          }
          socket.emit('processes', processList);
        });
      });
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
    const indexPath = 'D:/Personal/ezpm2gui/src/client/build/index.html';
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
}
import { Router } from 'express';
import pm2 from 'pm2';
import fs from 'fs';
import { spawn } from 'child_process';

const router:Router = Router();

// This variable will hold references to active log streams
const activeStreams: Record<string, any> = {};

// Get active stream (or create a new one)
const getLogStream = (io: any, processId: string, logType: string) => {
  const streamKey = `${processId}-${logType}`;
  
  // If stream already exists, return it
  if (activeStreams[streamKey]) {
    return activeStreams[streamKey];
  }
  
  return new Promise((resolve, reject) => {
    pm2.describe(processId, (err, processDesc: any) => {
      if (err || !processDesc || processDesc.length === 0) {
        reject(new Error('Process not found'));
        return;
      }
      
      const logPath = processDesc[0]?.pm2_env?.[`pm_${logType}_log_path`];
      
      if (!logPath || !fs.existsSync(logPath)) {
        reject(new Error(`Log file not found: ${logPath}`));
        return;
      }
      
      // Create a tail process to stream the log file
      const tail = spawn('tail', ['-f', logPath]);
      
      // Setup event handlers
      tail.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim() !== '');
        
        lines.forEach((line: string) => {
          // Emit log line to all connected clients
          io.emit('log-line', {
            processId,
            logType,
            line
          });
        });
      });
      
      tail.stderr.on('data', (data) => {
        console.error(`Tail error: ${data}`);
      });
      
      tail.on('close', (code) => {
        console.log(`Tail process exited with code ${code}`);
        delete activeStreams[streamKey];
      });
      
      // Store the tail process
      activeStreams[streamKey] = tail;
      
      resolve(tail);
    });
  });
};

// Setup socket.io handlers for log streaming
const setupLogStreaming = (io: any) => {
  io.on('connection', (socket: any) => {
    console.log('Client connected for log streaming');
    
    // Subscribe to log stream
    socket.on('subscribe-logs', async ({ processId, logType }) => {
      try {
        const streamKey = `${processId}-${logType}`;
        
        // Add socket to a room for this specific log stream
        socket.join(streamKey);
        
        console.log(`Client subscribed to logs: ${streamKey}`);
        
        // Get or create the log stream
        await getLogStream(io, processId, logType);
      } catch (error) {
        console.error('Error subscribing to logs:', error);
      }
    });
    
    // Unsubscribe from log stream
    socket.on('unsubscribe-logs', ({ processId, logType }) => {
      const streamKey = `${processId}-${logType}`;
      
      // Remove socket from the room
      socket.leave(streamKey);
      
      console.log(`Client unsubscribed from logs: ${streamKey}`);
      
      // If no more clients in this room, stop the stream
      const room = io.sockets.adapter.rooms.get(streamKey);
      if (!room || room.size === 0) {
        const stream = activeStreams[streamKey];
        if (stream) {
          console.log(`Stopping log stream: ${streamKey}`);
          stream.kill();
          delete activeStreams[streamKey];
        }
      }
    });
    
    // Cleanup on disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected from log streaming');
    });
  });
};

export { setupLogStreaming };
export default router;

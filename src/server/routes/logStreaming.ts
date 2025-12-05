import { Router } from 'express';
import pm2 from 'pm2';
import fs from 'fs';
import { spawn } from 'child_process';
import { remoteConnectionManager } from '../utils/remote-connection';

const router:Router = Router();

// This variable will hold references to active log streams
const activeStreams: Record<string, any> = {};
const activeRemoteStreams: Record<string, any> = {};

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

// Get remote log stream (or create a new one)
const getRemoteLogStream = async (io: any, connectionId: string, processId: string) => {
  const streamKey = `${connectionId}-${processId}`;
  
  // If stream already exists, return it
  if (activeRemoteStreams[streamKey]) {
    return activeRemoteStreams[streamKey];
  }
  
  const connection = remoteConnectionManager.getConnection(connectionId);
  if (!connection || !connection.isConnected()) {
    throw new Error('Connection not found or not connected');
  }

  // Get process info to find log paths
  console.log(`Getting process info for: ${processId}`);
  const processInfoResult = await connection.executeCommand(`pm2 jlist`, false); // Don't use sudo for listing
  if (processInfoResult.code !== 0) {
    throw new Error(`Failed to get process list: ${processInfoResult.stderr}`);
  }

  let processInfo;
  try {
    const processList = JSON.parse(processInfoResult.stdout);
    console.log(`Found ${processList.length} processes`);
    
    // Find the process by ID
    processInfo = processList.find((proc: any) => proc.pm_id === parseInt(processId));
    if (!processInfo) {
      throw new Error(`Process with ID ${processId} not found`);
    }
    console.log(`Found process: ${processInfo.name} (ID: ${processInfo.pm_id})`);
  } catch (parseError) {
    console.error('Parse error:', parseError);
    throw new Error(`Failed to parse process list: ${parseError}`);
  }  const processName = processInfo.name;

  // Create streams using pm2 logs instead of tail for better permission handling
  const streams: any = {};
  try {
    console.log(`Setting up pm2 logs stream for process: ${processName} (ID: ${processId})`);
    
    // Use pm2 logs with --lines 0 --raw to stream only new logs
    // Use sudo since PM2 processes are running as root
    const pm2LogsCommand = `pm2 logs ${processId} --lines 0 --raw`;
    console.log(`About to create pm2 log stream with command: ${pm2LogsCommand} (using sudo)`);
    
    const logStream = await connection.createLogStream(pm2LogsCommand, true);
    console.log(`Successfully created pm2 logs stream for ${processName}`);
    
    logStream.on('data', (data: string) => {
      console.log(`Raw pm2 logs data received for ${processName}:`, data);
      const lines = data.toString().split('\n').filter((line: string) => line.trim() !== '');
        lines.forEach((line: string) => {
        // Skip PM2 startup messages, system messages, and errors
        if (line.trim() === '' || 
            line.includes('PM2') ||
            line.includes('---') ||
            line.includes('watching') ||
            line.includes('change detected') ||
            line.includes('Runtime Edition') ||
            line.includes('Production Process Manager') ||
            line.includes('built-in Load Balancer') ||
            line.includes('$ pm2') ||
            line.includes('http://pm2.io') ||
            line.includes('Start and Daemonize') ||
            line.includes('Load Balance') ||
            line.includes('Monitor in production') ||
            line.includes('Make pm2 auto-boot') ||
            line.includes('To go further') ||
            line.includes('ENOENT') ||
            line.includes('module_conf.json') ||
            line.includes('pm2.log') ||
            line.includes('node:fs:') ||
            line.includes('at Object.') ||
            line.includes('at Client.') ||
            line.includes('at processTicksAndRejections') ||
            line.includes('errno:') ||
            line.includes('syscall:') ||
            line.includes('Node.js v') ||
            line.startsWith('    at ') ||
            line.match(/^\s*\^?\s*$/) ||
            line.match(/^[\s_\/\\|]+$/)) {
          console.log(`Skipping PM2 system/error line: "${line}"`);
          return;
        }
        
        // Parse PM2 log format: timestamp | app-name | message
        // PM2 logs typically come in format like: "2023-01-01T12:00:00: PM2 log: [TAILING]"
        // or just the raw log content depending on version
        let logType = 'stdout'; // Default to stdout
        let cleanLine = line;
        
        // Try to detect if this is stderr (PM2 usually prefixes with different indicators)
        if (line.includes('ERROR') || line.includes('error') || line.includes('stderr')) {
          logType = 'stderr';
        }
        
        // Clean up the line by removing PM2 prefixes if present
        // PM2 log format can vary, but often includes timestamps and app names
        const logMatch = line.match(/^.*?\|\s*(.+)$/);
        if (logMatch) {
          cleanLine = logMatch[1];
        }
        
        console.log(`Emitting remote-log-line for ${connectionId}-${processId} (${logType}):`, cleanLine);
        io.emit('remote-log-line', {
          connectionId,
          processId,
          processName,
          logType,
          line: cleanLine
        });
      });
    });
    
    logStream.on('error', (error: any) => {
      console.error(`Error in pm2 logs stream for ${processName}:`, error);
      io.emit('remote-log-error', {
        connectionId,
        processId,
        processName,
        error: error.message
      });
    });
    
    logStream.on('close', (code: any) => {
      console.log(`PM2 logs stream closed for ${processName} with code:`, code);
    });
    
    streams.combined = logStream;
  } catch (error) {    console.error(`Failed to create pm2 logs stream for ${processName}:`, error);
    io.emit('remote-log-error', {
      connectionId,
      processId,
      processName,
      error: `Failed to start log streaming: ${error}`
    });
  }
  
  // Store the streams
  activeRemoteStreams[streamKey] = streams;
  
  return streams;
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
    });    // Subscribe to remote log stream
    socket.on('subscribe-remote-logs', async ({ connectionId, processId }) => {
      try {
        console.log(`Subscribing to remote logs - Connection: ${connectionId}, Process: ${processId}`);
        const streamKey = `${connectionId}-${processId}`;
        
        // Add socket to a room for this specific log stream
        socket.join(streamKey);
        
        console.log(`Client subscribed to remote logs: ${streamKey}`);
        
        // Get or create the remote log stream
        await getRemoteLogStream(io, connectionId, processId);
      } catch (error) {
        console.error('Error subscribing to remote logs:', error);
        socket.emit('remote-log-error', {
          connectionId,
          processId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Unsubscribe from remote log stream
    socket.on('unsubscribe-remote-logs', ({ connectionId, processId }) => {
      const streamKey = `${connectionId}-${processId}`;
      
      // Remove socket from the room
      socket.leave(streamKey);
      
      console.log(`Client unsubscribed from remote logs: ${streamKey}`);
      
      // If no more clients in this room, stop the streams
      const room = io.sockets.adapter.rooms.get(streamKey);
      if (!room || room.size === 0) {
        const streams = activeRemoteStreams[streamKey];
        if (streams) {
          console.log(`Stopping remote log streams: ${streamKey}`);
          if (streams.stdout && streams.stdout.kill) {
            streams.stdout.kill();
          }
          if (streams.stderr && streams.stderr.kill) {
            streams.stderr.kill();
          }
          delete activeRemoteStreams[streamKey];
        }
      }
    });
  });
};

export { setupLogStreaming };
export default router;

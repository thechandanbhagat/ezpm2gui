import express, { Router } from 'express';
import { remoteConnectionManager, RemoteConnectionConfig } from '../utils/remote-connection';

const router: Router = express.Router();

// @group Security : Validate remote log file paths before shell interpolation
const SHELL_UNSAFE_CHARS = /['"`;$|&<>(){}\\\n\r\0]/;
const MAX_LOG_LINES = 10_000;

const validateRemotePath = (filePath: string): boolean => {
  if (!filePath) return false;
  if (filePath.includes('..')) return false;
  if (SHELL_UNSAFE_CHARS.test(filePath)) return false;
  if (!/\.(log|gz)$/i.test(filePath)) return false;
  return true;
};

const safeLogLines = (raw: string | undefined): number => {
  const n = parseInt(raw || '200', 10);
  if (!Number.isFinite(n) || n < 0) return 200;
  return Math.min(n, MAX_LOG_LINES);
};

/**
 * Connect to an existing remote server
 * POST /api/remote/:connectionId/connect
 */
router.post('/:connectionId/connect', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    // Establish the SSH connection only — PM2 detection happens lazily
    // when processes are first requested, avoiding a slow multi-command
    // pre-check that causes browser timeouts on the connect button.
    await connection.connect();

    res.json({ success: true });  } catch (error) {
    console.error('Connection error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: `Failed to connect: ${errorMessage}`
    });
  }
});

/**
 * Disconnect from a remote server
 * POST /api/remote/:connectionId/disconnect
 */
router.post('/:connectionId/disconnect', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const success = await remoteConnectionManager.closeConnection(connectionId);
    
    res.json({
      success
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to disconnect: ${error.message}`
    });
  }
});

/**
 * Create a new remote server connection (legacy route)
 * POST /api/remote/connect
 */
router.post('/connect', async (req, res) => {
  try {
    const connectionConfig: RemoteConnectionConfig = req.body;
    
    // Validate required fields
    if (!connectionConfig.host || !connectionConfig.username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required connection parameters'
      });
    }
    
    // Ensure port is set
    if (!connectionConfig.port) {
      connectionConfig.port = 22;
    }
    
    // Validate authentication method
    if (!connectionConfig.password && !connectionConfig.privateKey) {
      return res.status(400).json({
        success: false,
        error: 'No authentication method provided (password or privateKey)'
      });
    }
    
    // Create the connection
    const connectionId = remoteConnectionManager.createConnection(connectionConfig);
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create connection'
      });
    }
    
    // Test the connection
    try {
      await connection.connect();
      
      // Check if PM2 is installed
      const isPM2Installed = await connection.checkPM2Installation();
      
      res.json({
        success: true,
        connectionId,
        isPM2Installed,
        name: connectionConfig.name || connectionConfig.host
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Connection failed: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Disconnect from a remote server
 * POST /api/remote/disconnect
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { connectionId } = req.body;
    
    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing connectionId parameter'
      });
    }
    
    const success = await remoteConnectionManager.closeConnection(connectionId);
    
    res.json({
      success
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get PM2 process list from remote server
 * GET /api/remote/pm2/list
 */
router.get('/pm2/list/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
      try {
      const processes = await connection.getPM2Processes();
      
      res.json(processes);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get PM2 list: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get detailed information about a PM2 process on remote server
 * GET /api/remote/pm2/info/:connectionId/:processId
 */
router.get('/pm2/info/:connectionId/:processId', async (req, res) => {
  try {
    const { connectionId, processId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
      try {
      // Find process in the list of processes
      const processes = await connection.getPM2Processes();
      const process = processes.find(p => p.pm_id.toString() === processId);
      
      if (!process) {
        return res.status(404).json({
          success: false,
          error: 'Process not found'
        });
      }
      
      res.json({
        success: true,
        processInfo: process
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get process info: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Perform process actions (start, stop, restart, delete) on remote server
 * POST /api/remote/pm2/action/:connectionId/:action
 */
router.post('/pm2/action/:connectionId/:action', async (req, res) => {
  try {
    const { connectionId, action } = req.params;
    const { processId, options } = req.body;
    
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    let result;
    
    try {
      switch (action) {
        case 'start':
          result = await connection.startPM2Process(options || processId);
          break;
        case 'stop':
          result = await connection.stopPM2Process(processId);
          break;
        case 'restart':
          result = await connection.restartPM2Process(processId);
          break;
        case 'delete':
          result = await connection.deletePM2Process(processId);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Unknown action: ${action}`
          });
      }
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Action failed: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get PM2 processes from remote server
 * GET /api/remote/:connectionId/processes
 */
router.get('/:connectionId/processes', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    try {
      const processes = await connection.getPM2Processes();
      res.json(processes);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get processes: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Perform an action on a PM2 process
 * POST /api/remote/:connectionId/processes/:processName/:action
 */
router.post('/:connectionId/processes/:processName/:action', async (req, res) => {
  try {
    const { connectionId, processName, action } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    try {
      let result;
      
      switch (action) {
        case 'start':
          result = await connection.startPM2Process(processName);
          break;
        case 'stop':
          result = await connection.stopPM2Process(processName);
          break;
        case 'restart':
          result = await connection.restartPM2Process(processName);
          break;
        case 'delete':
          result = await connection.deletePM2Process(processName);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Invalid action: ${action}`
          });
      }
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to ${action} process: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get system information from a remote server
 * GET /api/remote/:connectionId/system-info
 */
router.get('/:connectionId/system-info', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    try {
      const systemInfo = await connection.getSystemInfo();
      res.json(systemInfo);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get system info: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get logs for a PM2 process on remote server
 * GET /api/remote/pm2/logs/:connectionId/:processId
 */
router.get('/pm2/logs/:connectionId/:processId', async (req, res) => {
  try {
    const { connectionId, processId } = req.params;
    const lines = req.query.lines ? parseInt(req.query.lines as string) : 100;
    
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    try {
      const result = await connection.getPM2Logs(processId, lines);
      
      res.json({
        success: true,
        logs: result.stdout
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get logs: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get system information from the remote server
 * GET /api/remote/system/:connectionId
 */
router.get('/system/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    try {
      const systemInfo = await connection.getSystemInfo();
      
      res.json({
        success: true,
        systemInfo
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Failed to get system info: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Get logs from a remote PM2 process
 * GET /api/remote/:connectionId/logs/:processId
 */
router.get('/:connectionId/logs/:processId', async (req, res) => {
  try {
    const { connectionId, processId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }

    if (!connection.isConnected()) {
      return res.status(400).json({
        success: false,
        error: 'Connection not established'
      });
    }

    // Get log paths from PM2 process info — use the PATH-fallback executor so
    // pm2 is found regardless of the remote shell environment (nvm, npm-global, etc.)
    const processInfoResult = await connection.executePM2Command('jlist');
    if (processInfoResult.code !== 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get PM2 process list'
      });
    }

    let processInfo;
    try {
      let raw = processInfoResult.stdout.trim();
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']') + 1;
      if (start !== -1 && end > 0) raw = raw.substring(start, end);

      const processList = JSON.parse(raw);
      processInfo = processList.find((p: any) => p.pm_id === parseInt(processId, 10) || p.name === processId);

      if (!processInfo) {
        return res.status(404).json({
          success: false,
          error: 'Process not found'
        });
      }
    } catch (parseError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PM2 process list'
      });
    }

    const outLogPath = processInfo.pm2_env?.pm_out_log_path;
    const errLogPath = processInfo.pm2_env?.pm_err_log_path;

    const logs: { stdout: string[], stderr: string[] } = {
      stdout: [],
      stderr: []
    };    // Fetch stdout logs
    if (outLogPath) {
      let outResult = await connection.executeCommand(`tail -n 100 "${outLogPath}" 2>/dev/null || echo ""`);
      
      // If failed, try with sudo
      if (outResult.code !== 0 || !outResult.stdout.trim()) {
        console.log(`Failed to read ${outLogPath}, trying with sudo`);
        outResult = await connection.executeCommand(`sudo tail -n 100 "${outLogPath}" 2>/dev/null || echo ""`);
      }
      
      if (outResult.code === 0 && outResult.stdout.trim()) {
        logs.stdout = outResult.stdout.trim().split('\n').filter(line => line.trim());
      }
    }

    // Fetch stderr logs
    if (errLogPath) {
      let errResult = await connection.executeCommand(`tail -n 100 "${errLogPath}" 2>/dev/null || echo ""`);
      
      // If failed, try with sudo
      if (errResult.code !== 0 || !errResult.stdout.trim()) {
        console.log(`Failed to read ${errLogPath}, trying with sudo`);
        errResult = await connection.executeCommand(`sudo tail -n 100 "${errLogPath}" 2>/dev/null || echo ""`);
      }
      
      if (errResult.code === 0 && errResult.stdout.trim()) {
        logs.stderr = errResult.stdout.trim().split('\n').filter(line => line.trim());
      }
    }

    res.json({
      success: true,
      ...logs
    });
  } catch (error) {
    console.error('Error fetching remote logs:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// @group LogHistory : Helper — resolve log path for a given process on a remote connection
const resolveRemoteLogPath = async (connection: any, processId: string, logType: 'out' | 'err'): Promise<{ logPath: string | null; error?: string }> => {
  const processInfoResult = await connection.executePM2Command('jlist');
  if (processInfoResult.code !== 0) return { logPath: null, error: 'Failed to get PM2 process list' };

  try {
    let raw = processInfoResult.stdout.trim();
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']') + 1;
    if (start !== -1 && end > 0) raw = raw.substring(start, end);

    const processList = JSON.parse(raw);
    const proc = processList.find((p: any) => p.pm_id === parseInt(processId, 10) || p.name === processId);
    if (!proc) return { logPath: null, error: 'Process not found' };

    const key = logType === 'out' ? 'pm_out_log_path' : 'pm_err_log_path';
    return { logPath: proc.pm2_env?.[key] ?? null };
  } catch {
    return { logPath: null, error: 'Failed to parse PM2 process list' };
  }
};

/**
 * Get log lines from a specific log type on a remote process — ?lines=N (default 200, 0 = all)
 * GET /api/remote/:connectionId/logs/:processId/:type
 */
router.get('/:connectionId/logs/:processId/:type', async (req, res) => {
  try {
    const { connectionId, processId, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';
    const lines = safeLogLines(req.query.lines as string | undefined);

    const connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) return res.status(404).json({ success: false, error: 'Connection not found' });
    if (!connection.isConnected()) return res.status(400).json({ success: false, error: 'Not connected' });

    const { logPath, error } = await resolveRemoteLogPath(connection, processId, logType);
    if (!logPath) return res.status(404).json({ success: false, error: error || 'Log path not found' });

    // tail -n 0 = all lines; use wc -l to get total count alongside
    const lineArg = lines === 0 ? '+1' : `-${lines}`;
    const cmd = `{ wc -l < "${logPath}" 2>/dev/null || echo 0; } && tail -n ${lineArg} "${logPath}" 2>/dev/null`;
    let result = await connection.executeCommand(cmd);

    // Fallback to sudo if the file is unreadable (root-owned logs)
    if (result.code !== 0 || !result.stdout.trim()) {
      result = await connection.executeCommand(`{ sudo wc -l < "${logPath}" 2>/dev/null || echo 0; } && sudo tail -n ${lineArg} "${logPath}" 2>/dev/null`);
    }

    const outputLines = result.stdout.split('\n');
    const totalLines = parseInt(outputLines[0]?.trim() || '0', 10);
    const logLines = outputLines.slice(1).filter((l: string) => l.trim() !== '');

    res.json({ logs: logLines, logPath, totalLines });
  } catch (error) {
    console.error('Error fetching remote log history:', error);
    res.status(500).json({ success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

/**
 * Download full log file from a remote process via SSH
 * GET /api/remote/:connectionId/logs/:processId/:type/download
 */
router.get('/:connectionId/logs/:processId/:type/download', async (req, res) => {
  try {
    const { connectionId, processId, type } = req.params;
    const logType = type === 'err' ? 'err' : 'out';

    const connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) return res.status(404).json({ success: false, error: 'Connection not found' });
    if (!connection.isConnected()) return res.status(400).json({ success: false, error: 'Not connected' });

    const { logPath, error } = await resolveRemoteLogPath(connection, processId, logType);
    if (!logPath) return res.status(404).json({ success: false, error: error || 'Log path not found' });

    const fileName = `${processId}-${logType}.log`;
    await connection.streamFileToResponse(logPath, res, fileName);
  } catch (error) {
    console.error('Error downloading remote log:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  }
});

/**
 * List all log files (current + rotated) for a remote process
 * GET /api/remote/:connectionId/log-files/:processId
 * Uses /log-files/ prefix to avoid Express matching /:processId/:type with type='files'
 */
router.get('/:connectionId/log-files/:processId', async (req, res) => {
  try {
    const { connectionId, processId } = req.params;

    const connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) return res.status(404).json({ success: false, error: 'Connection not found' });
    if (!connection.isConnected()) return res.status(400).json({ success: false, error: 'Not connected' });

    // Resolve both log paths so we know the directory and base name
    const { logPath: outPath } = await resolveRemoteLogPath(connection, processId, 'out');
    const { logPath: errPath } = await resolveRemoteLogPath(connection, processId, 'err');

    if (!outPath && !errPath) {
      return res.status(404).json({ success: false, error: 'No log paths found for this process' });
    }

    // Derive log directory + base name from the out log path (or err if out missing)
    const refPath  = outPath || errPath!;
    const logDir   = refPath.substring(0, refPath.lastIndexOf('/'));
    const baseName = refPath.split('/').pop()!.replace(/-out\.log.*$/, '').replace(/-(error|err)\.log.*$/, '');

    // List matching files in the log directory
    const lsCmd = `ls -la "${logDir}" 2>/dev/null`;
    let lsResult = await connection.executeCommand(lsCmd);
    if (lsResult.code !== 0) lsResult = await connection.executeCommand(`sudo ${lsCmd}`);

    const files: any[] = [];
    if (lsResult.code === 0) {
      for (const line of lsResult.stdout.split('\n')) {
        // ls -la line: permissions links owner group size month day time name
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;

        const fileName = parts.slice(8).join(' ');
        if (!fileName.startsWith(baseName)) continue;

        const size     = parseInt(parts[4], 10) || 0;
        const month    = parts[5];
        const day      = parts[6];
        const timeOrYr = parts[7];
        const modified = `${month} ${day} ${timeOrYr}`;

        let type: 'out' | 'err' | 'unknown' = 'unknown';
        if (fileName.includes('-out'))                               type = 'out';
        else if (fileName.includes('-error') || fileName.includes('-err')) type = 'err';

        files.push({
          name:       fileName,
          path:       `${logDir}/${fileName}`,
          size,
          modified,
          type,
          compressed: fileName.endsWith('.gz'),
        });
      }
    }

    // Sort: current files first (no date suffix), then rotated newest first
    files.sort((a: any, b: any) => {
      const aRot = a.name.includes('__') || /\d{4}-\d{2}/.test(a.name);
      const bRot = b.name.includes('__') || /\d{4}-\d{2}/.test(b.name);
      if (!aRot && bRot) return -1;
      if (aRot && !bRot) return 1;
      return b.name.localeCompare(a.name);
    });

    res.json({ files });
  } catch (error) {
    console.error('Error listing remote log files:', error);
    res.status(500).json({ success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

/**
 * Read a specific remote log file by path — ?lines=N, handles .gz via zcat
 * GET /api/remote/:connectionId/log-file?path=...&lines=N
 * Uses /log-file top-level to avoid clashing with /logs/:processId routes
 */
router.get('/:connectionId/log-file', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const filePath = req.query.path as string;
    const lines    = safeLogLines(req.query.lines as string | undefined);

    if (!filePath) return res.status(400).json({ error: 'path query parameter required' });

    // Strict path validation — blocks traversal, shell metacharacters, and non-log extensions
    if (!validateRemotePath(filePath)) {
      return res.status(403).json({ error: 'Access denied: invalid or unsafe log file path' });
    }

    const connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) return res.status(404).json({ success: false, error: 'Connection not found' });
    if (!connection.isConnected()) return res.status(400).json({ success: false, error: 'Not connected' });

    const isGz     = filePath.endsWith('.gz');
    const catCmd   = isGz ? `zcat "${filePath}" 2>/dev/null` : `cat "${filePath}" 2>/dev/null`;
    const lineArg  = lines === 0 ? '' : `| tail -n ${lines}`;
    const countCmd = isGz
      ? `zcat "${filePath}" 2>/dev/null | wc -l`
      : `wc -l < "${filePath}" 2>/dev/null`;

    const [contentResult, countResult] = await Promise.all([
      connection.executeCommand(`${catCmd} ${lineArg}`).catch(() => ({ code: 1, stdout: '', stderr: '' })),
      connection.executeCommand(countCmd).catch(() => ({ code: 1, stdout: '0', stderr: '' })),
    ]);

    // Fallback to sudo on permission error
    const content = contentResult.code === 0 && contentResult.stdout.trim()
      ? contentResult
      : await connection.executeCommand(`sudo ${catCmd} ${lineArg}`);

    const totalLines = parseInt(countResult.stdout?.trim() || '0', 10);
    const logLines   = (content.stdout || '').split('\n').filter((l: string) => l.trim() !== '');

    res.json({ logs: logLines, totalLines });
  } catch (error) {
    console.error('Error reading remote log file:', error);
    res.status(500).json({ success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

/**
 * Download a specific remote log file by path via SSH cat/zcat
 * GET /api/remote/:connectionId/log-file/download?path=...
 */
router.get('/:connectionId/log-file/download', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const filePath = req.query.path as string;

    if (!filePath) return res.status(400).json({ error: 'path query parameter required' });
    if (!validateRemotePath(filePath)) {
      return res.status(403).json({ error: 'Access denied: invalid or unsafe log file path' });
    }

    const connection = remoteConnectionManager.getConnection(connectionId);
    if (!connection) return res.status(404).json({ success: false, error: 'Connection not found' });
    if (!connection.isConnected()) return res.status(400).json({ success: false, error: 'Not connected' });

    // .gz files: stream via SFTP + local gunzip (no server-side memory buffering)
    if (filePath.endsWith('.gz')) {
      const gzName = filePath.split('/').pop()!.replace(/\.gz$/, '');
      await connection.streamGzFileToResponse(filePath, res, gzName);
      return;
    }

    // Plain files: SFTP stream
    const fileName = filePath.split('/').pop()!;
    await connection.streamFileToResponse(filePath, res, fileName);
  } catch (error) {
    console.error('Error downloading remote log file:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  }
});

/**
 * Get list of all remote connections with their status
 * GET /api/remote/connections
 */
router.get('/connections', async (req, res) => {  try {
    const connections = remoteConnectionManager.getAllConnections();
    const connectionsList = Array.from(connections.entries()).map(([id, conn]) => ({
      id,
      name: conn.name || `${conn.username}@${conn.host}`,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      connected: conn.isConnected(),
      isPM2Installed: conn.isPM2Installed
    }));

    res.json(connectionsList);
  } catch (error) {
    console.error('Error getting connections:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Add a new remote connection configuration
 * POST /api/remote/connections
 */
router.post('/connections', (req, res) => {
  try {
    const connectionConfig: RemoteConnectionConfig = req.body;
    
    if (!connectionConfig.name || !connectionConfig.host || !connectionConfig.username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required connection parameters: name, host, or username'
      });
    }
    
    // Ensure port is set
    if (!connectionConfig.port) {
      connectionConfig.port = 22;
    }
    
    // Create the connection
    const connectionId = remoteConnectionManager.createConnection(connectionConfig);
    
    res.status(201).json({
      success: true,
      connectionId,
      message: 'Connection configuration saved'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

/**
 * Update an existing remote connection configuration
 * PUT /api/remote/connections/:connectionId
 */
router.put('/connections/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connectionConfig: RemoteConnectionConfig = req.body;
    
    if (!connectionConfig.name || !connectionConfig.host || !connectionConfig.username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required connection parameters: name, host, or username'
      });
    }
    
    // Ensure port is set
    if (!connectionConfig.port) {
      connectionConfig.port = 22;
    }
    
    // Update the connection
    const success = await remoteConnectionManager.updateConnection(connectionId, connectionConfig);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Connection updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Delete a remote connection configuration
 * DELETE /api/remote/connections/:connectionId
 */
router.delete('/connections/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    // Close the connection if it's open
    await remoteConnectionManager.closeConnection(connectionId);
    
    // Delete the connection configuration
    const success = remoteConnectionManager.deleteConnection(connectionId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Connection deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Install PM2 on a remote server
 * POST /api/remote/:connectionId/install-pm2
 */
router.post('/:connectionId/install-pm2', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = remoteConnectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }
    
    // Install PM2
    const result = await connection.installPM2();
    
    if (result.code === 0) {
      res.json({
        success: true,
        message: 'PM2 installed successfully',
        output: result.stdout
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to install PM2',
        output: result.stderr || result.stdout
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to install PM2: ${error.message}`
    });
  }
});

export default router;

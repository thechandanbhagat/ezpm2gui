import express, { Router } from 'express';
import { remoteConnectionManager, RemoteConnectionConfig } from '../utils/remote-connection';

const router: Router = express.Router();

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
    
    // Connect to the remote server
    await connection.connect();
    
    // Check if PM2 is installed
    const isPM2Installed = await connection.checkPM2Installation();
    
    res.json({
      success: true,
      isPM2Installed
    });  } catch (error) {
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
    }    // Get log paths from PM2 process info
    const processInfoResult = await connection.executeCommand(`pm2 show ${processId} --json`);
    if (processInfoResult.code !== 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get process info'
      });
    }

    let processInfo;
    try {
      processInfo = JSON.parse(processInfoResult.stdout);
      if (!Array.isArray(processInfo) || processInfo.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Process not found'
        });
      }
      processInfo = processInfo[0];
    } catch (parseError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse process info'
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
      isConnected: conn.isConnected(),
      isPM2Installed: conn.isPM2Installed    }));

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

/**
 * Delete a connection configuration
 * DELETE /api/remote/connections/:connectionId
 */
router.delete('/connections/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    // Disconnect if connected
    await remoteConnectionManager.closeConnection(connectionId);
    
    // Delete the connection from the manager
    const success = remoteConnectionManager.deleteConnection(connectionId);
    
    if (success) {
      res.json({ success: true, message: 'Connection deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Connection not found' });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

export default router;

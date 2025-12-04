import { Client, ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';

/**
 * Interface for remote server connection configuration
 */
export interface RemoteConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  name?: string;  // A friendly name for the connection
  useSudo?: boolean; // Whether to use sudo for privileged commands
}

/**
 * Type for remote command execution results
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Class to manage SSH connections to remote servers
 */
export class RemoteConnection extends EventEmitter {
  private client: Client;
  private config: RemoteConnectionConfig;
  private _isConnected = false;
  public isPM2Installed = false;
  
  // Public properties for connection info
  public name: string;
  public host: string;
  public port: number;
  public username: string;
  
  // Getters for secure access to authentication details
  get hasPassword(): boolean {
    return !!this.config.password;
  }
  
  get hasPrivateKey(): boolean {
    return !!this.config.privateKey;
  }
  
  get hasPassphrase(): boolean {
    return !!this.config.passphrase;
  }
  
  // Getter for secure config (without sensitive data)
  get secureConfig(): RemoteConnectionConfig {
    return {
      name: this.name,
      host: this.host,
      port: this.port,
      username: this.username
    };
  }
  
  // Method to get the full config for use by connection manager
  getFullConfig(): RemoteConnectionConfig {
    return this.config;
  }

  constructor(config: RemoteConnectionConfig) {
    super();
    this.client = new Client();
    this.config = config;
    
    // Initialize public properties
    this.name = config.name || config.host;
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username;
  }
  
  /**
   * Check if the connection is active
   */
  isConnected(): boolean {
    return this._isConnected;
  }
  /**
   * Connect to the remote server
   */  async connect(): Promise<void> {
    if (this._isConnected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {      this.client.on('ready', () => {
        this._isConnected = true;
        console.log(`Successfully connected to ${this.config.host}`);
        this.emit('connected');
        resolve();
      });

      this.client.on('error', (err) => {
        this._isConnected = false;
        console.error(`SSH connection error for ${this.config.host}:`, err.message);
        reject(err);
      });

      this.client.on('end', () => {
        this._isConnected = false;
        console.log(`Disconnected from ${this.config.host}`);
        this.emit('disconnected');
      });

      // Attempt connection with the provided configuration
      const connectionConfig: any = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        // Add reasonable timeouts
        readyTimeout: 10000,
        keepaliveInterval: 30000
      };

      // Debug output
      console.log(`Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);
      console.log(`Authentication methods available: ${this.config.password ? 'Password' : 'No password'}, ${this.config.privateKey ? 'Private key' : 'No private key'}`);
      
      // Add authentication method
      if (this.config.privateKey) {
        connectionConfig.privateKey = this.config.privateKey;
        if (this.config.passphrase) {
          connectionConfig.passphrase = this.config.passphrase;
        }
      } else if (this.config.password) {
        connectionConfig.password = this.config.password;
      } else {
        console.error('No authentication method provided for', this.config.host);
        return reject(new Error('No authentication method provided'));
      }

      this.client.connect(connectionConfig);
    });
  }

  /**
   * Disconnect from the remote server
   */
  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._isConnected) {
        resolve();
        return;
      }

      this.client.once('end', () => {
        this._isConnected = false;
        resolve();
      });

      this.client.end();
    });
  }  /**
   * Execute a command on the remote server
   * @param command The command to execute
   * @param forceSudo Whether to force using sudo for this specific command
   */
  async executeCommand(command: string, forceSudo?: boolean): Promise<CommandResult> {    
    // Connect if not already connected
    if (!this._isConnected) {
      await this.connect();
    }

    // Apply sudo if configured or explicitly requested for this command
    const useElevatedPrivileges = forceSudo || this.config.useSudo;
    let finalCommand = command;
    
    // Only apply sudo if it's requested and we have a password
    if (useElevatedPrivileges && this.config.password) {
      finalCommand = `echo '${this.config.password}' | sudo -S ${command}`;
    }
      
    console.log(`Executing command: ${useElevatedPrivileges ? '[sudo] ' : ''}${command}`);

    return new Promise((resolve, reject) => {
      this.client.exec(finalCommand, (err, channel) => {
        if (err) {
          console.error('Error executing command:', err);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';
        let exitCode: number | null = null;

        channel.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on('exit', (code) => {
          exitCode = code;
        });

        channel.on('close', () => {
          // Remove sudo password from stdout/stderr if present
          if (useElevatedPrivileges && this.config.password) {
            stdout = stdout.replace(this.config.password, '[PASSWORD REDACTED]');
            stderr = stderr.replace(this.config.password, '[PASSWORD REDACTED]');
          }
          
          resolve({
            stdout,
            stderr,
            code: exitCode
          });
        });

        channel.on('error', (err) => {
          console.error('Channel error:', err);
          reject(err);
        });
      });
    });
  }

  /**
   * Check if PM2 is installed on the remote server
   * Uses multiple detection methods for better reliability
   */
  async checkPM2Installation(): Promise<boolean> {
    try {
      // Method 1: Try running pm2 --version directly (most reliable)
      try {
        const versionResult = await this.executeCommand('pm2 --version');
        if (versionResult.code === 0 && versionResult.stdout.trim()) {
          console.log(`PM2 detected via version check: ${versionResult.stdout.trim()}`);
          this.isPM2Installed = true;
          return true;
        }
      } catch (error) {
        console.log('PM2 version check failed, trying alternative methods');
      }

      // Method 2: Check common installation paths
      const pathChecks = [
        'which pm2',
        'command -v pm2',
        'ls -la /usr/local/bin/pm2',
        'ls -la ~/.npm-global/bin/pm2',
        'ls -la ~/node_modules/.bin/pm2',
        'find /usr -name "pm2" -type f -executable 2>/dev/null | head -1'
      ];

      for (const pathCheck of pathChecks) {
        try {
          const result = await this.executeCommand(pathCheck);
          if (result.code === 0 && result.stdout.trim() && !result.stdout.includes('not found')) {
            console.log(`PM2 found via: ${pathCheck} -> ${result.stdout.trim()}`);
            this.isPM2Installed = true;
            return true;
          }
        } catch (error) {
          // Continue to next method
          continue;
        }
      }

      // Method 3: Try with full environment loading
      try {
        const envResult = await this.executeCommand('bash -l -c "pm2 --version"');
        if (envResult.code === 0 && envResult.stdout.trim()) {
          console.log(`PM2 detected via bash login shell: ${envResult.stdout.trim()}`);
          this.isPM2Installed = true;
          return true;
        }
      } catch (error) {
        console.log('PM2 not found via bash login shell');
      }

      // Method 4: Try npm ls -g pm2
      try {
        const npmResult = await this.executeCommand('npm ls -g pm2 --depth=0');
        if (npmResult.code === 0 && !npmResult.stdout.includes('(empty)')) {
          console.log('PM2 detected via npm global list');
          this.isPM2Installed = true;
          return true;
        }
      } catch (error) {
        console.log('PM2 not found via npm global list');
      }

      console.log('PM2 not detected via any method');
      this.isPM2Installed = false;
      return false;
    } catch (error) {
      console.error('Error during PM2 installation check:', error);
      this.isPM2Installed = false;
      return false;
    }
  }

  /**
   * Execute a PM2 command with proper PATH handling
   * Tries different methods to find and execute PM2
   */
  private async executePM2Command(pm2Args: string): Promise<CommandResult> {
    const commands = [
      `pm2 ${pm2Args}`,                           // Direct PM2 call
      `bash -l -c "pm2 ${pm2Args}"`,              // With login shell
      `~/.npm-global/bin/pm2 ${pm2Args}`,         // Common global npm path
      `~/node_modules/.bin/pm2 ${pm2Args}`,       // Local node_modules path
      `/usr/local/bin/pm2 ${pm2Args}`,            // System-wide installation
      `npx pm2 ${pm2Args}`                        // Using npx as fallback
    ];

    let lastError: any = null;

    for (const command of commands) {
      try {
        const result = await this.executeCommand(command);
        if (result.code === 0) {
          return result;
        }
        lastError = new Error(`Command failed with exit code ${result.code}: ${result.stderr}`);
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error(`Failed to execute PM2 command: ${pm2Args}`);
  }

  /**
   * Get PM2 processes from the remote server
   */
  async getPM2Processes(): Promise<any[]> {
    try {
      // Connect if not already connected
      if (!this._isConnected) {
        await this.connect();
      }

      // Check if PM2 is installed (force re-check if not cached)
      const isPM2Installed = await this.checkPM2Installation();
      if (!isPM2Installed) {
        throw new Error('PM2 is not installed on the remote server. Please install PM2 globally using: npm install -g pm2');
      }

      // Update the cached status
      this.isPM2Installed = true;

      const result = await this.executePM2Command('jlist');
      
      // Clean the output to ensure it's valid JSON
      // Sometimes pm2 jlist can include non-JSON data at the beginning or end
      let cleanedOutput = result.stdout.trim();
      
      // Find the beginning of the JSON array
      const startIndex = cleanedOutput.indexOf('[');
      // Find the end of the JSON array
      const endIndex = cleanedOutput.lastIndexOf(']') + 1;
      
      if (startIndex === -1 || endIndex === 0) {
        console.log('Invalid PM2 output format, trying alternative approach');
        // Try using pm2 list --format=json instead
        const listResult = await this.executeCommand('pm2 list --format=json');
        cleanedOutput = listResult.stdout.trim();
      } else if (startIndex > 0 || endIndex < cleanedOutput.length) {
        // Extract just the JSON array part
        cleanedOutput = cleanedOutput.substring(startIndex, endIndex);
      }

      try {
        const processList = JSON.parse(cleanedOutput);
        
        // Format process data similar to local PM2 format
        return processList.map((proc: any) => ({
          name: proc.name,
          pm_id: proc.pm_id,
          status: proc.pm2_env ? proc.pm2_env.status : 'unknown',
          cpu: proc.monit ? (proc.monit.cpu || 0).toFixed(1) : '0.0',
          memory: proc.monit ? this.formatMemory(proc.monit.memory) : '0 B',
          uptime: proc.pm2_env ? this.formatUptime(proc.pm2_env.pm_uptime) : 'N/A',
          restarts: proc.pm2_env ? (proc.pm2_env.restart_time || 0) : 0
        }));
      } catch (error) {
        console.error('Error parsing PM2 process list:', error);
        console.log('Raw output:', result.stdout);
        // Return an empty array instead of throwing
        return [];
      }
    } catch (error) {
      console.error('Error getting PM2 processes:', error);
      throw error;
    }
  }

  /**
   * Format memory size to human readable format
   */
  private formatMemory(bytes: number): string {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human readable format
   */  private formatUptime(timestamp: number): string {
    if (!timestamp || isNaN(timestamp)) return 'N/A';
    
    try {
      const uptime = Date.now() - timestamp;
      if (uptime < 0) return 'N/A'; // Invalid timestamp
      
      const seconds = Math.floor(uptime / 1000);
      
      if (seconds < 60) {
        return `${seconds}s`;
      } else if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
      } else if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
      } else {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        return `${days}d ${hours}h`;
      }
    } catch (error) {
      console.error('Error formatting uptime:', error);
      return 'N/A';
    }
  }

  /**
   * Start a PM2 process
   */
  async startPM2Process(processName: string): Promise<CommandResult> {
    return await this.executePM2Command(`start ${processName}`);
  }

  /**
   * Stop a PM2 process
   */
  async stopPM2Process(processName: string): Promise<CommandResult> {
    return await this.executePM2Command(`stop ${processName}`);
  }

  /**
   * Restart a PM2 process
   */
  async restartPM2Process(processName: string): Promise<CommandResult> {
    return await this.executePM2Command(`restart ${processName}`);
  }

  /**
   * Delete a PM2 process
   */
  async deletePM2Process(processName: string): Promise<CommandResult> {
    return await this.executePM2Command(`delete ${processName}`);
  }

  /**
   * Install PM2 on the remote server
   */
  async installPM2(): Promise<CommandResult> {
    try {
      console.log('Attempting to install PM2 on remote server...');
      
      // Try different installation methods
      const installCommands = [
        'npm install -g pm2',                     // Standard global install
        'sudo npm install -g pm2',                // With sudo if needed
        'npm install -g pm2 --unsafe-perm=true', // With unsafe permissions
      ];

      let lastResult: CommandResult | null = null;
      
      for (const command of installCommands) {
        try {
          const result = await this.executeCommand(command, command.includes('sudo'));
          if (result.code === 0) {
            console.log(`PM2 installed successfully with: ${command}`);
            
            // Verify installation
            const isPM2Installed = await this.checkPM2Installation();
            if (isPM2Installed) {
              this.isPM2Installed = true;
              return result;
            }
          }
          lastResult = result;
        } catch (error) {
          console.log(`Failed to install PM2 with command: ${command}`);
          lastResult = {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            code: 1
          };
        }
      }

      return lastResult || {
        stdout: '',
        stderr: 'Failed to install PM2 with any method',
        code: 1
      };
    } catch (error) {
      console.error('Error installing PM2:', error);
      throw error;
    }
  }

  /**
   * Get system information from the remote server
   */
  async getSystemInfo(): Promise<any> {
    try {
      // Connect if not already connected
      if (!this._isConnected) {
        await this.connect();
      }

      // Run a series of commands to get system information
      const [hostname, platform, arch, nodeVersion, memInfo, cpuInfo] = await Promise.all([
        this.executeCommand('hostname'),
        this.executeCommand('uname -s'),
        this.executeCommand('uname -m'),
        this.executeCommand('node -v'),
        this.executeCommand('free -b'),
        this.executeCommand('cat /proc/cpuinfo | grep processor | wc -l')
      ]);

      // Parse memory information
      const memLines = memInfo.stdout.split('\n');
      let totalMemory = 0;
      let freeMemory = 0;
      
      if (memLines.length > 1) {
        const memValues = memLines[1].split(/\s+/);
        if (memValues.length > 6) {
          totalMemory = parseInt(memValues[1], 10);
          freeMemory = parseInt(memValues[3], 10);
        }
      }

      // Get load average
      const loadAvgResult = await this.executeCommand('cat /proc/loadavg');
      const loadAvg = loadAvgResult.stdout.trim().split(' ').slice(0, 3).map(parseFloat);

      return {
        hostname: hostname.stdout.trim(),
        platform: platform.stdout.trim(),
        arch: arch.stdout.trim(),
        nodeVersion: nodeVersion.stdout.trim(),
        totalMemory: this.formatMemory(totalMemory),
        freeMemory: this.formatMemory(freeMemory),
        cpuCount: parseInt(cpuInfo.stdout.trim(), 10),
        loadAverage: loadAvg
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      throw error;
    }
  }
  /**
   * Get logs for a PM2 process
   */
  async getPM2Logs(processName: string, lines: number = 100): Promise<CommandResult> {
    return await this.executeCommand(`pm2 logs ${processName} --lines ${lines} --nostream`);
  }  /**
   * Create a streaming log connection for a command
   */
  async createLogStream(command: string, useSudo: boolean = false): Promise<EventEmitter> {
    if (!this._isConnected) {
      throw new Error('Connection not established');
    }

    let finalCommand = command;
    let isInitialized = false;
    
    // Apply sudo if requested and we have a password
    if (useSudo && this.config.useSudo && this.config.password) {
      // Use echo to pipe the password to sudo for streaming commands
      finalCommand = `echo '${this.config.password}' | sudo -S ${command}`;
    }

    console.log(`[createLogStream] Executing command: ${finalCommand.replace(this.config.password || '', '[PASSWORD]')}`);

    return new Promise((resolve, reject) => {
      this.client.exec(finalCommand, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          console.error(`[createLogStream] Exec error:`, err);
          reject(err);
          return;
        }

        const logEmitter = new EventEmitter();        stream.on('data', (data: Buffer) => {
          const dataStr = data.toString();
          console.log(`[createLogStream] Raw data:`, dataStr);
          
          // Skip the sudo password prompt and initial setup messages
          if (!isInitialized) {
            if (dataStr.includes('[sudo] password') || 
                dataStr.includes('Password:') ||
                dataStr.trim() === '') {
              return; // Skip initialization messages
            }
            isInitialized = true;
          }
          
          logEmitter.emit('data', dataStr);
        });

        stream.stderr?.on('data', (data: Buffer) => {
          const dataStr = data.toString();
          console.log(`[createLogStream] Stderr data:`, dataStr);
          
          // Don't emit stderr data for sudo prompts or permission messages
          if (!dataStr.includes('[sudo] password') && 
              !dataStr.includes('Password:') &&
              !dataStr.includes('Sorry, try again')) {
            logEmitter.emit('data', dataStr);
          }
        });

        stream.on('close', (code: number) => {
          console.log(`[createLogStream] Stream closed with code:`, code);
          logEmitter.emit('close', code);
        });

        stream.on('error', (error: Error) => {
          console.error(`[createLogStream] Stream error:`, error);
          logEmitter.emit('error', error);
        });

        // Add a method to kill the stream
        (logEmitter as any).kill = () => {
          console.log(`[createLogStream] Killing stream`);
          stream.close();
        };

        resolve(logEmitter);
      });
    });
  }
}

/**
 * Interface for saved connection configuration
 */
export interface SavedConnectionConfig extends RemoteConnectionConfig {
  id: string;
}

/**
 * Connection manager to handle multiple remote connections
 */
export class RemoteConnectionManager {
  private connections: Map<string, RemoteConnection> = new Map();
  private configFilePath: string;
  
  constructor() {
    const path = require('path');
    this.configFilePath = path.join(__dirname, '../config/remote-connections.json');
    this.loadConnectionsFromDisk();
  }
  /**
   * Create a new remote connection
   * @param config Connection configuration
   * @returns The connection ID
   */
  createConnection(config: RemoteConnectionConfig): string {
    const connectionId = `${config.host}-${config.port}-${config.username}`;
    
    if (this.connections.has(connectionId)) {
      return connectionId;
    }
    
    const connection = new RemoteConnection(config);
    this.connections.set(connectionId, connection);
    
    // Save the updated connections to disk
    this.saveConnectionsToDisk();
    
    return connectionId;
  }

  /**
   * Update an existing remote connection
   * @param connectionId The connection ID
   * @param config New connection configuration
   * @returns True if the connection was updated, false if it didn't exist
   */
  async updateConnection(connectionId: string, config: RemoteConnectionConfig): Promise<boolean> {
    const existingConnection = this.connections.get(connectionId);
    
    if (!existingConnection) {
      return false;
    }
    
    // Close the existing connection if it's active
    if (existingConnection.isConnected()) {
      await existingConnection.disconnect();
    }
    
    // Get the old config to preserve password if not provided in update
    const oldConfig = existingConnection.getFullConfig();
    
    // If password is not provided in the update, keep the old one
    const updatedConfig: RemoteConnectionConfig = {
      ...config,
      password: config.password || oldConfig.password,
      privateKey: config.privateKey || oldConfig.privateKey,
      passphrase: config.passphrase || oldConfig.passphrase
    };
    
    // Create a new connection with updated config
    const newConnection = new RemoteConnection(updatedConfig);
    
    // Replace the old connection with the new one
    this.connections.set(connectionId, newConnection);
    
    // Save the updated connections to disk
    this.saveConnectionsToDisk();
    
    return true;
  }

  /**
   * Get a connection by ID
   * @param connectionId The connection ID
   */
  getConnection(connectionId: string): RemoteConnection | undefined {
    return this.connections.get(connectionId);
  }
  /**
   * Close a connection by ID (disconnect but keep the configuration)
   * @param connectionId The connection ID
   */
  async closeConnection(connectionId: string): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      await connection.disconnect();
      return true;
    }
    
    return false;
  }

  /**
   * Close all connections
   */  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map((conn) => conn.disconnect());
    await Promise.all(closePromises);
    this.connections.clear();
  }
  
  /**
   * Get all connections
   * @returns Map of all connections
   */
  getAllConnections(): Map<string, RemoteConnection> {
    return this.connections;
  }
    /**
   * Delete a connection by ID
   * @param connectionId The connection ID
   * @returns True if the connection was deleted, false if it didn't exist
   */
  deleteConnection(connectionId: string): boolean {
    const deleted = this.connections.delete(connectionId);
    if (deleted) {
      // Save the updated connections to disk
      this.saveConnectionsToDisk();
    }
    return deleted;
  }
  /**
   * Load connection configurations from disk
   */
  private loadConnectionsFromDisk(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { decrypt } = require('./encryption');
      
      // Ensure the config directory exists
      const configDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Create the file with default content if it doesn't exist
      if (!fs.existsSync(this.configFilePath)) {
        fs.writeFileSync(this.configFilePath, JSON.stringify({ connections: [] }, null, 2));
      }
      
      // Read the configuration file
      const data = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(data);
      
      if (config && Array.isArray(config.connections)) {
        // Create connections from saved configs
        config.connections.forEach((conn: SavedConnectionConfig) => {          const connectionConfig: RemoteConnectionConfig = {
            name: conn.name,
            host: conn.host,
            port: conn.port,
            username: conn.username,
            // Decrypt sensitive data if it exists
            password: conn.password ? decrypt(conn.password) : undefined,
            privateKey: conn.privateKey ? decrypt(conn.privateKey) : undefined,
            passphrase: conn.passphrase ? decrypt(conn.passphrase) : undefined,
            useSudo: conn.useSudo
          };
          
          // Re-create the connection with the original ID
          const connection = new RemoteConnection(connectionConfig);
          this.connections.set(conn.id, connection);
        });
        
        console.log(`Loaded ${config.connections.length} remote connections from disk`);
      }
    } catch (error) {
      console.error('Error loading remote connections from disk:', error);
    }
  }
    /**
   * Save connection configurations to disk
   */
  private saveConnectionsToDisk(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { encrypt } = require('./encryption');
      
      // Ensure the config directory exists
      const configDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
        // Convert connections map to serializable array with encrypted sensitive data
      const savedConnections = Array.from(this.connections.entries()).map(([id, conn]) => {
        // Get the original configuration to access sensitive data
        const config = conn.getFullConfig();
          return {
          id,
          name: conn.name,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: config.password ? encrypt(config.password) : undefined,
          privateKey: config.privateKey ? encrypt(config.privateKey) : undefined,
          passphrase: config.passphrase ? encrypt(config.passphrase) : undefined,
          useSudo: config.useSudo
        };
      });
      
      // Write to file
      fs.writeFileSync(this.configFilePath, JSON.stringify({ 
        connections: savedConnections 
      }, null, 2));
      
      console.log(`Saved ${savedConnections.length} remote connections to disk`);
    } catch (error) {
      console.error('Error saving remote connections to disk:', error);
    }
  }
}

// Create a singleton instance of the connection manager
export const remoteConnectionManager = new RemoteConnectionManager();

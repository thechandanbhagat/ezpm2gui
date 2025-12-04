/**
 * Cron Job Service - Manages PM2 processes with cron_restart
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CronJobConfig, PM2CronOptions, CronJobStatus } from '../../types/cron';
import { executePM2Command } from '../utils/pm2-connection';
import { CronExpressionParser } from 'cron-parser';

const CRON_CONFIG_FILE = path.join(__dirname, '../config/cron-jobs.json');
const CRON_SCRIPTS_DIR = path.join(__dirname, '../config/cron-scripts');

export class CronJobService {
  private static instance: CronJobService;

  private constructor() {
    this.ensureConfigFile();
  }

  public static getInstance(): CronJobService {
    if (!CronJobService.instance) {
      CronJobService.instance = new CronJobService();
    }
    return CronJobService.instance;
  }

  private ensureConfigFile(): void {
    const dir = path.dirname(CRON_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CRON_CONFIG_FILE)) {
      fs.writeFileSync(CRON_CONFIG_FILE, JSON.stringify([], null, 2));
    }
    // Ensure scripts directory exists for inline scripts
    if (!fs.existsSync(CRON_SCRIPTS_DIR)) {
      fs.mkdirSync(CRON_SCRIPTS_DIR, { recursive: true });
    }
  }

  private readConfig(): CronJobConfig[] {
    try {
      const data = fs.readFileSync(CRON_CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading cron config:', error);
      return [];
    }
  }

  private writeConfig(configs: CronJobConfig[]): void {
    fs.writeFileSync(CRON_CONFIG_FILE, JSON.stringify(configs, null, 2));
  }

  /**
   * Validate cron expression
   */
  public validateCronExpression(expression: string): { valid: boolean; error?: string; nextRun?: Date } {
    try {
      const interval = CronExpressionParser.parse(expression);
      return {
        valid: true,
        nextRun: interval.next().toDate()
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get human-readable description of cron expression
   */
  public getCronDescription(expression: string): string {
    try {
      const parts = expression.split(' ');
      if (parts.length !== 5) {
        return 'Invalid cron expression';
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      // Simple descriptions for common patterns
      if (expression === '* * * * *') return 'Every minute';
      if (expression === '0 * * * *') return 'Every hour';
      if (expression === '0 0 * * *') return 'Daily at midnight';
      if (expression === '0 0 * * 0') return 'Weekly on Sunday at midnight';
      if (expression === '0 0 1 * *') return 'Monthly on the 1st at midnight';
      
      let desc = 'At ';
      if (minute === '*') desc += 'every minute';
      else desc += `minute ${minute}`;
      
      if (hour !== '*') desc += ` past hour ${hour}`;
      if (dayOfMonth !== '*') desc += ` on day ${dayOfMonth}`;
      if (month !== '*') desc += ` in month ${month}`;
      if (dayOfWeek !== '*') desc += ` on day ${dayOfWeek} of week`;
      
      return desc;
    } catch (error) {
      return 'Invalid expression';
    }
  }

  /**
   * Get script path for inline scripts (creates temp file)
   */
  private getScriptPath(config: CronJobConfig): string {
    if (config.scriptMode === 'file') {
      return config.scriptPath;
    }

    // For inline scripts, write to temp file
    const extension = this.getScriptExtension(config.scriptType);
    const scriptFileName = `${config.id}${extension}`;
    const scriptPath = path.join(CRON_SCRIPTS_DIR, scriptFileName);

    if (config.inlineScript) {
      fs.writeFileSync(scriptPath, config.inlineScript, 'utf8');
      // Make executable for shell scripts
      if (config.scriptType === 'shell') {
        try {
          fs.chmodSync(scriptPath, '755');
        } catch (err) {
          console.warn('Could not set execute permission:', err);
        }
      }
    }

    return scriptPath;
  }

  /**
   * Get file extension for script type
   */
  private getScriptExtension(scriptType: string): string {
    switch (scriptType) {
      case 'node':
        return '.js';
      case 'python':
        return '.py';
      case 'shell':
        return '.sh';
      case 'dotnet':
        return '.cs';
      default:
        return '.txt';
    }
  }

  /**
   * Convert CronJobConfig to PM2 start options
   */
  private toPM2Options(config: CronJobConfig): PM2CronOptions {
    const scriptPath = this.getScriptPath(config);
    
    const options: PM2CronOptions = {
      name: `cron-${config.id}`,
      script: scriptPath,
      cron_restart: config.cronExpression,
      autorestart: false, // Don't auto-restart on crash, only on cron schedule
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      combine_logs: true
    };

    // Set interpreter based on script type
    switch (config.scriptType) {
      case 'node':
        options.interpreter = 'node';
        break;
      case 'python':
        options.interpreter = 'python';
        break;
      case 'dotnet':
        options.interpreter = 'none';
        options.script = 'dotnet';
        options.args = ['run', '--project', config.scriptPath];
        break;
      case 'shell':
        options.interpreter = 'bash';
        options.interpreter_args = '-c';
        break;
    }

    if (config.args && config.args.length > 0) {
      options.args = config.args;
    }

    if (config.env) {
      options.env = config.env;
    }

    if (config.cwd) {
      options.cwd = config.cwd;
    }

    return options;
  }

  /**
   * Create a new cron job
   */
  public async createCronJob(config: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<CronJobConfig> {
    const validation = this.validateCronExpression(config.cronExpression);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    const newConfig: CronJobConfig = {
      ...config,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const configs = this.readConfig();
    configs.push(newConfig);
    this.writeConfig(configs);

    // Start the PM2 process if enabled
    if (newConfig.enabled) {
      await this.startCronJob(newConfig.id);
    }

    return newConfig;
  }

  /**
   * Get all cron jobs
   */
  public getCronJobs(): CronJobConfig[] {
    return this.readConfig();
  }

  /**
   * Get a single cron job by ID
   */
  public getCronJob(id: string): CronJobConfig | undefined {
    const configs = this.readConfig();
    return configs.find(c => c.id === id);
  }

  /**
   * Update a cron job
   */
  public async updateCronJob(id: string, updates: Partial<CronJobConfig>): Promise<CronJobConfig> {
    if (updates.cronExpression) {
      const validation = this.validateCronExpression(updates.cronExpression);
      if (!validation.valid) {
        throw new Error(`Invalid cron expression: ${validation.error}`);
      }
    }

    const configs = this.readConfig();
    const index = configs.findIndex(c => c.id === id);
    
    if (index === -1) {
      throw new Error('Cron job not found');
    }

    const wasEnabled = configs[index].enabled;
    configs[index] = {
      ...configs[index],
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    this.writeConfig(configs);

    // Handle PM2 process state changes
    if (wasEnabled && !configs[index].enabled) {
      await this.stopCronJob(id);
    } else if (!wasEnabled && configs[index].enabled) {
      await this.startCronJob(id);
    } else if (configs[index].enabled) {
      // Restart if enabled and config changed
      await this.stopCronJob(id);
      await this.startCronJob(id);
    }

    return configs[index];
  }

  /**
   * Delete a cron job
   */
  public async deleteCronJob(id: string): Promise<void> {
    const configs = this.readConfig();
    const job = configs.find(c => c.id === id);
    
    if (!job) {
      throw new Error('Cron job not found');
    }

    // Stop PM2 process if running
    if (job.enabled) {
      await this.stopCronJob(id);
    }

    // Delete inline script file if it exists
    if (job.scriptMode === 'inline') {
      const extension = this.getScriptExtension(job.scriptType);
      const scriptPath = path.join(CRON_SCRIPTS_DIR, `${id}${extension}`);
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    }

    const filtered = configs.filter(c => c.id !== id);
    this.writeConfig(filtered);
  }

  /**
   * Start a cron job (start PM2 process with cron_restart)
   */
  public async startCronJob(id: string): Promise<void> {
    const config = this.getCronJob(id);
    if (!config) {
      throw new Error('Cron job not found');
    }

    const pm2Options = this.toPM2Options(config);
    const pm2 = require('pm2');
    
    await executePM2Command((callback) => {
      pm2.start(pm2Options as any, callback);
    });
  }

  /**
   * Stop a cron job (delete PM2 process)
   */
  public async stopCronJob(id: string): Promise<void> {
    const processName = `cron-${id}`;
    const pm2 = require('pm2');
    
    try {
      await executePM2Command((callback) => {
        pm2.delete(processName, (err: any) => {
          // PM2 delete returns undefined on success, pass empty object
          if (err && !err.message.includes('not found')) {
            callback(err);
          } else {
            callback(null, {} as any);
          }
        });
      });
    } catch (error: any) {
      // Ignore not found errors
      if (!error.message.includes('not found')) {
        throw error;
      }
    }
  }

  /**
   * Get status of all cron jobs (including PM2 process info)
   */
  public async getCronJobsStatus(): Promise<CronJobStatus[]> {
    const configs = this.readConfig();
    const pm2 = require('pm2');
    
    const list = await executePM2Command<any[]>((callback) => {
      pm2.list(callback);
    });

    const statuses: CronJobStatus[] = configs.map(config => {
      const processName = `cron-${config.id}`;
      const pm2Process = list.find((p: any) => p.name === processName);
      
      let nextExecution: string | undefined;
      if (config.enabled) {
        try {
          const interval = CronExpressionParser.parse(config.cronExpression);
          nextExecution = interval.next().toDate().toISOString();
        } catch (e) {
          // Ignore
        }
      }
      
      return {
        config,
        pm2Process,
        isRunning: pm2Process?.pm2_env?.status === 'online',
        nextExecution
      };
    });

    return statuses;
  }

  /**
   * Toggle cron job enabled state
   */
  public async toggleCronJob(id: string): Promise<CronJobConfig> {
    const config = this.getCronJob(id);
    if (!config) {
      throw new Error('Cron job not found');
    }

    return this.updateCronJob(id, { enabled: !config.enabled });
  }
}

export default CronJobService.getInstance();

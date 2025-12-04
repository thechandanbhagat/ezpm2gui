/**
 * Cron Job Types for Frontend
 */

export interface CronJobConfig {
  id: string;
  name: string;
  description?: string;
  scriptType: 'node' | 'python' | 'shell' | 'dotnet';
  scriptMode: 'file' | 'inline';
  scriptPath: string;
  inlineScript?: string;
  cronExpression: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CronJobStatus {
  config: CronJobConfig;
  pm2Process?: any;
  isRunning: boolean;
  lastExecution?: {
    jobId: string;
    timestamp: string;
    status: 'success' | 'error';
    output?: string;
    error?: string;
    duration?: number;
  };
  nextExecution?: string;
}

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  nextRun?: string;
  description?: string;
}

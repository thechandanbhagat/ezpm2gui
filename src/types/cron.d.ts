/**
 * Cron Job Types for ezPM2GUI
 * Using PM2's native cron_restart feature
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

export interface PM2CronOptions {
  name: string;
  script: string;
  cron_restart: string;
  args?: string | string[];
  interpreter?: string;
  interpreter_args?: string;
  env?: Record<string, string>;
  cwd?: string;
  autorestart: boolean;
  watch: boolean;
  max_memory_restart?: string;
  log_date_format?: string;
  error_file?: string;
  out_file?: string;
  combine_logs?: boolean;
}

export interface CronJobExecution {
  jobId: string;
  timestamp: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  duration?: number;
}

export interface CronJobStatus {
  config: CronJobConfig;
  pm2Process?: any;
  isRunning: boolean;
  lastExecution?: CronJobExecution;
  nextExecution?: string;
}

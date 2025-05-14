/**
 * Type definitions for PM2 process data
 */

export interface PM2Environment {
  pm_id: number;
  name: string;
  namespace: string;
  version: string;
  versioning: Record<string, unknown> | null;
  pm_uptime: number;
  created_at: number;
  pm_cwd: string;
  pm_exec_path: string;
  exec_interpreter: string;
  exec_mode: string;
  instances: number;
  pm_out_log_path: string;
  pm_err_log_path: string;
  node_args: string[];
  status: 'online' | 'stopping' | 'stopped' | 'launching' | 'errored' | 'one-launch-status';
  restart_time: number;
  unstable_restarts: number;
  autorestart: boolean;
  watch: boolean;
  env: Record<string, string | number | boolean>;
}

export interface PM2Monitoring {
  memory: number;
  cpu: number;
}

export interface PM2Process {
  pid: number;
  pm_id: number;
  name: string;
  monit: PM2Monitoring;
  pm2_env: PM2Environment;
}

export interface SystemMetricsData {
  loadAvg: number[];
  memory: {
    total: number;
    free: number;
    used: number;
  };
  uptime: number;
  cpus: number;
}

export interface LogEntry {
  type: 'out' | 'err';
  content: string;
  timestamp: string;
}

export interface ConfirmationDialogData {
  isOpen: boolean;
  title: string;
  message: string;
  action: string;
  processId: number | null;
}

export type RuleSource = 'health' | 'cpu' | 'memory' | 'restarts' | 'offline';

export interface HealthCheck {
  id: string;
  name: string;
  enabled: boolean;
  kind: 'http' | 'tcp';
  url?: string;
  host?: string;
  port?: number;
  expectedStatus: number;
  intervalSeconds: number;
  timeoutSeconds: number;
  unhealthyAfter: number;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  source: RuleSource;
  connectionId: string;
  processName: string;
  healthCheckId: string;
  threshold: number;
  durationSeconds: number;
  windowSeconds: number;
  cooldownSeconds: number;
  webhookUrl: string;
}

export interface MonitoringConfig {
  revision: number;
  healthChecks: HealthCheck[];
  rules: AlertRule[];
  maintenanceUntil: number | null;
}

export interface HealthResult {
  checkId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  checkedAt: number;
  latencyMs: number | null;
  consecutiveFailures: number;
  message: string;
}

export interface RuleState {
  ruleId: string;
  status: 'ok' | 'pending' | 'firing' | 'unknown' | 'suppressed';
  since: number;
  updatedAt: number;
  value: number | null;
  message: string;
}

export interface MonitoringEvent {
  id: string;
  timestamp: number;
  ruleId: string;
  ruleName: string;
  kind: 'firing' | 'recovered';
  message: string;
  value: number | null;
  delivery: 'none' | 'pending' | 'sent' | 'failed' | 'suppressed';
}

export interface MonitoringSnapshot {
  config: MonitoringConfig;
  healthResults: HealthResult[];
  ruleStates: RuleState[];
  events: MonitoringEvent[];
}

export interface ProcessSample {
  id: number;
  name: string;
  status: string;
  cpu: number;
  memoryMb: number;
  restarts: number;
}

export interface MonitoringTarget {
  connectionId: string;
  name: string;
  connected: boolean;
  processes: ProcessSample[];
}

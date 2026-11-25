import { AlertRule, HealthCheck, MonitoringConfig, MonitoringEvent, RuleSource } from './monitoring-types';
import { normalizeHost, parseMonitoringUrl } from './monitoring-network';

export class MonitoringError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'MonitoringError'; }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MonitoringError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)
    || (!optional && !value.trim())) throw new MonitoringError(`${label} must be ${optional ? 'a' : 'a nonempty'} string of at most ${max} characters`);
  return value.trim();
}
function number(value: unknown, label: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new MonitoringError(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new MonitoringError(`${label} must be a boolean`);
  return value;
}
function id(value: unknown, label: string, optional = false): string {
  const result = text(value, label, 80, optional);
  if (result && !/^[a-zA-Z0-9_-]+$/.test(result)) throw new MonitoringError(`${label} contains unsupported characters`);
  return result;
}
function url(value: unknown, label: string, optional = false): string {
  const result = text(value, label, 2048, optional);
  if (optional && !result) return '';
  try { return parseMonitoringUrl(result).toString(); }
  catch { throw new MonitoringError(`${label} must be an HTTP(S) URL without credentials, fragments, or reserved addresses`); }
}

export function validateMonitoringConfig(value: unknown): MonitoringConfig {
  const input = object(value, 'Configuration');
  const revision = number(input.revision, 'Revision', 0, Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(input.healthChecks) || input.healthChecks.length > 50) throw new MonitoringError('Provide at most 50 health checks');
  if (!Array.isArray(input.rules) || input.rules.length > 100) throw new MonitoringError('Provide at most 100 alert rules');
  const healthChecks: HealthCheck[] = input.healthChecks.map((item, index) => {
    const check = object(item, `Health check ${index + 1}`);
    if (check.kind !== 'http' && check.kind !== 'tcp') throw new MonitoringError('Health check kind must be http or tcp');
    const result: HealthCheck = {
      id: id(check.id, 'Check ID'), name: text(check.name, 'Check name', 120), enabled: bool(check.enabled, 'Check enabled'),
      kind: check.kind, expectedStatus: number(check.expectedStatus, 'Expected status', 100, 599),
      intervalSeconds: number(check.intervalSeconds, 'Check interval', 10, 3600),
      timeoutSeconds: number(check.timeoutSeconds, 'Check timeout', 1, 30),
      unhealthyAfter: number(check.unhealthyAfter, 'Consecutive failures', 1, 20)
    };
    if (result.timeoutSeconds >= result.intervalSeconds) throw new MonitoringError('Check timeout must be shorter than its interval');
    if (check.url !== undefined) result.url = check.kind === 'http' ? url(check.url, 'Check URL') : text(check.url, 'Check URL', 2048, true);
    if (check.host !== undefined) result.host = text(check.host, 'Check host', 255, check.kind !== 'tcp');
    if (check.port !== undefined) result.port = number(check.port, 'TCP port', 1, 65535);
    if (check.kind === 'http' && !result.url) throw new MonitoringError('HTTP checks require a URL');
    if (check.kind === 'tcp') {
      if (!result.host || !result.port) throw new MonitoringError('TCP checks require a host and port');
      try { result.host = normalizeHost(result.host); }
      catch { throw new MonitoringError('TCP host must be a valid hostname or permitted address'); }
    }
    return result;
  });
  if (new Set(healthChecks.map(check => check.id)).size !== healthChecks.length) throw new MonitoringError('Health check IDs must be unique');
  const sources: RuleSource[] = ['health', 'cpu', 'memory', 'restarts', 'offline'];
  const rules: AlertRule[] = input.rules.map((item, index) => {
    const rule = object(item, `Alert rule ${index + 1}`);
    if (!sources.includes(rule.source as RuleSource)) throw new MonitoringError('Invalid alert source');
    const source = rule.source as RuleSource;
    const result: AlertRule = {
      id: id(rule.id, 'Rule ID'), name: text(rule.name, 'Rule name', 120), enabled: bool(rule.enabled, 'Rule enabled'), source,
      connectionId: text(rule.connectionId, 'Connection ID', 120, source === 'health'),
      processName: text(rule.processName, 'Process name', 200, source === 'health'),
      healthCheckId: id(rule.healthCheckId, 'Health check ID', source !== 'health'),
      threshold: number(rule.threshold, 'Threshold', 0, source === 'cpu' ? 100000 : 1e9, source === 'restarts'),
      durationSeconds: number(rule.durationSeconds, 'Alert duration', 0, 86400),
      windowSeconds: number(rule.windowSeconds, 'Restart window', 10, 86400),
      cooldownSeconds: number(rule.cooldownSeconds, 'Notification cooldown', 0, 86400),
      webhookUrl: url(rule.webhookUrl, 'Webhook URL', true)
    };
    if (source === 'memory' && result.threshold <= 0) throw new MonitoringError('Memory threshold must be greater than zero');
    if (source === 'restarts' && (result.threshold < 1 || result.threshold > 1000000)) throw new MonitoringError('Restart threshold must be an integer between 1 and 1000000');
    if (source === 'health' && !healthChecks.some(check => check.id === result.healthCheckId)) throw new MonitoringError('Health rule must reference an existing health check');
    return result;
  });
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw new MonitoringError('Alert rule IDs must be unique');
  const maintenanceUntil = input.maintenanceUntil === null ? null
    : number(input.maintenanceUntil, 'Maintenance expiry', 0, Number.MAX_SAFE_INTEGER);
  return { revision, healthChecks, rules, maintenanceUntil };
}

export function validateStoredEvents(value: unknown): MonitoringEvent[] {
  if (!Array.isArray(value) || value.length > 1000) throw new MonitoringError('Invalid stored event history');
  return value.map(raw => {
    const event = object(raw, 'Stored event');
    if (!['firing', 'recovered'].includes(event.kind as string)
      || !['none', 'pending', 'sent', 'failed', 'suppressed'].includes(event.delivery as string)) throw new MonitoringError('Invalid stored event state');
    return {
      id: id(event.id, 'Event ID'), timestamp: number(event.timestamp, 'Event timestamp', 0, Number.MAX_SAFE_INTEGER),
      ruleId: id(event.ruleId, 'Event rule ID'), ruleName: text(event.ruleName, 'Event rule name', 120),
      kind: event.kind as MonitoringEvent['kind'], message: text(event.message, 'Event message', 512),
      value: event.value === null ? null : number(event.value, 'Event value', 0, Number.MAX_SAFE_INTEGER, false),
      // A process restart cannot establish whether an interrupted delivery arrived.
      delivery: event.delivery === 'pending' ? 'failed' : event.delivery as MonitoringEvent['delivery']
    };
  });
}

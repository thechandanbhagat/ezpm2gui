import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { configPath } from '../utils/config-dir';
import {
  AlertRule, HealthCheck, HealthResult, MonitoringConfig, MonitoringEvent,
  MonitoringSnapshot, MonitoringTarget, RuleState
} from './monitoring-types';
import { deliverMonitoringWebhook, ProbeResult, probeHealthCheck } from './monitoring-network';
import { MonitoringError, validateMonitoringConfig, validateStoredEvents } from './monitoring-validation';
export { MonitoringError, validateMonitoringConfig } from './monitoring-validation';

interface ServiceOptions {
  filePath?: string;
  now?: () => number;
  collectTargets?: () => Promise<MonitoringTarget[]>;
  probe?: (check: HealthCheck) => Promise<ProbeResult>;
  notify?: (url: string, event: MonitoringEvent) => Promise<void>;
}
interface RuleRuntime {
  active: boolean;
  pendingSince: number | null;
  lastNotified: number | null;
  notifiedActive: boolean;
  deferredEvent: string | null;
  counters: Record<string, number>;
  increments: Array<{ at: number; count: number }>;
}
interface Observation { breach: boolean | null; value: number | null; message: string }
interface Delivery { rule: AlertRule; eventId: string; generation: number }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const runtime = (): RuleRuntime => ({ active: false, pendingSince: null, lastNotified: null,
  notifiedActive: false, deferredEvent: null, counters: {}, increments: [] });
const unknownHealth = (check: HealthCheck): HealthResult => ({ checkId: check.id, status: 'unknown', checkedAt: 0,
  latencyMs: null, consecutiveFailures: 0, message: check.enabled ? 'Waiting for the first check' : 'Check is disabled' });
const initialRule = (rule: AlertRule, now: number): RuleState => ({ ruleId: rule.id,
  status: rule.enabled ? 'unknown' : 'suppressed', since: now, updatedAt: now, value: null,
  message: rule.enabled ? 'Waiting for a sample' : 'Rule is disabled' });

export class MonitoringService {
  private readonly filePath: string;
  private readonly now: () => number;
  private readonly collectTargets: () => Promise<MonitoringTarget[]>;
  private readonly probe?: ServiceOptions['probe'];
  private readonly notify?: ServiceOptions['notify'];
  private config: MonitoringConfig = { revision: 0, healthChecks: [], rules: [], maintenanceUntil: null };
  private events: MonitoringEvent[] = [];
  private health = new Map<string, HealthResult>();
  private rules = new Map<string, RuleState>();
  private runtime = new Map<string, RuleRuntime>();
  private nextCheck = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private controller?: AbortController;
  private stopped = false;
  private busy = false;
  private generation = 0;
  private deliveryQueue: Delivery[] = [];
  private deliveryControllers = new Set<AbortController>();
  private deliveryRules = new Map<string, AbortController>();

  constructor(options: ServiceOptions = {}) {
    this.filePath = options.filePath || configPath('monitoring.json');
    this.now = options.now || Date.now;
    this.collectTargets = options.collectTargets || (async () => []);
    this.probe = options.probe;
    this.notify = options.notify;
    if (fs.existsSync(this.filePath)) {
      try {
        const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (!stored || stored.version !== 1) throw new Error('Unsupported monitoring store');
        this.config = validateMonitoringConfig(stored.config);
        this.events = validateStoredEvents(stored.events);
      } catch { throw new MonitoringError('Monitoring data could not be loaded. Restore or repair monitoring.json before restarting.', 500); }
    }
    this.reconcileConfiguration();
  }

  getSnapshot(): MonitoringSnapshot {
    return clone({ config: this.config, healthResults: [...this.health.values()], ruleStates: [...this.rules.values()], events: this.events });
  }

  updateConfig(input: unknown): MonitoringSnapshot {
    const candidate = validateMonitoringConfig(input);
    if (candidate.revision !== this.config.revision) throw new MonitoringError('Monitoring configuration changed. Refresh before saving again.', 409);
    if (candidate.revision === Number.MAX_SAFE_INTEGER) throw new MonitoringError('Monitoring configuration revision limit reached.', 409);
    candidate.revision++;
    const events = this.events.map(event => event.delivery === 'pending' ? { ...event, delivery: 'failed' as const } : event);
    // Complete the durable write before replacing any in-memory configuration.
    this.persist(candidate, events);
    const previous = this.config;
    this.config = candidate;
    this.events = events;
    this.generation++;
    this.controller?.abort();
    this.cancelDeliveries();
    this.reconcileConfiguration(previous);
    return this.getSnapshot();
  }

  async getTargets(): Promise<MonitoringTarget[]> { return clone(await this.collectTargets()); }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    const run = () => { void this.tick().catch(() => console.error('Monitoring evaluation failed; check runtime storage availability.')); };
    this.timer = setInterval(run, 1000);
    this.timer.unref?.();
    run();
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.cancelDeliveries();
    const events = this.events.map(event => event.delivery === 'pending' ? { ...event, delivery: 'failed' as const } : event);
    if (events.some((event, index) => event !== this.events[index])) {
      this.persist(this.config, events);
      this.events = events;
    }
  }

  private reconcileConfiguration(previous?: MonitoringConfig): void {
    const changedChecks = new Set<string>();
    const health = new Map<string, HealthResult>();
    const next = new Map<string, number>();
    for (const check of this.config.healthChecks) {
      const old = previous?.healthChecks.find(item => item.id === check.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(check)) changedChecks.add(check.id);
      health.set(check.id, changedChecks.has(check.id) ? unknownHealth(check) : this.health.get(check.id) || unknownHealth(check));
      if (!changedChecks.has(check.id) && this.nextCheck.has(check.id)) next.set(check.id, this.nextCheck.get(check.id));
    }
    const rules = new Map<string, RuleState>();
    const states = new Map<string, RuleRuntime>();
    for (const rule of this.config.rules) {
      const old = previous?.rules.find(item => item.id === rule.id);
      const unchanged = old && JSON.stringify(old) === JSON.stringify(rule)
        && !(rule.source === 'health' && changedChecks.has(rule.healthCheckId));
      rules.set(rule.id, unchanged ? this.rules.get(rule.id) : initialRule(rule, this.now()));
      states.set(rule.id, unchanged ? this.runtime.get(rule.id) : runtime());
    }
    this.health = health;
    this.nextCheck = next;
    this.rules = rules;
    this.runtime = states;
  }

  private persist(config = this.config, events = this.events): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, config, events }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.filePath);
    } catch {
      try { fs.unlinkSync(temporary); } catch { /* A failed write may not have created the temporary file. */ }
      throw new MonitoringError('Monitoring data could not be saved. Check runtime storage permissions and free space.', 500);
    }
  }

  async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const current = () => !this.stopped && generation === this.generation;
    try {
      const started = this.now();
      const due = this.config.healthChecks.filter(check => check.enabled && (this.nextCheck.get(check.id) ?? 0) <= started);
      const needsProcesses = this.config.rules.some(rule => rule.enabled && rule.source !== 'health');
      const [targets, results] = await Promise.all([
        needsProcesses ? Promise.resolve().then(this.collectTargets).catch(() => [] as MonitoringTarget[]) : Promise.resolve([] as MonitoringTarget[]),
        Promise.all(due.map(async check => {
          try {
            const result = await (this.probe ? this.probe(clone(check)) : probeHealthCheck(check, controller.signal));
            return { check, result, checkedAt: this.now() };
          } catch { return { check, result: { healthy: false, latencyMs: null, message: 'Check failed' } as ProbeResult, checkedAt: this.now() }; }
        }))
      ]);
      if (!current()) return;
      const now = this.now();
      const health = new Map(this.health);
      const nextCheck = new Map(this.nextCheck);
      for (const { check, result, checkedAt } of results) {
        const old = health.get(check.id);
        const failures = result.healthy ? 0 : (old?.consecutiveFailures || 0) + 1;
        health.set(check.id, { checkId: check.id, checkedAt,
          status: result.healthy ? 'healthy' : failures >= check.unhealthyAfter ? 'unhealthy' : old?.status || 'unknown',
          consecutiveFailures: Math.min(failures, 1000000),
          latencyMs: typeof result.latencyMs === 'number' && Number.isFinite(result.latencyMs)
            && result.latencyMs >= 0 && result.latencyMs <= Number.MAX_SAFE_INTEGER ? result.latencyMs : null,
          message: typeof result.message === 'string' ? result.message.slice(0, 256) : 'Check failed' });
        nextCheck.set(check.id, checkedAt + check.intervalSeconds * 1000);
      }
      const states = new Map<string, RuleRuntime>();
      const rules = new Map<string, RuleState>();
      let events = clone(this.events);
      const deliveries: Array<{ rule: AlertRule; eventId: string }> = [];
      const maintenance = this.config.maintenanceUntil !== null && now < this.config.maintenanceUntil;
      for (const rule of this.config.rules) {
        const state = clone(this.runtime.get(rule.id) || runtime());
        const previous = this.rules.get(rule.id) || initialRule(rule, now);
        if (!rule.enabled) {
          states.set(rule.id, state);
          rules.set(rule.id, { ...previous, updatedAt: now });
          continue;
        }
        const observation = this.observe(rule, state, targets, health, now);
        let status: RuleState['status'];
        let transition: MonitoringEvent['kind'] | null = null;
        if (observation.breach === null) {
          state.pendingSince = null;
          status = 'unknown';
        } else if (observation.breach) {
          if (!state.active) {
            if (state.pendingSince === null) state.pendingSince = now;
            if (now - state.pendingSince >= rule.durationSeconds * 1000) {
              state.active = true;
              transition = 'firing';
            }
          }
          status = state.active ? 'firing' : 'pending';
        } else {
          if (state.active) transition = 'recovered';
          state.active = false;
          state.pendingSince = null;
          status = 'ok';
        }
        rules.set(rule.id, { ruleId: rule.id, status, since: previous.status === status ? previous.since : now,
          updatedAt: now, value: observation.value, message: observation.message });
        if (transition) {
          const event: MonitoringEvent = { id: randomUUID(), timestamp: now, ruleId: rule.id,
            ruleName: rule.name, kind: transition, message: observation.message,
            value: observation.value, delivery: 'none' };
          if (rule.webhookUrl) {
            const cooldown = transition === 'firing' && state.lastNotified !== null && now - state.lastNotified < rule.cooldownSeconds * 1000;
            event.delivery = maintenance || cooldown ? 'suppressed' : 'pending';
            state.deferredEvent = maintenance || cooldown ? event.id : null;
            if (event.delivery === 'pending') {
              deliveries.push({ rule, eventId: event.id });
              if (event.kind === 'firing') state.lastNotified = now;
            }
          }
          events.unshift(event);
        }
        // Reconcile only a still-current condition after maintenance. A failure and
        // recovery contained entirely within maintenance generate history only.
        if (!maintenance && observation.breach !== null && state.deferredEvent) {
          const deferred = events.find(event => event.id === state.deferredEvent);
          if (deferred && rule.webhookUrl && ((state.active && deferred.kind === 'firing')
            || (!state.active && deferred.kind === 'recovered' && state.notifiedActive))) {
            if (deferred.kind === 'recovered' || state.lastNotified === null || now - state.lastNotified >= rule.cooldownSeconds * 1000) {
              deferred.delivery = 'pending';
              deliveries.push({ rule, eventId: deferred.id });
              if (deferred.kind === 'firing') state.lastNotified = now;
              state.deferredEvent = null;
            }
          } else state.deferredEvent = null;
        }
        states.set(rule.id, state);
      }
      events = events.slice(0, 1000);
      if (JSON.stringify(events) !== JSON.stringify(this.events)) this.persist(this.config, events);
      this.health = health;
      this.nextCheck = nextCheck;
      this.runtime = states;
      this.rules = rules;
      this.events = events;
      this.deliveryQueue = this.deliveryQueue.filter(delivery => events.some(event => event.id === delivery.eventId));
      this.deliveryQueue.push(...deliveries.map(delivery => ({ ...delivery, generation })));
      this.drainDeliveries();
    } finally {
      this.busy = false;
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private cancelDeliveries(): void {
    this.deliveryQueue = [];
    for (const controller of this.deliveryControllers) controller.abort();
    this.deliveryControllers.clear();
    this.deliveryRules.clear();
  }

  private drainDeliveries(): void {
    while (!this.stopped && this.deliveryControllers.size < 4 && this.deliveryQueue.length) {
      const index = this.deliveryQueue.findIndex(item => !this.deliveryRules.has(item.rule.id));
      if (index < 0) return;
      const [delivery] = this.deliveryQueue.splice(index, 1);
      if (delivery.generation !== this.generation) continue;
      const event = this.events.find(item => item.id === delivery.eventId && item.delivery === 'pending');
      if (!event) continue;
      const controller = new AbortController();
      this.deliveryControllers.add(controller);
      this.deliveryRules.set(delivery.rule.id, controller);
      void this.deliver(delivery, clone(event), controller).catch(() => {
        console.error('Monitoring notification status could not be saved.');
      }).finally(() => {
        this.deliveryControllers.delete(controller);
        if (this.deliveryRules.get(delivery.rule.id) === controller) this.deliveryRules.delete(delivery.rule.id);
        this.drainDeliveries();
      });
    }
  }

  private async deliver(delivery: Delivery, event: MonitoringEvent, controller: AbortController): Promise<void> {
    let delivered = false;
    let timer: NodeJS.Timeout;
    let onAbort: () => void;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('cancelled'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); }, 10000);
        timer.unref?.();
      });
      await Promise.race([
        this.notify ? this.notify(delivery.rule.webhookUrl, event)
          : deliverMonitoringWebhook(delivery.rule.webhookUrl, event, controller.signal),
        deadline
      ]);
      delivered = true;
    } catch { /* Retain outcome only: webhook errors may include credentials. */ }
    finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
    }
    if (this.stopped || delivery.generation !== this.generation) return;
    const updated = this.events.map(item => item.id === event.id ? { ...item, delivery: delivered ? 'sent' as const : 'failed' as const } : item);
    this.persist(this.config, updated);
    this.events = updated;
    if (delivered) {
      const state = this.runtime.get(delivery.rule.id);
      if (state) state.notifiedActive = event.kind === 'firing';
    }
  }

  private observe(rule: AlertRule, state: RuleRuntime, targets: MonitoringTarget[], health: Map<string, HealthResult>, now: number): Observation {
    const unknown = (message: string): Observation => {
      if (rule.source === 'restarts') state.counters = {};
      return { breach: null, value: null, message };
    };
    if (rule.source === 'health') {
      const check = this.config.healthChecks.find(item => item.id === rule.healthCheckId);
      const result = health.get(rule.healthCheckId);
      if (!check?.enabled) return unknown('Health check is disabled');
      if (!result || result.status === 'unknown' || now - result.checkedAt > (check.intervalSeconds + check.timeoutSeconds) * 1000) {
        return unknown('Waiting for a fresh health check');
      }
      return { breach: result.status === 'unhealthy', value: result.latencyMs,
        message: result.status === 'unhealthy' ? 'Health check is failing' : 'Health check is healthy' };
    }
    const target = targets.find(item => item.connectionId === rule.connectionId);
    if (!target?.connected) return unknown('Server samples are unavailable');
    const processes = target.processes.filter(process => process.name === rule.processName);
    if (rule.source === 'offline') {
      const offline = !processes.length || processes.some(process => process.status !== 'online');
      return { breach: offline, value: processes.filter(process => process.status !== 'online').length || (offline ? 1 : 0),
        message: offline ? 'An instance is offline or the process is missing' : 'All process instances are online' };
    }
    if (!processes.length) return unknown('Process samples are unavailable');
    let value: number;
    if (rule.source === 'restarts') {
      if (processes.some(process => !Number.isSafeInteger(process.id) || process.id < 0 || !Number.isSafeInteger(process.restarts) || process.restarts < 0)
        || new Set(processes.map(process => process.id)).size !== processes.length) return unknown('Restart samples are unavailable');
      const counters: Record<string, number> = {};
      let count = 0;
      for (const process of processes) {
        const old = state.counters[process.id];
        if (old !== undefined && process.restarts >= old) count = Math.min(Number.MAX_SAFE_INTEGER, count + process.restarts - old);
        counters[process.id] = process.restarts;
      }
      state.counters = counters;
      state.increments = state.increments.filter(item => item.at > now - rule.windowSeconds * 1000);
      if (count) state.increments.push({ at: now, count });
      value = state.increments.reduce((sum, item) => Math.min(Number.MAX_SAFE_INTEGER, sum + item.count), 0);
    } else {
      const values = processes.map(process => rule.source === 'cpu' ? process.cpu : process.memoryMb);
      if (values.some(sample => !Number.isFinite(sample) || sample < 0 || sample > Number.MAX_SAFE_INTEGER)) return unknown('Resource samples are unavailable');
      value = Math.max(...values);
    }
    const unit = rule.source === 'cpu' ? '% CPU' : rule.source === 'memory' ? ' MB memory' : ' restarts in the window';
    return { breach: value >= rule.threshold, value,
      message: `${Number(value.toFixed(2))}${unit}; threshold ${rule.threshold}` };
  }
}

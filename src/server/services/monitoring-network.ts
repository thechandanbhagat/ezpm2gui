import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { HealthCheck, MonitoringEvent } from './monitoring-types';

export interface ProbeResult { healthy: boolean; latencyMs: number | null; message: string }

// Infrastructure checks intentionally support private networks and loopback. Reserved
// destinations and metadata services are excluded, including through DNS answers.
export function isAllowedAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '').toLowerCase();
  const family = net.isIP(host);
  if (family === 4) {
    const octets = host.split('.').map(Number);
    return octets[0] !== 0 && octets[0] < 224
      && !(octets[0] === 169 && octets[1] === 254)
      && host !== '100.100.100.200' && host !== '168.63.129.16';
  }
  if (family !== 6 || host.includes('%')) return false;
  let normalized = host;
  if (normalized.includes('.')) {
    const index = normalized.lastIndexOf(':');
    const octets = normalized.slice(index + 1).split('.').map(Number);
    normalized = normalized.slice(0, index + 1)
      + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const [left, right] = normalized.split('::');
  const prefix = left ? left.split(':') : [];
  const suffix = right ? right.split(':') : [];
  const words = (normalized.includes('::')
    ? [...prefix, ...Array(8 - prefix.length - suffix.length).fill('0'), ...suffix]
    : prefix).map(word => parseInt(word, 16));
  if (words.length !== 8 || words.every(word => word === 0)) return false;
  if ((words[0] & 0xff00) === 0xff00 || (words[0] & 0xffc0) === 0xfe80) return false;
  if (words.slice(0, 5).every(word => word === 0) && (words[5] === 0xffff || words[5] === 0)) {
    if (words.slice(0, 7).every(word => word === 0) && words[7] === 1) return true;
    return isAllowedAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  // AWS IPv6 metadata and NAT64/6to4 forms can otherwise hide reserved IPv4.
  if (words[0] === 0xfd00 && words[1] === 0xec2 && words.slice(2, 7).every(word => word === 0) && words[7] === 0x254) return false;
  if (words[0] === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every(word => word === 0)) {
    return isAllowedAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  if (words[0] === 0x2002) return isAllowedAddress(`${words[1] >> 8}.${words[1] & 255}.${words[2] >> 8}.${words[2] & 255}`);
  return true;
}

export function normalizeHost(value: string): string {
  if ((value.includes('[') || value.includes(']')) && !/^\[[0-9a-fA-F:.]+\]$/.test(value)) throw new Error('Invalid host');
  const host = value.replace(/^\[|\]$/g, '');
  if (!host || host.length > 253 || /[\s\x00-\x1f\x7f/@?#%]/.test(host)) throw new Error('Invalid host');
  if (net.isIP(host)) {
    if (!isAllowedAddress(host)) throw new Error('Reserved or metadata address is not allowed');
  } else if (!/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9.])?$/.test(host)
    || host.split('.').filter(Boolean).some(label => label.length > 63 || label.startsWith('-') || label.endsWith('-'))
    || host.includes('..')) throw new Error('Invalid host');
  return host;
}

export function parseMonitoringUrl(value: string): URL {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\x00-\x1f\x7f#\\]/.test(value)) throw new Error('Invalid URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.port === '0'
    || /^https?:\/\/[^/]*@/i.test(value)) {
    throw new Error('Use an HTTP(S) URL without credentials or a fragment');
  }
  normalizeHost(url.hostname);
  return url;
}

async function resolveAddress(host: string): Promise<{ address: string; family: number }> {
  const normalized = normalizeHost(host);
  if (net.isIP(normalized)) return { address: normalized, family: net.isIP(normalized) };
  const addresses = await dns.promises.lookup(normalized, { all: true });
  if (!addresses.length || addresses.some(result => !isAllowedAddress(result.address))) throw new Error('Unsafe DNS answer');
  return addresses[0];
}

// A single deadline covers DNS, connection, TLS and response headers. Request
// bodies and response bodies are never retained. DNS is pinned per request.
async function httpStatus(url: URL, timeoutMs: number, body?: string, signal?: AbortSignal): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let request: http.ClientRequest;
    let finished = false;
    const finish = (error?: Error, status?: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      request?.destroy();
      if (error) reject(error); else resolve(status);
    };
    const abort = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    resolveAddress(url.hostname).then(address => {
      if (finished) return;
      const options: http.RequestOptions = {
        protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined, path: url.pathname + url.search,
        method: body === undefined ? 'GET' : 'POST', agent: false,
        lookup: ((_host: string, _options: unknown, callback: Function) => {
          if ((_options as { all?: boolean })?.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        }) as http.RequestOptions['lookup'],
        headers: body === undefined ? { Accept: '*/*' } : {
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
        }
      };
      try {
        request = (url.protocol === 'https:' ? https : http).request(options, response => {
          const status = response.statusCode || 0;
          response.destroy();
          finish(undefined, status);
        });
        request.once('error', () => finish(new Error('request failed')));
        request.end(body);
      } catch { finish(new Error('request failed')); }
    }).catch(() => finish(new Error('destination unavailable or reserved')));
  });
}

async function tcpConnect(host: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let socket: net.Socket;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket?.destroy();
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    resolveAddress(host).then(address => {
      if (finished) return;
      try {
        socket = net.connect({ host: address.address, port, family: address.family });
        socket.once('connect', () => finish());
        socket.once('error', () => finish(new Error('connection failed')));
      } catch { finish(new Error('connection failed')); }
    }).catch(() => finish(new Error('destination unavailable or reserved')));
  });
}

export async function probeHealthCheck(check: HealthCheck, signal?: AbortSignal): Promise<ProbeResult> {
  const started = Date.now();
  try {
    if (check.kind === 'tcp') {
      await tcpConnect(check.host, check.port, check.timeoutSeconds * 1000, signal);
      return { healthy: true, latencyMs: Date.now() - started, message: 'TCP connection succeeded' };
    }
    const status = await httpStatus(parseMonitoringUrl(check.url), check.timeoutSeconds * 1000, undefined, signal);
    return { healthy: status === check.expectedStatus, latencyMs: Date.now() - started,
      message: status === check.expectedStatus ? `HTTP ${status}` : `HTTP ${status}; expected ${check.expectedStatus}` };
  } catch (error) {
    return { healthy: false, latencyMs: null,
      message: (error as Error).message === 'timeout' ? 'Check timed out' : 'Connection failed or destination is unavailable' };
  }
}

export async function deliverMonitoringWebhook(url: string, event: MonitoringEvent, signal?: AbortSignal): Promise<void> {
  const status = await httpStatus(parseMonitoringUrl(url), 10000, JSON.stringify({
    source: 'ezpm2gui', event: {
      id: event.id, timestamp: event.timestamp, ruleId: event.ruleId, ruleName: event.ruleName,
      kind: event.kind, message: event.message, value: event.value
    }
  }), signal);
  if (status < 200 || status >= 300) throw new Error('Webhook did not return a successful status');
}

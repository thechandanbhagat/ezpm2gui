declare module 'pm2' {
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

  export function connect(cb: (err: Error | null) => void): void;
  export function disconnect(): void;
  export function list(cb: (err: Error | null, processList: PM2Process[]) => void): void;
  export function describe(id: string | number, cb: (err: Error | null, processDescription: PM2Process[]) => void): void;
  export function start(options: string | number | object, cb?: (err: Error | null) => void): void;
  export function stop(process: string | number, cb?: (err: Error | null) => void): void;
  export function restart(process: string | number, cb?: (err: Error | null) => void): void;
  export function remove(process: string | number, cb?: (err: Error | null) => void): void;
  export function del(process: string | number, cb?: (err: Error | null) => void): void;
  export function reload(process: string | number, cb?: (err: Error | null) => void): void;
  export function scale(process: string | number, instances: number, cb?: (err: Error | null) => void): void;
  export function dump(cb: (err: Error | null, dump: object) => void): void;
  export function startup(platform: string, cb: (err: Error | null) => void): void;
  export function flush(process: string | number | 'all', cb?: (err: Error | null) => void): void;
  export function reloadLogs(cb?: (err: Error | null) => void): void;
  export function sendSignal(signal: string, process: string | number, cb?: (err: Error | null) => void): void;
  export function install(module: string, cb?: (err: Error | null) => void): void;
  export function uninstall(module: string, cb?: (err: Error | null) => void): void;
}

declare module 'socket.io-client' {
  interface Socket {
    on(event: string, callback: (...args: any[]) => void): this;
    off(event: string): this;
    emit(event: string, ...args: any[]): this;
  }

  function io(uri: string, opts?: object): Socket;

  export { io };
}

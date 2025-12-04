export interface RemoteConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  connected: boolean;
  isPM2Installed?: boolean;
  privateKey?: string;
  useSudo?: boolean;
}

export interface RemoteConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  name?: string;
  useSudo?: boolean;
}

export interface RemoteProcess {
  // Same as PM2Process but from remote server
  pm_id: number;
  name: string;
  status: 'online' | 'stopping' | 'stopped' | 'launching' | 'errored';
  memory: number;
  cpu: number;
  uptime: number;
  restarts: number;
}

export interface PM2Process {
  name: string;
  status: string;
  cpu: string;
  memory: string;
  uptime: string;
  restarts: number;
  pm_id: number;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  totalMemory: string;
  freeMemory: string;
  cpuCount: number;
  loadAverage?: number[];
}

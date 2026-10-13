export interface AnalysisModel {
  name: string;
  local: boolean;
  kind?: 'local' | 'cloud' | 'unavailable';
  available?: boolean;
}

export interface AnalysisProvider {
  id: string;
  name: string;
  available: boolean;
  kind: 'local' | 'cloud';
  reason?: string;
  models?: AnalysisModel[];
}

export interface AnalysisTarget {
  processId: number;
  processName?: string;
  connectionId?: string;
}

export interface AnalysisSnapshot {
  processId: number;
  processName: string;
  source: 'local' | 'remote';
  status?: string;
  restarts?: number;
  cpuPercent?: number;
  memoryBytes?: number;
  notes?: string[];
  logs: Array<{ stream: 'stdout' | 'stderr'; message: string }>;
}

export interface SnapshotResponse {
  snapshot: AnalysisSnapshot;
  redactionCount: number;
  truncated: boolean;
  warnings?: string[];
}

export interface AnalysisResult {
  provider: string;
  model?: string;
  analysis: string;
  lineCount: number;
  redactionCount: number;
  truncated: boolean;
  warnings?: string[];
}

export interface AnalysisMessage {
  id: string;
  clientRequestId?: string;
  conversationId: string;
  question: string;
  provider: string;
  model?: string;
  snapshot: AnalysisSnapshot;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result?: AnalysisResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisConversationSummary {
  id: string;
  processId: number;
  processName: string;
  source: 'local' | 'remote';
  connectionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisConversation extends AnalysisConversationSummary {
  snapshot: AnalysisSnapshot;
  messages: AnalysisMessage[];
  redactionCount?: number;
  truncated?: boolean;
  warnings?: string[];
}

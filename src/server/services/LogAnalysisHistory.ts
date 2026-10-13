import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { configPath } from '../utils/config-dir';
import { validateSnapshotSelection } from './LogAnalysisSnapshot';
import {
  AnalysisInput, AnalysisResult, AnalysisSnapshot, analyzeSnapshot, LogAnalysisError,
  prepareAnalysisQuestion, prepareSnapshot, redactLogText,
} from './LogAnalysisService';

export type ConversationSummary = {
  id: string; processId: number; processName: string; source: 'local' | 'remote';
  connectionId?: string; createdAt: string; updatedAt: string;
};
export type AnalysisMessage = {
  id: string; conversationId: string; question: string; provider: string; model?: string;
  clientRequestId?: string;
  snapshot: AnalysisSnapshot; status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result?: AnalysisResult; error?: string; createdAt: string; updatedAt: string;
};
export type ConversationDetail = ConversationSummary & {
  snapshot: AnalysisSnapshot; redactionCount: number; truncated: boolean; warnings: string[];
  messages: AnalysisMessage[];
};

type ConversationRow = {
  id: string; process_id: number; process_name: string; source: 'local' | 'remote';
  connection_id: string; snapshot_json: string; snapshot_metadata_json: string; created_at: string; updated_at: string;
};
type SummaryRow = Pick<ConversationRow, 'id' | 'process_id' | 'process_name' | 'source' | 'connection_id' | 'created_at' | 'updated_at'>;
type MessageRow = {
  id: string; conversation_id: string; question: string; provider: string; model: string | null;
  snapshot_json: string; status: AnalysisMessage['status']; result_json: string | null; error: string | null;
  allow_cloud: number;
  client_request_id: string | null;
  created_at: string; updated_at: string;
};
type ListSelection = { processId: number; connectionId?: string; limit?: number; cursor?: string };
type HistoryOptions = { dbPath?: string; analyze?: (input: AnalysisInput, signal?: AbortSignal) => Promise<AnalysisResult>; now?: () => Date };

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const MAX_MESSAGES = 200;
const MAX_CONTEXT_MESSAGES = 10;
const MAX_CONTEXT_REPORT_BYTES = 64 * 1024;
const MAX_WARNING_COUNT = 8;
const MAX_WARNING_LENGTH = 4096;
const MAX_WARNING_BYTES = 256;
const MAX_REDACTIONS = 1_000_000;
const MAX_ERROR_BYTES = 2048;
const MAX_ANALYSIS_BYTES = 256 * 1024;
const MAX_CURSOR_LENGTH = 512;
const SQLITE_BUSY_TIMEOUT_MS = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const PROVIDERS = ['ollama', 'claude', 'codex', 'cursor', 'copilot'];
const INTERRUPTED_ERROR = 'The server restarted before this analysis finished. Start a new request to continue.';

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LogAnalysisError('Provide a valid log analysis request.', 400);
  }
  return value as Record<string, unknown>;
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new LogAnalysisError('Provide a valid conversation or message ID.', 400);
  return value;
}

function boundedRedactedText(value: string, limit: number): string {
  const redacted = redactLogText(value).text;
  const bytes = Buffer.from(redacted);
  if (bytes.length <= limit) return redacted;
  let end = limit;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}

function summary(row: SummaryRow): ConversationSummary {
  return {
    id: row.id, processId: row.process_id, processName: row.process_name, source: row.source,
    ...(row.connection_id ? { connectionId: row.connection_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function message(row: MessageRow): AnalysisMessage {
  return {
    id: row.id, conversationId: row.conversation_id, question: row.question, provider: row.provider,
    ...(row.client_request_id ? { clientRequestId: row.client_request_id } : {}),
    ...(row.model ? { model: row.model } : {}), snapshot: JSON.parse(row.snapshot_json), status: row.status,
    ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}), ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function snapshotMetadata(input: Record<string, unknown>, prepared: ReturnType<typeof prepareSnapshot>) {
  if (input.redactionCount !== undefined && (!Number.isSafeInteger(input.redactionCount) ||
      (input.redactionCount as number) < 0 || (input.redactionCount as number) > MAX_REDACTIONS)) {
    throw new LogAnalysisError('Provide a valid snapshot redaction count.', 400);
  }
  if (input.truncated !== undefined && typeof input.truncated !== 'boolean') throw new LogAnalysisError('Provide valid snapshot truncation metadata.', 400);
  if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.length > MAX_WARNING_COUNT ||
      input.warnings.some(warning => typeof warning !== 'string' || warning.length > MAX_WARNING_LENGTH))) {
    throw new LogAnalysisError('Provide a bounded list of snapshot warnings.', 400);
  }
  const warnings = ((input.warnings || []) as string[]).map(warning => boundedRedactedText(warning, MAX_WARNING_BYTES));
  return {
    redactionCount: Math.min(MAX_REDACTIONS, prepared.redactionCount + ((input.redactionCount as number) || 0)),
    truncated: prepared.truncated || input.truncated === true, warnings,
  };
}

function validatedMessage(value: unknown) {
  const input = objectInput(value);
  if (typeof input.provider !== 'string' || !PROVIDERS.includes(input.provider)) throw new LogAnalysisError('Choose a supported analysis provider.', 400);
  if (input.model !== undefined && (typeof input.model !== 'string' || !MODEL_PATTERN.test(input.model) || redactLogText(input.model).text !== input.model)) {
    throw new LogAnalysisError('Provide a valid short model name.', 400);
  }
  if (input.provider === 'ollama' && !input.model) throw new LogAnalysisError('Choose an installed Ollama model.', 400);
  if (typeof input.allowCloud !== 'boolean') throw new LogAnalysisError('Specify whether cloud processing is allowed.', 400);
  if (input.provider !== 'ollama' && input.allowCloud !== true) throw new LogAnalysisError('Confirm sending the redacted snapshot to this provider’s cloud service.', 400);
  const question = prepareAnalysisQuestion(input.question);
  if (!question) throw new LogAnalysisError('Provide a question for this analysis.', 400);
  if (input.clientRequestId !== undefined) validateId(input.clientRequestId);
  return {
    provider: input.provider, model: input.model as string | undefined, allowCloud: input.allowCloud, question,
    questionRedactionCount: redactLogText(input.question as string).count,
    clientRequestId: input.clientRequestId as string | undefined,
  };
}

function savedResult(result: AnalysisResult, request: ReturnType<typeof validatedMessage>, snapshot: AnalysisSnapshot): AnalysisResult {
  if (!result || typeof result.analysis !== 'string' || !result.analysis.trim()) throw new LogAnalysisError('The provider did not return an analysis response.', 502);
  const redacted = redactLogText(result.analysis);
  const analysis = boundedRedactedText(redacted.text, MAX_ANALYSIS_BYTES);
  return {
    provider: request.provider, ...(request.model ? { model: request.model } : {}), analysis,
    lineCount: snapshot.logs.length,
    redactionCount: Number.isSafeInteger(result.redactionCount) && result.redactionCount >= 0
      ? Math.min(result.redactionCount + redacted.count + request.questionRedactionCount, MAX_REDACTIONS)
      : redacted.count + request.questionRedactionCount,
    truncated: result.truncated === true || Buffer.byteLength(redacted.text) > MAX_ANALYSIS_BYTES,
  };
}

function decodeCursor(value: unknown): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new LogAnalysisError('Provide a valid history cursor.', 400);
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.updatedAt !== 'string' || !UUID_PATTERN.test(parsed.id) ||
        new Date(parsed.updatedAt).toISOString() !== parsed.updatedAt) throw new Error('Invalid cursor');
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch { throw new LogAnalysisError('Provide a valid history cursor.', 400); }
}

export function createLogAnalysisHistory(options: HistoryOptions = {}) {
  const dbPath = options.dbPath || configPath('remote-metrics.db');
  const analyze = options.analyze || analyzeSnapshot;
  const now = () => (options.now?.() || new Date()).toISOString();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS log_analysis_conversations (
      id TEXT PRIMARY KEY, process_id INTEGER NOT NULL, process_name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'remote')), connection_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, snapshot_metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_log_analysis_conversations_selection
      ON log_analysis_conversations (connection_id, process_id, updated_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS log_analysis_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES log_analysis_conversations(id),
      question TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, snapshot_json TEXT NOT NULL,
      allow_cloud INTEGER NOT NULL CHECK (allow_cloud IN (0, 1)), client_request_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'interrupted')),
      result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (conversation_id, client_request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_log_analysis_messages_conversation ON log_analysis_messages (conversation_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_log_analysis_messages_running
      ON log_analysis_messages (conversation_id) WHERE status = 'running';
  `);
  const startupTime = now();
  db.transaction(() => {
    db.prepare(`UPDATE log_analysis_conversations SET updated_at = ? WHERE id IN
      (SELECT conversation_id FROM log_analysis_messages WHERE status = 'running')`).run(startupTime);
    db.prepare("UPDATE log_analysis_messages SET status = 'interrupted', error = ?, updated_at = ? WHERE status = 'running'")
      .run(INTERRUPTED_ERROR, startupTime);
  })();
  const jobs = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const checkOpen = () => {
    if (closing || !db.open) throw new LogAnalysisError('Log analysis history is shutting down.', 503);
  };
  const getConversation = (id: string): ConversationDetail => {
    checkOpen();
    validateId(id);
    const row = db.prepare('SELECT * FROM log_analysis_conversations WHERE id = ?').get(id) as ConversationRow | undefined;
    if (!row) throw new LogAnalysisError('Log analysis conversation not found.', 404);
    const messages = db.prepare('SELECT * FROM log_analysis_messages WHERE conversation_id = ? ORDER BY created_at, rowid').all(id) as MessageRow[];
    return { ...summary(row), snapshot: JSON.parse(row.snapshot_json), ...JSON.parse(row.snapshot_metadata_json), messages: messages.map(message) };
  };
  const finishMessage = (conversationId: string, messageId: string, status: AnalysisMessage['status'], result?: AnalysisResult, error?: string) => {
    const updatedAt = now();
    db.transaction(() => {
      const changed = db.prepare(`UPDATE log_analysis_messages SET status = ?, result_json = ?, error = ?, updated_at = ?
        WHERE id = ? AND conversation_id = ? AND status = 'running'`).run(status, result ? JSON.stringify(result) : null, error || null, updatedAt, messageId, conversationId);
      if (changed.changes) db.prepare('UPDATE log_analysis_conversations SET updated_at = ? WHERE id = ?').run(updatedAt, conversationId);
    })();
  };

  return {
    createConversation(value: unknown): ConversationDetail {
      checkOpen();
      const input = objectInput(value);
      const prepared = prepareSnapshot(input.snapshot);
      const selection = validateSnapshotSelection({ processId: prepared.snapshot.processId, connectionId: input.connectionId });
      if (prepared.snapshot.source !== (selection.connectionId ? 'remote' : 'local')) {
        throw new LogAnalysisError('The log snapshot does not match the selected server.', 400);
      }
      const metadata = snapshotMetadata(input, prepared);
      const id = randomUUID();
      const createdAt = now();
      db.prepare(`INSERT INTO log_analysis_conversations
        (id, process_id, process_name, source, connection_id, snapshot_json, snapshot_metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, prepared.snapshot.processId, prepared.snapshot.processName,
          prepared.snapshot.source, selection.connectionId || '', JSON.stringify(prepared.snapshot), JSON.stringify(metadata), createdAt, createdAt);
      return getConversation(id);
    },
    listConversations(value: ListSelection): { conversations: ConversationSummary[]; nextCursor: string | null } {
      checkOpen();
      const input = objectInput(value);
      const selection = validateSnapshotSelection(input);
      const limit = input.limit === undefined ? DEFAULT_LIST_LIMIT : input.limit;
      if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIST_LIMIT) {
        throw new LogAnalysisError(`Choose a history limit between 1 and ${MAX_LIST_LIMIT}.`, 400);
      }
      const cursor = decodeCursor(input.cursor);
      const rows = cursor
        ? db.prepare(`SELECT id, process_id, process_name, source, connection_id, created_at, updated_at
            FROM log_analysis_conversations WHERE connection_id = ? AND process_id = ?
            AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?`)
          .all(selection.connectionId || '', selection.processId, cursor.updatedAt, cursor.updatedAt, cursor.id, (limit as number) + 1)
        : db.prepare(`SELECT id, process_id, process_name, source, connection_id, created_at, updated_at
            FROM log_analysis_conversations WHERE connection_id = ? AND process_id = ?
            ORDER BY updated_at DESC, id DESC LIMIT ?`).all(selection.connectionId || '', selection.processId, (limit as number) + 1);
      const selected = (rows as SummaryRow[]).slice(0, limit as number);
      const last = selected[selected.length - 1];
      return { conversations: selected.map(summary), nextCursor: rows.length > (limit as number)
        ? Buffer.from(JSON.stringify({ updatedAt: last.updated_at, id: last.id })).toString('base64url') : null };
    },
    getConversation,
    addMessage(conversationId: string, value: unknown): ConversationDetail {
      checkOpen();
      validateId(conversationId);
      const request = validatedMessage(value);
      const conversation = getConversation(conversationId);
      if (!conversation.snapshot.logs.some(row => row.message.trim())) throw new LogAnalysisError('There are no log lines to analyze. Wait for output or select another process.', 400);
      if (request.clientRequestId) {
        const previous = db.prepare('SELECT * FROM log_analysis_messages WHERE conversation_id = ? AND client_request_id = ?')
          .get(conversationId, request.clientRequestId) as MessageRow | undefined;
        if (previous) {
          if (previous.question !== request.question || previous.provider !== request.provider || (previous.model || undefined) !== request.model ||
              previous.allow_cloud !== (request.allowCloud ? 1 : 0)) {
            throw new LogAnalysisError('This request ID was already used for another analysis.', 409);
          }
          return conversation;
        }
      }
      if (conversation.messages.some(turn => jobs.has(turn.id))) {
        throw new LogAnalysisError('An analysis is running or stopping in this conversation. Wait for it to finish.', 409);
      }
      const id = randomUUID();
      const createdAt = now();
      db.transaction(() => {
        const counts = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
          FROM log_analysis_messages WHERE conversation_id = ?`).get(conversationId) as { total: number; running: number };
        if (counts.running) throw new LogAnalysisError('An analysis is already running in this conversation.', 409);
        if (counts.total >= MAX_MESSAGES) throw new LogAnalysisError('This conversation is full. Start a new log analysis conversation.', 413);
        db.prepare(`INSERT INTO log_analysis_messages
          (id, conversation_id, question, provider, model, snapshot_json, allow_cloud, client_request_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`).run(id, conversationId, request.question, request.provider,
            request.model || null, JSON.stringify(conversation.snapshot), request.allowCloud ? 1 : 0, request.clientRequestId || null, createdAt, createdAt);
        db.prepare('UPDATE log_analysis_conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId);
      }).immediate();
      const controller = new AbortController();
      const history = conversation.messages.filter(turn => turn.status === 'completed' && turn.result)
        .slice(-MAX_CONTEXT_MESSAGES).map(turn => ({ question: turn.question,
          analysis: Buffer.byteLength(turn.result!.analysis) > MAX_CONTEXT_REPORT_BYTES
            ? `${boundedRedactedText(turn.result!.analysis, MAX_CONTEXT_REPORT_BYTES - MAX_WARNING_BYTES)}\n[Analysis response truncated for conversation context.]`
            : turn.result!.analysis }));
      const execute = async () => {
        await Promise.resolve();
        try {
          if (controller.signal.aborted) throw new LogAnalysisError('Log analysis was cancelled.', 499);
          const result = await analyze({ provider: request.provider, model: request.model, snapshot: conversation.snapshot,
            allowCloud: request.allowCloud, question: request.question, history }, controller.signal);
          finishMessage(conversationId, id, 'completed', savedResult(result, request, conversation.snapshot));
        } catch (error) {
          const description = error instanceof LogAnalysisError ? boundedRedactedText(error.message, MAX_ERROR_BYTES)
            : 'Could not complete log analysis. Check the provider setup and try again.';
          finishMessage(conversationId, id, controller.signal.aborted ? 'cancelled' : 'failed', undefined, description);
        } finally { jobs.delete(id); }
      };
      const promise = execute().catch(() => {
        // There is no open HTTP response after acceptance; a storage failure must remain visible to the operator.
        console.error('Could not persist the log analysis outcome. The running request will be interrupted on server restart.');
      });
      jobs.set(id, { controller, promise });
      return getConversation(conversationId);
    },
    cancelMessage(conversationId: string, messageId: string): ConversationDetail {
      checkOpen();
      validateId(messageId);
      const conversation = getConversation(conversationId);
      const selected = conversation.messages.find(turn => turn.id === messageId);
      if (!selected) throw new LogAnalysisError('Log analysis message not found.', 404);
      if (selected.status === 'running') {
        finishMessage(conversationId, messageId, 'cancelled', undefined, 'Log analysis was cancelled.');
        jobs.get(messageId)?.controller.abort();
      }
      return getConversation(conversationId);
    },
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      const complete = async () => {
        const pending = [...jobs.entries()];
        for (const [id, job] of pending) {
          const row = db.prepare('SELECT conversation_id FROM log_analysis_messages WHERE id = ?').get(id) as { conversation_id: string };
          finishMessage(row.conversation_id, id, 'interrupted', undefined, INTERRUPTED_ERROR);
          job.controller.abort();
        }
        await Promise.all(pending.map(([, job]) => job.promise));
        db.close();
      };
      closePromise = complete();
      return closePromise;
    },
  };
}

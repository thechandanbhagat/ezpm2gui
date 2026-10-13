export type LogAnalysisLog = { stream: 'stdout' | 'stderr'; message: string };
export type NumberedLogAnalysisLog = LogAnalysisLog & { line: number };
export type EncodedLogAnalysisLogs = {
  format: 'json' | 'tsln'; text: string; explanation: string; originalBytes: number; encodedBytes: number;
};

const MAX_LOG_LINES = 400;
const MAX_LOG_JSON_BYTES = 2 * 1024 * 1024;
const COLUMN_COUNT = 5;
const LINE_COLUMN = 0;
const TIMESTAMP_COLUMN = 2;
const NULL_CELL = '∅';
const REPEAT_CELL = '=';
const HEADER = '# TSLN-based log profile/1\n# Schema: d:line s:stream i:timestamp i:separator i:message\n---\n';
const EXPLANATION = 'TSLN-based log profile: strings are JSON-quoted; pipes inside quoted strings are literal. '
  + 'Unquoted = repeats the previous value in that column; ∅ means no timestamp. '
  + 'Reconstruct each exact message as timestamp + separator + message, or message alone for ∅. '
  + 'Each row preserves one numbered log line and its stream. Timestamps are literal text, without timezone inference. '
  + 'Do not sort rows or infer cross-stream chronology. This is a local profile, not a standard TSLN wire format.';
const TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)(:[ \t]*|[ \t]+|$)([\s\S]*)$/;

type LogCells = [number, LogAnalysisLog['stream'], string | null, string, string];

function numberedLogs(value: unknown): NumberedLogAnalysisLog[] {
  if (!Array.isArray(value)) throw new TypeError('Provide an array of log rows.');
  if (value.length > MAX_LOG_LINES) throw new RangeError(`Include at most ${MAX_LOG_LINES} log rows.`);
  let messageBytes = 0;
  return Array.from(value, (row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || (row.stream !== 'stdout' && row.stream !== 'stderr') || typeof row.message !== 'string') {
      throw new TypeError('Every log row must contain a stdout/stderr stream and string message.');
    }
    // Reject oversized aggregate content before JSON serialization allocates a larger copy.
    messageBytes += Buffer.byteLength(row.message, 'utf8');
    if (messageBytes > MAX_LOG_JSON_BYTES) throw new RangeError('The encoded log rows are too large.');
    return { line: index + 1, stream: row.stream, message: row.message };
  });
}

function assertBoundedText(text: string): number {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_LOG_JSON_BYTES) throw new RangeError('The encoded log rows are too large.');
  return bytes;
}

function logCells(row: NumberedLogAnalysisLog): LogCells {
  const timestamp = TIMESTAMP_PREFIX.exec(row.message);
  return timestamp
    ? [row.line, row.stream, timestamp[1], timestamp[2], timestamp[3]]
    : [row.line, row.stream, null, '', row.message];
}

function encodeCell(value: LogCells[number], previous: LogCells[number] | undefined): string {
  if (value === previous) return REPEAT_CELL;
  return value === null ? NULL_CELL : JSON.stringify(value);
}

function splitCells(row: string): string[] {
  const cells: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < row.length; index++) {
    const character = row[index];
    if (quoted && escaped) escaped = false;
    else if (quoted && character === '\\') escaped = true;
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === '|') {
      cells.push(row.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) throw new TypeError('The log profile contains an unterminated quoted cell.');
  cells.push(row.slice(start));
  if (cells.length !== COLUMN_COUNT) throw new TypeError('Every log profile row must contain five columns.');
  return cells;
}

function decodeCell(cell: string, column: number, previous: LogCells | undefined): LogCells[number] {
  if (cell === REPEAT_CELL) {
    if (!previous || column === LINE_COLUMN) throw new TypeError('A repeat marker requires a previous value in the same column.');
    return previous[column];
  }
  if (cell === NULL_CELL) {
    if (column !== TIMESTAMP_COLUMN) throw new TypeError('Only the timestamp column accepts the null marker.');
    return null;
  }
  const value: unknown = JSON.parse(cell);
  if (column === LINE_COLUMN ? !Number.isSafeInteger(value) : typeof value !== 'string') {
    throw new TypeError('Log profile cells must match their declared types.');
  }
  return value as number | string;
}

export function decodeLogAnalysisLogs(text: unknown, format: 'json' | 'tsln'): NumberedLogAnalysisLog[] {
  if (typeof text !== 'string') throw new TypeError('Provide encoded log rows as a string.');
  assertBoundedText(text);
  if (format === 'json') {
    const parsed: unknown = JSON.parse(text);
    const rows = numberedLogs(parsed);
    if ((parsed as Array<{ line?: unknown }>).some((row, index) => row.line !== index + 1)) {
      throw new TypeError('Numbered log rows must retain their original sequential line numbers.');
    }
    return rows;
  }
  if (format !== 'tsln' || !text.startsWith(HEADER)) throw new TypeError('Provide a supported log encoding and profile header.');
  const body = text.slice(HEADER.length);
  const encodedRows = body ? body.split('\n') : [];
  if (encodedRows.length > MAX_LOG_LINES) throw new RangeError(`Include at most ${MAX_LOG_LINES} log rows.`);
  let previous: LogCells | undefined;
  const rows = encodedRows.map((encoded, index) => {
    const cells = splitCells(encoded).map((cell, column) => decodeCell(cell, column, previous)) as LogCells;
    const [line, stream, timestamp, separator, messageText] = cells;
    if (line !== index + 1) throw new TypeError('Numbered log rows must retain their original sequential line numbers.');
    if (stream !== 'stdout' && stream !== 'stderr') throw new TypeError('Provide a stdout/stderr log stream.');
    if (timestamp === null && separator !== '') throw new TypeError('A log without a timestamp must have an empty separator.');
    const message = timestamp === null ? messageText : timestamp + separator + messageText;
    const row: NumberedLogAnalysisLog = { line, stream, message };
    const extracted = logCells(row);
    if (extracted.some((value, column) => value !== cells[column])) throw new TypeError('Provide an exact literal ISO-style timestamp prefix.');
    previous = cells;
    return row;
  });
  return rows;
}

export function encodeLogAnalysisLogs(logs: unknown): EncodedLogAnalysisLogs {
  const rows = numberedLogs(logs);
  const original = JSON.stringify(rows);
  const originalBytes = assertBoundedText(original);
  let previous: LogCells | undefined;
  const encodedRows = rows.map(row => {
    const cells = logCells(row);
    const encoded = cells.map((value, column) => encodeCell(value, previous?.[column])).join('|');
    previous = cells;
    return encoded;
  });
  const candidate = HEADER + encodedRows.join('\n');
  const encodedBytes = Buffer.byteLength(`${EXPLANATION}\n${candidate}`, 'utf8');
  if (encodedBytes >= originalBytes) {
    return { format: 'json', text: original, explanation: '', originalBytes, encodedBytes: originalBytes };
  }
  // Codec failures must fail visibly before any model receives changed diagnostic evidence.
  if (JSON.stringify(decodeLogAnalysisLogs(candidate, 'tsln')) !== original) {
    throw new Error('The log profile failed to preserve the original numbered evidence.');
  }
  return { format: 'tsln', text: candidate, explanation: EXPLANATION, originalBytes, encodedBytes };
}

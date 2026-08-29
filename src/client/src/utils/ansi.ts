// @group Utilities : Strip ANSI escape codes (colour codes, cursor moves, etc.)
// PM2 writes raw stdout/stderr to its log files, so loggers that colourize output
// (e.g. tslog, chalk) leave escape sequences in the log text itself.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;

export const stripAnsi = (str: string): string => str.replace(ANSI_PATTERN, '');

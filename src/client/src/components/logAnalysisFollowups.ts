const MAX_QUESTION_LENGTH = 4000;
const MAX_REFERENCE_LENGTH = 240;

const followups = {
  port: ['portEvidence', 'portChecks', 'portFix'],
  connection: ['connectionEvidence', 'connectionChecks', 'connectionFix'],
  memory: ['memoryEvidence', 'memoryChecks', 'memoryFix'],
  general: ['generalEvidence', 'generalChecks', 'generalFix'],
} as const;

export const getLogAnalysisFollowups = (analysis?: string | null) => {
  const content = analysis || '';
  if (/eaddrinuse|port\s+conflict|address\s+already\s+in\s+use/i.test(content)) return followups.port;
  if (/out\s+of\s+memory|memory\s+(?:leak|usage|pressure)|heap\s+(?:limit|exhaust)|restart\s+(?:loop|storm)|repeated\s+restarts?|\boom\b/i.test(content)) return followups.memory;
  if (/econn(?:reset|refused)|etimedout|connection\s+(?:fail|lost|refused|reset)|database|\bdns\b/i.test(content)) return followups.connection;
  return followups.general;
};

export const createLogAnalysisFollowupQuestion = (
  suggestion: string | null | undefined,
  originatingQuestion: string | null | undefined,
  formatReference: (question: string, followup: string) => string,
) => {
  const followup = (suggestion || '').trim();
  if (!followup) return '';
  const origin = (originatingQuestion || '').replace(/\s+/g, ' ').trim();
  const reference = origin.length > MAX_REFERENCE_LENGTH ? `${origin.slice(0, MAX_REFERENCE_LENGTH - 1)}…` : origin;
  return (reference ? formatReference(reference, followup) : followup).slice(0, MAX_QUESTION_LENGTH);
};

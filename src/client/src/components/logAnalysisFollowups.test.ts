import { describe, expect, test } from '@jest/globals';
import { createLogAnalysisFollowupQuestion, getLogAnalysisFollowups } from './logAnalysisFollowups';

const MAX_QUESTION_LENGTH = 4000;
const MAX_ANALYSIS_BYTES = 256 * 1024;
const MAX_REFERENCE_LENGTH = 240;
const formatReference = (question: string, suggestion: string) => `Regarding your response to “${question}”: ${suggestion}`;

describe('analysis follow-up topics', () => {
  test.each([null, undefined, '', 'No specific problem found.'])('falls back to three investigation questions for %p', content => {
    expect(getLogAnalysisFollowups(content)).toEqual(['generalEvidence', 'generalChecks', 'generalFix']);
  });

  test.each(['EADDRINUSE on startup', 'Port conflict detected', 'address already in use'])('selects port diagnostics from %s', content => {
    expect(getLogAnalysisFollowups(content)).toEqual(['portEvidence', 'portChecks', 'portFix']);
  });

  test.each(['ECONNRESET in the database client', 'ETIMEDOUT', 'Connection refused', 'DNS lookup failure'])('selects connection diagnostics from %s', content => {
    expect(getLogAnalysisFollowups(content)).toEqual(['connectionEvidence', 'connectionChecks', 'connectionFix']);
  });

  test.each(['Out of memory', 'Memory usage is elevated', 'Heap limit exceeded', 'Restart loop', 'Repeated restarts'])('selects resource diagnostics from %s', content => {
    expect(getLogAnalysisFollowups(content)).toEqual(['memoryEvidence', 'memoryChecks', 'memoryFix']);
  });

  test('keeps a specific port cause ahead of its restart symptom and handles maximum output', () => {
    expect(getLogAnalysisFollowups('Restart loop caused by EADDRINUSE')).toEqual(['portEvidence', 'portChecks', 'portFix']);
    expect(getLogAnalysisFollowups('x'.repeat(MAX_ANALYSIS_BYTES))).toEqual(['generalEvidence', 'generalChecks', 'generalFix']);
  });
});

describe('follow-up question draft', () => {
  test('references the originating question and normalizes its line breaks', () => {
    expect(createLogAnalysisFollowupQuestion(' How do I verify recovery? ', ' Investigate\n  the failures ', formatReference))
      .toBe('Regarding your response to “Investigate the failures”: How do I verify recovery?');
  });

  test.each([null, undefined, '', '  '])('does not create a question for an empty suggestion %p', value => {
    expect(createLogAnalysisFollowupQuestion(value, 'Original question', formatReference)).toBe('');
  });

  test.each([null, undefined, '', '  '])('omits an empty originating question %p', value => {
    expect(createLogAnalysisFollowupQuestion('Check the evidence?', value, formatReference)).toBe('Check the evidence?');
  });

  test('shortens a maximum original question while retaining the complete suggestion', () => {
    const result = createLogAnalysisFollowupQuestion('How do I verify recovery?', 'x'.repeat(MAX_QUESTION_LENGTH), formatReference);
    expect(result).toBe(formatReference(`${'x'.repeat(MAX_REFERENCE_LENGTH - 1)}…`, 'How do I verify recovery?'));
    expect(result.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
  });

  test('caps translated and unreferenced drafts at the server question limit', () => {
    expect(createLogAnalysisFollowupQuestion('y'.repeat(MAX_QUESTION_LENGTH), 'Original question', formatReference)).toHaveLength(MAX_QUESTION_LENGTH);
    expect(createLogAnalysisFollowupQuestion('y'.repeat(MAX_QUESTION_LENGTH + 1), null, formatReference)).toHaveLength(MAX_QUESTION_LENGTH);
  });
});

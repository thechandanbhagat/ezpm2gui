import React from 'react';
import { Box } from '@mui/material';
import { Markdown, MarkdownToJSX } from 'markdown-to-jsx/react';

const safeLinkDestination = (value: string): string | null => {
  const destination = value.trim();
  if (destination.startsWith('#')) return destination;
  if (!/^(https?:|mailto:)/i.test(destination)) return null;
  try {
    const url = new URL(destination);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? destination : null;
  } catch {
    return null;
  }
};

const AnalysisLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({ href, title, children }) => {
  const destination = href ? safeLinkDestination(href) : null;
  return destination ? <a href={destination} title={title} target={destination.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>;
};

const AnalysisImage: React.FC<{ alt?: string }> = ({ alt }) => <span>{alt || ''}</span>;

const AnalysisTask: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ checked }) =>
  <input type="checkbox" checked={Boolean(checked)} disabled readOnly tabIndex={-1} aria-hidden="true" />;

const AnalysisTable: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}><table>{children}</table></Box>;

const markdownOptions: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  disableAutoLink: true,
  forceBlock: true,
  forceWrapper: true,
  sanitizer: value => safeLinkDestination(value),
  overrides: {
    a: AnalysisLink, img: AnalysisImage, table: AnalysisTable, input: AnalysisTask,
    h1: { component: 'h4', props: { className: 'analysis-heading-1' } },
    h2: { component: 'h5', props: { className: 'analysis-heading-2' } },
    h3: { component: 'h6' }, h4: { component: 'h6' }, h5: { component: 'h6' }, h6: { component: 'h6' },
  },
};

export const LogAnalysisMarkdown: React.FC<{ content?: string | null }> = ({ content }) => {
  if (!content) return null;
  return <Box sx={{ lineHeight: 1.6, overflowWrap: 'anywhere', minWidth: 0,
    '& p, & ul, & ol, & blockquote, & pre, & table': { my: 1.5 },
    '& > div > :first-child': { mt: 0 }, '& > div > :last-child': { mb: 0 },
    '& h4, & h5, & h6': { fontWeight: 600, fontSize: '1rem', lineHeight: 1.3, mt: 2.5, mb: 1 },
    '& .analysis-heading-1': { fontSize: '1.25rem' }, '& .analysis-heading-2': { fontSize: '1.125rem' },
    '& ul': { listStyleType: 'disc', pl: 3 }, '& ol': { listStyleType: 'decimal', pl: 3 },
    '& li': { my: 0.5 }, '& li > p': { my: 0.5 }, '& strong': { fontWeight: 700 },
    '& a': { color: 'var(--ez-accent)', textDecoration: 'underline' },
    '& a:focus-visible': { outline: '2px solid var(--ez-accent)', outlineOffset: 2 },
    '& blockquote': { borderInlineStart: '2px solid var(--ez-border)', pl: 2, color: 'var(--ez-text-muted)' },
    '& code': { fontFamily: 'monospace', bgcolor: 'var(--ez-bg-page)', px: 0.5, py: 0.25, borderRadius: 0.5 },
    '& pre': { p: 1.5, overflowX: 'auto', whiteSpace: 'pre', border: '1px solid var(--ez-border)', borderRadius: 1, bgcolor: 'var(--ez-bg-page)' },
    '& pre code': { p: 0, bgcolor: 'transparent', whiteSpace: 'pre' },
    '& table': { borderCollapse: 'collapse', width: '100%', textAlign: 'start' },
    '& th, & td': { border: '1px solid var(--ez-border)', p: 1, verticalAlign: 'top' },
    '& th': { fontWeight: 600, bgcolor: 'var(--ez-bg-surface-muted)' },
    '& hr': { border: 0, borderTop: '1px solid var(--ez-border)', my: 2 },
  }}><Markdown options={markdownOptions}>{content}</Markdown></Box>;
};

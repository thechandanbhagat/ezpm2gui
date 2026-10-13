import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

const repositoryRoot = join(__dirname, '..');
const clientRequire = createRequire(join(repositoryRoot, 'src/client/package.json'));
const React = clientRequire('react') as typeof import('react');
const { renderToStaticMarkup } = clientRequire('react-dom/server') as typeof import('react-dom/server');
const { compiler } = clientRequire('markdown-to-jsx/react') as {
  compiler: (markdown: string, options: Record<string, unknown>) => ReactNode;
};
const MAX_MARKDOWN_BYTES = 64 * 1024;
const GITHUB_SOURCE_BASE = 'https://github.com/thechandanbhagat/ezpm2gui/blob/main/';
const DOCUMENTATION_URL = 'https://ezpm2gui.chandanbhagat.com.np/userguides/tsln-log-analysis.html';

const safeDestination = (href: string): string | null => {
  const value = href.trim();
  if (/^#[a-z0-9_-]+$/i.test(value)) return value;
  if (/^\.\.\/\.\.\/(src|tests)\/[a-z0-9_./-]+$/i.test(value)) {
    const sourcePath = value.slice('../../'.length);
    if (sourcePath.split('/').some(segment => segment === '..' || segment === '.')) return null;
    return `${GITHUB_SOURCE_BASE}${sourcePath}`;
  }
  if (!/^(https?:|mailto:)/i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const DocumentationLink = ({ href, children, title }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const destination = href ? safeDestination(href) : null;
  return destination
    ? React.createElement('a', { href: destination, title }, children)
    : React.createElement('span', null, children);
};

const DocumentationTable = ({ children }: { children?: ReactNode }) =>
  React.createElement('div', { className: 'table-wrap', tabIndex: 0, role: 'region', 'aria-label': 'Scrollable comparison table' },
    React.createElement('table', null, children));

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export const renderTslnDocumentation = (markdown: unknown): string => {
  if (typeof markdown !== 'string') throw new TypeError('Documentation Markdown must be a string.');
  if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) throw new RangeError('Documentation Markdown exceeds 64 KiB.');
  const body = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '').trim();
  if (!body) throw new Error('Documentation Markdown must not be empty.');
  if (!body.startsWith('# ')) throw new Error('Documentation Markdown must begin with one level-one heading.');
  const title = escapeHtml(body.split(/\r?\n/, 1)[0].slice('# '.length).trim());
  const content = renderToStaticMarkup(compiler(body, {
    disableParsingRawHTML: true,
    disableAutoLink: true,
    forceBlock: true,
    forceWrapper: true,
    sanitizer: safeDestination,
    overrides: {
      a: DocumentationLink,
      img: ({ alt }: { alt?: string }) => React.createElement('span', null, alt || ''),
      table: DocumentationTable,
      th: { component: 'th', props: { scope: 'col' } },
    },
  }));
  if ((content.match(/<h1(?:\s[^>]*)?>/g) || []).length !== 1) throw new Error('Documentation Markdown must contain one level-one heading.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — EZ PM2 GUI</title>
  <meta name="description" content="Why EZ PM2 GUI uses a TSLN-based log profile for AI analysis, with examples, evidence safeguards, measured savings, and limits.">
  <link rel="canonical" href="${DOCUMENTATION_URL}">
  <link rel="icon" type="image/svg+xml" href="../images/logo.svg">
  <link rel="stylesheet" href="../theme.css">
  <style>
    :root { --space: 1rem; --radius: .5rem; --measure: 72ch; }
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-padding-top: var(--space); }
    body { margin: 0; background: var(--bg); color: var(--text-body); font: 1rem/1.65 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    a { color: var(--blue); }
    .skip-link { position: absolute; top: -4rem; left: var(--space); padding: var(--space); background: var(--surface); }
    .skip-link:focus { top: var(--space); }
    .nav { border-bottom: 1px solid var(--border); background: var(--surface); }
    .nav-inner { max-width: 1200px; margin-inline: auto; padding: var(--space); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space); }
    .logo { color: var(--text); font-weight: 800; text-decoration: none; }
    .nav-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space); }
    .theme-btn { min-height: 44px; padding: .5rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
    main, footer { max-width: var(--measure); margin-inline: auto; padding: calc(var(--space) * 2) var(--space); }
    .breadcrumbs { color: var(--text-muted); margin-bottom: calc(var(--space) * 2); font-size: .875rem; }
    h1, h2, h3 { color: var(--text); line-height: 1.25; }
    h1 { font-size: clamp(2rem, 5vw, 2.5rem); margin-top: 0; }
    h2 { font-size: 1.5rem; margin-top: calc(var(--space) * 3); }
    h3 { font-size: 1.25rem; margin-top: calc(var(--space) * 2); }
    article p, article ul, article ol { margin-block: var(--space); overflow-wrap: anywhere; }
    article ul, article ol { padding-inline-start: calc(var(--space) * 1.5); }
    article li { margin-block: .5rem; }
    code { font: .875em/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--surface-2); color: var(--primary); padding: .125rem .25rem; border-radius: .25rem; }
    pre { max-width: 100%; padding: var(--space); border: 1px solid var(--border); border-left: .25rem solid var(--primary); border-radius: var(--radius); overflow-x: auto; background: var(--surface-2); }
    pre code { color: var(--text); padding: 0; background: none; white-space: pre; }
    .table-wrap { max-width: 100%; overflow-x: auto; margin-block: var(--space); border-radius: var(--radius); }
    table { width: 100%; border-collapse: collapse; text-align: start; }
    th, td { padding: .75rem; border: 1px solid var(--border); }
    th { background: var(--surface); color: var(--text); }
    footer { border-top: 1px solid var(--border); color: var(--text-muted); font-size: .875rem; }
    footer p { margin-block: .5rem; }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <nav class="nav" aria-label="Documentation navigation">
    <div class="nav-inner">
      <a href="../index.html" class="logo">EZ PM2 GUI</a>
      <div class="nav-actions">
        <a href="index.html">User Guide</a>
        <a href="../index.html#documentation">Resources</a>
        <button class="theme-btn" id="themeToggle" type="button" aria-label="Switch to light theme">Light theme</button>
      </div>
    </div>
  </nav>
  <main id="main">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="../index.html">Documentation</a> / <a href="index.html">User Guide</a> / TSLN log analysis</nav>
    <article>${content}</article>
  </main>
  <footer>
    <p><a href="tsln-log-analysis.md">View the Markdown source</a> · <a href="index.html#logs">Log streaming guide</a></p>
    <p>Maintained by EZ PM2 GUI maintainers. Review the source when the encoder, prompt format, or snapshot limits change.</p>
  </footer>
  <script>
    const root = document.documentElement;
    const button = document.getElementById('themeToggle');
    const saved = localStorage.getItem('ezpm2-theme');
    let dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const applyTheme = () => {
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      button.textContent = dark ? 'Light theme' : 'Dark theme';
      button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    };
    applyTheme();
    button.addEventListener('click', () => {
      dark = !dark;
      applyTheme();
      localStorage.setItem('ezpm2-theme', dark ? 'dark' : 'light');
    });
  </script>
</body>
</html>
`;
};

if (require.main === module) {
  const source = join(repositoryRoot, 'ezpm2gui/userguides/tsln-log-analysis.md');
  const destination = join(repositoryRoot, 'ezpm2gui/userguides/tsln-log-analysis.html');
  writeFileSync(destination, renderTslnDocumentation(readFileSync(source, 'utf8')), 'utf8');
  console.log('Rendered ezpm2gui/userguides/tsln-log-analysis.html');
}

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { LogAnalysisMarkdown } from './LogAnalysisMarkdown';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const MAX_ANALYSIS_BYTES = 256 * 1024;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const renderMarkdown = (content?: string | null) => act(() => root.render(<LogAnalysisMarkdown content={content} />));

describe('analysis Markdown', () => {
  test('renders headings, formatting, lists, inline code, fenced code, block quotes and tables', () => {
    renderMarkdown('# Diagnostic report\n\n## Findings\n\n**Repeated failure** with *evidence* at `line 2`.\n\n- Investigate port\n- Retry worker\n\n1. Check owner\n2. Restart process\n\n```sh\nss -ltnp | grep 4000\n```\n\n> Review evidence first.\n\n| Cause | Evidence |\n| --- | --- |\n| Port occupied | Line 2 |');
    expect(container.querySelector('h4')?.textContent).toBe('Diagnostic report');
    expect(container.querySelector('h5')?.textContent).toBe('Findings');
    expect(container.querySelector('h1, h2, h3')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('Repeated failure');
    expect(container.querySelector('em')?.textContent).toBe('evidence');
    expect(container.querySelector('p code')?.textContent).toBe('line 2');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toContain('ss -ltnp | grep 4000');
    expect(container.querySelector('blockquote')?.textContent).toContain('Review evidence first.');
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(container.querySelector('table tbody td')?.textContent).toBe('Port occupied');
  });

  test('renders lower headings within the transcript hierarchy and noninteractive task checkboxes', () => {
    renderMarkdown('### Evidence\n\n#### Next steps\n\n##### Detail\n\n###### Note\n\n- [x] Inspect port\n- [ ] Restart worker');
    expect(Array.from(container.querySelectorAll('h6')).map(node => node.textContent)).toEqual(['Evidence', 'Next steps', 'Detail', 'Note']);
    const tasks = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(tasks.map(input => input.checked)).toEqual([true, false]);
    expect(tasks.every(input => input.disabled && input.readOnly && input.tabIndex === -1)).toBe(true);
  });

  test('permits HTTP, HTTPS, mail and fragment links with safe external attributes', () => {
    renderMarkdown('[Docs](https://example.com/docs) [HTTP](http://example.com) [Mail](mailto:support@example.com) [Finding](#findings)');
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map(link => link.getAttribute('href'))).toEqual(['https://example.com/docs', 'http://example.com', 'mailto:support@example.com', '#findings']);
    for (const link of links.slice(0, -1)) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(links[links.length - 1].getAttribute('target')).toBeNull();
  });

  test.each(['javascript:alert%281%29', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox%281%29', 'file:///C:/secret', '//tracker.example.com/path', 'java&#x73;cript:alert%281%29', 'https://'])('renders unsafe destination %s as inert text', destination => {
    renderMarkdown(`[Unsafe link](${destination})`);
    expect(container.textContent).toContain('Unsafe link');
    expect(container.querySelector('a')).toBeNull();
  });

  test('keeps raw HTML inert and suppresses all Markdown images while preserving their alternatives', () => {
    const rawHtml = '<img src="https://tracker.example.com/pixel" onerror="alert(1)">';
    renderMarkdown(`${rawHtml}\n\n<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n<a href="javascript:alert(1)">Dangerous link</a>\n\n![Diagram](https://tracker.example.com/chart.png)\n\n![Inline image](data:image/svg+xml;base64,PHN2Zz4=)`);
    expect(container.querySelector('img, script, iframe, svg, a')).toBeNull();
    expect(container.textContent).toContain(rawHtml);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('Diagram');
    expect(container.textContent).toContain('Inline image');
  });

  test.each([null, undefined, ''])('renders empty content %s without empty markup', content => {
    renderMarkdown(content);
    expect(container.childElementCount).toBe(0);
  });

  test('preserves the full maximum bounded analysis response', () => {
    const content = 'x'.repeat(MAX_ANALYSIS_BYTES);
    renderMarkdown(content);
    expect(container.textContent).toBe(content);
  });
});

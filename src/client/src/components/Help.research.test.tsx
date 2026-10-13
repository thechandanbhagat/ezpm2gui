import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { run } from 'axe-core';
import english from '../locales/en/translation.json';
import nepali from '../locales/ne/translation.json';
import chinese from '../locales/zh/translation.json';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let messages: Record<string, unknown> = english;

jest.doMock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, values: Record<string, string> = {}) => {
    const message = key.split('.').reduce<unknown>((value, part) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, messages);
    return typeof message === 'string'
      ? message.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? '')
      : key;
  },
}) }));
jest.doMock('react-router-dom', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) =>
    <a href={to} className={className}>{children}</a>,
}));

const Help: React.FC = require('./Help').default;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  messages = english;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test.each([['English', english], ['Nepali', nepali], ['Chinese', chinese]] as const)(
  'shows the TSLN rationale with safe, descriptive guide and paper links in %s', (_, translations) => {
    messages = translations;
    act(() => root.render(<Help />));
    const section = container.querySelector('section[aria-labelledby="help-tsln-title"]');
    const link = section?.querySelector<HTMLAnchorElement>('a[href="https://doi.org/10.31224/6375"]');
    const guide = section?.querySelector<HTMLAnchorElement>('a[href="https://ezpm2gui.chandanbhagat.com.np/userguides/tsln-log-analysis.html"]');
    expect(section?.querySelector('h2')?.textContent).toBe(translations.help.tslnTitle);
    expect(section?.textContent).toContain(translations.help.tslnDescription);
    expect(section?.textContent).toContain(translations.help.tslnAuthors);
    expect(link?.textContent).toBe(translations.help.tslnPaper);
    expect(link?.href).toBe('https://doi.org/10.31224/6375');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(link?.tabIndex).toBe(0);
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(guide?.textContent).toBe(translations.help.tslnGuide);
    expect(guide?.href).toBe('https://ezpm2gui.chandanbhagat.com.np/userguides/tsln-log-analysis.html');
    expect(guide?.target).toBe('_blank');
    expect(guide?.rel).toBe('noopener noreferrer');
    expect(guide?.tabIndex).toBe(0);
    expect(guide?.className).toContain('focus-visible:outline');
    expect(guide?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  },
);

test('points documentation and user guide links at the custom documentation domain', () => {
  act(() => root.render(<Help />));
  expect(container.querySelector<HTMLAnchorElement>('a[href="https://ezpm2gui.chandanbhagat.com.np/"]')?.textContent).toBe(english.help.documentation);
  expect(container.querySelector<HTMLAnchorElement>('a[href="https://ezpm2gui.chandanbhagat.com.np/userguides/"]')?.textContent).toBe(english.help.userGuide);
  expect(container.querySelector('a[href*="ezpm2gui.vercel.app"]')).toBeNull();
});

test.each([['English', english], ['Nepali', nepali], ['Chinese', chinese]] as const)('keeps the TSLN section accessible with native links in %s', async (_, translations) => {
  messages = translations;
  act(() => root.render(<Help />));
  const section = container.querySelector<HTMLElement>('section[aria-labelledby="help-tsln-title"]');
  if (!section) throw new Error('Missing TSLN help section.');
  const results = await run(section, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
});

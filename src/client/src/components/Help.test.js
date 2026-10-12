import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-i18next', () => {
  const messages = require('../locales/en/translation.json');
  return { useTranslation: () => ({ t: (key, values = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages) || key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
  } }) };
});

const { MemoryRouter } = require('react-router-dom');
const Help = require('./Help').default;
let root;
let container;
const click = async element => { await act(async () => element.click()); };
const button = label => [...container.querySelectorAll('button')].find(item => item.textContent.includes(label));

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><Help /></MemoryRouter>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test('does not load a third-party player until Play and replaces it when another demo is chosen', async () => {
  expect(container.querySelector('iframe')).toBeNull();
  await click(button('Play demo'));
  const firstPlayer = container.querySelector('iframe');
  expect(firstPlayer.src).toBe('https://www.youtube-nocookie.com/embed/EPwORhBHupU?autoplay=1&rel=0');
  expect(firstPlayer.title).toContain('AI log analysis');
  await click(button('Product walkthrough'));
  expect(firstPlayer.isConnected).toBe(false);
  expect(container.querySelector('iframe')).toBeNull();
  expect(button('Product walkthrough').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('a[href="https://youtu.be/u1ckawU-sg4"]')).not.toBeNull();
  await click(button('Play demo'));
  expect(container.querySelector('iframe').src).toBe('https://www.youtube-nocookie.com/embed/u1ckawU-sg4?autoplay=1&rel=0');
});

test('keeps a direct YouTube fallback when the embedded player fails and supports retry', async () => {
  await click(button('Play demo'));
  await act(async () => container.querySelector('iframe').dispatchEvent(new Event('error')));
  expect(container.querySelector('[role="alert"]').textContent).toContain('could not load');
  const fallback = container.querySelector('a[href="https://youtu.be/EPwORhBHupU"]');
  expect(fallback.target).toBe('_blank');
  expect(fallback.rel).toBe('noopener noreferrer');
  await click(button('Retry playback'));
  expect(container.querySelector('iframe')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

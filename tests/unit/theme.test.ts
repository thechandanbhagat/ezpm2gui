import assert from 'assert/strict';
import {
  getAccentPalette,
  getThemePreference,
  isDarkTheme,
  normalizeAccentColor,
  normalizeThemePreference,
} from '../../src/client/src/utils/theme';

// @group UnitTests : Stored theme preference normalization
assert.equal(normalizeThemePreference('light'), 'light');
assert.equal(normalizeThemePreference('dark'), 'dark');
assert.equal(normalizeThemePreference(null), 'dark');
assert.equal(normalizeThemePreference('unexpected'), 'dark');

// @group UnitTests : Theme boolean conversion
assert.equal(isDarkTheme('dark'), true);
assert.equal(isDarkTheme('light'), false);
assert.equal(getThemePreference(true), 'dark');
assert.equal(getThemePreference(false), 'light');

// @group UnitTests : Accent color preference normalization
assert.equal(normalizeAccentColor('blue'), 'blue');
assert.equal(normalizeAccentColor('purple'), 'purple');
assert.equal(normalizeAccentColor('green'), 'green');
assert.equal(normalizeAccentColor('orange'), 'orange');
assert.equal(normalizeAccentColor(null), 'blue');
assert.equal(normalizeAccentColor('unexpected'), 'blue');

// @group UnitTests : Accent palettes expose CSS-ready color values
assert.equal(getAccentPalette('blue').main, '#22d3ee');
assert.equal(getAccentPalette('purple').main, '#a78bfa');
assert.equal(getAccentPalette('green').main, '#22c55e');
assert.equal(getAccentPalette('orange').main, '#f59e0b');

// Accent labels must remain readable on page, card, selected, and hover surfaces.
const luminance = (hex: string): number => {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

for (const theme of ['dark', 'light'] as const) {
  for (const accent of ['blue', 'purple', 'green', 'orange'] as const) {
    const palette = getAccentPalette(accent, theme);
    const surfaces = theme === 'light'
      ? ['#ffffff', '#f8fafc', '#e2e8f0', palette.strongBg]
      : ['#0a0a0a', '#111111', '#1a1a1a', palette.strongBg];
    for (const text of [palette.main, palette.hover]) {
      for (const surface of surfaces) {
        const values = [luminance(text), luminance(surface)].sort((a, b) => b - a);
        const contrast = (values[0] + 0.05) / (values[1] + 0.05);
        assert.ok(contrast >= 4.5, `${theme} ${accent}: ${text} on ${surface} has contrast ${contrast}`);
      }
    }
  }
}

console.log('theme tests passed');

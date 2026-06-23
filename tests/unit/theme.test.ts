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

console.log('theme tests passed');

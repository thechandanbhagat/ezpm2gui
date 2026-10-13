import assert from 'assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { formatVersionLabel } from '../../src/client/src/utils/app-version';
import {
  APP_RELEASE_DATE,
  APP_RELEASE_SUBTITLE,
  APP_RELEASE_VERSION,
} from '../../src/client/src/utils/release-info';

// @group UnitTests : Footer version label formatting
assert.equal(formatVersionLabel('1.11.0'), 'v1.11.0');
assert.equal(formatVersionLabel('v1.11.0'), 'v1.11.0');
assert.equal(formatVersionLabel(' 1.11.0 '), 'v1.11.0');

// @group EdgeCases : Missing version fallback
assert.equal(formatVersionLabel(''), 'v...');
assert.equal(formatVersionLabel(null), 'v...');
assert.equal(formatVersionLabel(undefined), 'v...');

// @group UnitTests : Shared What's New release label
assert.equal(APP_RELEASE_VERSION, '1.13.0');
assert.equal(APP_RELEASE_DATE, 'October 2026');
assert.equal(APP_RELEASE_SUBTITLE, 'EZ PM2 GUI · October 2026');

const releaseManifests = [
  'package.json',
  'package-lock.json',
  'src/client/package.json',
  'src/client/package-lock.json',
];
for (const manifestPath of releaseManifests) {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../..', manifestPath), 'utf8'));
  assert.equal(manifest.version, APP_RELEASE_VERSION, manifestPath);
  if (manifest.packages) {
    assert.equal(manifest.packages[''].version, APP_RELEASE_VERSION, `${manifestPath} root package`);
  }
}

console.log('app-version tests passed');

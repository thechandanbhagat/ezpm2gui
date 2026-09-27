import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { getConfigDir, configPath, PACKAGE_CONFIG_DIR, migrateConfigDirectory } from '../../src/server/utils/config-dir';

const originalConfigDir = process.env.EZPM2GUI_CONFIG_DIR;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-config-test-'));
const source = path.join(root, 'package-config');
const destination = path.join(root, 'persistent');
fs.mkdirSync(source);
fs.mkdirSync(destination);
const sourceDb = new Database(path.join(source, 'remote-metrics.db'));

try {
  delete process.env.EZPM2GUI_CONFIG_DIR;
  assert.equal(getConfigDir(), PACKAGE_CONFIG_DIR);
  for (const name of ['override-one', 'override-two']) {
    const directory = path.join(root, name);
    process.env.EZPM2GUI_CONFIG_DIR = directory;
    assert.equal(getConfigDir(), directory);
    assert.equal(configPath('nested', 'file.json'), path.join(directory, 'nested', 'file.json'));
    assert.ok(fs.existsSync(path.join(directory, '.ezpm2gui-migration-complete')));
  }

  fs.writeFileSync(path.join(source, 'auth.json'), '{"hash":"test-password"}');
  fs.writeFileSync(path.join(source, 'auth-tokens.json'), '[]');
  fs.writeFileSync(path.join(source, 'remote-connections.json'), '[{"id":"test-remote"}]');
  fs.writeFileSync(path.join(source, 'cron-jobs.json'), '[{"id":"test-job"}]');
  fs.mkdirSync(path.join(source, 'cron-scripts', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(source, 'cron-scripts', 'nested', 'job.sh'), 'echo test');
  fs.writeFileSync(path.join(destination, 'ezpm2gui.env'), 'PORT=3101');
  sourceDb.pragma('journal_mode = WAL');
  sourceDb.pragma('wal_autocheckpoint = 0');
  sourceDb.exec('CREATE TABLE samples (value TEXT); INSERT INTO samples VALUES (\'committed in WAL\')');

  migrateConfigDirectory(source, destination);
  assert.equal(fs.readFileSync(path.join(destination, 'auth.json'), 'utf8'), '{"hash":"test-password"}');
  assert.equal(fs.readFileSync(path.join(destination, 'cron-scripts', 'nested', 'job.sh'), 'utf8'), 'echo test');
  assert.equal(fs.readFileSync(path.join(destination, 'ezpm2gui.env'), 'utf8'), 'PORT=3101');
  assert.ok(!fs.existsSync(path.join(destination, 'remote-metrics.db-wal')));
  assert.ok(!fs.existsSync(path.join(destination, 'remote-metrics.db-shm')));
  const migratedDb = new Database(path.join(destination, 'remote-metrics.db'), { readonly: true });
  try {
    assert.deepEqual(migratedDb.prepare('SELECT value FROM samples').all(), [{ value: 'committed in WAL' }]);
    assert.equal(migratedDb.pragma('integrity_check', { simple: true }), 'ok');
  } finally { migratedDb.close(); }

  // Removing credentials or remotes must survive another startup or package update.
  fs.unlinkSync(path.join(destination, 'auth.json'));
  fs.unlinkSync(path.join(destination, 'remote-connections.json'));
  migrateConfigDirectory(source, destination);
  assert.ok(!fs.existsSync(path.join(destination, 'auth.json')));
  assert.ok(!fs.existsSync(path.join(destination, 'remote-connections.json')));

  // Never copy old credentials or WAL files into a populated destination.
  const existing = path.join(root, 'existing');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'remote-metrics.db'), 'existing database');
  migrateConfigDirectory(source, existing);
  assert.equal(fs.readFileSync(path.join(existing, 'remote-metrics.db'), 'utf8'), 'existing database');
  assert.ok(!fs.existsSync(path.join(existing, 'auth.json')));
  assert.ok(!fs.existsSync(path.join(existing, 'remote-metrics.db-wal')));

  // A copy failure must stop startup, including on the next attempt.
  const incomplete = path.join(root, 'incomplete');
  const copyFile = fs.copyFileSync;
  try {
    fs.copyFileSync = (() => { throw new Error('simulated disk failure'); }) as typeof fs.copyFileSync;
    assert.throws(() => migrateConfigDirectory(source, incomplete), /simulated disk failure/);
  } finally { fs.copyFileSync = copyFile; }
  assert.throws(() => migrateConfigDirectory(source, incomplete), /Incomplete config migration/);
  assert.ok(!fs.existsSync(path.join(incomplete, '.ezpm2gui-migration-complete')));

  console.log('config-dir tests passed (migration, restart, WAL snapshot, existing state, failure recovery)');
} finally {
  sourceDb.close();
  if (originalConfigDir === undefined) delete process.env.EZPM2GUI_CONFIG_DIR;
  else process.env.EZPM2GUI_CONFIG_DIR = originalConfigDir;
  fs.rmSync(root, { recursive: true, force: true });
}

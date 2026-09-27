/**
 * Resolve the directory used for runtime state (auth, remotes, cron, metrics).
 *
 * EZPM2GUI_CONFIG_DIR overrides the default, which is the package's own
 * dist/server/config folder. Systemd units typically set the override via
 * EnvironmentFile so `npm i -g` does not wipe operator data.
 *
 * dotenv is loaded here so a local `.env` still works when this module is
 * imported before index.ts finishes its own dotenv calls. Existing process
 * env (including systemd EnvironmentFile) is never overridden.
 */
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// @group Constants : Packaged fallback + files copied on first use of an override dir
export const PACKAGE_CONFIG_DIR = path.join(__dirname, '../config');

const MIGRATE_FILES = [
  'auth.json',
  'auth-tokens.json',
  'remote-connections.json',
  'cron-jobs.json',
];
const MIGRATION_COMPLETE = '.ezpm2gui-migration-complete';
const MIGRATION_PENDING = '.ezpm2gui-migration-in-progress';
const RUNTIME_ENTRIES = [...MIGRATE_FILES, 'cron-scripts', 'remote-metrics.db', 'remote-metrics.db-wal', 'remote-metrics.db-shm'];
const initializedDirs = new Set<string>();

// @group Utilities : Absolute directory for runtime config files
export function getConfigDir(): string {
  const fromEnv = process.env.EZPM2GUI_CONFIG_DIR?.trim();
  const dir = fromEnv ? path.resolve(fromEnv) : PACKAGE_CONFIG_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const canonicalDir = fs.realpathSync(dir);
  const isPackageDir = fs.existsSync(PACKAGE_CONFIG_DIR) && canonicalDir === fs.realpathSync(PACKAGE_CONFIG_DIR);
  if (fromEnv && !isPackageDir && !initializedDirs.has(canonicalDir)) {
    migrateConfigDirectory(PACKAGE_CONFIG_DIR, dir);
    initializedDirs.add(canonicalDir);
  }
  return dir;
}

// @group Utilities : Join one or more path segments onto the config directory
export function configPath(...parts: string[]): string {
  return path.join(getConfigDir(), ...parts);
}

// @group DatabaseOperations : Initialize an unused destination exactly once across restarts.
export function migrateConfigDirectory(sourceDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const complete = path.join(destDir, MIGRATION_COMPLETE);
  const pending = path.join(destDir, MIGRATION_PENDING);
  if (fs.existsSync(complete)) return;
  if (fs.existsSync(pending)) {
    throw new Error(`Incomplete config migration in ${destDir}. Restore the config backup before retrying; startup stopped to preserve authentication.`);
  }
  if (RUNTIME_ENTRIES.some(name => fs.existsSync(path.join(destDir, name)))) {
    // Never fill gaps in an existing store: a missing password may be intentional.
    fs.writeFileSync(complete, 'Existing runtime state preserved.\n', { flag: 'wx', mode: 0o600 });
    return;
  }

  // Fail closed if any copy fails. The marker also detects an interrupted copy on restart.
  fs.writeFileSync(pending, 'Config migration in progress.\n', { flag: 'wx', mode: 0o600 });
  for (const name of MIGRATE_FILES) {
    const source = path.join(sourceDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destDir, name), fs.constants.COPYFILE_EXCL);
  }
  const scripts = path.join(sourceDir, 'cron-scripts');
  if (fs.existsSync(scripts)) copyDirectory(scripts, path.join(destDir, 'cron-scripts'));

  const sourceDatabase = path.join(sourceDir, 'remote-metrics.db');
  if (fs.existsSync(sourceDatabase)) {
    // VACUUM INTO includes committed WAL data without copying transient WAL/SHM files.
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const db = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
    try {
      const destination = path.join(destDir, 'remote-metrics.db').replace(/'/g, "''");
      db.exec(`VACUUM INTO '${destination}'`);
    } finally {
      db.close();
    }
  }
  fs.renameSync(pending, complete);
}

function copyDirectory(sourceDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirectory(source, destination);
    else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

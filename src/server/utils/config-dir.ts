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
  'remote-metrics.db',
  'remote-metrics.db-wal',
  'remote-metrics.db-shm',
];

let migrated = false;

// @group Utilities : Absolute directory for runtime config files
export function getConfigDir(): string {
  const fromEnv = process.env.EZPM2GUI_CONFIG_DIR?.trim();
  const dir = fromEnv ? path.resolve(fromEnv) : PACKAGE_CONFIG_DIR;
  fs.mkdirSync(dir, { recursive: true });

  if (fromEnv && path.resolve(dir) !== path.resolve(PACKAGE_CONFIG_DIR)) {
    migrateFromPackage(dir);
  }

  return dir;
}

// @group Utilities : Join one or more path segments onto the config directory
export function configPath(...parts: string[]): string {
  return path.join(getConfigDir(), ...parts);
}

// @group DatabaseOperations : Copy packaged runtime files into an empty override dir once
function migrateFromPackage(destDir: string): void {
  if (migrated) return;
  migrated = true;
  if (!fs.existsSync(PACKAGE_CONFIG_DIR)) return;

  let copied = 0;
  for (const name of MIGRATE_FILES) {
    const src = path.join(PACKAGE_CONFIG_DIR, name);
    const dest = path.join(destDir, name);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
        copied += 1;
      } catch (error) {
        console.error(`Failed to migrate ${name} to ${destDir}:`, error);
      }
    }
  }

  const srcScripts = path.join(PACKAGE_CONFIG_DIR, 'cron-scripts');
  const destScripts = path.join(destDir, 'cron-scripts');
  if (fs.existsSync(srcScripts) && fs.statSync(srcScripts).isDirectory()) {
    copied += copyDirIfMissing(srcScripts, destScripts);
  }

  if (copied > 0) {
    console.log(`Migrated ${copied} config file(s) from ${PACKAGE_CONFIG_DIR} to ${destDir}`);
  }
}

// @group Utilities : Recursively copy missing files; never overwrite dest
function copyDirIfMissing(srcDir: string, destDir: string): number {
  let copied = 0;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirIfMissing(src, dest);
    } else if (!fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
        copied += 1;
      } catch (error) {
        console.error(`Failed to migrate ${src} to ${dest}:`, error);
      }
    }
  }
  return copied;
}

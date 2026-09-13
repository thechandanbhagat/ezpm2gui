import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getConfigDir, PACKAGE_CONFIG_DIR } from '../../src/server/utils/config-dir';

const originalConfigDir = process.env.EZPM2GUI_CONFIG_DIR;
let tmpDir: string | undefined;

const restoreEnv = () => {
  if (originalConfigDir === undefined) {
    delete process.env.EZPM2GUI_CONFIG_DIR;
  } else {
    process.env.EZPM2GUI_CONFIG_DIR = originalConfigDir;
  }
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

try {
  delete process.env.EZPM2GUI_CONFIG_DIR;
  assert.equal(getConfigDir(), PACKAGE_CONFIG_DIR);

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpm2gui-config-'));
  process.env.EZPM2GUI_CONFIG_DIR = tmpDir;
  assert.equal(getConfigDir(), path.resolve(tmpDir));
  assert.ok(fs.existsSync(tmpDir));

  console.log('config-dir tests passed');
} finally {
  restoreEnv();
}

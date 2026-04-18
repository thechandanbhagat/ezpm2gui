import { Router } from 'express';
import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';

// @group Types : Update check response shape
interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes?: string;
  publishedAt?: string;
}

// @group Utilities : Read the current installed version from package.json
const getCurrentVersion = (): string => {
  try {
    // Try the package root (works when run from source or dist)
    const candidates = [
      path.resolve(__dirname, '../../../package.json'),
      path.resolve(__dirname, '../../package.json'),
      path.resolve(process.cwd(), 'package.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (pkg.name === 'ezpm2gui') return pkg.version as string;
      }
    }
  } catch {
    // fall through
  }
  return '0.0.0';
};

// @group Utilities : Fetch latest version info from npm registry (no external deps)
const fetchNpmLatest = (): Promise<{ version: string; description?: string; publishedAt?: string }> =>
  new Promise((resolve, reject) => {
    const req = https.get(
      'https://registry.npmjs.org/ezpm2gui/latest',
      { headers: { Accept: 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({
              version: json.version as string,
              description: json.description as string | undefined,
              publishedAt: json.time?.modified as string | undefined,
            });
          } catch {
            reject(new Error('Failed to parse npm registry response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('npm registry request timed out')); });
  });

// @group Utilities : Compare semver strings — returns true if b is newer than a
const isNewer = (current: string, latest: string): boolean => {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
};

const router: Router = Router();

// @group CheckUpdate : GET /api/update/check — returns current vs latest npm version
router.get('/check', async (_req, res) => {
  try {
    const currentVersion = getCurrentVersion();
    const { version: latestVersion, publishedAt } = await fetchNpmLatest();
    const updateAvailable = isNewer(currentVersion, latestVersion);

    const result: VersionInfo = {
      currentVersion,
      latestVersion,
      updateAvailable,
      publishedAt,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Update check failed:', err);
    res.status(503).json({ success: false, error: (err as Error).message || 'Failed to reach npm registry' });
  }
});

// @group InstallUpdate : POST /api/update/install — installs ezpm2gui@latest globally
// Streams progress lines as newline-delimited JSON (ndjson) so the client can read incrementally.
router.post('/install', (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (type: 'log' | 'error' | 'done' | 'fail', message: string) => {
    res.write(JSON.stringify({ type, message }) + '\n');
  };

  send('log', 'Starting update — running npm install -g ezpm2gui@latest...');

  // Use `npm` with execFile for safety — no shell injection possible
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['install', '-g', 'ezpm2gui@latest'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split('\n').filter(Boolean).forEach((line) => send('log', line));
  });

  child.stderr.on('data', (chunk: Buffer) => {
    // npm writes progress to stderr — treat as log unless it's an actual error keyword
    const text = chunk.toString();
    const isError = /^npm (ERR|error)/i.test(text.trim());
    text.split('\n').filter(Boolean).forEach((line) => send(isError ? 'error' : 'log', line));
  });

  child.on('close', (code) => {
    if (code === 0) {
      send('done', 'Update installed successfully. Reload the page to use the new frontend. Restart the server to apply backend changes.');
    } else {
      send('fail', `npm exited with code ${code}. Update may have failed.`);
    }
    res.end();
  });

  child.on('error', (err) => {
    send('fail', `Failed to run npm: ${err.message}`);
    res.end();
  });
});

// @group RestartServer : POST /api/update/restart — graceful server restart (relies on process manager to respawn)
router.post('/restart', (_req, res) => {
  res.json({ success: true, message: 'Server will restart in 1 second.' });
  setTimeout(() => {
    console.log('[ezpm2gui] Graceful restart triggered via API.');
    process.exit(0);
  }, 1000);
});

export default router;

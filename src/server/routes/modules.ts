import { Router } from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import pm2 from 'pm2';
import { executePM2Command } from '../utils/pm2-connection';

const router: Router = Router();

// Run the distributed PM2 CLI with this Node runtime, including on Windows.
const runPM2CLI = (args: string[]): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(process.execPath, [require.resolve('pm2/bin/pm2'), ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || `PM2 command failed (${error.code})`));
      else resolve({ stdout, stderr });
    });
  });

// @group APIEndpoints : List installed PM2 modules
router.get('/', async (_req, res) => {
  try {
    // Use PM2 Node.js API — modules appear as regular processes with module metadata
    const processList = await executePM2Command<any[]>((cb) => pm2.list(cb));

    // PM2 modules have pm2_env.pmx_module === true
    const modules = processList
      .filter((proc: any) => proc.pm2_env?.pmx_module === true)
      .map((proc: any) => ({
        name: proc.name,
        version: proc.pm2_env?.version || proc.pm2_env?.MODULE_VERSION || 'N/A',
        status: proc.pm2_env?.status || 'unknown',
        pid: proc.pid,
        pm_id: proc.pm_id,
      }));

    res.json(modules);
  } catch (error: any) {
    // Fallback: parse pm2 module:list CLI output
    try {
      const { stdout } = await runPM2CLI(['module:list']);

      const moduleLines = stdout
        .split('\n')
        .filter(line => line.includes('│') && !line.includes('Module') && line.trim() !== '');

      const modules = moduleLines
        .map(line => {
          const parts = line.split('│').map(part => part.trim()).filter(Boolean);
          if (parts.length >= 3) {
            return { name: parts[0], version: parts[1], status: parts[2] };
          }
          return null;
        })
        .filter(Boolean);

      res.json(modules);
    } catch (fallbackError: any) {
      res.status(500).json({
        error: 'Failed to list PM2 modules',
        details: fallbackError.message
      });
    }
  }
});

// @group APIEndpoints : Install a PM2 module
router.post('/install', async (req, res) => {
  const { moduleName } = req.body;

  if (!moduleName) {
    return res.status(400).json({ error: 'Module name is required' });
  }

  // Basic validation — only allow alphanumeric, @, /, -, .
  if (!/^[@a-zA-Z0-9/_\-.]+$/.test(moduleName)) {
    return res.status(400).json({ error: 'Invalid module name' });
  }

  try {
    const { stdout } = await runPM2CLI(['install', moduleName]);
    res.json({
      success: true,
      message: `Successfully installed module: ${moduleName}`,
      details: stdout
    });
  } catch (error: any) {
    res.status(500).json({
      error: `Failed to install module: ${moduleName}`,
      details: error.message
    });
  }
});

// @group APIEndpoints : Uninstall a PM2 module
router.delete('/:moduleName', async (req, res) => {
  const { moduleName } = req.params;

  if (!moduleName) {
    return res.status(400).json({ error: 'Module name is required' });
  }

  // Basic validation
  if (!/^[@a-zA-Z0-9/_\-.]+$/.test(moduleName)) {
    return res.status(400).json({ error: 'Invalid module name' });
  }

  try {
    const { stdout } = await runPM2CLI(['uninstall', moduleName]);
    res.json({
      success: true,
      message: `Successfully uninstalled module: ${moduleName}`,
      details: stdout
    });
  } catch (error: any) {
    res.status(500).json({
      error: `Failed to uninstall module: ${moduleName}`,
      details: error.message
    });
  }
});

// PM2 resolves PM2_HOME, platform defaults and the optional module config override.
const moduleConfPath = (): string => require('pm2/paths')().PM2_MODULE_CONF_FILE;

// @group APIEndpoints : Get config for a specific installed module
router.get('/:moduleName/config', (req, res) => {
  const { moduleName } = req.params;
  if (!/^[@a-zA-Z0-9/_\-.]+$/.test(moduleName)) {
    return res.status(400).json({ error: 'Invalid module name' });
  }

  const confFile = moduleConfPath();
  if (!fs.existsSync(confFile)) {
    return res.json({ config: {} });
  }

  try {
    const raw = JSON.parse(fs.readFileSync(confFile, 'utf8'));
    // PM2 stores module config under the module name key
    const config: Record<string, string> = raw[moduleName] ?? {};
    res.json({ config });
  } catch {
    res.status(500).json({ error: 'Failed to read module configuration' });
  }
});

// @group APIEndpoints : Set one or more config keys for an installed module
router.put('/:moduleName/config', async (req, res) => {
  const { moduleName } = req.params;
  const { config } = req.body as { config: Record<string, string> };

  if (!/^[@a-zA-Z0-9/_\-.]+$/.test(moduleName)) {
    return res.status(400).json({ error: 'Invalid module name' });
  }
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config object is required' });
  }

  // Validate all keys — no shell metacharacters
  for (const key of Object.keys(config)) {
    if (!/^[a-zA-Z0-9_\-.]+$/.test(key)) {
      return res.status(400).json({ error: `Invalid config key: ${key}` });
    }
  }

  try {
    // Run pm2 set for each key sequentially
    for (const [key, value] of Object.entries(config)) {
      await runPM2CLI(['set', `${moduleName}:${key}`, String(value)]);
    }
    res.json({ success: true, message: `Configuration updated for ${moduleName}` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update configuration', details: error.message });
  }
});

export default router;

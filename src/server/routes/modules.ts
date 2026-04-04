import { Router } from 'express';
import { exec } from 'child_process';
import pm2 from 'pm2';
import { executePM2Command } from '../utils/pm2-connection';

const router: Router = Router();

// @group Utilities : Resolve pm2 binary path via shell
const runPM2CLI = (args: string): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    // Use shell so the OS resolves the global pm2 binary from PATH
    const child = exec(`pm2 ${args}`);
    let out = '';
    let err = '';
    child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err || `pm2 exited with code ${code}`));
      } else {
        resolve({ stdout: out, stderr: err });
      }
    });
    child.on('error', (e) => reject(e));
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
      const { stdout } = await runPM2CLI('module:list');

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
    const { stdout } = await runPM2CLI(`install ${moduleName}`);
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
    const { stdout } = await runPM2CLI(`uninstall ${moduleName}`);
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

export default router;

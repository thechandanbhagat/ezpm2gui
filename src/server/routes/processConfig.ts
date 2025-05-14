import { Router } from 'express';
import pm2 from 'pm2';
import fs from 'fs';
import path from 'path';

const router: Router = Router();

// Get current configuration for a process
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  pm2.connect((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }

    pm2.describe(id, (err, processDesc: any) => {
      pm2.disconnect();
      if (err || !processDesc || processDesc.length === 0) {
        res.status(404).json({ error: 'Process not found' });
        return;
      }

      const process = processDesc[0];
      const pm2Env = process.pm2_env;
      
      // Extract configuration from PM2 environment
      const config = {
        name: process.name,
        script: pm2Env.pm_exec_path,
        cwd: pm2Env.pm_cwd,
        interpreter: pm2Env.exec_interpreter,
        instances: pm2Env.instances || 1,
        exec_mode: pm2Env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
        autorestart: pm2Env.autorestart,
        watch: pm2Env.watch,
        ignore_watch: pm2Env.ignore_watch || [],
        env: pm2Env.env || {},
        max_memory_restart: pm2Env.max_memory_restart || '150M'
      };
      
      res.json(config);
    });
  });
});

// Update configuration for a process
router.post('/:id', (req, res) => {
  const { id } = req.params;
  const config = req.body;
  
  if (!config) {
    res.status(400).json({ error: 'Configuration data is required' });
    return;
  }

  pm2.connect(async (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }

    try {
      // First get the current process to find its ecosystem file if any
      const describePromise = new Promise((resolve, reject) => {
        pm2.describe(id, (err, processDesc: any) => {
          if (err || !processDesc || processDesc.length === 0) {
            reject(new Error('Process not found'));
            return;
          }
          resolve(processDesc[0]);
        });
      });
      
      const process = await describePromise as any;
      
      // Update process via PM2 API
      const updatePromise = new Promise((resolve, reject) => {
        // Stop the process first
        pm2.stop(id, (err) => {
          if (err) {
            reject(new Error(`Failed to stop process: ${err.message}`));
            return;          }
          
          // Delete the process
          // TypeScript doesn't recognize 'del' method, so we're using it with a type assertion
          (pm2 as any).del(id, (err: Error | null) => {
            if (err) {
              reject(new Error(`Failed to delete process: ${err.message}`));
              return;
            }
            
            // Start with new configuration
            pm2.start({
              name: config.name,
              script: config.script,
              cwd: config.cwd,
              interpreter: config.interpreter,
              instances: config.instances,
              exec_mode: config.exec_mode,
              autorestart: config.autorestart,
              watch: config.watch,
              ignore_watch: config.ignore_watch,
              env: config.env,
              max_memory_restart: config.max_memory_restart
            }, (err) => {
              if (err) {
                reject(new Error(`Failed to start process with new config: ${err.message}`));
                return;
              }
              resolve(true);
            });
          });
        });
      });
      
      await updatePromise;
      pm2.disconnect();
      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error: any) {
      pm2.disconnect();
      res.status(500).json({ error: error.message || 'Failed to update configuration' });
    }
  });
});

export default router;

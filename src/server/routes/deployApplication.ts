import { Router } from 'express';
import pm2 from 'pm2';
import path from 'path';
import fs from 'fs';

const router: Router = Router();

// Deploy a new application
router.post('/', (req, res) => {
  const {
    name,
    script,
    cwd,
    instances,
    exec_mode,
    autorestart,
    watch,
    max_memory_restart,
    env
  } = req.body;
  
  // Validate required fields
  if (!name || !script) {
    return res.status(400).json({ error: 'Name and script path are required' });
  }
  
  // Validate script path exists
  if (!fs.existsSync(script)) {
    return res.status(400).json({ error: `Script file not found: ${script}` });
  }
  
  // Create deployment configuration
  const appConfig = {
    name,
    script,
    cwd: cwd || path.dirname(script),
    instances: parseInt(instances) || 1,
    exec_mode: exec_mode || 'fork',
    autorestart: autorestart !== undefined ? autorestart : true,
    watch: watch || false,
    max_memory_restart: max_memory_restart || '150M',
    env: env || {}
  };
  
  pm2.connect((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to connect to PM2' });
    }
    
    pm2.start(appConfig, (err) => {
      pm2.disconnect();
      
      if (err) {
        console.error('PM2 start error:', err);
        return res.status(500).json({
          error: `Failed to deploy application: ${err.message || 'Unknown error'}`
        });
      }
      
      res.json({
        success: true,
        message: `Application ${name} deployed successfully`
      });
    });
  });
});

// Generate ecosystem.config.js file
router.post('/generate-ecosystem', (req, res) => {
  pm2.connect(async (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to connect to PM2' });
    }
    
    try {
      // Get all processes
      const listPromise = new Promise((resolve, reject) => {
        pm2.list((err, processList) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(processList);
        });
      });
      
      const processList = await listPromise as any[];
      
      // Filter processes if needed
      let filteredProcesses = processList;
      if (req.body.includeAllProcesses === false) {
        filteredProcesses = processList.filter(proc => proc.pm2_env.status === 'online');
      }
      
      // Create ecosystem config
      const apps = filteredProcesses.map(proc => {
        const pm2Env = proc.pm2_env;
        
        return {
          name: proc.name,
          script: pm2Env.pm_exec_path,
          cwd: pm2Env.pm_cwd,
          instances: pm2Env.instances || 1,
          exec_mode: pm2Env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
          autorestart: pm2Env.autorestart,
          watch: pm2Env.watch,
          ignore_watch: pm2Env.ignore_watch || [],
          max_memory_restart: pm2Env.max_memory_restart || '150M',
          env: pm2Env.env || {}
        };
      });
      
      const ecosystemConfig = `module.exports = {
  apps: ${JSON.stringify(apps, null, 2)}
};`;
      
      // Create the file (either at specified path or default location)
      const filePath = req.body.path || path.join(process.cwd(), 'ecosystem.config.js');
      fs.writeFileSync(filePath, ecosystemConfig);
      
      pm2.disconnect();
      res.json({
        success: true,
        message: 'Ecosystem file generated successfully',
        path: filePath
      });
    } catch (error: any) {
      pm2.disconnect();
      res.status(500).json({ error: error.message || 'Failed to generate ecosystem file' });
    }
  });
});

// Preview ecosystem.config.js content
router.get('/generate-ecosystem-preview', (req, res) => {
  pm2.connect(async (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to connect to PM2' });
    }
    
    try {
      // Get all processes
      const listPromise = new Promise((resolve, reject) => {
        pm2.list((err, processList) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(processList);
        });
      });
      
      const processList = await listPromise as any[];
      
      // Create ecosystem config
      const apps = processList.map(proc => {
        const pm2Env = proc.pm2_env;
        
        return {
          name: proc.name,
          script: pm2Env.pm_exec_path,
          cwd: pm2Env.pm_cwd,
          instances: pm2Env.instances || 1,
          exec_mode: pm2Env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
          autorestart: pm2Env.autorestart,
          watch: pm2Env.watch,
          ignore_watch: pm2Env.ignore_watch || [],
          max_memory_restart: pm2Env.max_memory_restart || '150M',
          env: pm2Env.env || {}
        };
      });
      
      const ecosystemConfig = `module.exports = {
  apps: ${JSON.stringify(apps, null, 2)}
};`;
      
      pm2.disconnect();
      res.json({
        success: true,
        content: ecosystemConfig
      });
    } catch (error: any) {
      pm2.disconnect();
      res.status(500).json({ error: error.message || 'Failed to generate ecosystem preview' });
    }
  });
});

export default router;

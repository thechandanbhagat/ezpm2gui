import { Router } from 'express';
import pm2 from 'pm2';
import path from 'path';
import fs from 'fs';
import { projectSetupService } from '../services/ProjectSetupService';

const router: Router = Router();

// Deploy a new application (SSE streaming)
router.post('/', async (req, res) => {
  const {
    name,
    script,
    cwd,
    namespace,
    instances,
    exec_mode,
    autorestart,
    watch,
    max_memory_restart,
    env,
    appType,
    autoSetup = true
  } = req.body;

  // Validate required fields before starting SSE
  if (!name || !script) {
    return res.status(400).json({ error: 'Name and script path are required' });
  }
  if (!fs.existsSync(script)) {
    return res.status(400).json({ error: `Script file not found: ${script}` });
  }

  // Switch to SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type: string, data: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    }
  };
  const log = (message: string) => send('log', { message });
  const done = (success: boolean, extra: Record<string, unknown> = {}) => {
    send('done', { success, ...extra });
    res.end();
  };

  try {
    const projectPath = cwd || path.dirname(script);
    let finalEnv = env || {};
    let interpreterPath = '';
    let setupResult = null;

    // Auto-detect project type
    let detectedType = appType;
    if (!detectedType) {
      detectedType = projectSetupService.detectProjectType(projectPath);
      if (detectedType) {
        log(`Auto-detected project type: ${detectedType}`);
      }
    }

    // Run project setup
    if (autoSetup && detectedType && ['node', 'python', 'dotnet'].includes(detectedType)) {
      log(`Running ${detectedType} project setup...`);
      try {
        setupResult = await projectSetupService.setupProject(projectPath, detectedType, log);

        if (!setupResult.success) {
          return done(false, {
            error: 'Project setup failed',
            details: setupResult.errors,
            warnings: setupResult.warnings
          });
        }

        finalEnv = { ...setupResult.environment, ...finalEnv };
        if (setupResult.interpreterPath) {
          interpreterPath = setupResult.interpreterPath;
        }
      } catch (setupError) {
        return done(false, {
          error: 'Project setup failed',
          details: setupError instanceof Error ? setupError.message : 'Unknown setup error'
        });
      }
    }

    // Build PM2 config
    const appConfig: any = {
      name,
      script,
      cwd: projectPath,
      namespace: namespace || 'default',
      instances: parseInt(instances) || 1,
      exec_mode: exec_mode || 'fork',
      autorestart: autorestart !== undefined ? autorestart : true,
      watch: watch || false,
      max_memory_restart: max_memory_restart || '150M',
      env: finalEnv
    };

    if (detectedType === 'python' && interpreterPath) {
      appConfig.interpreter = interpreterPath;
    } else if (detectedType === 'dotnet') {
      appConfig.interpreter = 'dotnet';
      const publishedDll = path.join(projectPath, 'publish', `${path.basename(projectPath)}.dll`);
      if (fs.existsSync(publishedDll)) {
        appConfig.script = publishedDll;
      }
    }

    log(`Starting PM2 process: ${name}`);

    await new Promise<void>((resolve, reject) => {
      pm2.connect((err) => {
        if (err) return reject(err);
        pm2.start(appConfig, (startErr) => {
          pm2.disconnect();
          if (startErr) return reject(startErr);
          resolve();
        });
      });
    });

    log(`Process "${name}" started successfully.`);
    done(true, {
      message: `Application ${name} deployed successfully`,
      setupResult: setupResult ? { steps: setupResult.steps, warnings: setupResult.warnings } : null
    });

  } catch (error) {
    console.error('Deployment error:', error);
    done(false, {
      error: 'Deployment failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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

// Detect project type
router.post('/detect-project', (req, res) => {
  const { projectPath } = req.body;
  
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }
  
  if (!fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Project path does not exist' });
  }
  
  try {
    const projectType = projectSetupService.detectProjectType(projectPath);
    const config = projectType ? projectSetupService.getProjectConfig(projectType) : null;
    
    res.json({
      success: true,
      projectType,
      config: config ? {
        name: config.name,
        defaultConfig: config.defaultConfig,
        setupSteps: config.setup.steps.length
      } : null
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to detect project type',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Setup project (without deployment)
router.post('/setup-project', async (req, res) => {
  const { projectPath, projectType } = req.body;
  
  if (!projectPath || !projectType) {
    return res.status(400).json({ error: 'Project path and type are required' });
  }
  
  if (!fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Project path does not exist' });
  }
  
  try {
    const setupResult = await projectSetupService.setupProject(projectPath, projectType);
    
    res.json({
      success: setupResult.success,
      steps: setupResult.steps,
      errors: setupResult.errors,
      warnings: setupResult.warnings,
      environment: setupResult.environment,
      interpreterPath: setupResult.interpreterPath
    });
  } catch (error) {
    res.status(500).json({
      error: 'Project setup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get supported project types
router.get('/project-types', (req, res) => {
  try {
    const types = projectSetupService.getSupportedProjectTypes();
    const typeConfigs = types.map(type => {
      const config = projectSetupService.getProjectConfig(type);
      return {
        type,
        name: config?.name,
        defaultConfig: config?.defaultConfig
      };
    });
    
    res.json({
      success: true,
      types: typeConfigs
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get project types',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

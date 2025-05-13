import { Router } from 'express';
import { spawn } from 'child_process';

const router: Router = Router();

// List installed modules
router.get('/', (req, res) => {
  const pm2Command = spawn('pm2', ['module:list']);
  let output = '';
  let errorOutput = '';

  pm2Command.stdout.on('data', (data) => {
    output += data.toString();
  });

  pm2Command.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pm2Command.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ 
        error: 'Failed to list PM2 modules', 
        details: errorOutput 
      });
    }

    // Parse the output to get module information
    try {
      const moduleLines = output.split('\n').filter(line => 
        line.includes('│') && !line.includes('Module') && line.trim() !== '');

      const modules = moduleLines.map(line => {
        const parts = line.split('│').map(part => part.trim()).filter(Boolean);
        if (parts.length >= 3) {
          return {
            name: parts[0],
            version: parts[1],
            status: parts[2]
          };
        }
        return null;
      }).filter(Boolean);

      res.json(modules);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to parse PM2 modules', 
        details: error 
      });
    }
  });
});

// Install a module
router.post('/install', (req, res) => {
  const { moduleName } = req.body;
  
  if (!moduleName) {
    return res.status(400).json({ error: 'Module name is required' });
  }
  
  const pm2Command = spawn('pm2', ['install', moduleName]);
  let output = '';
  let errorOutput = '';

  pm2Command.stdout.on('data', (data) => {
    output += data.toString();
  });

  pm2Command.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pm2Command.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ 
        error: `Failed to install module: ${moduleName}`, 
        details: errorOutput 
      });
    }
    
    res.json({ 
      success: true, 
      message: `Successfully installed module: ${moduleName}`,
      details: output
    });
  });
});

// Uninstall a module
router.delete('/:moduleName', (req, res) => {
  const { moduleName } = req.params;
  
  if (!moduleName) {
    return res.status(400).json({ error: 'Module name is required' });
  }
  
  const pm2Command = spawn('pm2', ['uninstall', moduleName]);
  let output = '';
  let errorOutput = '';

  pm2Command.stdout.on('data', (data) => {
    output += data.toString();
  });

  pm2Command.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pm2Command.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ 
        error: `Failed to uninstall module: ${moduleName}`, 
        details: errorOutput 
      });
    }
    
    res.json({ 
      success: true, 
      message: `Successfully uninstalled module: ${moduleName}`,
      details: output
    });
  });
});

export default router;

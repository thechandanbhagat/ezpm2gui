import { Router } from 'express';
import pm2 from 'pm2';

const router: Router = Router();

// Get cluster information for a specific process
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
      const clusterInfo = {
        pm_id: process.pm_id,
        name: process.name,
        instances: process.pm2_env.instances,
        exec_mode: process.pm2_env.exec_mode,
        isCluster: process.pm2_env.exec_mode === 'cluster_mode'
      };
      
      res.json(clusterInfo);
    });
  });
});

// Scale process (change number of instances)
router.post('/:id/scale', (req, res) => {
  const { id } = req.params;
  const { instances } = req.body;
    if (!instances || isNaN(parseInt(instances))) {
    res.status(400).json({ error: 'Valid number of instances is required' });
    return;
  }

  pm2.connect((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }

    // Using PM2 API to scale a process
    // TypeScript doesn't recognize 'scale' method, so we're using it with a type assertion
    (pm2 as any).scale(id, parseInt(instances), (err: Error | null) => {
      pm2.disconnect();
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to scale process' });
        return;
      }
      
      res.json({ success: true, message: `Process ${id} scaled to ${instances} instances` });
    });
  });
});

// Reload instances (zero-downtime reload)
router.post('/:id/reload', (req, res) => {
  const { id } = req.params;
  
  pm2.connect((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }

    pm2.reload(id, (err) => {
      pm2.disconnect();
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reload process' });
        return;
      }
      
      res.json({ success: true, message: `Process ${id} reloaded with zero-downtime` });
    });
  });
});

// Change execution mode between 'fork' and 'cluster'
router.post('/:id/exec-mode', (req, res) => {
  const { id } = req.params;
  const { mode } = req.body;
  
  if (!mode || (mode !== 'fork' && mode !== 'cluster')) {
    res.status(400).json({ error: 'Valid execution mode (fork or cluster) is required' });
    return;
  }

  pm2.connect((err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }

    // First get the current process information to preserve settings
    pm2.describe(id, (err, processDesc: any) => {
      if (err || !processDesc || processDesc.length === 0) {
        pm2.disconnect();
        res.status(404).json({ error: 'Process not found' });
        return;
      }

      const process = processDesc[0];
      const pm2Env = process.pm2_env;
      
      // Update the execution mode
      const updateOptions = {
        script: pm2Env.pm_exec_path,
        name: process.name,
        instances: pm2Env.instances || 1,
        exec_mode: mode === 'cluster' ? 'cluster_mode' : 'fork_mode',
        // Preserve other settings
        cwd: pm2Env.pm_cwd,
        watch: pm2Env.watch || false,
        ignore_watch: pm2Env.ignore_watch || [],
        env: pm2Env.env || {}
      };

      // Stop the existing process
      pm2.stop(id, (stopErr) => {
        if (stopErr) {
          pm2.disconnect();
          console.error(stopErr);
          res.status(500).json({ error: 'Failed to stop process for exec mode change' });
          return;
        }

        // Delete the existing process
        (pm2 as any).del(id, (delErr: Error | null) => {
          if (delErr) {
            pm2.disconnect();
            console.error(delErr);
            res.status(500).json({ error: 'Failed to delete process for exec mode change' });
            return;
          }

          // Start with new settings
          pm2.start(updateOptions, (startErr) => {
            pm2.disconnect();
            if (startErr) {
              console.error(startErr);
              res.status(500).json({ error: 'Failed to restart process with new exec mode' });
              return;
            }
            
            res.json({ 
              success: true, 
              message: `Process ${process.name} execution mode changed to ${mode}` 
            });
          });
        });
      });
    });
  });
});

export default router;

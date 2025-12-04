/**
 * Cron Jobs API Routes
 * Manages scheduled tasks using PM2's cron_restart feature
 */

import { Router, Request, Response } from 'express';
import CronJobService from '../services/CronJobService';
import { CronJobConfig } from '../../types/cron';

const router: Router = Router();

/**
 * GET /api/cron-jobs
 * Get all cron jobs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const jobs = CronJobService.getCronJobs();
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    console.error('Error getting cron jobs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cron-jobs/status
 * Get status of all cron jobs including PM2 process info
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const statuses = await CronJobService.getCronJobsStatus();
    res.json({ success: true, data: statuses });
  } catch (error: any) {
    console.error('Error getting cron job statuses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cron-jobs/:id
 * Get a specific cron job by ID
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const job = CronJobService.getCronJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Cron job not found' });
    }
    res.json({ success: true, data: job });
  } catch (error: any) {
    console.error('Error getting cron job:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-jobs
 * Create a new cron job
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const config: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'> = req.body;
    
    // Validate required fields
    if (!config.name || !config.scriptType || !config.cronExpression) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, scriptType, cronExpression'
      });
    }

    // Validate script mode specific requirements
    if (config.scriptMode === 'file' && !config.scriptPath) {
      return res.status(400).json({
        success: false,
        error: 'Script path is required when using file mode'
      });
    }

    if (config.scriptMode === 'inline' && !config.inlineScript) {
      return res.status(400).json({
        success: false,
        error: 'Inline script content is required when using inline mode'
      });
    }

    const job = await CronJobService.createCronJob(config);
    res.json({ success: true, data: job });
  } catch (error: any) {
    console.error('Error creating cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/cron-jobs/:id
 * Update a cron job
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates: Partial<CronJobConfig> = req.body;
    const job = await CronJobService.updateCronJob(req.params.id, updates);
    res.json({ success: true, data: job });
  } catch (error: any) {
    console.error('Error updating cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/cron-jobs/:id
 * Delete a cron job
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await CronJobService.deleteCronJob(req.params.id);
    res.json({ success: true, message: 'Cron job deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-jobs/:id/toggle
 * Toggle cron job enabled state
 */
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const job = await CronJobService.toggleCronJob(req.params.id);
    res.json({ success: true, data: job });
  } catch (error: any) {
    console.error('Error toggling cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-jobs/:id/start
 * Manually start a cron job
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    await CronJobService.startCronJob(req.params.id);
    res.json({ success: true, message: 'Cron job started successfully' });
  } catch (error: any) {
    console.error('Error starting cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-jobs/:id/stop
 * Manually stop a cron job
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    await CronJobService.stopCronJob(req.params.id);
    res.json({ success: true, message: 'Cron job stopped successfully' });
  } catch (error: any) {
    console.error('Error stopping cron job:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-jobs/validate
 * Validate a cron expression
 */
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { expression } = req.body;
    
    if (!expression) {
      return res.status(400).json({ success: false, error: 'Expression is required' });
    }

    const validation = CronJobService.validateCronExpression(expression);
    const description = CronJobService.getCronDescription(expression);
    
    res.json({
      success: true,
      data: {
        ...validation,
        description
      }
    });
  } catch (error: any) {
    console.error('Error validating cron expression:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Switch,
  Tooltip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Schedule as ScheduleIcon,
  Code as CodeIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import axios from 'axios';
import CronJobDialog from './CronJobDialog';
import ConfirmationDialog from './ConfirmationDialog';
import PageHeader from './PageHeader';
import { CronJobConfig, CronJobStatus } from '../types/cron';

// @group CronJobsPage : Cron job management page
const CronJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<CronJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobConfig | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  // @group DataFetching : Load cron jobs from API
  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/cron-jobs/status');
      if (response.data.success) setJobs(response.data.data);
    } catch (error) {
      console.error('Error fetching cron jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  // @group Handlers : CRUD and toggle handlers
  const handleCreate = () => { setEditingJob(undefined); setDialogOpen(true); };
  const handleEdit   = (job: CronJobConfig) => { setEditingJob(job); setDialogOpen(true); };

  const handleSave = async (jobData: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingJob) {
        await axios.put(`/api/cron-jobs/${editingJob.id}`, jobData);
      } else {
        await axios.post('/api/cron-jobs', jobData);
      }
      fetchJobs();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving cron job:', error);
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!jobToDelete) return;
    try {
      await axios.delete(`/api/cron-jobs/${jobToDelete}`);
      fetchJobs();
      setDeleteConfirmOpen(false);
      setJobToDelete(null);
    } catch (error) {
      console.error('Error deleting cron job:', error);
    }
  };

  const handleToggle = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/toggle`); fetchJobs(); }
    catch (error) { console.error('Error toggling cron job:', error); }
  };

  const handleStart = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/start`); fetchJobs(); }
    catch (error) { console.error('Error starting cron job:', error); }
  };

  const handleStop = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/stop`); fetchJobs(); }
    catch (error) { console.error('Error stopping cron job:', error); }
  };

  // @group Utilities : Chip color helpers
  const getScriptTypeColor = (type: string) => {
    const colors: Record<string, string> = { node: 'success', python: 'info', shell: 'warning', dotnet: 'secondary' };
    return colors[type] || 'default';
  };

  // @group Render : Page layout
  return (
    <Box>
      <PageHeader
        title="Cron Jobs"
        subtitle="Schedule and manage automated tasks using PM2's cron feature"
        actions={
          <>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchJobs} disabled={loading}>
              Refresh
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Create Job
            </Button>
          </>
        }
      />

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          { label: 'Total',     value: jobs.length,                                        color: 'primary' },
          { label: 'Enabled',   value: jobs.filter(j => j.config.enabled).length,          color: 'success' },
          { label: 'Running',   value: jobs.filter(j => j.isRunning).length,               color: 'info'    },
          { label: 'Scheduled', value: jobs.filter(j => j.config.enabled && !j.isRunning).length, color: 'warning' },
        ].map(({ label, value, color }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="h5" color={`${color}.main`} sx={{ fontWeight: 700 }}>
                  {value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Jobs Table */}
      {jobs.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <ScheduleIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>No cron jobs yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first scheduled task to automate your workflows
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Create First Job
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Next Run</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.config.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{job.config.name}</Typography>
                    {job.config.description && (
                      <Typography variant="caption" color="text.secondary">{job.config.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<CodeIcon />}
                      label={job.config.scriptType.toUpperCase()}
                      color={getScriptTypeColor(job.config.scriptType) as any}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {job.config.cronExpression}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color={job.nextExecution ? 'text.primary' : 'text.secondary'}>
                      {job.nextExecution ? new Date(job.nextExecution).toLocaleString() : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {job.isRunning ? (
                      <Chip icon={<CheckCircleIcon />} label="Running" color="success" />
                    ) : job.config.enabled ? (
                      <Chip label="Scheduled" />
                    ) : (
                      <Chip icon={<ErrorIcon />} label="Disabled" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={job.config.enabled} onChange={() => handleToggle(job.config.id)} color="success" size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {job.isRunning ? (
                        <Tooltip title="Stop">
                          <IconButton onClick={() => handleStop(job.config.id)} color="error">
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Start">
                          <IconButton onClick={() => handleStart(job.config.id)} color="success">
                            <PlayIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Edit">
                        <IconButton onClick={() => handleEdit(job.config)} color="primary">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton onClick={() => { setJobToDelete(job.config.id); setDeleteConfirmOpen(true); }} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialogs */}
      <CronJobDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingJob(undefined); }}
        onSave={handleSave}
        editJob={editingJob}
      />
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete Cron Job"
        message="Are you sure you want to delete this cron job? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setJobToDelete(null); }}
        type="danger"
      />
    </Box>
  );
};

export default CronJobsPage;

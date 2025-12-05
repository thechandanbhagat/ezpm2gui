import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
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
  Alert,
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
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import CronJobDialog from './CronJobDialog';
import ConfirmationDialog from './ConfirmationDialog';
import { CronJobConfig, CronJobStatus } from '../types/cron';

const CronJobsPage: React.FC = () => {
  const theme = useTheme();
  const [jobs, setJobs] = useState<CronJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobConfig | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/cron-jobs/status');
      if (response.data.success) {
        setJobs(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching cron jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleCreate = () => {
    setEditingJob(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (job: CronJobConfig) => {
    setEditingJob(job);
    setDialogOpen(true);
  };

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
    try {
      await axios.post(`/api/cron-jobs/${jobId}/toggle`);
      fetchJobs();
    } catch (error) {
      console.error('Error toggling cron job:', error);
    }
  };

  const handleStart = async (jobId: string) => {
    try {
      await axios.post(`/api/cron-jobs/${jobId}/start`);
      fetchJobs();
    } catch (error) {
      console.error('Error starting cron job:', error);
    }
  };

  const handleStop = async (jobId: string) => {
    try {
      await axios.post(`/api/cron-jobs/${jobId}/stop`);
      fetchJobs();
    } catch (error) {
      console.error('Error stopping cron job:', error);
    }
  };

  const getScriptTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      node: 'success',
      python: 'info',
      shell: 'warning',
      dotnet: 'secondary',
    };
    return colors[type] || 'default';
  };

  const getScriptTypeIcon = (type: string) => {
    return <CodeIcon fontSize="small" />;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon sx={{ fontSize: 40 }} />
            Cron Jobs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Schedule and manage automated tasks using PM2's cron feature
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchJobs}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Create Job
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: 'white',
            }}
          >
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {jobs.length}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Total Jobs
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
              color: 'white',
            }}
          >
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {jobs.filter((j) => j.config.enabled).length}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Enabled
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.info.dark})`,
              color: 'white',
            }}
          >
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {jobs.filter((j) => j.isRunning).length}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Running
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`,
              color: 'white',
            }}
          >
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {jobs.filter((j) => j.config.enabled && !j.isRunning).length}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Scheduled
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Jobs Table */}
      {jobs.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ScheduleIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No cron jobs yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first scheduled task to automate your workflows
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Create First Job
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Schedule</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Next Run</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Enabled</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.config.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {job.config.name}
                      </Typography>
                      {job.config.description && (
                        <Typography variant="caption" color="text.secondary">
                          {job.config.description}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {job.config.scriptPath}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getScriptTypeIcon(job.config.scriptType)}
                      label={job.config.scriptType.toUpperCase()}
                      size="small"
                      color={getScriptTypeColor(job.config.scriptType) as any}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {job.config.cronExpression}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {job.nextExecution ? (
                      <Typography variant="body2">
                        {new Date(job.nextExecution).toLocaleString()}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {job.isRunning ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="Running"
                        size="small"
                        color="success"
                      />
                    ) : job.config.enabled ? (
                      <Chip label="Scheduled" size="small" color="default" />
                    ) : (
                      <Chip
                        icon={<ErrorIcon />}
                        label="Disabled"
                        size="small"
                        color="default"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={job.config.enabled}
                      onChange={() => handleToggle(job.config.id)}
                      color="success"
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {job.isRunning ? (
                        <Tooltip title="Stop">
                          <IconButton
                            size="small"
                            onClick={() => handleStop(job.config.id)}
                            color="error"
                          >
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Start">
                          <IconButton
                            size="small"
                            onClick={() => handleStart(job.config.id)}
                            color="success"
                          >
                            <PlayIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(job.config)}
                          color="primary"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setJobToDelete(job.config.id);
                            setDeleteConfirmOpen(true);
                          }}
                          color="error"
                        >
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

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          About PM2 Cron Jobs
        </Typography>
        <Typography variant="caption">
          Cron jobs run as PM2 processes with automatic restart on the specified schedule.
          They will continue running even after system reboot if PM2 is set to start on boot.
          Use the PM2 ecosystem file or PM2 startup command to configure PM2 auto-start.
        </Typography>
      </Alert>

      {/* Dialogs */}
      <CronJobDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingJob(undefined);
        }}
        onSave={handleSave}
        editJob={editingJob}
      />

      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete Cron Job"
        message="Are you sure you want to delete this cron job? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setJobToDelete(null);
        }}
        type="danger"
      />
    </Container>
  );
};

export default CronJobsPage;

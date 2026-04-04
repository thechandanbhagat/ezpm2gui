import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PM2Process } from '../types/pm2';
import ProcessLogs from './ProcessLogs';
import MetricsChart from './MetricsChart';
import axios from 'axios';
import {
  Box,
  IconButton,
  Tabs,
  Tab,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import PageHeader from './PageHeader';

// @group Types : Tab panel props
interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

// @group TabPanel : Renders tab content when active
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`process-tabpanel-${index}`}
    aria-labelledby={`process-tab-${index}`}
    {...other}
  >
    {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
  </div>
);

interface ProcessDetailPageProps {
  onAction?: (id: number, action: string) => void;
}

// @group ProcessDetailPage : Detail view for a single PM2 process
const ProcessDetailPage: React.FC<ProcessDetailPageProps> = ({ onAction }) => {
  const { id } = useParams<{ id: string }>();
  const [process, setProcess] = useState<PM2Process | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const navigate = useNavigate();

  // @group DataFetching : Load process details and poll for updates
  useEffect(() => {
    const fetchProcess = async () => {
      try {
        const response = await axios.get<PM2Process[]>('/api/processes');
        const found = response.data.find(p => p.pm_id === Number(id));
        if (found) {
          setProcess(found);
        } else {
          setError(`Process with ID ${id} not found`);
        }
      } catch (err) {
        console.error('Error fetching process:', err);
        setError('Failed to fetch process details');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProcess();
    const interval = setInterval(() => { if (id) fetchProcess(); }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  // @group Utilities : Format helpers
  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' =>
    status === 'online' ? 'success' : status === 'stopped' ? 'error' : 'warning';

  // @group Handlers : Execute process lifecycle actions
  const executeAction = async (action: string): Promise<void> => {
    if (!process) return;
    try {
      if (onAction) {
        onAction(process.pm_id, action);
        if (action === 'delete') { navigate('/'); return; }
      } else {
        await axios.post(`/api/process/${process.pm_id}/${action}`);
      }
      const response = await axios.get<PM2Process[]>('/api/processes');
      const updated = response.data.find(p => p.pm_id === Number(id));
      if (updated) setProcess(updated);
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(`Failed to ${action} process. ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // @group Render : Loading / error states
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, gap: 1.5 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">Loading process details…</Typography>
      </Box>
    );
  }

  if (error || !process) {
    return (
      <Box>
        <Alert severity={error ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {error || 'Process not found'}
        </Alert>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          Back to Process List
        </Button>
      </Box>
    );
  }

  // @group Render : Main detail page layout
  return (
    <Box>
      <PageHeader
        title={process.name}
        subtitle={`PID ${process.pm_id} · ${process.pm2_env.exec_mode || 'fork'} mode`}
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={process.pm2_env.status}
              size="small"
              color={getStatusColor(process.pm2_env.status)}
            />
            <Tooltip title="Back to process list">
              <IconButton size="small" onClick={() => navigate('/')}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayIcon />}
              onClick={() => executeAction('start')}
              disabled={process.pm2_env.status === 'online'}
            >
              Start
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<StopIcon />}
              onClick={() => executeAction('stop')}
              disabled={process.pm2_env.status === 'stopped'}
            >
              Stop
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => executeAction('restart')}
            >
              Restart
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => executeAction('delete')}
            >
              Delete
            </Button>
          </Box>
        }
      />

      {/* Quick stats row */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          {[
            { label: 'CPU Usage',     value: process.monit ? `${process.monit.cpu}%` : 'N/A' },
            { label: 'Memory',        value: process.monit ? formatMemory(process.monit.memory) : 'N/A' },
            { label: 'Restarts',      value: process.pm2_env.restart_time },
            { label: 'Started At',    value: formatDate(process.pm2_env.pm_uptime) },
          ].map(({ label, value }) => (
            <Grid item xs={6} sm={3} key={label}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography variant="body2" fontWeight={500}>{value}</Typography>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Tabbed detail panels */}
      <Paper variant="outlined">
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} aria-label="process details tabs">
            <Tab label="Details"  id="process-tab-0" aria-controls="process-tabpanel-0" />
            <Tab label="Logs"     id="process-tab-1" aria-controls="process-tabpanel-1" />
            <Tab label="Metrics"  id="process-tab-2" aria-controls="process-tabpanel-2" />
          </Tabs>
        </Box>

        {/* Details tab */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Process Information</Typography>
              <Grid container spacing={1.5}>
                {[
                  { label: 'Exec Mode',   value: process.pm2_env.exec_mode || 'N/A' },
                  { label: 'Instances',   value: process.pm2_env.instances || 1 },
                  { label: 'Created At',  value: formatDate(process.pm2_env.created_at) },
                  { label: 'Restarts',    value: process.pm2_env.restart_time },
                ].map(({ label, value }) => (
                  <Grid item xs={6} key={label}>
                    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                    <Typography variant="body2" fontWeight={500}>{value}</Typography>
                  </Grid>
                ))}
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block">Script Path</Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ wordBreak: 'break-all' }}>
                    {process.pm2_env.pm_exec_path}
                  </Typography>
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Environment Variables</Typography>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, maxHeight: 260, overflow: 'auto', bgcolor: 'action.hover' }}
              >
                {process.pm2_env.env && Object.keys(process.pm2_env.env).length > 0 ? (
                  <Box component="pre" sx={{ m: 0, fontSize: '0.75rem', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    {JSON.stringify(process.pm2_env.env, null, 2)}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No environment variables found.</Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Logs tab */}
        <TabPanel value={activeTab} index={1}>
          <ProcessLogs processId={process.pm_id} processName={process.name} />
        </TabPanel>

        {/* Metrics tab */}
        <TabPanel value={activeTab} index={2}>
          <MetricsChart processId={process.pm_id} initialData={process} />
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default ProcessDetailPage;

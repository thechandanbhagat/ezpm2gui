import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PM2Process } from '../types/pm2';
import ProcessLogs from './ProcessLogs';
import MetricsChart from './MetricsChart';
import axios from 'axios';
import {
  Container,
  Box,
  IconButton,
  Tabs,
  Tab,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  useTheme,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`process-tabpanel-${index}`}
      aria-labelledby={`process-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

interface ProcessDetailPageProps {
  onAction?: (id: number, action: string) => void;
}

const ProcessDetailPage: React.FC<ProcessDetailPageProps> = ({ onAction }) => {
  const { id } = useParams<{ id: string }>();
  const [process, setProcess] = useState<PM2Process | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProcess = async () => {
      try {
        const response = await axios.get<PM2Process[]>('/api/processes');
        const foundProcess = response.data.find(p => p.pm_id === Number(id));
        
        if (foundProcess) {
          setProcess(foundProcess);
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

    if (id) {
      fetchProcess();
    }

    // Set up polling to refresh the data
    const interval = setInterval(() => {
      if (id) fetchProcess();
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Helper function to format dates
  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Helper function to format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to determine status color
  const getStatusColor = (status: string): "success" | "error" | "warning" => {
    if (status === 'online') return 'success';
    if (status === 'stopped') return 'error';
    return 'warning';
  };

  // Execute process actions
  const executeAction = async (action: string): Promise<void> => {
    if (!process) return;
    
    try {
      if (onAction) {
        // Use the parent onAction function if provided
        onAction(process.pm_id, action);
        
        // If delete action, navigate back to the process list
        if (action === 'delete') {
          navigate('/');
          return;
        }
      } else {
        // Direct API call if onAction is not provided
        await axios.post(`/api/process/${process.pm_id}/${action}`);
      }
      
      // Refresh the process data after action
      const response = await axios.get<PM2Process[]>('/api/processes');
      const updatedProcess = response.data.find(p => p.pm_id === Number(id));
      if (updatedProcess) {
        setProcess(updatedProcess);
      }
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(`Failed to ${action} process. ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading process details...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button 
          variant="outlined" 
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
        >
          Back to Process List
        </Button>
      </Container>
    );
  }

  if (!process) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>Process not found</Alert>
        <Button 
          variant="outlined" 
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
        >
          Back to Process List
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 2 }}>
        <Button 
          variant="outlined" 
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mb: 2 }}
        >
          Back to Process List
        </Button>
      </Box>
      
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="h4">
                {process.name}
              </Typography>
              <Chip
                label={process.pm2_env.status}
                size="medium"
                color={getStatusColor(process.pm2_env.status)}
                sx={{ ml: 2 }}
              />
            </Box>
            <Box>
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<PlayIcon />} 
                onClick={() => executeAction('start')}
                disabled={process.pm2_env.status === 'online'}
                sx={{ mr: 1 }}
              >
                Start
              </Button>
              <Button 
                variant="contained" 
                color="error" 
                startIcon={<StopIcon />} 
                onClick={() => executeAction('stop')}
                disabled={process.pm2_env.status === 'stopped'}
                sx={{ mr: 1 }}
              >
                Stop
              </Button>
              <Button 
                variant="contained" 
                color="warning" 
                startIcon={<RefreshIcon />} 
                onClick={() => executeAction('restart')}
                sx={{ mr: 1 }}
              >
                Restart
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                startIcon={<DeleteIcon />} 
                onClick={() => executeAction('delete')}
              >
                Delete
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Process ID
              </Typography>
              <Typography variant="body1" fontWeight="medium">
                {process.pm_id}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                CPU Usage
              </Typography>
              <Typography variant="body1" fontWeight="medium">
                {process.monit ? `${process.monit.cpu}%` : 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Memory Usage
              </Typography>
              <Typography variant="body1" fontWeight="medium">
                {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Uptime
              </Typography>
              <Typography variant="body1" fontWeight="medium">
                {process.pm2_env.pm_uptime ? formatDate(process.pm2_env.pm_uptime) : 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Paper>
      
      <Paper variant="outlined">
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="process details tabs">
            <Tab label="Details" id="process-tab-0" aria-controls="process-tabpanel-0" />
            <Tab label="Logs" id="process-tab-1" aria-controls="process-tabpanel-1" />
            <Tab label="Metrics" id="process-tab-2" aria-controls="process-tabpanel-2" />
          </Tabs>
        </Box>
        
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Process Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Exec Mode
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" paragraph>
                    {process.pm2_env.exec_mode || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Instances
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" paragraph>
                    {process.pm2_env.instances || 1}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Created At
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" paragraph>
                    {formatDate(process.pm2_env.created_at)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Restarts
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" paragraph>
                    {process.pm2_env.restart_time}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Script Path
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" paragraph sx={{ wordBreak: 'break-all' }}>
                    {process.pm2_env.pm_exec_path}
                  </Typography>
                </Grid>
              </Grid>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Environment Variables
              </Typography>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  maxHeight: 300, 
                  overflow: 'auto',
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'
                }}
              >
                {process.pm2_env.env && Object.keys(process.pm2_env.env).length > 0 ? (
                  <Box component="pre" sx={{ margin: 0, fontSize: '0.875rem' }}>
                    {JSON.stringify(process.pm2_env.env, null, 2)}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No environment variables found.
                  </Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>
          <TabPanel value={activeTab} index={1}>
          <ProcessLogs processId={process.pm_id} processName={process.name} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <MetricsChart processId={process.pm_id} initialData={process} />
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default ProcessDetailPage;

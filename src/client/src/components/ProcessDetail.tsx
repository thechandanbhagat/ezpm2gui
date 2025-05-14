import React, { useState } from 'react';
import { PM2Process } from '../types/pm2';
import ProcessLogs from './ProcessLogs';
import MetricsChart from './MetricsChart';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  useTheme
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface ProcessDetailProps {
  process: PM2Process;
  onClose: () => void;
}

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

const ProcessDetail: React.FC<ProcessDetailProps> = ({ process, onClose }) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const theme = useTheme();

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

  return (
    <Dialog
      open={true}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="process-detail-dialog-title"
    >
      <DialogTitle id="process-detail-dialog-title" sx={{ px: 3, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="h6">
              {process.name}
            </Typography>
            <Chip
              label={process.pm2_env.status}
              size="small"
              color={getStatusColor(process.pm2_env.status)}
              sx={{ ml: 1 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              ID: {process.pm_id}
            </Typography>
          </Box>
          <IconButton
            aria-label="close"
            onClick={onClose}
            edge="end"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <Divider />
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          aria-label="process details tabs"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Information" id="process-tab-0" aria-controls="process-tabpanel-0" />
          <Tab label="Metrics" id="process-tab-1" aria-controls="process-tabpanel-1" />
          <Tab label="Logs" id="process-tab-2" aria-controls="process-tabpanel-2" />
          <Tab label="Environment" id="process-tab-3" aria-controls="process-tabpanel-3" />
        </Tabs>
      </Box>
      
      <DialogContent dividers sx={{ p: 0 }}>
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  Process Status
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Status</Typography>
                      <Typography variant="body1">{process.pm2_env.status}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Restarts</Typography>
                      <Typography variant="body1">{process.pm2_env.restart_time}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Uptime</Typography>
                      <Typography variant="body1">
                        {process.pm2_env.status === 'online' 
                          ? formatDate(process.pm2_env.pm_uptime) 
                          : 'Not running'}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Created</Typography>
                      <Typography variant="body1">{formatDate(process.pm2_env.created_at)}</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  Resource Usage
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">CPU Usage</Typography>
                      <Typography variant="body1">{process.monit ? `${process.monit.cpu}%` : 'N/A'}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Memory Usage</Typography>
                      <Typography variant="body1">
                        {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
            
            <Grid item xs={12}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  Process Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Script</Typography>
                      <Typography variant="body1" sx={{ 
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {process.pm2_env.pm_exec_path}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Working Directory</Typography>
                      <Typography variant="body1" sx={{ 
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {process.pm2_env.pm_cwd}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Interpreter</Typography>
                      <Typography variant="body1">{process.pm2_env.exec_interpreter}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Watching</Typography>
                      <Typography variant="body1">{process.pm2_env.watch ? 'Yes' : 'No'}</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <MetricsChart processId={process.pm_id} initialData={process} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <ProcessLogs processId={process.pm_id} processName={process.name} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Environment Variables
            </Typography>
            {process.pm2_env.env ? (
              <Grid container spacing={2}>
                {Object.entries(process.pm2_env.env)
                  .filter(([key]) => !key.startsWith('_') && key !== 'PATH')
                  .map(([key, value]) => (
                    <Grid item xs={12} sm={6} md={4} key={key}>
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 1.5,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'
                        }}
                      >
                        <Typography 
                          variant="subtitle2" 
                          sx={{ 
                            color: 'primary.main',
                            fontSize: '0.9rem' 
                          }}
                        >
                          {key}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}
                        >
                          {String(value)}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
              </Grid>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No environment variables found.
                </Typography>
              </Box>
            )}
          </Paper>
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessDetail;

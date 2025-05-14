import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  Button,
  Divider,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  MenuItem,
  CircularProgress,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { 
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { PM2Process } from '../types/pm2';

interface ClusterProcess {
  pm_id: number;
  name: string;
  instances: number;
  exec_mode: string;
  isCluster: boolean;
}

interface ClusterManagementProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

const ClusterManagement: React.FC<ClusterManagementProps> = ({ processes, onRefresh }) => {
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [clusterProcesses, setClusterProcesses] = useState<ClusterProcess[]>([]);
  const [instancesInput, setInstancesInput] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  useEffect(() => {
    if (selectedProcess) {
      fetchClusterInfo(selectedProcess);
    }
  }, [selectedProcess]);
  
  const fetchClusterInfo = async (processId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/cluster/${processId}`);
      setClusterProcesses([response.data]);
      setInstancesInput(response.data.instances || 1);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch cluster information');
      setLoading(false);
    }
  };
    const handleProcessChange = (event: SelectChangeEvent) => {
    setSelectedProcess(event.target.value);
  };
  
  const handleScaleProcess = async () => {
    if (!selectedProcess || instancesInput < 0) return;
    
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/scale`, {
        instances: instancesInput
      });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Successfully scaled process to ${instancesInput} instances`);
      onRefresh();
      setLoading(false);
    } catch (err) {
      setError('Failed to scale process');
      setLoading(false);
    }
  };
    const handleChangeExecMode = async (mode: 'fork' | 'cluster') => {
    if (!selectedProcess) return;
    
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/exec-mode`, {
        mode
      });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Execution mode changed to ${mode}`);
      onRefresh();
      setLoading(false);
    } catch (err) {
      setError('Failed to change execution mode');
      setLoading(false);
    }
  };
  
  const handleReloadProcess = async () => {
    if (!selectedProcess) return;
    
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/reload`);
      setSuccess('Process reloaded with zero downtime');
      onRefresh();
      setLoading(false);
    } catch (err) {
      setError('Failed to reload process');
      setLoading(false);
    }
  };
  
  return (
    <Box>      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Cluster Management</Typography>
        <Divider sx={{ mb: 3 }} />
        
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body1">
            <strong>Load Balancing with PM2</strong>: To enable load balancing for your application, set multiple instances and use cluster mode.
            This will distribute incoming requests across all instances of your application automatically.
          </Typography>
        </Alert>
        
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Select Process</InputLabel><Select
                value={selectedProcess}
                onChange={handleProcessChange}
                label="Select Process"
              >
                {processes.map((process) => (
                  <MenuItem key={process.pm_id} value={process.pm_id}>
                    {process.name} (ID: {process.pm_id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : selectedProcess ? (
          <>
            {clusterProcesses.length > 0 && (
              <>
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Instances</TableCell>
                        <TableCell>Exec Mode</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {clusterProcesses.map((process) => (
                        <TableRow key={process.pm_id}>
                          <TableCell>{process.pm_id}</TableCell>
                          <TableCell>{process.name}</TableCell>
                          <TableCell>{process.instances}</TableCell>
                          <TableCell>{process.exec_mode}</TableCell>
                          <TableCell>
                            {process.isCluster ? 'Cluster Mode' : 'Fork Mode'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <Typography variant="h6" gutterBottom>Scale Process</Typography>
                <Grid container spacing={2} alignItems="center" sx={{ mb: 4 }}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Number of Instances"
                      value={instancesInput}
                      onChange={(e) => setInstancesInput(Number(e.target.value))}
                      InputProps={{ 
                        inputProps: { min: 0 },
                        startAdornment: (
                          <InputLabel sx={{ mr: 1 }}>Instances:</InputLabel>
                        ) 
                      }}
                    />
                  </Grid>
                  <Grid item>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleScaleProcess}
                      startIcon={<RefreshIcon />}
                    >
                      Scale
                    </Button>
                  </Grid>                </Grid>
                
                <Typography variant="h6" gutterBottom>Change Execution Mode</Typography>
                <Grid container spacing={2}>
                  <Grid item>
                    <Button
                      variant="outlined"
                      onClick={() => handleChangeExecMode('fork')}
                      disabled={!clusterProcesses[0]?.isCluster}
                    >
                      Switch to Fork Mode
                    </Button>
                  </Grid>
                  <Grid item>
                    <Button
                      variant="outlined"
                      onClick={() => handleChangeExecMode('cluster')}
                      disabled={clusterProcesses[0]?.isCluster}
                    >
                      Switch to Cluster Mode
                    </Button>
                  </Grid>
                </Grid>
                
                <Typography variant="h6" sx={{ mt: 4 }} gutterBottom>Zero-Downtime Reload</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      Reload all instances one by one for zero-downtime updates. This is especially useful when you've 
                      updated your application code and want to apply changes without service interruption.
                    </Typography>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={handleReloadProcess}
                    >
                      Graceful Reload All Instances
                    </Button>
                  </Grid>
                </Grid>
              </>
            )}
          </>
        ) : (
          <Typography variant="body1" sx={{ textAlign: 'center', py: 4 }}>
            Select a process to view cluster information
          </Typography>
        )}
      </Paper>
      
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      
      <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess('')}>
        <Alert severity="success">{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ClusterManagement;

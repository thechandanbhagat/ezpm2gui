import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Button, Grid, TextField, FormControl,
  InputLabel, Select, SelectChangeEvent, MenuItem, CircularProgress,
  Alert, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { PM2Process } from '../types/pm2';
import PageHeader from './PageHeader';

// @group Types : Cluster management types
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

// @group ClusterManagement : Process cluster scaling and exec-mode management
const ClusterManagement: React.FC<ClusterManagementProps> = ({ processes, onRefresh }) => {
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [clusterProcesses, setClusterProcesses] = useState<ClusterProcess[]>([]);
  const [instancesInput, setInstancesInput] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (selectedProcess) fetchClusterInfo(selectedProcess);
  }, [selectedProcess]);

  // @group DataFetching : Fetch cluster info for selected process
  const fetchClusterInfo = async (processId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/cluster/${processId}`);
      setClusterProcesses([response.data]);
      setInstancesInput(response.data.instances || 1);
    } catch {
      setError('Failed to fetch cluster information');
    } finally {
      setLoading(false);
    }
  };

  // @group Handlers : Cluster action handlers
  const handleProcessChange = (e: SelectChangeEvent) => setSelectedProcess(e.target.value);

  const handleScaleProcess = async () => {
    if (!selectedProcess || instancesInput < 0) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/scale`, { instances: instancesInput });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Scaled to ${instancesInput} instances`);
      onRefresh();
    } catch { setError('Failed to scale process'); }
    finally { setLoading(false); }
  };

  const handleChangeExecMode = async (mode: 'fork' | 'cluster') => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/exec-mode`, { mode });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Execution mode changed to ${mode}`);
      onRefresh();
    } catch { setError('Failed to change execution mode'); }
    finally { setLoading(false); }
  };

  const handleReloadProcess = async () => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/reload`);
      setSuccess('Process reloaded with zero downtime');
      onRefresh();
    } catch { setError('Failed to reload process'); }
    finally { setLoading(false); }
  };

  // @group Render : Cluster management layout
  return (
    <Box>
      <PageHeader
        title="Cluster Management"
        subtitle="Scale processes and manage execution modes"
      />

      {/* Process selector */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Select Process</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Process</InputLabel>
              <Select value={selectedProcess} onChange={handleProcessChange} label="Process">
                {processes.map(p => (
                  <MenuItem key={p.pm_id} value={p.pm_id}>{p.name} (ID: {p.pm_id})</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : selectedProcess && clusterProcesses.length > 0 ? (
        <>
          {/* Current cluster info */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Current Status</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Instances</TableCell>
                    <TableCell>Exec Mode</TableCell>
                    <TableCell>Mode</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusterProcesses.map(p => (
                    <TableRow key={p.pm_id}>
                      <TableCell>{p.pm_id}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.instances}</TableCell>
                      <TableCell>{p.exec_mode}</TableCell>
                      <TableCell>{p.isCluster ? 'Cluster' : 'Fork'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Scale */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Scale Instances</Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth type="number" label="Instances"
                  value={instancesInput}
                  onChange={e => setInstancesInput(Number(e.target.value))}
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid item>
                <Button variant="contained" startIcon={<RefreshIcon />} onClick={handleScaleProcess}>
                  Scale
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Exec mode */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Execution Mode</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button variant="outlined" onClick={() => handleChangeExecMode('fork')}
                disabled={!clusterProcesses[0]?.isCluster}>
                Switch to Fork
              </Button>
              <Button variant="outlined" onClick={() => handleChangeExecMode('cluster')}
                disabled={clusterProcesses[0]?.isCluster}>
                Switch to Cluster
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Use <strong>cluster mode</strong> with multiple instances to distribute requests across all CPU cores.
            </Typography>
          </Paper>

          {/* Zero-downtime reload */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Zero-Downtime Reload</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Reload instances one by one — no service interruption during code updates.
            </Typography>
            <Button variant="contained" color="secondary" onClick={handleReloadProcess}>
              Graceful Reload
            </Button>
          </Paper>
        </>
      ) : !selectedProcess ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">Select a process above to view cluster options</Typography>
        </Paper>
      ) : null}

      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess('')}>
        <Alert severity="success">{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ClusterManagement;

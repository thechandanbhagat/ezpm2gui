import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Add as AddIcon
} from '@mui/icons-material';
import axios from 'axios';

interface Module {
  name: string;
  version: string;
  status: string;
}

const ModuleManagement: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/modules');
      setModules(response.data);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch modules');
      setLoading(false);
    }
  };

  const handleInstallModule = async () => {
    if (!newModuleName.trim()) {
      setError('Module name is required');
      return;
    }

    try {
      setInstalling(true);
      await axios.post('/api/modules/install', { moduleName: newModuleName });
      setSuccess(`Successfully installed module: ${newModuleName}`);
      setNewModuleName('');
      setDialogOpen(false);
      fetchModules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to install module');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstallModule = async (moduleName: string) => {
    try {
      await axios.delete(`/api/modules/${moduleName}`);
      setSuccess(`Successfully uninstalled module: ${moduleName}`);
      fetchModules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to uninstall module');
    }
  };

  const getStatusColor = (status: string): "success" | "error" | "warning" => {
    if (status.toLowerCase().includes('online') || status.toLowerCase().includes('enabled')) {
      return 'success';
    }
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('disabled')) {
      return 'error';
    }
    return 'warning';
  };

  return (
    <Box>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">PM2 Modules</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Install and manage PM2 module plugins</p>
        </div>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchModules} disabled={loading}>Refresh</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Install Module</Button>
        </Box>
      </div>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : modules.length === 0 ? (
          <Alert severity="info">No PM2 modules installed</Alert>
        ) : (
          <List>
            {modules.map((module) => (
              <ListItem key={module.name} divider>
                <ListItemText
                  primary={module.name}
                  secondary={`Version: ${module.version}`}
                />
                <Chip
                  label={module.status}
                  color={getStatusColor(module.status)}
                  size="small"
                  sx={{ mr: 2 }}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    color="error"
                    onClick={() => handleUninstallModule(module.name)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Install PM2 Module</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Module Name"
            fullWidth
            variant="outlined"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
            helperText="e.g. pm2-logrotate, pm2-server-monit"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleInstallModule}
            variant="contained"
            color="primary"
            disabled={installing}
          >
            {installing ? <CircularProgress size={24} /> : 'Install'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      
      <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess('')}>
        <Alert severity="success">{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ModuleManagement;

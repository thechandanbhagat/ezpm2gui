import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Grid,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  CircularProgress
} from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface EnvVariable {
  key: string;
  value: string;
}

const DeployApplication: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    script: '',
    cwd: '',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '150M'
  });
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [newEnvVar, setNewEnvVar] = useState<EnvVariable>({ key: '', value: '' });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSelectChange = (e: any) => {
    const { name, value } = e.target;
    
    setForm({
      ...form,
      [name]: value
    });
  };

  const handleEnvInputChange = (index: number, field: 'key' | 'value', value: string) => {
    const updatedEnvVars = [...envVars];
    updatedEnvVars[index][field] = value;
    setEnvVars(updatedEnvVars);
  };

  const handleNewEnvChange = (field: 'key' | 'value', value: string) => {
    setNewEnvVar({
      ...newEnvVar,
      [field]: value
    });
  };

  const addEnvVar = () => {
    if (!newEnvVar.key.trim()) return;
    
    setEnvVars([...envVars, { ...newEnvVar }]);
    setNewEnvVar({ key: '', value: '' });
  };

  const removeEnvVar = (index: number) => {
    const updatedEnvVars = [...envVars];
    updatedEnvVars.splice(index, 1);
    setEnvVars(updatedEnvVars);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Convert env vars array to object
    const envObject: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) {
        envObject[key] = value;
      }
    });
    
    try {
      await axios.post('/api/deploy', {
        ...form,
        env: envObject
      });
      
      setSuccess('Application deployed successfully');
      setLoading(false);
      
      // Redirect to process list after successful deployment
      setTimeout(() => {
        navigate('/processes');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to deploy application');
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Deploy New Application</Typography>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              required
              fullWidth
              label="Application Name"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              margin="normal"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              required
              fullWidth
              label="Script Path"
              name="script"
              value={form.script}
              onChange={handleInputChange}
              margin="normal"
              helperText="Full path to the script file"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Working Directory"
              name="cwd"
              value={form.cwd}
              onChange={handleInputChange}
              margin="normal"
              helperText="Leave empty to use the script's directory"
            />
          </Grid>
            <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Instances"
              name="instances"
              type="number"
              value={form.instances}
              onChange={handleInputChange}
              margin="normal"
              helperText="For load balancing: use >1 for multiple instances, 0 or -1 for max (based on CPU cores)"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Execution Mode</InputLabel>
              <Select
                name="exec_mode"
                value={form.exec_mode}
                onChange={handleSelectChange}
                label="Execution Mode"
              >
                <MenuItem value="fork">Fork</MenuItem>
                <MenuItem value="cluster">Cluster (recommended for load balancing)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {form.instances > 1 && (
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Load Balancing Configuration</strong>
                <Typography variant="body2">
                  You've set up {form.instances} instances which will enable load balancing for this application.
                  {form.exec_mode === 'cluster' 
                    ? ' Cluster mode is ideal for load balancing as it shares the server port among instances.'
                    : ' Consider switching to Cluster mode for better load balancing.'}
                </Typography>
              </Alert>
            </Grid>
          )}
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.autorestart}
                  onChange={handleInputChange}
                  name="autorestart"
                />
              }
              label="Auto Restart"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.watch}
                  onChange={handleInputChange}
                  name="watch"
                />
              }
              label="Watch for Changes"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Max Memory Restart"
              name="max_memory_restart"
              value={form.max_memory_restart}
              onChange={handleInputChange}
              margin="normal"
              helperText="e.g. 150M, 1G"
            />
          </Grid>
        </Grid>
        
        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Environment Variables</Typography>
        <Divider sx={{ mb: 3 }} />
        
        {envVars.map((env, index) => (
          <Box key={index} sx={{ display: 'flex', mb: 2 }}>
            <TextField
              sx={{ mr: 1, flexGrow: 1 }}
              label="Key"
              value={env.key}
              onChange={(e) => handleEnvInputChange(index, 'key', e.target.value)}
            />
            <TextField
              sx={{ mr: 1, flexGrow: 2 }}
              label="Value"
              value={env.value}
              onChange={(e) => handleEnvInputChange(index, 'value', e.target.value)}
            />
            <Button
              variant="outlined"
              color="error"
              onClick={() => removeEnvVar(index)}
            >
              Remove
            </Button>
          </Box>
        ))}
        
        <Box sx={{ display: 'flex', mt: 2 }}>
          <TextField
            sx={{ mr: 1, flexGrow: 1 }}
            label="New Key"
            value={newEnvVar.key}
            onChange={(e) => handleNewEnvChange('key', e.target.value)}
          />
          <TextField
            sx={{ mr: 1, flexGrow: 2 }}
            label="New Value"
            value={newEnvVar.value}
            onChange={(e) => handleNewEnvChange('value', e.target.value)}
          />
          <Button
            variant="contained"
            onClick={addEnvVar}
          >
            Add
          </Button>
        </Box>
        
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/processes')}
            sx={{ mr: 2 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Deploy Application'}
          </Button>
        </Box>
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

export default DeployApplication;

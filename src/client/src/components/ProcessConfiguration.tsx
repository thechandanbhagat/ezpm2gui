import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Snackbar
} from '@mui/material';
import axios from 'axios';

interface ConfigurationProps {
  procId?: number | string;
}

interface ConfigData {
  name: string;
  script: string;
  cwd: string;
  interpreter?: string;
  instances: number;
  exec_mode: 'fork' | 'cluster';
  autorestart: boolean;
  watch: boolean;
  ignore_watch: string[];
  env: Record<string, string>;
  max_memory_restart: string;
}

const ProcessConfiguration: React.FC<ConfigurationProps> = ({ procId: propProcId }) => {
  const params = useParams<{ id: string }>();
  const processId = propProcId || Number(params.id);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [envKeys, setEnvKeys] = useState<string[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const navigate = useNavigate();  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/config/${processId}`);
        setConfig(response.data);
        setEnvKeys(Object.keys(response.data.env || {}));
        setLoading(false);
      } catch (err) {
        setError(`Failed to fetch configuration for process ${processId}`);
        setLoading(false);
      }
    };
    
    fetchConfig();
  }, [processId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setConfig(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
    });
  };

  const handleSelectChange = (e: any) => {
    const { name, value } = e.target;
    
    setConfig(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        [name]: value
      };
    });
  };

  const handleEnvChange = (key: string, value: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        env: {
          ...prev.env,
          [key]: value
        }
      };
    });
  };

  const addNewEnvVar = () => {
    if (!newEnvKey.trim()) return;
    
    setConfig(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        env: {
          ...prev.env,
          [newEnvKey]: newEnvValue
        }
      };
    });
    
    setEnvKeys(prev => [...prev, newEnvKey]);
    setNewEnvKey('');
    setNewEnvValue('');
  };

  const removeEnvVar = (key: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      
      const newEnv = { ...prev.env };
      delete newEnv[key];
      
      return {
        ...prev,
        env: newEnv
      };
    });
    
    setEnvKeys(envKeys.filter(k => k !== key));
  };
  const saveConfig = async () => {
    try {
      await axios.post(`/api/config/${processId}`, config);
      setSuccess('Configuration saved successfully');
    } catch (err) {
      setError('Failed to save configuration');
    }
  };

  if (loading) return <Typography>Loading configuration...</Typography>;
  if (!config) return <Typography color="error">Configuration not found</Typography>;

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Process Configuration</Typography>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Name"
              name="name"
              value={config.name}
              onChange={handleInputChange}
              margin="normal"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Script Path"
              name="script"
              value={config.script}
              onChange={handleInputChange}
              margin="normal"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Current Working Directory"
              name="cwd"
              value={config.cwd}
              onChange={handleInputChange}
              margin="normal"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Instances"
              name="instances"
              type="number"
              value={config.instances}
              onChange={handleInputChange}
              margin="normal"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Execution Mode</InputLabel>
              <Select
                name="exec_mode"
                value={config.exec_mode}
                onChange={handleSelectChange}
                label="Execution Mode"
              >
                <MenuItem value="fork">Fork</MenuItem>
                <MenuItem value="cluster">Cluster</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.autorestart}
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
                  checked={config.watch}
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
              value={config.max_memory_restart}
              onChange={handleInputChange}
              margin="normal"
              helperText="e.g. 150M, 1G"
            />
          </Grid>
        </Grid>
        
        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Environment Variables</Typography>
        <Divider sx={{ mb: 3 }} />
        
        {envKeys.map(key => (
          <Box key={key} sx={{ display: 'flex', mb: 2 }}>
            <TextField
              sx={{ mr: 1, flexGrow: 1 }}
              label="Key"
              value={key}
              disabled
            />
            <TextField
              sx={{ mr: 1, flexGrow: 2 }}
              label="Value"
              value={config.env[key]}
              onChange={(e) => handleEnvChange(key, e.target.value)}
            />
            <Button
              variant="outlined"
              color="error"
              onClick={() => removeEnvVar(key)}
            >
              Remove
            </Button>
          </Box>
        ))}
        
        <Box sx={{ display: 'flex', mt: 2 }}>
          <TextField
            sx={{ mr: 1, flexGrow: 1 }}
            label="New Key"
            value={newEnvKey}
            onChange={(e) => setNewEnvKey(e.target.value)}
          />
          <TextField
            sx={{ mr: 1, flexGrow: 2 }}
            label="New Value"
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
          />
          <Button
            variant="contained"
            onClick={addNewEnvVar}
          >
            Add
          </Button>
        </Box>
        
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={saveConfig}
            sx={{ mr: 2 }}
          >
            Save Configuration
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/processes')}
          >
            Cancel
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

export default ProcessConfiguration;

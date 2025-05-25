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

type AppType = 'node' | 'python' | 'dotnet' | 'other';

interface AppTypeConfig {
  label: string;
  scriptLabel: string;
  scriptHelp: string;
  interpreterEnvVar?: string;
  defaultExecMode: 'fork' | 'cluster';
  supportsCluster: boolean;
  requiresInterpreter?: boolean;
  interpreterHelp?: string;
}

const appTypeConfigs: Record<AppType, AppTypeConfig> = {
  node: {
    label: 'Node.js Application',
    scriptLabel: 'Script Path',
    scriptHelp: 'Full path to the JavaScript/TypeScript file',
    defaultExecMode: 'fork',
    supportsCluster: true,
  },  python: {
    label: 'Python Application',
    scriptLabel: 'Python File',
    scriptHelp: 'Full path to the Python file (e.g., app.py)',
    interpreterEnvVar: 'PYTHON_INTERPRETER',
    defaultExecMode: 'fork',
    supportsCluster: false,
    requiresInterpreter: true,
    interpreterHelp: 'Path to Python interpreter (e.g., /path/to/venv/bin/python)',
  },
  dotnet: {
    label: '.NET Application',
    scriptLabel: 'DLL Path',
    scriptHelp: 'Full path to your compiled .dll file',
    interpreterEnvVar: 'DOTNET_COMMAND',
    defaultExecMode: 'fork', 
    supportsCluster: false,
  },
  other: {
    label: 'Other Application',
    scriptLabel: 'Script/Binary Path',
    scriptHelp: 'Full path to your executable or script',
    defaultExecMode: 'fork',
    supportsCluster: false,
  }
};

const DeployApplication: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [appType, setAppType] = useState<AppType>('node');
  const [autoSetup, setAutoSetup] = useState(true);
  const [detectedProjectType, setDetectedProjectType] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    script: '',
    cwd: '',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '150M',
    port: ''
  });
  const [portError, setPortError] = useState('');
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [newEnvVar, setNewEnvVar] = useState<EnvVariable>({ key: '', value: '' });
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    // Validate port when the port field is changed
    if (name === 'port') {
      // Clear previous error
      setPortError('');
      
      // Validate that port is a number between 1-65535
      if (value && (!/^\d+$/.test(value) || parseInt(value) < 1 || parseInt(value) > 65535)) {
        setPortError('Port must be a number between 1 and 65535');
      }
    }
    
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value
    });
  };
  const handleSelectChange = (e: any) => {
    const { name, value } = e.target;
    
    if (name === 'appType') {
      setAppType(value as AppType);
      // Update exec_mode based on app type configuration
      setForm(prev => ({
        ...prev,
        exec_mode: appTypeConfigs[value as AppType].defaultExecMode
      }));
    } else {
      setForm({
        ...form,
        [name]: value
      });
    }
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
    
    // Validate port format first
    if (form.port && (!/^\d+$/.test(form.port) || parseInt(form.port) < 1 || parseInt(form.port) > 65535)) {
      setPortError('Port must be a number between 1 and 65535');
      return;
    }
    
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
        env: envObject,
        appType,
        autoSetup
      });
      
      setSuccess('Application deployed successfully');
      setLoading(false);
      
      // Redirect to process list after successful deployment
      setTimeout(() => {
        navigate('/processes');
      }, 2000);
    } catch (err: any) {
      // Check if error is specifically about port being in use
      if (err.response?.data?.error?.includes('port') && err.response?.data?.error?.includes('use')) {
        setError(`Port ${form.port} is already in use. Please choose a different port.`);
      } else {
        setError(err.response?.data?.error || 'Failed to deploy application');
      }
      setLoading(false);
    }
  };
  const detectProjectType = async () => {
    if (!form.cwd && !form.script) {
      setError('Please specify either working directory or script path for project detection');
      return;
    }

    // Use working directory or extract directory from script path
    let projectPath = form.cwd;
    if (!projectPath && form.script) {
      // Simple path extraction for client-side (just remove filename)
      const lastSlash = Math.max(form.script.lastIndexOf('/'), form.script.lastIndexOf('\\'));
      projectPath = lastSlash > 0 ? form.script.substring(0, lastSlash) : '.';
    }
    
    try {
      setSetupLoading(true);
      const response = await axios.post('/api/deploy/detect-project', { projectPath });
      
      if (response.data.success && response.data.projectType) {
        setDetectedProjectType(response.data.projectType);
        setAppType(response.data.projectType as AppType);
        setSuccess(`Detected ${response.data.config?.name || response.data.projectType} project`);
      } else {
        setDetectedProjectType(null);
        setError('Could not auto-detect project type');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to detect project type');
    } finally {
      setSetupLoading(false);
    }
  };

  const runProjectSetup = async () => {
    if (!form.cwd && !form.script) {
      setError('Please specify either working directory or script path');
      return;
    }

    // Use working directory or extract directory from script path
    let projectPath = form.cwd;
    if (!projectPath && form.script) {
      // Simple path extraction for client-side (just remove filename)
      const lastSlash = Math.max(form.script.lastIndexOf('/'), form.script.lastIndexOf('\\'));
      projectPath = lastSlash > 0 ? form.script.substring(0, lastSlash) : '.';
    }
    
    try {
      setSetupLoading(true);
      const response = await axios.post('/api/deploy/setup-project', {
        projectPath,
        projectType: appType
      });
      
      if (response.data.success) {
        setSetupResult(response.data);
        setSuccess('Project setup completed successfully');
        
        // Update environment variables with setup results
        if (response.data.environment) {
          Object.entries(response.data.environment).forEach(([key, value]) => {
            if (!envVars.find(env => env.key === key)) {
              setEnvVars(prev => [...prev, { key, value: value as string }]);
            }
          });
        }
      } else {
        setError('Project setup failed: ' + response.data.errors?.join(', '));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to setup project');
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Deploy New Application</Typography>
        <Divider sx={{ mb: 3 }} />        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Application Type</InputLabel>
              <Select
                name="appType"
                value={appType}
                onChange={handleSelectChange}
                label="Application Type"
              >
                <MenuItem value="node">Node.js Application</MenuItem>
                <MenuItem value="python">Python Application</MenuItem>
                <MenuItem value="dotnet">.NET Application</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
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
              label={appTypeConfigs[appType].scriptLabel}
              name="script"
              value={form.script}
              onChange={handleInputChange}
              margin="normal"
              helperText={appTypeConfigs[appType].scriptHelp}
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
                disabled={!appTypeConfigs[appType].supportsCluster}
              >
                <MenuItem value="fork">Fork</MenuItem>
                {appTypeConfigs[appType].supportsCluster && (
                  <MenuItem value="cluster">Cluster (recommended for load balancing)</MenuItem>
                )}
              </Select>
            </FormControl>
            {!appTypeConfigs[appType].supportsCluster && form.exec_mode === 'fork' && (
              <Typography variant="caption" color="textSecondary">
                Cluster mode is only available for Node.js applications
              </Typography>
            )}
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
            <Grid item xs={12} md={6}>
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
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Port"
              name="port"
              value={form.port}
              onChange={handleInputChange}
              margin="normal"
              helperText={portError || "Application port (e.g., 3000, 8080)"}
              error={!!portError}
            />
          </Grid>
        </Grid>
          {appTypeConfigs[appType].requiresInterpreter && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Interpreter Settings</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={`${appType === 'python' ? 'Python' : ''} Interpreter Path`}
                  value={newEnvVar.key === appTypeConfigs[appType].interpreterEnvVar ? newEnvVar.value : ''}
                  onChange={(e) => {
                    // Find if this env var already exists
                    const existingIndex = envVars.findIndex(env => env.key === appTypeConfigs[appType].interpreterEnvVar);
                    if (existingIndex >= 0) {
                      // Update existing var
                      handleEnvInputChange(existingIndex, 'value', e.target.value);
                    } else {
                      // Set up new env var
                      setNewEnvVar({
                        key: appTypeConfigs[appType].interpreterEnvVar || '',
                        value: e.target.value
                      });
                    }
                  }}
                  margin="normal"
                  helperText={appTypeConfigs[appType].interpreterHelp || 'Path to the interpreter'}
                />
                {appType === 'python' && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      For Python applications, it's recommended to use a virtual environment. 
                      Enter the path to the Python executable in your virtual environment (e.g., /path/to/venv/bin/python).
                    </Typography>
                  </Alert>
                )}
              </Grid>
            </Grid>
          </>
        )}
        
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
        
        <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>Project Setup</Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoSetup}
                      onChange={(e) => setAutoSetup(e.target.checked)}
                      name="autoSetup"
                    />
                  }
                  label="Auto Setup Project"
                />
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Button
                  variant="outlined"
                  onClick={detectProjectType}
                  disabled={setupLoading}
                  fullWidth
                >
                  {setupLoading ? <CircularProgress size={20} /> : 'Detect Project Type'}
                </Button>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Button
                  variant="outlined"
                  onClick={runProjectSetup}
                  disabled={setupLoading || !appType}
                  fullWidth
                >
                  {setupLoading ? <CircularProgress size={20} /> : 'Setup Project'}
                </Button>
              </Grid>
            </Grid>
            
            {detectedProjectType && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Detected Project Type:</strong> {detectedProjectType}
                  {autoSetup && ' (Auto-setup will run during deployment)'}
                </Typography>
              </Alert>
            )}
            
            {setupResult && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={setupResult.success ? 'success' : 'warning'}>
                  <Typography variant="body2">
                    <strong>Setup Status:</strong> {setupResult.success ? 'Completed' : 'Completed with warnings'}
                  </Typography>
                  {setupResult.warnings?.length > 0 && (
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      Warnings: {setupResult.warnings.join(', ')}
                    </Typography>
                  )}
                </Alert>
              </Box>
            )}
          </Grid>
        
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

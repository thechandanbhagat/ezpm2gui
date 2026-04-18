import React, { useState } from 'react';
import {
  Box,
  Paper,
  Grid,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon        from '@mui/icons-material/Add';
import DeleteIcon     from '@mui/icons-material/Delete';
import SearchIcon     from '@mui/icons-material/Search';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import PageHeader from './PageHeader';

// @group Types : App type configuration
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

interface EnvVariable { key: string; value: string; }

// @group Constants : Per-app-type metadata
const APP_CONFIGS: Record<AppType, AppTypeConfig> = {
  node: {
    label: 'Node.js',
    scriptLabel: 'Entry File',
    scriptHelp: 'e.g. dist/index.js',
    defaultExecMode: 'fork',
    supportsCluster: true,
  },
  python: {
    label: 'Python',
    scriptLabel: 'Python File',
    scriptHelp: 'e.g. app.py',
    interpreterEnvVar: 'PYTHON_INTERPRETER',
    defaultExecMode: 'fork',
    supportsCluster: false,
    requiresInterpreter: true,
    interpreterHelp: 'e.g. /path/to/venv/bin/python',
  },
  dotnet: {
    label: '.NET',
    scriptLabel: 'DLL Path',
    scriptHelp: 'e.g. bin/Release/net8.0/app.dll',
    interpreterEnvVar: 'DOTNET_COMMAND',
    defaultExecMode: 'fork',
    supportsCluster: false,
  },
  other: {
    label: 'Other',
    scriptLabel: 'Script / Binary',
    scriptHelp: 'Full path to executable',
    defaultExecMode: 'fork',
    supportsCluster: false,
  },
};

// @group DeployApplication : Form to start a new PM2-managed process
const DeployApplication: React.FC = () => {
  const navigate = useNavigate();

  // @group State : Form values
  const [appType,    setAppType]    = useState<AppType>('node');
  const [autoSetup,  setAutoSetup]  = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [detecting,  setDetecting]  = useState(false);
  const [success,    setSuccess]    = useState('');
  const [error,      setError]      = useState('');
  const [portError,  setPortError]  = useState('');
  const [envVars,    setEnvVars]    = useState<EnvVariable[]>([]);
  const [newEnv,     setNewEnv]     = useState<EnvVariable>({ key: '', value: '' });

  const [form, setForm] = useState({
    name: '',
    script: '',
    cwd: '',
    namespace: 'default',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '150M',
    port: '',
    interpreter: '',
  });

  // @group Handlers : Generic field change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    if (name === 'port') {
      setPortError(
        value && (!/^\d+$/.test(value) || +value < 1 || +value > 65535)
          ? 'Must be a number between 1–65535'
          : ''
      );
    }
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAppTypeChange = (val: AppType) => {
    setAppType(val);
    setForm(prev => ({ ...prev, exec_mode: APP_CONFIGS[val].defaultExecMode }));
  };

  // @group Handlers : Auto-detect project type from cwd / script path
  const detectType = async () => {
    const projectPath = form.cwd || (() => {
      const s = form.script;
      const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
      return i > 0 ? s.substring(0, i) : '.';
    })();
    if (!projectPath || projectPath === '.') {
      setError('Set Working Directory or Entry File first');
      return;
    }
    try {
      setDetecting(true);
      const { data } = await axios.post('/api/deploy/detect-project', { projectPath });
      if (data.success && data.projectType) {
        handleAppTypeChange(data.projectType as AppType);
        setSuccess(`Detected: ${data.config?.name || data.projectType}`);
      } else {
        setError('Could not detect project type');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  // @group Handlers : Env variable management
  const addEnvVar = () => {
    if (!newEnv.key.trim()) return;
    setEnvVars(prev => [...prev, { ...newEnv }]);
    setNewEnv({ key: '', value: '' });
  };

  const removeEnvVar = (i: number) =>
    setEnvVars(prev => prev.filter((_, idx) => idx !== i));

  const updateEnvVar = (i: number, field: 'key' | 'value', val: string) =>
    setEnvVars(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  // @group Handlers : Submit deployment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portError) return;

    const envObject: Record<string, string> = {};
    envVars.forEach(({ key, value }) => { if (key.trim()) envObject[key] = value; });
    if (form.interpreter && APP_CONFIGS[appType].interpreterEnvVar) {
      envObject[APP_CONFIGS[appType].interpreterEnvVar!] = form.interpreter;
    }

    setLoading(true);
    try {
      await axios.post('/api/deploy', { ...form, env: envObject, appType, autoSetup });
      setSuccess('Application deployed successfully');
      setTimeout(() => navigate('/processes'), 1800);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to deploy application';
      setError(msg.includes('port') && msg.includes('use')
        ? `Port ${form.port} is already in use`
        : msg);
    } finally {
      setLoading(false);
    }
  };

  const cfg = APP_CONFIGS[appType];

  // @group Render : Section card helper
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Paper>
  );

  // @group Render : Main form
  return (
    <Box component="form" onSubmit={handleSubmit}>
      <PageHeader
        title="Deploy Application"
        subtitle="Start a new process managed by PM2"
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" size="small" onClick={() => navigate('/processes')}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" size="small" disabled={loading || !!portError}>
              {loading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
              Deploy
            </Button>
          </Box>
        }
      />

      {/* ── Basic Info ── */}
      <Section title="Basic Info">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>App Type</InputLabel>
              <Select
                value={appType}
                label="App Type"
                onChange={e => handleAppTypeChange(e.target.value as AppType)}
              >
                {(Object.keys(APP_CONFIGS) as AppType[]).map(k => (
                  <MenuItem key={k} value={k}>{APP_CONFIGS[k].label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={5}>
            <TextField
              required fullWidth size="small"
              label="Application Name"
              name="name"
              value={form.name}
              onChange={handleChange}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth size="small"
              label="Namespace"
              name="namespace"
              value={form.namespace}
              onChange={handleChange}
              helperText='Group name (e.g. "backend")'
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              required fullWidth size="small"
              label={cfg.scriptLabel}
              name="script"
              value={form.script}
              onChange={handleChange}
              helperText={cfg.scriptHelp}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth size="small"
              label="Working Directory"
              name="cwd"
              value={form.cwd}
              onChange={handleChange}
              helperText="Leave empty to use script's directory"
              InputProps={{
                endAdornment: (
                  <Tooltip title="Auto-detect project type">
                    <span>
                      <IconButton size="small" onClick={detectType} disabled={detecting}>
                        {detecting ? <CircularProgress size={14} /> : <SearchIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                )
              }}
            />
          </Grid>

          {cfg.requiresInterpreter && (
            <Grid item xs={12}>
              <TextField
                fullWidth size="small"
                label="Interpreter Path"
                name="interpreter"
                value={form.interpreter}
                onChange={handleChange}
                helperText={cfg.interpreterHelp}
              />
            </Grid>
          )}
        </Grid>
      </Section>

      {/* ── Runtime ── */}
      <Section title="Runtime">
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} sm={3}>
            <TextField
              fullWidth size="small" type="number"
              label="Instances"
              name="instances"
              value={form.instances}
              onChange={handleChange}
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid item xs={6} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Exec Mode</InputLabel>
              <Select
                name="exec_mode"
                value={form.exec_mode}
                label="Exec Mode"
                disabled={!cfg.supportsCluster}
                onChange={e => setForm(prev => ({ ...prev, exec_mode: e.target.value }))}
              >
                <MenuItem value="fork">Fork</MenuItem>
                {cfg.supportsCluster && <MenuItem value="cluster">Cluster</MenuItem>}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField
              fullWidth size="small"
              label="Max Memory"
              name="max_memory_restart"
              value={form.max_memory_restart}
              onChange={handleChange}
              helperText="e.g. 150M, 1G"
            />
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField
              fullWidth size="small"
              label="Port"
              name="port"
              value={form.port}
              onChange={handleChange}
              error={!!portError}
              helperText={portError || 'Optional'}
            />
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={<Switch size="small" checked={form.autorestart} name="autorestart" onChange={handleChange} />}
                label={<Typography variant="body2">Auto Restart</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={form.watch} name="watch" onChange={handleChange} />}
                label={<Typography variant="body2">Watch for Changes</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={autoSetup} onChange={e => setAutoSetup(e.target.checked)} />}
                label={<Typography variant="body2">Auto Setup on Deploy</Typography>}
              />
            </Box>
          </Grid>

          {+form.instances > 1 && (
            <Grid item xs={12}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                {form.instances} instances
                {form.exec_mode === 'cluster'
                  ? ' in cluster mode — port is shared across instances.'
                  : ' — consider switching to Cluster mode for better load balancing.'}
              </Alert>
            </Grid>
          )}
        </Grid>
      </Section>

      {/* ── Environment Variables ── */}
      <Section title="Environment Variables">
        {envVars.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            {envVars.map((env, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small" label="Key" value={env.key} sx={{ flex: 1 }}
                  onChange={e => updateEnvVar(i, 'key', e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
                <TextField
                  size="small" label="Value" value={env.value} sx={{ flex: 2 }}
                  onChange={e => updateEnvVar(i, 'value', e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
                <IconButton size="small" color="error" onClick={() => removeEnvVar(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Divider sx={{ my: 1.5 }} />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small" label="Key" value={newEnv.key} sx={{ flex: 1 }}
            onChange={e => setNewEnv(prev => ({ ...prev, key: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEnvVar(); } }}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
          <TextField
            size="small" label="Value" value={newEnv.value} sx={{ flex: 2 }}
            onChange={e => setNewEnv(prev => ({ ...prev, value: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEnvVar(); } }}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
          <Button variant="outlined" size="small" onClick={addEnvVar} startIcon={<AddIcon />}
            disabled={!newEnv.key.trim()}>
            Add
          </Button>
        </Box>
        {envVars.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            No environment variables — type a key and value above, then press Add or Enter.
          </Typography>
        )}
      </Section>

      {/* @group Toast : Feedback snackbars */}
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default DeployApplication;

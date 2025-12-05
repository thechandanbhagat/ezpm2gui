import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Grid,
  SelectChangeEvent,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import CronExpressionBuilder from './CronExpressionBuilder';
import ScriptEditor from './ScriptEditor';
import { CronJobConfig, CronValidationResult } from '../types/cron';

interface CronJobDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (job: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  editJob?: CronJobConfig;
}

const CronJobDialog: React.FC<CronJobDialogProps> = ({
  open,
  onClose,
  onSave,
  editJob,
}) => {
  const theme = useTheme();
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<CronValidationResult>({ valid: true });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scriptType: 'node' as 'node' | 'python' | 'shell' | 'dotnet',
    scriptMode: 'inline' as 'file' | 'inline',
    scriptPath: '',
    inlineScript: '',
    cronExpression: '0 * * * *',
    args: [] as string[],
    env: {} as Record<string, string>,
    cwd: '',
    enabled: true,
  });

  const [newArg, setNewArg] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  useEffect(() => {
    if (editJob) {
      setFormData({
        name: editJob.name,
        description: editJob.description || '',
        scriptType: editJob.scriptType,
        scriptMode: editJob.scriptMode || 'file',
        scriptPath: editJob.scriptPath,
        inlineScript: editJob.inlineScript || '',
        cronExpression: editJob.cronExpression,
        args: editJob.args || [],
        env: editJob.env || {},
        cwd: editJob.cwd || '',
        enabled: editJob.enabled,
      });
    } else {
      // Reset form for new job
      setFormData({
        name: '',
        description: '',
        scriptType: 'node',
        scriptMode: 'inline',
        scriptPath: '',
        inlineScript: '',
        cronExpression: '0 * * * *',
        args: [],
        env: {},
        cwd: '',
        enabled: true,
      });
    }
  }, [editJob, open]);

  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSwitchChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.checked,
    }));
  };

  const addArg = () => {
    if (newArg.trim()) {
      setFormData((prev) => ({
        ...prev,
        args: [...prev.args, newArg.trim()],
      }));
      setNewArg('');
    }
  };

  const removeArg = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      args: prev.args.filter((_, i) => i !== index),
    }));
  };

  const addEnv = () => {
    if (newEnvKey.trim()) {
      setFormData((prev) => ({
        ...prev,
        env: {
          ...prev.env,
          [newEnvKey.trim()]: newEnvValue.trim(),
        },
      }));
      setNewEnvKey('');
      setNewEnvValue('');
    }
  };

  const removeEnv = (key: string) => {
    setFormData((prev) => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  const handleSubmit = async () => {
    if (!validation.valid) {
      return;
    }

    if (!formData.name || !formData.cronExpression) {
      alert('Please fill in all required fields');
      return;
    }

    if (formData.scriptMode === 'file' && !formData.scriptPath) {
      alert('Please provide a script path');
      return;
    }

    if (formData.scriptMode === 'inline' && !formData.inlineScript) {
      alert('Please write your script');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving cron job:', error);
      alert('Failed to save cron job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {editJob ? 'Edit Cron Job' : 'Create New Cron Job'}
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: '500px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Basic Info */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Basic Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  required
                  label="Job Name"
                  value={formData.name}
                  onChange={handleChange('name')}
                  placeholder="My Scheduled Task"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.enabled}
                      onChange={handleSwitchChange('enabled')}
                      color="success"
                    />
                  }
                  label="Enabled"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Description"
                  value={formData.description}
                  onChange={handleChange('description')}
                  placeholder="Optional description of this job"
                />
              </Grid>
            </Grid>
          </Box>

          {/* Script Configuration */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Script Configuration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth required>
                  <InputLabel>Script Type</InputLabel>
                  <Select
                    value={formData.scriptType}
                    onChange={handleChange('scriptType')}
                    label="Script Type"
                  >
                    <MenuItem value="node">Node.js</MenuItem>
                    <MenuItem value="python">Python</MenuItem>
                    <MenuItem value="shell">Shell Script</MenuItem>
                    <MenuItem value="dotnet">.NET</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={8}>
                <FormControl fullWidth required>
                  <InputLabel>Script Mode</InputLabel>
                  <Select
                    value={formData.scriptMode}
                    onChange={handleChange('scriptMode')}
                    label="Script Mode"
                  >
                    <MenuItem value="inline">Write Script Inline</MenuItem>
                    <MenuItem value="file">Use Script File</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {formData.scriptMode === 'file' ? (
                <>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      label="Script Path"
                      value={formData.scriptPath}
                      onChange={handleChange('scriptPath')}
                      placeholder="/path/to/script.js"
                      helperText="Absolute or relative path to your script"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Working Directory"
                      value={formData.cwd}
                      onChange={handleChange('cwd')}
                      placeholder="/path/to/working/directory"
                      helperText="Optional: Directory to run the script from"
                    />
                  </Grid>
                </>
              ) : (
                <Grid item xs={12}>
                  <ScriptEditor
                    value={formData.inlineScript}
                    onChange={(value) => setFormData((prev) => ({ ...prev, inlineScript: value }))}
                    scriptType={formData.scriptType}
                  />
                </Grid>
              )}
            </Grid>
          </Box>

          {/* Cron Schedule */}
          <Box>
            <CronExpressionBuilder
              value={formData.cronExpression}
              onChange={(expr) => setFormData((prev) => ({ ...prev, cronExpression: expr }))}
              onValidationChange={setValidation}
            />
          </Box>

          {/* Arguments */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Script Arguments (Optional)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Add argument"
                value={newArg}
                onChange={(e) => setNewArg(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addArg()}
              />
              <IconButton onClick={addArg} color="primary">
                <AddIcon />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {formData.args.map((arg, index) => (
                <Chip
                  key={index}
                  label={arg}
                  onDelete={() => removeArg(index)}
                  size="small"
                />
              ))}
            </Box>
          </Box>

          {/* Environment Variables */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Environment Variables (Optional)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="Key"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                placeholder="Value"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addEnv()}
                sx={{ flex: 2 }}
              />
              <IconButton onClick={addEnv} color="primary">
                <AddIcon />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {Object.entries(formData.env).map(([key, value]) => (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, minWidth: '100px' }}>
                    {key}
                  </Typography>
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
                    {value}
                  </Typography>
                  <IconButton size="small" onClick={() => removeEnv(key)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={saving || !validation.valid}
        >
          {saving ? 'Saving...' : editJob ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CronJobDialog;

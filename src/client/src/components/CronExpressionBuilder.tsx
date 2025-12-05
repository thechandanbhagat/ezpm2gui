import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Paper,
  SelectChangeEvent,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import { CronValidationResult } from '../types/cron';

interface CronExpressionBuilderProps {
  value: string;
  onChange: (expression: string) => void;
  onValidationChange?: (validation: CronValidationResult) => void;
}

const CronExpressionBuilder: React.FC<CronExpressionBuilderProps> = ({
  value,
  onChange,
  onValidationChange,
}) => {
  const theme = useTheme();
  
  // Parse current expression
  const parseCron = (expr: string) => {
    const parts = expr.split(' ');
    if (parts.length === 5) {
      return {
        minute: parts[0],
        hour: parts[1],
        dayOfMonth: parts[2],
        month: parts[3],
        dayOfWeek: parts[4],
      };
    }
    return {
      minute: '*',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
    };
  };

  const [cronParts, setCronParts] = useState(parseCron(value));
  const [validation, setValidation] = useState<CronValidationResult>({
    valid: true,
    description: '',
  });
  const [usePreset, setUsePreset] = useState(false);

  // Common presets
  const presets = {
    'Every minute': '* * * * *',
    'Every 5 minutes': '*/5 * * * *',
    'Every 15 minutes': '*/15 * * * *',
    'Every 30 minutes': '*/30 * * * *',
    'Every hour': '0 * * * *',
    'Every 6 hours': '0 */6 * * *',
    'Every day at midnight': '0 0 * * *',
    'Every day at noon': '0 12 * * *',
    'Every Monday at 9 AM': '0 9 * * 1',
    'Every weekday at 9 AM': '0 9 * * 1-5',
    'Every month on the 1st': '0 0 1 * *',
  };

  // Validate expression
  useEffect(() => {
    const validateExpression = async () => {
      try {
        const response = await axios.post('/api/cron-jobs/validate', {
          expression: value,
        });
        if (response.data.success) {
          const validationResult = response.data.data;
          setValidation(validationResult);
          if (onValidationChange) {
            onValidationChange(validationResult);
          }
        }
      } catch (error) {
        setValidation({
          valid: false,
          error: 'Invalid cron expression',
        });
        if (onValidationChange) {
          onValidationChange({
            valid: false,
            error: 'Invalid cron expression',
          });
        }
      }
    };

    if (value) {
      validateExpression();
    }
  }, [value, onValidationChange]);

  // Update expression when parts change
  useEffect(() => {
    const newExpression = `${cronParts.minute} ${cronParts.hour} ${cronParts.dayOfMonth} ${cronParts.month} ${cronParts.dayOfWeek}`;
    if (newExpression !== value) {
      onChange(newExpression);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronParts]);

  const handlePartChange = (part: keyof typeof cronParts, newValue: string) => {
    setCronParts((prev) => ({ ...prev, [part]: newValue }));
    setUsePreset(false);
  };

  const handlePresetChange = (event: SelectChangeEvent<string>) => {
    const preset = event.target.value;
    onChange(preset);
    setCronParts(parseCron(preset));
    setUsePreset(true);
  };

  const handleDirectChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setCronParts(parseCron(event.target.value));
    setUsePreset(false);
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        Cron Schedule
      </Typography>

      {/* Preset Selector */}
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Use Preset</InputLabel>
        <Select
          value={usePreset ? value : ''}
          onChange={handlePresetChange}
          label="Use Preset"
        >
          <MenuItem value="">
            <em>Custom</em>
          </MenuItem>
          {Object.entries(presets).map(([label, expr]) => (
            <MenuItem key={expr} value={expr}>
              {label} ({expr})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Manual Expression Input */}
      <TextField
        fullWidth
        label="Cron Expression"
        value={value}
        onChange={handleDirectChange}
        placeholder="* * * * *"
        sx={{ mb: 2 }}
        error={!validation.valid}
        helperText={
          validation.valid
            ? validation.description
            : validation.error
        }
      />

      {/* Visual Builder */}
      <Paper
        sx={{
          p: 2,
          mb: 2,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <Typography variant="caption" sx={{ mb: 2, display: 'block', color: 'text.secondary' }}>
          Build cron expression visually
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2.4}>
            <TextField
              fullWidth
              label="Minute"
              value={cronParts.minute}
              onChange={(e) => handlePartChange('minute', e.target.value)}
              placeholder="*"
              size="small"
              helperText="0-59 or *"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <TextField
              fullWidth
              label="Hour"
              value={cronParts.hour}
              onChange={(e) => handlePartChange('hour', e.target.value)}
              placeholder="*"
              size="small"
              helperText="0-23 or *"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <TextField
              fullWidth
              label="Day of Month"
              value={cronParts.dayOfMonth}
              onChange={(e) => handlePartChange('dayOfMonth', e.target.value)}
              placeholder="*"
              size="small"
              helperText="1-31 or *"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <TextField
              fullWidth
              label="Month"
              value={cronParts.month}
              onChange={(e) => handlePartChange('month', e.target.value)}
              placeholder="*"
              size="small"
              helperText="1-12 or *"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <TextField
              fullWidth
              label="Day of Week"
              value={cronParts.dayOfWeek}
              onChange={(e) => handlePartChange('dayOfWeek', e.target.value)}
              placeholder="*"
              size="small"
              helperText="0-6 or *"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Validation Result */}
      {validation.valid && validation.nextRun && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Next run:
          </Typography>
          <Chip
            label={new Date(validation.nextRun).toLocaleString()}
            size="small"
            color="success"
          />
        </Box>
      )}

      {/* Help Text */}
      <Box sx={{ mt: 2, p: 2, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.01)', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          <strong>Cron Expression Format:</strong> minute hour day-of-month month day-of-week
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          <strong>Examples:</strong> * = any value, */5 = every 5 units, 1-5 = range, 1,3,5 = specific values
        </Typography>
      </Box>
    </Box>
  );
};

export default CronExpressionBuilder;

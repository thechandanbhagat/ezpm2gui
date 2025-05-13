import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Switch,
  FormControl,
  FormControlLabel,
  Divider,
  Button,
  TextField,
  Grid,
  Alert,
  Snackbar,
  Card,
  CardContent,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Stack
} from '@mui/material';

const Settings: React.FC = () => {
  // Settings state
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<string>("3000");
  const [logLines, setLogLines] = useState<string>("100");
  const [darkMode, setDarkMode] = useState<boolean>(
    localStorage.getItem('darkMode') === 'true'
  );
  const [pm2Path, setPm2Path] = useState<string>("pm2");
  const [theme, setTheme] = useState<string>("blue");
  const [success, setSuccess] = useState<boolean>(false);
  
  const handleThemeChange = (event: SelectChangeEvent) => {
    setTheme(event.target.value);
  };
  
  const handleSaveSettings = () => {
    // Save all settings to localStorage
    localStorage.setItem('autoRefresh', autoRefresh.toString());
    localStorage.setItem('refreshInterval', refreshInterval);
    localStorage.setItem('logLines', logLines);
    localStorage.setItem('darkMode', darkMode.toString());
    localStorage.setItem('pm2Path', pm2Path);
    localStorage.setItem('theme', theme);
    
    // Show success message
    setSuccess(true);
  };
  
  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSuccess(false);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }} variant="outlined">
        <Typography variant="h5" gutterBottom color="primary">
          Application Settings
        </Typography>
        
        <Divider sx={{ my: 3 }} />
        
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  User Interface
                </Typography>
                
                <Stack spacing={3} sx={{ mt: 3 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={darkMode}
                        onChange={(e) => setDarkMode(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Dark Mode"
                  />
                  
                  <FormControl fullWidth variant="outlined" size="small">
                    <InputLabel id="theme-select-label">Theme Color</InputLabel>
                    <Select
                      labelId="theme-select-label"
                      id="theme-select"
                      value={theme}
                      label="Theme Color"
                      onChange={handleThemeChange}
                    >
                      <MenuItem value="blue">Blue</MenuItem>
                      <MenuItem value="green">Green</MenuItem>
                      <MenuItem value="purple">Purple</MenuItem>
                      <MenuItem value="orange">Orange</MenuItem>
                    </Select>
                  </FormControl>
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Auto Refresh Dashboard"
                  />
                  
                  <TextField
                    label="Refresh Interval (ms)"
                    variant="outlined"
                    type="number"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(e.target.value)}
                    disabled={!autoRefresh}
                    size="small"
                    fullWidth
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  PM2 Configuration
                </Typography>
                
                <Stack spacing={3} sx={{ mt: 3 }}>
                  <TextField
                    label="PM2 Path"
                    variant="outlined"
                    value={pm2Path}
                    onChange={(e) => setPm2Path(e.target.value)}
                    size="small"
                    fullWidth
                    helperText="Path to the PM2 executable (default: 'pm2')"
                  />
                  
                  <TextField
                    label="Log Lines to Display"
                    variant="outlined"
                    type="number"
                    value={logLines}
                    onChange={(e) => setLogLines(e.target.value)}
                    size="small"
                    fullWidth
                    helperText="Maximum number of log lines to display"
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSaveSettings}
          >
            Save Settings
          </Button>
        </Box>
      </Paper>
      
      <Snackbar open={success} autoHideDuration={6000} onClose={handleClose}>
        <Alert onClose={handleClose} severity="success" sx={{ width: '100%' }}>
          Settings saved successfully!
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Settings;

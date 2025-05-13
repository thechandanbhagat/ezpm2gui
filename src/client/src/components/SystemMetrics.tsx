import React from 'react';
import { SystemMetricsData } from '../types/pm2';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Divider,
  useTheme
} from '@mui/material';
import { 
  Memory as MemoryIcon, 
  Speed as SpeedIcon, 
  Schedule as ScheduleIcon,
  Dns as DnsIcon
} from '@mui/icons-material';

interface SystemMetricsProps {
  metrics: SystemMetricsData;
}

const SystemMetrics: React.FC<SystemMetricsProps> = ({ metrics }) => {
  const theme = useTheme();
  
  // Helper function to format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result;
  };

  // Calculate memory usage percentage
  const memoryUsagePercent = Math.round((metrics.memory.used / metrics.memory.total) * 100);
  
  // Determine load average status (visual indicator)
  const getLoadStatus = (load: number, cores: number): 'success' | 'warning' | 'error' => {
    if (load / cores > 0.8) return 'error';
    if (load / cores > 0.5) return 'warning';
    return 'success';
  };
  
  const loadStatus = getLoadStatus(metrics.loadAvg[0], metrics.cpus);

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        System Metrics
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DnsIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  CPU Cores
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ mb: 1 }}>
                {metrics.cpus}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total available CPU cores
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SpeedIcon color={loadStatus} sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Load Average
                </Typography>
                <Chip 
                  label="1 min" 
                  size="small" 
                  color={loadStatus}
                  variant="outlined"
                  sx={{ ml: 'auto' }} 
                />
              </Box>
              <Typography variant="h4" sx={{ mb: 1 }}>
                {metrics.loadAvg[0].toFixed(2)}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  5 min: {metrics.loadAvg[1].toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  15 min: {metrics.loadAvg[2].toFixed(2)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MemoryIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Memory Usage
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1 }}>
                <Typography variant="h4">
                  {memoryUsagePercent}%
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  of {formatMemory(metrics.memory.total)}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={memoryUsagePercent} 
                color={memoryUsagePercent > 90 ? "error" : memoryUsagePercent > 70 ? "warning" : "primary"}
                sx={{ height: 8, borderRadius: 1, mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                {formatMemory(metrics.memory.used)} used, {formatMemory(metrics.memory.free)} free
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  System Uptime
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ mb: 1 }}>
                {formatUptime(metrics.uptime)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Since last reboot
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemMetrics;

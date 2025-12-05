import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  FormControlLabel,
  Divider
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Dns as DnsIcon
} from '@mui/icons-material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { PM2Process, SystemMetricsData } from '../types/pm2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

interface AdvancedMonitoringDashboardProps {
  processes: PM2Process[];
  systemMetrics: SystemMetricsData;
  onRefresh: () => void;
}

interface HistoricalMetrics {
  timestamp: number;
  cpu: number;
  memory: number;
  loadAvg: number;
  processCount: number;
  onlineProcesses: number;
}

interface ProcessAlert {
  processId: number;
  processName: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

const AdvancedMonitoringDashboard: React.FC<AdvancedMonitoringDashboardProps> = ({
  processes,
  systemMetrics,
  onRefresh
}) => {
  const [historicalMetrics, setHistoricalMetrics] = useState<HistoricalMetrics[]>([]);
  const [alerts, setAlerts] = useState<ProcessAlert[]>([]);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);

  // Format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Calculate system health score
  const calculateHealthScore = (): number => {
    const memoryUsagePercent = (systemMetrics.memory.used / systemMetrics.memory.total) * 100;
    const loadAvgPercent = (systemMetrics.loadAvg[0] / systemMetrics.cpus) * 100;
    const onlineProcessPercent = processes.length > 0 ? 
      (processes.filter(p => p.pm2_env.status === 'online').length / processes.length) * 100 : 100;
    
    // Weight the factors
    const memoryScore = Math.max(0, 100 - memoryUsagePercent);
    const loadScore = Math.max(0, 100 - loadAvgPercent);
    const processScore = onlineProcessPercent;
    
    return Math.round((memoryScore * 0.3 + loadScore * 0.3 + processScore * 0.4));
  };

  // Get health status color
  const getHealthColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  // Generate alerts based on process and system state
  const generateAlerts = (): ProcessAlert[] => {
    const newAlerts: ProcessAlert[] = [];
    const now = Date.now();

    // Check for stopped processes
    processes.forEach(process => {
      if (process.pm2_env.status !== 'online') {
        newAlerts.push({
          processId: process.pm_id,
          processName: process.name,
          type: 'error',
          message: `Process is ${process.pm2_env.status}`,
          timestamp: now
        });
      }

      // Check for high memory usage
      if (process.monit.memory > 500 * 1024 * 1024) { // 500MB
        newAlerts.push({
          processId: process.pm_id,
          processName: process.name,
          type: 'warning',
          message: `High memory usage: ${formatMemory(process.monit.memory)}`,
          timestamp: now
        });
      }

      // Check for high CPU usage
      if (process.monit.cpu > 80) {
        newAlerts.push({
          processId: process.pm_id,
          processName: process.name,
          type: 'warning',
          message: `High CPU usage: ${process.monit.cpu.toFixed(1)}%`,
          timestamp: now
        });
      }

      // Check for frequent restarts
      if (process.pm2_env.restart_time > 5) {
        newAlerts.push({
          processId: process.pm_id,
          processName: process.name,
          type: 'warning',
          message: `Frequent restarts: ${process.pm2_env.restart_time} times`,
          timestamp: now
        });
      }
    });

    // System-level alerts
    const memoryUsagePercent = (systemMetrics.memory.used / systemMetrics.memory.total) * 100;
    if (memoryUsagePercent > 90) {
      newAlerts.push({
        processId: -1,
        processName: 'System',
        type: 'error',
        message: `Critical memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        timestamp: now
      });
    }

    const loadAvgPercent = (systemMetrics.loadAvg[0] / systemMetrics.cpus) * 100;
    if (loadAvgPercent > 100) {
      newAlerts.push({
        processId: -1,
        processName: 'System',
        type: 'warning',
        message: `High system load: ${systemMetrics.loadAvg[0].toFixed(2)}`,
        timestamp: now
      });
    }

    return newAlerts;
  };

  // Update historical metrics
  useEffect(() => {
    if (realTimeUpdates) {
      const now = Date.now();
      const onlineProcesses = processes.filter(p => p.pm2_env.status === 'online').length;
      
      const newMetric: HistoricalMetrics = {
        timestamp: now,
        cpu: processes.reduce((sum, p) => sum + p.monit.cpu, 0) / Math.max(processes.length, 1),
        memory: systemMetrics.memory.used,
        loadAvg: systemMetrics.loadAvg[0],
        processCount: processes.length,
        onlineProcesses
      };

      setHistoricalMetrics(prev => {
        const updated = [...prev, newMetric];
        // Keep only last 100 data points for performance
        return updated.slice(-100);
      });      // Update alerts
      setAlerts(generateAlerts());
    }
  }, [processes, systemMetrics, realTimeUpdates, generateAlerts]);

  // Prepare chart data
  const chartData = {
    labels: historicalMetrics.map(m => new Date(m.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: historicalMetrics.map(m => m.cpu),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Memory Usage (GB)',
        data: historicalMetrics.map(m => m.memory / (1024 * 1024 * 1024)),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y1'
      },
      {
        label: 'Load Average',
        data: historicalMetrics.map(m => m.loadAvg),
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'System Performance Trends'
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        beginAtZero: true,
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        beginAtZero: true,
        grid: {
          drawOnChartArea: false,
        },
      },
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  };

  const healthScore = calculateHealthScore();
  const healthColor = getHealthColor(healthScore);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Advanced Monitoring Dashboard
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={realTimeUpdates}
                onChange={(e) => setRealTimeUpdates(e.target.checked)}
                color="primary"
              />
            }
            label="Real-time Updates"
          />          <Tooltip title="Refresh Data">
            <IconButton onClick={onRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* System Health Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon color={healthColor} sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  System Health
                </Typography>
              </Box>
              <Typography variant="h3" color={`${healthColor}.main`}>
                {healthScore}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Overall system status
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DnsIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Active Processes
                </Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {processes.filter(p => p.pm2_env.status === 'online').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                of {processes.length} total
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MemoryIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Memory Usage
                </Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {Math.round((systemMetrics.memory.used / systemMetrics.memory.total) * 100)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatMemory(systemMetrics.memory.used)} of {formatMemory(systemMetrics.memory.total)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SpeedIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  CPU Load
                </Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {systemMetrics.loadAvg[0].toFixed(1)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {systemMetrics.cpus} cores available
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts and Alerts */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ height: 400 }}>
              <Line data={chartData} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: 400, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Active Alerts
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {alerts.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '60%',
                color: 'success.main'
              }}>
                <CheckCircleIcon sx={{ fontSize: 48, mb: 2 }} />
                <Typography variant="body1">All systems healthy</Typography>
              </Box>
            ) : (
              <List>
                {alerts.map((alert, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon>
                      {alert.type === 'error' && <ErrorIcon color="error" />}
                      {alert.type === 'warning' && <WarningIcon color="warning" />}
                      {alert.type === 'info' && <CheckCircleIcon color="info" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight="medium">
                          {alert.processName}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {alert.message}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Process Performance Table */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Process Performance Overview
        </Typography>
        <Grid container spacing={2}>
          {processes.map((process) => (
            <Grid item xs={12} sm={6} md={4} key={process.pm_id}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {process.name}
                    </Typography>
                    <Chip
                      label={process.pm2_env.status}
                      color={process.pm2_env.status === 'online' ? 'success' : 'error'}
                      size="small"
                    />
                  </Box>
                  
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      CPU: {process.monit.cpu.toFixed(1)}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(process.monit.cpu, 100)}
                      color={process.monit.cpu > 80 ? 'error' : process.monit.cpu > 50 ? 'warning' : 'primary'}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Memory: {formatMemory(process.monit.memory)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((process.monit.memory / (100 * 1024 * 1024)) * 100, 100)}
                      color={process.monit.memory > 500 * 1024 * 1024 ? 'error' : 
                             process.monit.memory > 200 * 1024 * 1024 ? 'warning' : 'primary'}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary">
                    Restarts: {process.pm2_env.restart_time}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default AdvancedMonitoringDashboard;

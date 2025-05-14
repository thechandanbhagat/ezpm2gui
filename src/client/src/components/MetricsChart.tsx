import React, { useState, useEffect } from 'react';
import { PM2Process } from '../types/pm2';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';

// Register the chart components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface MetricsChartProps {
  processId: number;
  initialData: PM2Process;
}

interface MetricPoint {
  timestamp: number;
  cpu: number;
  memory: number;
}

const MetricsChart: React.FC<MetricsChartProps> = ({ processId, initialData }) => {
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Helper function to format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  useEffect(() => {
    // Initialize with the current metrics
    if (initialData && initialData.monit) {
      setMetrics([{
        timestamp: Date.now(),
        cpu: initialData.monit.cpu,
        memory: initialData.monit.memory
      }]);
    }

    // Set up polling for metrics
    const intervalId = setInterval(async () => {
      try {
        const response = await axios.get(`/api/process/${processId}/stats`);
        if (response.data && response.data.monit) {
          setMetrics(prevMetrics => {
            // Keep only the last 20 data points
            const newMetrics = [...prevMetrics, {
              timestamp: Date.now(),
              cpu: response.data.monit.cpu,
              memory: response.data.monit.memory
            }];
            
            if (newMetrics.length > 20) {
              return newMetrics.slice(newMetrics.length - 20);
            }
            return newMetrics;
          });
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching metrics:', err);
        setError(`Failed to fetch metrics: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [processId, initialData]);

  // Get latest values
  const latestCpu = metrics.length > 0 ? metrics[metrics.length - 1].cpu : (initialData.monit ? initialData.monit.cpu : 0);
  const latestMemory = metrics.length > 0 ? metrics[metrics.length - 1].memory : (initialData.monit ? initialData.monit.memory : 0);

  // Prepare chart data
  const cpuChartData = {
    labels: metrics.map(m => new Date(m.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: metrics.map(m => m.cpu),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }
    ]
  };

  const memoryChartData = {
    labels: metrics.map(m => new Date(m.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Memory Usage (MB)',
        data: metrics.map(m => m.memory / (1024 * 1024)), // Convert to MB
        fill: false,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      }
    ]
  };

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Current CPU Usage
              </Typography>
              <Typography variant="h4" color="primary">
                {latestCpu.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Current Memory Usage
              </Typography>
              <Typography variant="h4" color="primary">
                {formatMemory(latestMemory)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              CPU Usage Over Time
            </Typography>
            <Box sx={{ height: 250 }}>
              <Line 
                data={cpuChartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      suggestedMax: 100
                    }
                  }
                }} 
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Memory Usage Over Time
            </Typography>
            <Box sx={{ height: 250 }}>
              <Line 
                data={memoryChartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                }} 
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default MetricsChart;

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  LinearProgress,
  useTheme,
  Chip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';
import { PM2Process } from '../types/pm2';
import { useNavigate } from 'react-router-dom';

interface MonitDashboardProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

const MonitDashboard: React.FC<MonitDashboardProps> = ({ processes, onRefresh }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<'cpu' | 'memory'>('cpu');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Helper functions for formatting
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (uptime: number): string => {
    const seconds = Math.floor((Date.now() - uptime) / 1000);
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const getStatusColor = (status: string): "success" | "error" | "warning" => {
    if (status === 'online') return 'success';
    if (status === 'stopped') return 'error';
    return 'warning';
  };

  // Sort processes
  const sortedProcesses = [...processes].sort((a, b) => {
    let valueA, valueB;
    
    if (sortField === 'cpu') {
      valueA = a.monit.cpu;
      valueB = b.monit.cpu;
    } else {
      valueA = a.monit.memory;
      valueB = b.monit.memory;
    }

    return sortDirection === 'asc' 
      ? valueA - valueB 
      : valueB - valueA;
  });

  const handleSort = (field: 'cpu' | 'memory') => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const handleRowClick = (pmId: number) => {
    navigate(`/process/${pmId}`);
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5">Process Monitor</Typography>
          <Tooltip title="Refresh Data">
            <IconButton onClick={onRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider sx={{ mb: 3 }} />
        
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Paper 
              sx={{ 
                p: 2, 
                bgcolor: theme.palette.background.default,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
              elevation={2}
            >
              <Typography variant="h6" gutterBottom align="center">
                Processes
              </Typography>
              <Typography variant="h3" align="center" color="primary">
                {processes.length}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" align="center">
                  {processes.filter(p => p.pm2_env.status === 'online').length} online
                </Typography>
                <Typography variant="body2" align="center">
                  {processes.filter(p => p.pm2_env.status !== 'online').length} stopped
                </Typography>
              </Box>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper 
              sx={{ 
                p: 2, 
                bgcolor: theme.palette.background.default,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
              elevation={2}
            >
              <Typography variant="h6" gutterBottom align="center">
                <SpeedIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                CPU Usage
              </Typography>
              <Typography variant="h3" align="center" color="secondary">
                {sortedProcesses.length > 0 ? 
                  `${Math.max(...sortedProcesses.map(p => p.monit.cpu)).toFixed(1)}%` : 
                  '0%'
                }
              </Typography>
              <Typography variant="body2" align="center" sx={{ mt: 1 }}>
                Highest process CPU
              </Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper 
              sx={{ 
                p: 2, 
                bgcolor: theme.palette.background.default,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
              elevation={2}
            >
              <Typography variant="h6" gutterBottom align="center">
                <MemoryIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                Memory Usage
              </Typography>
              <Typography variant="h3" align="center" color="info.main">
                {sortedProcesses.length > 0 ? 
                  formatMemory(Math.max(...sortedProcesses.map(p => p.monit.memory))) : 
                  '0 MB'
                }
              </Typography>
              <Typography variant="body2" align="center" sx={{ mt: 1 }}>
                Highest process memory
              </Typography>
            </Paper>
          </Grid>
        </Grid>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>App Name</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell 
                  onClick={() => handleSort('cpu')}
                  sx={{ cursor: 'pointer' }}
                >
                  CPU {sortField === 'cpu' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableCell>
                <TableCell 
                  onClick={() => handleSort('memory')}
                  sx={{ cursor: 'pointer' }}
                >
                  Memory {sortField === 'memory' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableCell>
                <TableCell>Uptime</TableCell>
                <TableCell>Restarts</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedProcesses.map((process) => (
                <TableRow 
                  key={process.pm_id}
                  hover
                  onClick={() => handleRowClick(process.pm_id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {process.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{process.pm_id}</TableCell>
                  <TableCell>
                    <Chip
                      label={process.pm2_env.status}
                      color={getStatusColor(process.pm2_env.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: '100%', mr: 1 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(process.monit.cpu, 100)} 
                          color="secondary"
                          sx={{ height: 8, borderRadius: 5 }}
                        />
                      </Box>
                      <Box sx={{ minWidth: 35 }}>
                        <Typography variant="body2" color="secondary">
                          {process.monit.cpu.toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: '100%', mr: 1 }}>
                        <LinearProgress 
                          variant="determinate" 
                          // Calculate percentage based on highest memory usage in list
                          value={sortedProcesses.length > 0 
                            ? (process.monit.memory / Math.max(...sortedProcesses.map(p => p.monit.memory))) * 100
                            : 0
                          } 
                          color="info"
                          sx={{ height: 8, borderRadius: 5 }}
                        />
                      </Box>
                      <Box sx={{ minWidth: 65 }}>
                        <Typography variant="body2" color="info.main">
                          {formatMemory(process.monit.memory)}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {process.pm2_env.status === 'online' 
                      ? formatUptime(process.pm2_env.pm_uptime) 
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    {process.pm2_env.restart_time}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default MonitDashboard;

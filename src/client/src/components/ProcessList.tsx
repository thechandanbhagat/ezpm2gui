import React from 'react';
import { Link } from 'react-router-dom';
import { PM2Process } from '../types/pm2';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Info as InfoIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  List as ListIcon
} from '@mui/icons-material';

interface ProcessListProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

const ProcessList: React.FC<ProcessListProps> = ({ processes, onAction }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Helper function to format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to determine status color
  const getStatusColor = (status: string): "success" | "error" | "warning" => {
    if (status === 'online') return 'success';
    if (status === 'stopped') return 'error';
    return 'warning';
  };

  if (processes.length === 0) {
    return (
      <Paper 
        sx={{ 
          p: 3, 
          textAlign: 'center', 
          bgcolor: 'background.paper' 
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No PM2 Processes Found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Make sure PM2 is running and has active processes.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        PM2 Processes
      </Typography>
      
      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 650 }} size="small">
          <TableHead>
            <TableRow sx={{ 
              bgcolor: theme => theme.palette.mode === 'dark' 
                ? 'grey.800' 
                : 'grey.100' 
            }}>
              <TableCell><Typography variant="subtitle2">Name</Typography></TableCell>
              <TableCell><Typography variant="subtitle2">ID</Typography></TableCell>
              <TableCell><Typography variant="subtitle2">Status</Typography></TableCell>
              <TableCell><Typography variant="subtitle2">CPU</Typography></TableCell>
              <TableCell><Typography variant="subtitle2">Memory</Typography></TableCell>
              <TableCell align="right"><Typography variant="subtitle2">Actions</Typography></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processes.map((process) => (
              <TableRow 
                key={process.pm_id}
                sx={{ 
                  '&:hover': { 
                    bgcolor: theme => theme.palette.mode === 'dark' 
                      ? 'grey.800' 
                      : 'grey.50' 
                  }
                }}
              >
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {process.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {process.pm_id}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={process.pm2_env.status}
                    size="small"
                    color={getStatusColor(process.pm2_env.status)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {process.monit ? `${process.monit.cpu}%` : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {isMobile ? (
                    <ButtonGroup size="small">
                      <IconButton 
                        size="small" 
                        component={Link}
                        to={`/process/${process.pm_id}`}
                        color="primary"
                      >
                        <InfoIcon fontSize="small" />
                      </IconButton>
                      
                      {process.pm2_env.status === 'online' ? (
                        <>
                          <IconButton 
                            size="small" 
                            onClick={() => onAction(process.pm_id, 'restart')}
                            color="warning"
                          >
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={() => onAction(process.pm_id, 'stop')}
                            color="error"
                          >
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton 
                          size="small" 
                          onClick={() => onAction(process.pm_id, 'start')}
                          color="success"
                        >
                          <PlayIcon fontSize="small" />
                        </IconButton>
                      )}                      <IconButton 
                        size="small" 
                        onClick={() => onAction(process.pm_id, 'delete')}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      
                      <IconButton 
                        size="small" 
                        component={Link}
                        to={`/configure/${process.pm_id}`}
                        color="info"
                      >
                        <SettingsIcon fontSize="small" />
                      </IconButton>
                      
                      <IconButton 
                        size="small" 
                        component={Link}
                        to={`/logs/${process.pm_id}`}
                        color="secondary"
                      >
                        <ListIcon fontSize="small" />
                      </IconButton>
                    </ButtonGroup>
                  ) : (
                    <ButtonGroup size="small">
                      <Tooltip title="View Details">
                        <Button
                          component={Link}
                          to={`/process/${process.pm_id}`}
                          variant="outlined"
                          color="primary"
                          startIcon={<InfoIcon />}
                        >
                          Details
                        </Button>
                      </Tooltip>
                      
                      {process.pm2_env.status === 'online' ? (
                        <>
                          <Tooltip title="Restart Process">
                            <Button
                              onClick={() => onAction(process.pm_id, 'restart')}
                              variant="outlined"
                              color="warning"
                              startIcon={<RefreshIcon />}
                            >
                              Restart
                            </Button>
                          </Tooltip>
                          <Tooltip title="Stop Process">
                            <Button
                              onClick={() => onAction(process.pm_id, 'stop')}
                              variant="outlined"
                              color="error"
                              startIcon={<StopIcon />}
                            >
                              Stop
                            </Button>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip title="Start Process">
                          <Button
                            onClick={() => onAction(process.pm_id, 'start')}
                            variant="outlined"
                            color="success"
                            startIcon={<PlayIcon />}
                          >
                            Start
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete Process">
                        <Button
                          onClick={() => onAction(process.pm_id, 'delete')}
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteIcon />}
                        >                          Delete
                        </Button>
                      </Tooltip>
                      <Tooltip title="Configure">
                        <Button
                          component={Link}
                          to={`/configure/${process.pm_id}`}
                          variant="outlined"
                          color="info"
                          startIcon={<SettingsIcon />}
                        >
                          Configure
                        </Button>
                      </Tooltip>
                      <Tooltip title="View Logs">
                        <Button
                          component={Link}
                          to={`/logs/${process.pm_id}`}
                          variant="outlined"
                          color="secondary"
                          startIcon={<ListIcon />}
                        >
                          Logs
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ProcessList;

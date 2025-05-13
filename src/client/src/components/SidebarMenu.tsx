import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  ListSubheader,
  Box,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Monitor as MonitorIcon,
  Add as AddIcon,
  Extension as ExtensionIcon,
  Description as DescriptionIcon,
  Dashboard,
  StackedLineChart as ChartIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  Balance as BalanceIcon,
} from '@mui/icons-material';

interface SidebarMenuProps {
  toggleAbout: () => void;
  onItemClick?: () => void; // Optional callback when a menu item is clicked (for mobile)
}

const SidebarMenu: React.FC<SidebarMenuProps> = ({ toggleAbout, onItemClick }) => {
  const location = useLocation();
  const theme = useTheme();
  const currentPath = location.pathname;

  const handleItemClick = () => {
    if (onItemClick) {
      onItemClick();
    }
  };
  const isActive = (path: string) => {
    if (path === '/' && (currentPath === '/' || currentPath === '/processes')) {
      return true;
    }
    return currentPath === path;
  };
  const menuItems = [    { 
      label: 'Processes', 
      path: '/processes', 
      icon: <DashboardIcon /> 
    },
    { 
      label: 'Monitoring', 
      path: '/monit', 
      icon: <MonitorIcon /> 
    },
    { 
      label: 'Deploy New App', 
      path: '/deploy', 
      icon: <AddIcon /> 
    },
    { 
      label: 'PM2 Modules', 
      path: '/modules', 
      icon: <ExtensionIcon /> 
    },
    { 
      label: 'Ecosystem Config', 
      path: '/ecosystem', 
      icon: <DescriptionIcon /> 
    },
    { 
      label: 'Cluster Management', 
      path: '/cluster', 
      icon: <Dashboard /> 
    },
    { 
      label: 'Load Balancing Guide', 
      path: '/load-balancing-guide', 
      icon: <BalanceIcon /> 
    },
    { 
      label: 'Log Streaming', 
      path: '/logs', 
      icon: <ChartIcon /> 
    },
  ];

  return (
    <>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="subtitle1" color="primary" fontWeight="bold">
          ezPM2GUI
        </Typography>
      </Box>
      <Divider />
      <List component="nav" aria-label="main navigation">
        <ListSubheader component="div" sx={{ backgroundColor: 'transparent' }}>
          Process Management
        </ListSubheader>

        {menuItems.map((item) => (
          <ListItem 
            button 
            component={Link} 
            to={item.path} 
            onClick={handleItemClick}
            key={item.path}
            sx={{
              backgroundColor: isActive(item.path) ? 
                theme.palette.action.selected : 
                'transparent',
              borderRadius: '4px',
              my: 0.5,
              mx: 1,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              }
            }}
          >
            <ListItemIcon sx={{ 
              color: isActive(item.path) ? theme.palette.primary.main : 'inherit'
            }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText 
              primary={item.label}
              primaryTypographyProps={{
                fontWeight: isActive(item.path) ? 'bold' : 'normal',
                color: isActive(item.path) ? theme.palette.primary.main : 'inherit'
              }}
            />
          </ListItem>
        ))}
      </List>
      
      <Divider sx={{ mt: 2, mb: 2 }} />
      
      <List component="nav" aria-label="system navigation">
        <ListSubheader component="div" sx={{ backgroundColor: 'transparent' }}>
          System
        </ListSubheader>

        <ListItem 
          button 
          onClick={() => { toggleAbout(); handleItemClick(); }}
          sx={{
            borderRadius: '4px',
            my: 0.5,
            mx: 1,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            }
          }}
        >
          <ListItemIcon>
            <InfoIcon />
          </ListItemIcon>
          <ListItemText primary="About" />
        </ListItem>
        
        <ListItem 
          button 
          component={Link}
          to="/settings"
          onClick={handleItemClick}
          sx={{
            backgroundColor: isActive('/settings') ? 
              theme.palette.action.selected : 
              'transparent',
            borderRadius: '4px',
            my: 0.5,
            mx: 1,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            }
          }}
        >
          <ListItemIcon sx={{ 
            color: isActive('/settings') ? theme.palette.primary.main : 'inherit'
          }}>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText 
            primary="Settings"
            primaryTypographyProps={{
              fontWeight: isActive('/settings') ? 'bold' : 'normal',
              color: isActive('/settings') ? theme.palette.primary.main : 'inherit'
            }}
          />
        </ListItem>
      </List>
    </>
  );
};

export default SidebarMenu;

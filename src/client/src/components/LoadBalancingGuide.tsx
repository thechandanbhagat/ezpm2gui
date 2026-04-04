import React, { useState } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, Button
} from '@mui/material';
import {
  BubbleChart as BubbleChartIcon, Speed as SpeedIcon,
  DeviceHub as DeviceHubIcon, ExpandMore as ExpandMoreIcon,
  Code as CodeIcon, Update as UpdateIcon, Settings as SettingsIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import PageHeader from './PageHeader';

// @group LoadBalancingGuide : PM2 load balancing reference guide
const LoadBalancingGuide: React.FC = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | false>('panel1');
  const toggle = (panel: string) => (_: React.SyntheticEvent, open: boolean) =>
    setExpanded(open ? panel : false);

  // @group Render : Guide layout with accordions
  return (
    <Box>
      <PageHeader
        title="Load Balancing Guide"
        subtitle="How to set up PM2 cluster mode and distribute traffic across CPU cores"
        actions={
          <Button variant="outlined" onClick={() => navigate('/cluster')}>
            Go to Cluster Management
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Accordion expanded={expanded === 'panel1'} onChange={toggle('panel1')} disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>What is PM2 Load Balancing?</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" paragraph>
              PM2 load balancing creates multiple instances of your app that share the same port,
              distributing requests across all instances automatically. Useful for:
            </Typography>
            <List dense disablePadding>
              {[
                [SpeedIcon,      'Utilise all CPU cores for maximum throughput'],
                [DeviceHubIcon,  'Distribute incoming requests across worker processes'],
                [UpdateIcon,     'Enable zero-downtime reloads during deployments'],
              ].map(([Icon, text]: any, i) => (
                <ListItem key={i} sx={{ py: 0.25, px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={<Typography variant="body2">{text}</Typography>} />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>

        <Accordion expanded={expanded === 'panel2'} onChange={toggle('panel2')} disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Setting Up Load Balancing</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Two settings are required in your ecosystem.config.js:
            </Typography>
            <Grid container spacing={2}>
              {[
                { title: 'Multiple Instances', desc: 'Set instances > 1 to create workers. Use -1 to match CPU core count.', code: '"instances": 4  // or -1 for max' },
                { title: 'Cluster Mode',       desc: 'Allow all instances to share the same server port.', code: '"exec_mode": "cluster"' },
              ].map(({ title, desc, code }) => (
                <Grid item xs={12} md={6} key={title}>
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '12px !important' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{desc}</Typography>
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {code}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion expanded={expanded === 'panel3'} onChange={toggle('panel3')} disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Best Practices</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <List dense disablePadding>
              {[
                [SettingsIcon,      'Instances',       'Match CPU cores for CPU-bound apps. I/O-bound apps can use more.'],
                [CodeIcon,          'Stateless Design','Keep app stateless or use Redis for shared session storage.'],
                [BubbleChartIcon,   'Memory Limits',   'Set max_memory_restart to automatically cycle processes with leaks.'],
                [UpdateIcon,        'Zero-downtime',   'Use pm2 reload (not restart) to update without dropping connections.'],
              ].map(([Icon, primary, secondary]: any) => (
                <ListItem key={primary} sx={{ py: 0.5, px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                  <ListItemText
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>{primary}</Typography>}
                    secondary={<Typography variant="caption" color="text.secondary">{secondary}</Typography>}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Box>
  );
};

export default LoadBalancingGuide;

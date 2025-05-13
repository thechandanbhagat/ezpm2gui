import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Grid,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button
} from '@mui/material';
import {
  BubbleChart as BubbleChartIcon,
  Speed as SpeedIcon,
  DeviceHub as DeviceHubIcon,
  ExpandMore as ExpandMoreIcon,
  Code as CodeIcon,
  Update as UpdateIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

const LoadBalancingGuide: React.FC = () => {
  const [expanded, setExpanded] = useState<string | false>('panel1');

  const handleChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>PM2 Load Balancing Guide</Typography>
        <Divider sx={{ mb: 3 }} />
        
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body1">
            PM2 provides built-in load balancing capabilities for Node.js applications.
            This guide will help you understand how to set it up and use it effectively.
          </Typography>
        </Alert>
        
        <Accordion expanded={expanded === 'panel1'} onChange={handleChange('panel1')}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography variant="h6">What is PM2 Load Balancing?</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" paragraph>
              PM2 Load Balancing allows your application to handle more traffic by creating multiple instances of your application
              that work together. This is particularly useful for:
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon><SpeedIcon /></ListItemIcon>
                <ListItemText primary="Improving performance by utilizing all CPU cores" />
              </ListItem>
              <ListItem>
                <ListItemIcon><DeviceHubIcon /></ListItemIcon>
                <ListItemText primary="Distributing incoming requests across multiple instances" />
              </ListItem>
              <ListItem>
                <ListItemIcon><UpdateIcon /></ListItemIcon>
                <ListItemText primary="Enabling zero-downtime reloads and updates" />
              </ListItem>
            </List>
          </AccordionDetails>
        </Accordion>
        
        <Accordion expanded={expanded === 'panel2'} onChange={handleChange('panel2')}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography variant="h6">How to Set Up Load Balancing</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" paragraph>
              Setting up load balancing with PM2 requires two key settings:
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title="Multiple Instances" />
                  <CardContent>
                    <Typography variant="body2" paragraph>
                      Set the number of instances greater than 1 to create multiple workers.
                      Use 0 or -1 to automatically use all available CPU cores.
                    </Typography>
                    <Box sx={{ p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                      <Typography variant="body2" component="code">
                        "instances": 4  // or -1 for max
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title="Cluster Mode" />
                  <CardContent>
                    <Typography variant="body2" paragraph>
                      Set the execution mode to "cluster" to allow all instances to share the same server port.
                    </Typography>
                    <Box sx={{ p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                      <Typography variant="body2" component="code">
                        "exec_mode": "cluster"
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
        
        <Accordion expanded={expanded === 'panel3'} onChange={handleChange('panel3')}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography variant="h6">Best Practices</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              <ListItem>
                <ListItemIcon><SettingsIcon /></ListItemIcon>
                <ListItemText 
                  primary="Number of Instances" 
                  secondary="For CPU-bound applications, use a number equal to your CPU cores. For I/O-bound applications, you can use more."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CodeIcon /></ListItemIcon>
                <ListItemText 
                  primary="Application Design" 
                  secondary="Ensure your application is stateless or uses external state storage like Redis for session management."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><BubbleChartIcon /></ListItemIcon>
                <ListItemText 
                  primary="Memory Management" 
                  secondary="Monitor memory usage and set appropriate max_memory_restart limits to prevent memory leaks."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><UpdateIcon /></ListItemIcon>
                <ListItemText 
                  primary="Zero-downtime Updates" 
                  secondary="Use the reload feature instead of restart to update your application without disrupting service."
                />
              </ListItem>
            </List>
          </AccordionDetails>
        </Accordion>
        
        <Grid container sx={{ mt: 3 }}>
          <Grid item>
            <Button
              variant="contained"
              color="primary"              href="/processes"
            >
              Go to Process List
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default LoadBalancingGuide;

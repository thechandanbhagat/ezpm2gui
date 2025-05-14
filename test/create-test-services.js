#!/usr/bin/env node

/**
 * Simple test script to create some PM2 processes for testing ezPM2GUI
 */
const pm2 = require('pm2');
const path = require('path');

// Define some test services
const testServices = [
  {
    name: 'test-service-1',
    script: path.join(__dirname, 'test-service1.js'),
  },
  {
    name: 'test-service-2',
    script: path.join(__dirname, 'test-service2.js'),
  },
  {
    name: 'test-service-3',
    script: path.join(__dirname, 'test-service3.js'),
  }
];

pm2.connect((err) => {
  if (err) {
    console.error('Error connecting to PM2:', err);
    process.exit(1);
  }

  console.log('Creating test services...');

  const startProcesses = () => {
    let started = 0;
    
    testServices.forEach((service) => {
      pm2.start(service, (err) => {
        if (err) {
          console.error(`Error starting ${service.name}:`, err);
        } else {
          console.log(`Started ${service.name}`);
        }
        
        started++;
        if (started === testServices.length) {
          pm2.disconnect();
          console.log('\nTest services created. You can now run ezPM2GUI to monitor them.');
        }
      });
    });
  };

  // Delete existing services first
  pm2.list((err, list) => {
    if (err) {
      console.error('Error listing processes:', err);
      startProcesses();
      return;
    }

    const testServiceIds = list
      .filter(p => p.name.startsWith('test-service-'))
      .map(p => p.pm_id);
    
    if (testServiceIds.length === 0) {
      startProcesses();
      return;
    }

    console.log('Deleting existing test services...');
    
    let deleted = 0;
    testServiceIds.forEach(id => {
      pm2.delete(id, (err) => {
        if (err) {
          console.error(`Error deleting process ${id}:`, err);
        }
        
        deleted++;
        if (deleted === testServiceIds.length) {
          startProcesses();
        }
      });
    });
  });
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ecosystemConfig = `
module.exports = {
  apps : [
    {
      name: "my-api",
      script: "./api/index.js",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "worker",
      script: "./workers/queue-processor.js",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "cron-job",
      script: "./cron/scheduler.js",
      instances: 1,
      watch: false,
      cron_restart: "0 0 * * *",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
`;

// Get the output path
const outputPath = process.argv[2] || 'ecosystem.config.js';
const fullPath = path.resolve(process.cwd(), outputPath);

try {
  // Write file
  fs.writeFileSync(fullPath, ecosystemConfig);
  console.log(`PM2 ecosystem file generated at: ${fullPath}`);
  console.log('\nTo start your PM2 processes with this configuration:');
  console.log('  pm2 start ecosystem.config.js');
  console.log('\nTo monitor your processes with ezPM2GUI:');
  console.log('  ezpm2gui');
} catch (error) {
  console.error('Error generating ecosystem file:', error);
}

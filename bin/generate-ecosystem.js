#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
const fullPath = path_1.default.resolve(process.cwd(), outputPath);
try {
    // Write file
    fs_1.default.writeFileSync(fullPath, ecosystemConfig);
    console.log(`PM2 ecosystem file generated at: ${fullPath}`);
    console.log('\nTo start your PM2 processes with this configuration:');
    console.log('  pm2 start ecosystem.config.js');
    console.log('\nTo monitor your processes with ezPM2GUI:');
    console.log('  ezpm2gui');
}
catch (error) {
    console.error('Error generating ecosystem file:', error);
}

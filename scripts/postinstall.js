const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running postinstall script...');

const isGlobalInstall = process.env.npm_config_global === 'true';
if (isGlobalInstall) {
  console.log('Global installation detected, skipping client dependencies.');
  process.exit(0);
}

// Check if we're in a development environment
const clientDir = path.join(__dirname, '..', 'src', 'client');
const clientNodeModules = path.join(clientDir, 'node_modules');
const packageJsonPath = path.join(clientDir, 'package.json');

if (fs.existsSync(packageJsonPath) && !fs.existsSync(clientNodeModules)) {
  console.log('Installing client dependencies...');
  try {
    // Change to client directory
    process.chdir(clientDir);
    
    // Install dependencies
    execSync('npm install', { stdio: 'inherit' });
    
    console.log('Client dependencies installed successfully.');
  } catch (error) {
    console.error('Error installing client dependencies:', error.message);
    console.error('Please run "cd src/client && npm install" manually.');
  }
} else {
  console.log('Client dependencies already installed or client package.json not found.');
}

console.log('Postinstall completed.');

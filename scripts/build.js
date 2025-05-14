const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting ezPM2GUI build process...');

// Paths
const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');
const distDir = path.join(rootDir, 'dist');
const clientDir = path.join(rootDir, 'src', 'client');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log(`Created dist directory at ${distDir}`);
}

// Build server-side TypeScript files
console.log('\n1. Building server-side TypeScript files...');
try {
  const result = execSync('npm run build:server', { 
    stdio: ['pipe', 'pipe', 'pipe'], 
    cwd: rootDir,
    encoding: 'utf8' 
  });
  console.log(result);
  console.log('✓ Server-side build completed successfully');
} catch (error) {
  console.error('✗ Server-side build failed:');
  console.error(error.stdout || error.message);
  process.exit(1);
}

// Build client-side application
console.log('\n2. Building client-side application...');
try {
  if (!fs.existsSync(path.join(clientDir, 'node_modules'))) {
    console.log('   Installing client dependencies first...');
    const installResult = execSync('npm install', { 
      stdio: ['pipe', 'pipe', 'pipe'], 
      cwd: clientDir,
      encoding: 'utf8' 
    });
    console.log(installResult);
  }
  
  const buildResult = execSync('npm run build', { 
    stdio: ['pipe', 'pipe', 'pipe'], 
    cwd: clientDir,
    encoding: 'utf8' 
  });
  console.log(buildResult);
  console.log('✓ Client-side build completed successfully');
} catch (error) {
  console.error('✗ Client-side build failed:');
  console.error(error.stdout || error.message);
  process.exit(1);
}

// Build bin directory TypeScript files
console.log('\n3. Building bin directory TypeScript files...');
try {
  const binResult = execSync('npm run build:bin', { 
    stdio: ['pipe', 'pipe', 'pipe'], 
    cwd: rootDir,
    encoding: 'utf8' 
  });
  console.log(binResult);
  console.log('✓ Bin directory build completed successfully');
  
  // Make bin files executable
  const binFiles = ['ezpm2gui.js', 'generate-ecosystem.js'];
  binFiles.forEach(file => {
    const filePath = path.join(binDir, file);
    if (fs.existsSync(filePath)) {
      // Set executable permissions (Unix-like systems only)
      try {
        fs.chmodSync(filePath, '755');
      } catch (err) {
        // Skip for Windows systems
      }
    }
  });
} catch (error) {
  console.error('✗ Bin directory build failed:');
  console.error(error.stdout || error.message);
  process.exit(1);
}

console.log('\n✅ ezPM2GUI build completed successfully!');
console.log('You can now run the application with:');
console.log('  npm start');
console.log('Or if installed globally:');
console.log('  ezpm2gui');

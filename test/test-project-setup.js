// Test script for project setup functionality
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';

async function testProjectSetup() {
  console.log('🧪 Testing Project Setup Functionality\n');

  try {
    // Test 1: Get supported project types
    console.log('1️⃣  Testing: Get supported project types');
    const typesResponse = await axios.get(`${BASE_URL}/api/deploy/project-types`);
    console.log('✅ Supported project types:', typesResponse.data.types.map(t => t.type).join(', '));
    console.log('');

    // Test 2: Create a test Node.js project
    const testProjectPath = path.join(__dirname, 'test-nodejs-project');
    if (!fs.existsSync(testProjectPath)) {
      fs.mkdirSync(testProjectPath, { recursive: true });
    }

    // Create package.json
    const packageJson = {
      name: 'test-app',
      version: '1.0.0',
      main: 'app.js',
      scripts: {
        start: 'node app.js',
        build: 'echo "Building..."',
        test: 'echo "Testing..."'
      },
      dependencies: {
        express: '^4.18.0'
      }
    };
    fs.writeFileSync(path.join(testProjectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create app.js
    const appJs = `
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(\`App listening at http://localhost:\${port}\`);
});
`;
    fs.writeFileSync(path.join(testProjectPath, 'app.js'), appJs);

    console.log('2️⃣  Testing: Project type detection');
    const detectResponse = await axios.post(`${BASE_URL}/api/deploy/detect-project`, {
      projectPath: testProjectPath
    });
    console.log('✅ Detected project type:', detectResponse.data.projectType);
    console.log('');

    // Test 3: Project setup
    console.log('3️⃣  Testing: Project setup');
    const setupResponse = await axios.post(`${BASE_URL}/api/deploy/setup-project`, {
      projectPath: testProjectPath,
      projectType: 'node'
    });
    
    if (setupResponse.data.success) {
      console.log('✅ Project setup completed successfully');
      console.log('Setup steps completed:', setupResponse.data.steps.length);
      
      if (setupResponse.data.warnings && setupResponse.data.warnings.length > 0) {
        console.log('⚠️  Warnings:', setupResponse.data.warnings);
      }
    } else {
      console.log('❌ Project setup failed');
      console.log('Errors:', setupResponse.data.errors);
    }
    console.log('');

    // Test 4: Deploy the project
    console.log('4️⃣  Testing: Auto-deploy with setup');
    const deployResponse = await axios.post(`${BASE_URL}/api/deploy`, {
      name: 'test-nodejs-app',
      script: path.join(testProjectPath, 'app.js'),
      cwd: testProjectPath,
      appType: 'node',
      autoSetup: true,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3003'
      }
    });

    if (deployResponse.data.success) {
      console.log('✅ Deployment successful');
      if (deployResponse.data.setupResult) {
        console.log('Setup result included in deployment');
      }
    } else {
      console.log('❌ Deployment failed:', deployResponse.data.error);
    }

    console.log('');
    console.log('🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests if server is running
testProjectSetup().catch(console.error);

# Node.js Project Setup Script
# This script sets up a Node.js project with dependencies

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath
)

Write-Host "Setting up Node.js project at: $ProjectPath" -ForegroundColor Green

# Navigate to project directory
Set-Location $ProjectPath

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Blue
} catch {
    Write-Error "Node.js is not installed or not in PATH"
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Blue
} catch {
    Write-Error "npm is not installed or not in PATH"
    exit 1
}

# Check if package.json exists
if (-not (Test-Path "package.json")) {
    Write-Error "package.json not found in project directory"
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies"
    exit 1
}

# Check if there's a build script and run it
$packageJson = Get-Content "package.json" | ConvertFrom-Json
if ($packageJson.scripts.build) {
    Write-Host "Running build script..." -ForegroundColor Yellow
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build script failed, but continuing..."
    }
} else {
    Write-Host "No build script found in package.json" -ForegroundColor Yellow
}

# Run tests if test script exists
if ($packageJson.scripts.test -and $packageJson.scripts.test -ne "echo \"Error: no test specified\" && exit 1") {
    Write-Host "Running tests..." -ForegroundColor Yellow
    npm test
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Tests failed, but continuing..."
    }
} else {
    Write-Host "No test script found or default test script detected" -ForegroundColor Yellow
}

Write-Host "Node.js project setup completed successfully!" -ForegroundColor Green
Write-Host "Dependencies installed in: $ProjectPath\node_modules" -ForegroundColor Blue

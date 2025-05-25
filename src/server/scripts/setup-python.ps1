# Python Project Setup Script
# This script sets up a Python project with virtual environment

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath
)

Write-Host "Setting up Python project at: $ProjectPath" -ForegroundColor Green

# Navigate to project directory
Set-Location $ProjectPath

# Check if Python is installed
try {
    $pythonVersion = python --version
    Write-Host "Python version: $pythonVersion" -ForegroundColor Blue
} catch {
    Write-Error "Python is not installed or not in PATH"
    exit 1
}

# Create virtual environment
Write-Host "Creating virtual environment..." -ForegroundColor Yellow
python -m venv venv

if (-not (Test-Path "venv")) {
    Write-Error "Failed to create virtual environment"
    exit 1
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Upgrade pip
Write-Host "Upgrading pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip

# Install requirements if they exist
if (Test-Path "requirements.txt") {
    Write-Host "Installing requirements from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt
} else {
    Write-Host "No requirements.txt found. Skipping dependency installation." -ForegroundColor Yellow
}

# Install development dependencies if they exist
if (Test-Path "requirements-dev.txt") {
    Write-Host "Installing development requirements..." -ForegroundColor Yellow
    pip install -r requirements-dev.txt
}

# Install from pyproject.toml if it exists
if (Test-Path "pyproject.toml") {
    Write-Host "Installing from pyproject.toml..." -ForegroundColor Yellow
    pip install -e .
}

Write-Host "Python project setup completed successfully!" -ForegroundColor Green
Write-Host "Virtual environment created at: $ProjectPath\venv" -ForegroundColor Blue
Write-Host "To activate manually: .\venv\Scripts\Activate.ps1" -ForegroundColor Blue

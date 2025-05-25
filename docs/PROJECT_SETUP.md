# Project Setup Configuration Examples

This document provides examples of how to configure project setups for different technologies.

## Configuration Structure

The `project-configs.json` file contains configurations for different project types:

### Node.js Projects
- **Detection**: Looks for `package.json`, `.js`, `.ts`, `.jsx`, `.tsx` files
- **Setup Steps**:
  1. Check Node.js version
  2. Install dependencies (`npm install`)
  3. Build project (if build script exists)
  4. Run tests (if test script exists)
- **Environment**: `NODE_ENV=production`

### Python Projects
- **Detection**: Looks for `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile`, `.py` files
- **Setup Steps**:
  1. Check Python version
  2. Create virtual environment (`python -m venv venv`)
  3. Activate virtual environment
  4. Upgrade pip
  5. Install dependencies from requirements.txt or pyproject.toml
- **Environment**: `PYTHONPATH=.`, `PYTHON_UNBUFFERED=1`
- **Interpreter**: Points to virtual environment Python executable

### .NET Projects
- **Detection**: Looks for `*.csproj`, `*.fsproj`, `*.vbproj`, `*.sln` files
- **Setup Steps**:
  1. Check .NET version
  2. Restore NuGet packages (`dotnet restore`)
  3. Build project (`dotnet build --configuration Release`)
  4. Publish project (`dotnet publish --configuration Release --output ./publish`)
  5. Run tests (if test projects exist)
- **Environment**: `DOTNET_ENVIRONMENT=Production`, `ASPNETCORE_ENVIRONMENT=Production`

## Usage Examples

### Example 1: Auto-Deploy Node.js Application
```bash
# The system will:
# 1. Detect it's a Node.js project (package.json exists)
# 2. Run npm install
# 3. Build if build script exists
# 4. Deploy to PM2 with production environment
POST /api/deploy
{
  "name": "my-node-app",
  "script": "/path/to/project/app.js",
  "cwd": "/path/to/project",
  "autoSetup": true,
  "appType": "node"
}
```

### Example 2: Python Flask Application
```bash
# The system will:
# 1. Create virtual environment
# 2. Install dependencies from requirements.txt
# 3. Set PYTHON_INTERPRETER environment variable
# 4. Deploy with virtual environment Python interpreter
POST /api/deploy
{
  "name": "flask-app",
  "script": "/path/to/project/app.py",
  "cwd": "/path/to/project",
  "autoSetup": true,
  "appType": "python"
}
```

### Example 3: .NET Web API
```bash
# The system will:
# 1. Restore NuGet packages
# 2. Build and publish the project
# 3. Deploy the published DLL
POST /api/deploy
{
  "name": "dotnet-api",
  "script": "/path/to/project/publish/MyApi.dll",
  "cwd": "/path/to/project",
  "autoSetup": true,
  "appType": "dotnet"
}
```

## Manual Setup Options

You can also run setup manually:

### Detect Project Type
```bash
POST /api/deploy/detect-project
{
  "projectPath": "/path/to/project"
}
```

### Run Setup Only
```bash
POST /api/deploy/setup-project
{
  "projectPath": "/path/to/project",
  "projectType": "node"
}
```

## Configuration Customization

To add support for new project types or modify existing ones, edit `/src/server/config/project-configs.json`:

```json
{
  "projectTypes": {
    "your-custom-type": {
      "name": "Your Custom Type",
      "detection": {
        "files": ["custom.config"],
        "extensions": [".custom"]
      },
      "setup": {
        "steps": [
          {
            "name": "Check custom tool",
            "command": "custom-tool --version",
            "description": "Verifying custom tool installation",
            "required": true
          }
        ],
        "environment": {
          "CUSTOM_ENV": "production"
        }
      }
    }
  }
}
```

## Logging and Troubleshooting

Setup logs are written to `/src/server/logs/deployment.log`. Check this file for detailed information about setup processes.

Common issues:
- **Path not found**: Ensure the project path exists and is accessible
- **Permission denied**: Ensure the server has read/write permissions
- **Tool not installed**: Ensure required tools (Node.js, Python, .NET) are installed
- **Network issues**: Check internet connection for package downloads

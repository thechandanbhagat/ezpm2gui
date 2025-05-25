# .NET Project Setup Script
# This script sets up a .NET project with build and publish

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath
)

Write-Host "Setting up .NET project at: $ProjectPath" -ForegroundColor Green

# Navigate to project directory
Set-Location $ProjectPath

# Check if .NET is installed
try {
    $dotnetVersion = dotnet --version
    Write-Host ".NET version: $dotnetVersion" -ForegroundColor Blue
} catch {
    Write-Error ".NET is not installed or not in PATH"
    exit 1
}

# Find project files
$projectFiles = Get-ChildItem -Path . -Filter "*.csproj" -Recurse
$solutionFiles = Get-ChildItem -Path . -Filter "*.sln" -Recurse

if ($projectFiles.Count -eq 0 -and $solutionFiles.Count -eq 0) {
    Write-Error "No .NET project files (*.csproj) or solution files (*.sln) found"
    exit 1
}

# Restore packages
Write-Host "Restoring NuGet packages..." -ForegroundColor Yellow
dotnet restore

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to restore packages"
    exit 1
}

# Build the project
Write-Host "Building project..." -ForegroundColor Yellow
dotnet build --configuration Release --no-restore

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build project"
    exit 1
}

# Publish the project
Write-Host "Publishing project..." -ForegroundColor Yellow
dotnet publish --configuration Release --output ./publish --no-build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to publish project"
    exit 1
}

# Check for test projects and run tests
$testProjects = Get-ChildItem -Path . -Filter "*test*.csproj" -Recurse
if ($testProjects.Count -gt 0) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    dotnet test --configuration Release --no-build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Tests failed, but continuing..."
    }
} else {
    Write-Host "No test projects found" -ForegroundColor Yellow
}

Write-Host ".NET project setup completed successfully!" -ForegroundColor Green
Write-Host "Published files are in: $ProjectPath\publish" -ForegroundColor Blue

# List published DLL files
$publishedDlls = Get-ChildItem -Path ".\publish" -Filter "*.dll" | Where-Object { $_.Name -notlike "*.deps.dll" -and $_.Name -notlike "*.runtimeconfig.dll" }
if ($publishedDlls.Count -gt 0) {
    Write-Host "Main executable DLLs:" -ForegroundColor Blue
    foreach ($dll in $publishedDlls) {
        Write-Host "  - $($dll.Name)" -ForegroundColor Cyan
    }
}

#Requires -Version 5.1
<#
.SYNOPSIS
    Build and deploy the EZ PM2 GUI mobile app to an Android device.

.DESCRIPTION
    Builds the React Native / Expo Android APK (debug or release) via Gradle,
    copies the artifact to dist/mobile/android/<mode>/, and optionally installs
    and launches it on a connected ADB device.

.PARAMETER Mode
    Build mode: 'debug' (default) or 'release'.

.PARAMETER Install
    Install the APK on a connected Android device after the build.

.PARAMETER Clean
    Run `gradlew clean` before building.

.PARAMETER Launch
    Launch the app on the device after installing (requires -Install).

.PARAMETER Device
    Target a specific ADB device serial. Defaults to the first connected device.

.PARAMETER OutputDir
    Override the output directory for the built APK.
    Default: <repo-root>/dist/mobile/android/<mode>/

.EXAMPLE
    # Debug build only
    .\scripts\Deploy-Mobile.ps1

.EXAMPLE
    # Release build + install + launch on device
    .\scripts\Deploy-Mobile.ps1 -Mode release -Install -Launch

.EXAMPLE
    # Clean debug build, install on a specific device
    .\scripts\Deploy-Mobile.ps1 -Clean -Install -Device emulator-5554
#>

# @group Configuration : Script parameters
param(
    [ValidateSet('debug', 'release')]
    [string] $Mode = 'debug',

    [switch] $Install,
    [switch] $Clean,
    [switch] $Launch,
    [string] $Device = '',
    [string] $OutputDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# @group Constants : Paths
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Split-Path -Parent $ScriptDir
$MobileDir   = Join-Path $RootDir 'mobile-app'
$AndroidDir  = Join-Path $MobileDir 'android'
$GradleW     = Join-Path $AndroidDir 'gradlew.bat'
$DefaultOut  = Join-Path $RootDir "dist\mobile\android\$Mode"
$OutDir      = if ($OutputDir) { $OutputDir } else { $DefaultOut }
$PackageName = 'com.ezpm2gui.mobile'

# @group Utilities > Output : Coloured console helpers
function Write-Step([string]$n, [string]$total, [string]$msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan -NoNewline
    Write-Host ""
}

function Write-Ok([string]$msg)   { Write-Host "  [OK] $msg"   -ForegroundColor Green  }
function Write-Info([string]$msg) { Write-Host "  [..] $msg"   -ForegroundColor Blue   }
function Write-Warn([string]$msg) { Write-Host "  [!!] $msg"   -ForegroundColor Yellow }
function Write-Err([string]$msg)  { Write-Host "  [XX] $msg"   -ForegroundColor Red    }

function Write-Header([string]$msg) {
    $line = '-' * ($msg.Length + 4)
    Write-Host ""
    Write-Host "+$line+" -ForegroundColor Magenta
    Write-Host "|  $msg  |" -ForegroundColor Magenta
    Write-Host "+$line+" -ForegroundColor Magenta
    Write-Host ""
}

# @group Utilities > Shell : Run a command and fail loudly on error
function Invoke-Cmd {
    param(
        [string]   $Cmd,
        [string]   $WorkDir = $RootDir,
        [hashtable]$Env = @{},
        [switch]   $Silent
    )

    $origLocation = Get-Location
    Set-Location $WorkDir

    foreach ($kv in $Env.GetEnumerator()) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process')
    }

    if ($Silent) {
        $output = cmd /c "$Cmd 2>&1"
        Set-Location $origLocation
        return $output
    }

    Write-Info "$ $Cmd"
    cmd /c $Cmd
    $exit = $LASTEXITCODE
    Set-Location $origLocation

    if ($exit -ne 0) {
        Write-Err "Command failed (exit $exit): $Cmd"
        exit $exit
    }
}

# @group Utilities > Android : Resolve adb executable path
function Resolve-Adb {
    # 1. adb already on PATH?
    $onPath = Get-Command 'adb' -ErrorAction SilentlyContinue
    if ($onPath) { return 'adb' }

    # 2. Well-known SDK locations
    $sdkRoot = $env:ANDROID_HOME ?? $env:ANDROID_SDK_ROOT ?? ''
    $candidates = @(
        (Join-Path $sdkRoot 'platform-tools\adb.exe'),
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
        'C:\Android\sdk\platform-tools\adb.exe',
        'C:\Program Files\Android\android-sdk\platform-tools\adb.exe'
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) { return $candidates[0] }
    return $null
}

# @group Utilities > Android : List connected adb devices
function Get-AdbDevices([string]$adb) {
    $raw = & cmd /c "$adb devices 2>&1"
    $matched = @($raw | Where-Object { $_ -and ($_ -match "`t device$" -or $_ -match '\tdevice$') })
    return [string[]]@($matched | ForEach-Object { ($_ -split '\t')[0].Trim() })
}

# @group Utilities > Android : APK output path from Gradle
function Get-ApkPath([string]$mode) {
    return Join-Path $AndroidDir "app\build\outputs\apk\$mode\app-$mode.apk"
}

function Get-AabPath {
    return Join-Path $AndroidDir 'app\build\outputs\bundle\release\app-release.aab'
}

# @group BusinessLogic > PreFlight : Validate environment before building
function Assert-Prerequisites {
    if (-not (Test-Path $AndroidDir)) {
        Write-Err "android/ folder not found at: $AndroidDir"
        Write-Err "Run first:  cd mobile-app && npx expo run:android"
        exit 1
    }
    if (-not (Test-Path $GradleW)) {
        Write-Err "gradlew.bat not found at: $GradleW"
        exit 1
    }

    $nodeOk = Get-Command 'node' -ErrorAction SilentlyContinue
    if (-not $nodeOk) {
        Write-Err "node not found on PATH. Install Node.js."
        exit 1
    }
}

# @group BusinessLogic > DepsCheck : Ensure node_modules are installed
function Assert-NodeModules {
    $nm = Join-Path $MobileDir 'node_modules'
    if (-not (Test-Path $nm)) {
        Write-Info "node_modules missing — running npm install..."
        Invoke-Cmd 'npm install' -WorkDir $MobileDir
        Write-Ok "Dependencies installed"
    }
}

# @group BusinessLogic > KeystoreCheck : Warn if release keystore is missing
function Assert-ReleaseKeystore {
    $gradleProps = Join-Path $AndroidDir 'gradle.properties'
    if (Test-Path $gradleProps) {
        $content = Get-Content $gradleProps -Raw
        if ($content -match 'MYAPP_UPLOAD_STORE_FILE|KEYSTORE_FILE') { return }
    }

    Write-Warn "No release keystore configured in gradle.properties."
    Write-Warn "Build will use the DEBUG keystore — not suitable for Play Store."
    Write-Host ""
    Write-Host "  To configure a release keystore:" -ForegroundColor DarkGray
    Write-Host "  1. Generate:" -ForegroundColor DarkGray
    Write-Host "     keytool -genkey -v -keystore release.keystore -alias key0 -keyalg RSA -keysize 2048 -validity 10000" -ForegroundColor DarkGray
    Write-Host "  2. Place release.keystore in mobile-app/android/app/" -ForegroundColor DarkGray
    Write-Host "  3. Add to mobile-app/android/gradle.properties:" -ForegroundColor DarkGray
    Write-Host "       MYAPP_UPLOAD_STORE_FILE=release.keystore" -ForegroundColor DarkGray
    Write-Host "       MYAPP_UPLOAD_KEY_ALIAS=key0" -ForegroundColor DarkGray
    Write-Host "       MYAPP_UPLOAD_STORE_PASSWORD=<password>" -ForegroundColor DarkGray
    Write-Host "       MYAPP_UPLOAD_KEY_PASSWORD=<password>" -ForegroundColor DarkGray
    Write-Host ""
}

# @group BusinessLogic > Build : Main Android build pipeline
function Build-Android {
    # Debug APKs load JS from Metro (localhost:8081) — they cannot run standalone.
    # Auto-upgrade to release when installing so the JS bundle is embedded in the APK.
    if ($Mode -eq 'debug' -and $Install) {
        Write-Warn "Debug APKs require a running Metro server and cannot run standalone on a device."
        Write-Warn "Switching to RELEASE so the JS bundle is embedded in the APK."
        $script:Mode = 'release'
    }

    $isRelease   = $Mode -eq 'release'
    $gradleTask  = if ($isRelease) { 'assembleRelease' } else { 'assembleDebug' }
    $totalSteps  = 3
    if ($Clean)   { $totalSteps++ }
    if ($Install) { $totalSteps++ }
    $stepN = 0

    Write-Header "Building Android — $($Mode.ToUpper())"

    # --- Pre-flight ---
    Assert-Prerequisites

    if ($isRelease) { Assert-ReleaseKeystore }

    # --- Step: Clean ---
    if ($Clean) {
        Write-Step (++$stepN) $totalSteps "Cleaning Gradle build cache"
        Invoke-Cmd "gradlew.bat clean --no-daemon" -WorkDir $AndroidDir
        Write-Ok "Clean complete"
    }

    # --- Step: JS deps ---
    Write-Step (++$stepN) $totalSteps "Checking JS dependencies"
    Assert-NodeModules
    Write-Ok "Dependencies ready"

    # --- Step: Gradle build ---
    Write-Step (++$stepN) $totalSteps "Running Gradle $gradleTask"
    Write-Info "Working dir: $AndroidDir"

    $buildStart = [System.Diagnostics.Stopwatch]::StartNew()
    Invoke-Cmd "gradlew.bat $gradleTask --no-daemon" -WorkDir $AndroidDir
    $buildStart.Stop()
    $elapsed = [math]::Round($buildStart.Elapsed.TotalSeconds, 1)
    Write-Ok "Build complete in ${elapsed}s"

    # --- Step: Copy artifact ---
    Write-Step (++$stepN) $totalSteps "Copying output artifact"

    # Re-resolve OutDir in case Mode was upgraded from debug → release
    $effectiveOutDir = if ($OutputDir) { $OutputDir } else { Join-Path $RootDir "dist\mobile\android\$Mode" }
    $null = New-Item -ItemType Directory -Path $effectiveOutDir -Force
    $apkSrc = Get-ApkPath $Mode

    if (-not (Test-Path $apkSrc)) {
        Write-Warn "APK not found at expected path:"
        Write-Warn "  $apkSrc"
        Write-Warn "Check Gradle output above for errors."
        exit 1
    }

    $apkName = "ezpm2gui-$Mode.apk"
    $apkDest = Join-Path $effectiveOutDir $apkName
    Copy-Item $apkSrc $apkDest -Force
    $sizeMb = [math]::Round((Get-Item $apkDest).Length / 1MB, 2)
    Write-Ok "APK  →  $apkDest"
    Write-Info "Size: ${sizeMb} MB"

    # Also copy AAB for release (Play Store)
    if ($isRelease) {
        $aabSrc = Get-AabPath
        if (Test-Path $aabSrc) {
            $aabDest = Join-Path $effectiveOutDir 'ezpm2gui-release.aab'
            Copy-Item $aabSrc $aabDest -Force
            Write-Ok "AAB  →  $aabDest  (Play Store)"
        }
    }

    # --- Step: Install ---
    if ($Install) {
        Write-Step (++$stepN) $totalSteps "Installing APK on connected device"

        $adb = Resolve-Adb
        if (-not $adb) {
            Write-Warn "adb not found. Add Android platform-tools to PATH or set ANDROID_HOME."
            Write-Warn "Skipping install."
        } else {
            [string[]]$devices = @(Get-AdbDevices $adb)

            if ($devices.Count -eq 0) {
                Write-Warn "No Android device or emulator connected."
                Write-Warn "Enable USB debugging and reconnect, then re-run with -Install."
            } else {
                # Pick device
                $target = if ($Device) { $Device } else { $devices[0] }
                if (-not ($devices -contains $target)) {
                    Write-Err "Device '$target' not found. Available: $($devices -join ', ')"
                    exit 1
                }

                Write-Info "Target device: $target  ($($devices.Count) connected)"

                # Install
                $adbTarget = "$adb -s $target"
                Write-Info "Installing $apkName..."
                Invoke-Cmd "$adbTarget install -r `"$apkDest`""
                Write-Ok "APK installed"

                # Launch
                if ($Launch) {
                    Write-Info "Launching $PackageName..."
                    $null = Invoke-Cmd "$adbTarget shell am force-stop $PackageName" -Silent
                    Start-Sleep -Milliseconds 500
                    $null = Invoke-Cmd "$adbTarget shell monkey -p $PackageName -c android.intent.category.LAUNCHER 1" -Silent
                    Write-Ok "App launched on $target"
                }
            }
        }
    }
}

# @group BusinessLogic > Summary : Final output summary
function Write-Summary {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Ok "Mobile build complete!"

    if (-not $Install) {
        Write-Host ""
        Write-Info "To install on a connected device, re-run with -Install"
        $effectiveOutDir2 = if ($OutputDir) { $OutputDir } else { Join-Path $RootDir "dist\mobile\android\$Mode" }
        Write-Info "Or manually:  adb install `"$effectiveOutDir2\ezpm2gui-$Mode.apk`""
    }
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
}

# @group BusinessLogic > Main : Entry point
Build-Android
Write-Summary

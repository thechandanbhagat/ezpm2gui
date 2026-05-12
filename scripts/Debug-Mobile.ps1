#Requires -Version 5.1
<#
.SYNOPSIS
    Real-time debug log stream for the EZ PM2 GUI Android app.

.DESCRIPTION
    Connects to an ADB device, clears the log buffer, then streams
    live logcat output filtered and colour-coded by level.

.PARAMETER Device
    Target a specific ADB device serial (default: first connected device).

.PARAMETER Filter
    Comma-separated extra logcat tags to include. E.g. -Filter "OkHttpClient,SSL"

.PARAMETER Metro
    Start the Expo Metro bundler in a new window before streaming logs.

.PARAMETER Raw
    Show raw logcat lines without formatting.

.PARAMETER Dump
    Dump the current log buffer and exit instead of streaming live.

.EXAMPLE
    .\scripts\Debug-Mobile.ps1
    .\scripts\Debug-Mobile.ps1 -Dump
    .\scripts\Debug-Mobile.ps1 -Metro
    .\scripts\Debug-Mobile.ps1 -Device emulator-5554
    .\scripts\Debug-Mobile.ps1 -Filter "OkHttpClient"
#>

# @group Configuration : Script parameters
param(
    [string] $Device = '',
    [string] $Filter = '',
    [switch] $Metro,
    [switch] $Raw,
    [switch] $Dump
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# @group Constants : Paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$MobileDir = Join-Path $RootDir 'mobile-app'
$TempLog   = Join-Path $env:TEMP 'ezpm2-logcat.txt'

# @group Utilities > Output : Colour helpers (PowerShell 5.1 compatible)
function Clr([string]$text, [string]$fg) {
    $map = @{
        red     = [System.ConsoleColor]::Red
        yellow  = [System.ConsoleColor]::Yellow
        green   = [System.ConsoleColor]::Green
        blue    = [System.ConsoleColor]::Blue
        cyan    = [System.ConsoleColor]::Cyan
        magenta = [System.ConsoleColor]::Magenta
        gray    = [System.ConsoleColor]::DarkGray
        white   = [System.ConsoleColor]::White
    }
    if ($map.ContainsKey($fg)) {
        Write-Host $text -ForegroundColor $map[$fg] -NoNewline
    } else {
        Write-Host $text -NoNewline
    }
}

function Write-Line([string]$text, [string]$fg = 'white') {
    Clr $text $fg
    Write-Host ''
}

function Write-Banner {
    Write-Host ''
    Write-Host '  EZ PM2 GUI - Mobile Debug Console' -ForegroundColor Cyan
    Write-Host '  Press Ctrl+C to stop' -ForegroundColor DarkGray
    Write-Host ''
}

# @group Utilities > ADB : Resolve adb executable
function Resolve-Adb {
    $onPath = Get-Command 'adb' -ErrorAction SilentlyContinue
    if ($onPath) { return 'adb' }

    $sdkRoot = ''
    if ($env:ANDROID_HOME)     { $sdkRoot = $env:ANDROID_HOME }
    elseif ($env:ANDROID_SDK_ROOT) { $sdkRoot = $env:ANDROID_SDK_ROOT }

    $candidates = @()
    if ($sdkRoot) { $candidates += Join-Path $sdkRoot 'platform-tools\adb.exe' }
    $candidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    $candidates += 'C:\Android\sdk\platform-tools\adb.exe'

    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

# @group Utilities > ADB : List connected device serials
function Get-AdbDevices([string]$adb) {
    $raw = & $adb devices 2>$null
    [string[]]$found = @()
    foreach ($line in $raw) {
        if ($line -match "`tdevice$") {
            $found += ($line -split "`t")[0].Trim()
        }
    }
    return $found
}

# @group Utilities > ADB : Run adb shell getprop safely
function Get-DeviceProp([string]$adb, [string]$target, [string]$prop) {
    try {
        $val = & $adb -s $target shell getprop $prop 2>$null
        return ($val -join '').Trim()
    } catch {
        return '?'
    }
}

# @group BusinessLogic > LogParsing : Parse a raw logcat line
function Parse-LogLine([string]$line) {
    if ($line -match '^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s+\d+\s+\d+\s+([VDIWEF])\s+([\w./\-]+)\s*:\s*(.*)$') {
        return @{
            Time    = $Matches[1]
            Level   = $Matches[2]
            Tag     = $Matches[3].Trim()
            Message = $Matches[4]
        }
    }
    return @{ Time = ''; Level = 'V'; Tag = ''; Message = $line }
}

# @group BusinessLogic > LogFormatting : Print a colour-coded log line
function Write-LogLine([hashtable]$entry) {
    $lvl = $entry.Level
    $msg = $entry.Message
    $tag = $entry.Tag
    $ts  = $entry.Time

    # Shorten timestamp to HH:MM:SS.mmm
    $shortTs = if ($ts.Length -ge 12) { $ts.Substring($ts.Length - 12) } else { $ts }

    $levelColor = switch ($lvl) {
        'E' { 'red'    }
        'W' { 'yellow' }
        'I' { 'green'  }
        'D' { 'cyan'   }
        default { 'gray' }
    }

    # Timestamp
    Clr "$shortTs " 'gray'
    # Level badge
    Clr " $lvl " $levelColor
    Write-Host ' ' -NoNewline
    # Tag (fixed width 22)
    $tagPad = $tag.PadRight(22)
    if ($tagPad.Length -gt 22) { $tagPad = $tagPad.Substring(0, 22) }
    Clr "$tagPad " 'gray'

    # Message colour
    $msgColor = 'white'
    if ($msg -match '\[testConnection\]')       { $msgColor = 'magenta' }
    elseif ($lvl -eq 'E')                       { $msgColor = 'red'     }
    elseif ($lvl -eq 'W')                       { $msgColor = 'yellow'  }
    elseif ($msg -match 'socket|Socket')        { $msgColor = 'cyan'    }
    elseif ($msg -match 'axios|http|HTTP|fetch') { $msgColor = 'blue'   }

    $fgColor = [System.ConsoleColor]::White
    if     ($msgColor -eq 'red')     { $fgColor = [System.ConsoleColor]::Red     }
    elseif ($msgColor -eq 'yellow')  { $fgColor = [System.ConsoleColor]::Yellow  }
    elseif ($msgColor -eq 'cyan')    { $fgColor = [System.ConsoleColor]::Cyan    }
    elseif ($msgColor -eq 'blue')    { $fgColor = [System.ConsoleColor]::Blue    }
    elseif ($msgColor -eq 'magenta') { $fgColor = [System.ConsoleColor]::Magenta }
    Write-Host $msg -ForegroundColor $fgColor
}

# @group BusinessLogic > Metro : Launch Expo Metro in new window
function Start-Metro {
    Write-Line '  Starting Metro bundler in a new window...' 'cyan'
    $startCmd = "Set-Location '$MobileDir'; npx expo start"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $startCmd
    Start-Sleep -Seconds 3
}

# @group BusinessLogic > Main : Entry point
function Main {
    Write-Banner

    # Resolve adb
    $adb = Resolve-Adb
    if (-not $adb) {
        Write-Line '  [ERROR] adb not found. Set ANDROID_HOME or add platform-tools to PATH.' 'red'
        exit 1
    }
    Write-Host '  adb     : ' -NoNewline -ForegroundColor DarkGray
    Write-Host $adb

    # Find device
    [string[]]$devices = @(Get-AdbDevices $adb)
    if ($devices.Count -eq 0) {
        Write-Line '  [ERROR] No Android device or emulator connected.' 'red'
        Write-Line '          Enable USB debugging and reconnect.' 'gray'
        exit 1
    }

    $target = if ($Device -and $Device -ne '') { $Device } else { $devices[0] }

    if (-not ($devices -contains $target)) {
        Write-Line "  [ERROR] Device '$target' not found. Available: $($devices -join ', ')" 'red'
        exit 1
    }

    Write-Host '  device  : ' -NoNewline -ForegroundColor DarkGray
    Write-Host $target -ForegroundColor Green

    # Device info
    $model   = Get-DeviceProp $adb $target 'ro.product.model'
    $android = Get-DeviceProp $adb $target 'ro.build.version.release'
    $sdk     = Get-DeviceProp $adb $target 'ro.build.version.sdk'
    Write-Host "  model   : $model  (Android $android / API $sdk)"
    Write-Host ''

    # Metro
    if ($Metro) { Start-Metro }

    # Clear buffer
    Write-Line '  Clearing log buffer...' 'gray'
    & $adb -s $target logcat -c 2>$null | Out-Null

    # Build tag filter list
    $tagFilters = @(
        'ReactNativeJS:V'
        'ReactNative:V'
        'ReactNativeResources:V'
        'Expo:V'
        'ExpoModulesCore:V'
        'NetworkSecurityConfig:W'
        'OkHttp:V'
    )
    if ($Filter -ne '') {
        foreach ($t in ($Filter -split ',')) {
            $t = $t.Trim()
            if ($t -ne '') { $tagFilters += "${t}:V" }
        }
    }
    $tagFilters += '*:S'
    $filterStr = $tagFilters -join ' '

    Write-Line "  Streaming - tags: ReactNativeJS, ReactNative, OkHttp + extras" 'gray'
    Write-Line '  ----------------------------------------------------------------' 'gray'
    Write-Host ''

    if ($Dump) {
        # One-shot: dump buffer and exit
        $lines = & $adb -s $target logcat -d $filterStr.Split(' ') 2>$null
        foreach ($line in $lines) {
            if ($Raw) { Write-Host $line; continue }
            $entry = Parse-LogLine $line
            Write-LogLine $entry
        }
        return
    }

    # Live stream via temp file
    if (Test-Path $TempLog) { Remove-Item $TempLog -Force }
    '' | Out-File $TempLog -Encoding UTF8

    $procArgs = @('-s', $target, 'logcat') + $tagFilters
    $proc = Start-Process -FilePath $adb `
        -ArgumentList $procArgs `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $TempLog

    # Wait briefly so the process can create the file before we open it
    Start-Sleep -Milliseconds 300

    try {
        # Open with FileShare.ReadWrite so the adb process can keep writing while we read
        $fs     = [System.IO.FileStream]::new(
            $TempLog,
            [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        $reader = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
        while (-not $proc.HasExited) {
            $line = $reader.ReadLine()
            if ($null -ne $line) {
                if ($Raw) {
                    Write-Host $line
                } else {
                    $entry = Parse-LogLine $line
                    Write-LogLine $entry
                }
            } else {
                Start-Sleep -Milliseconds 80
            }
        }
        $reader.Dispose()
        $fs.Dispose()
    } finally {
        if (-not $proc.HasExited) { $proc.Kill() }
        Start-Sleep -Milliseconds 200
        if (Test-Path $TempLog) { Remove-Item $TempLog -Force -ErrorAction SilentlyContinue }
    }
}

Main

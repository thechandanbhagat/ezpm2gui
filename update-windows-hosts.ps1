# PowerShell script to update Windows hosts file with WSL IP for ezpm2.local
# Run this script as Administrator whenever WSL IP changes

# Get WSL IP address
$wslIP = (wsl hostname -I).Trim()

# Path to Windows hosts file
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"

# Domain to add
$domain = "ezpm2.local"

# Read current hosts file
$hosts = Get-Content $hostsPath

# Remove any existing entries for this domain
$hosts = $hosts | Where-Object { $_ -notmatch $domain }

# Add new entry
$newEntry = "$wslIP`t$domain"
$hosts += $newEntry

# Write back to hosts file
Set-Content -Path $hostsPath -Value $hosts -Force

Write-Host "Updated hosts file: $newEntry"
Write-Host "You can now access your app at http://ezpm2.local:2500"

# Flush DNS cache
ipconfig /flushdns | Out-Null
Write-Host "DNS cache flushed"

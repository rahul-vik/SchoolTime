param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = "Stop"

$dbDir = Join-Path $ProjectRoot "server\data"
$db = Join-Path $dbDir "app.db"
$backupDir = Join-Path $ProjectRoot "backups"

if (!(Test-Path $db)) {
  throw "Database not found at $db"
}

if (!(Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $backupDir "appdb-backup-$stamp.zip"

$files = @($db)
$wal = "$db-wal"
$shm = "$db-shm"
if (Test-Path $wal) { $files += $wal }
if (Test-Path $shm) { $files += $shm }

Compress-Archive -Path $files -DestinationPath $zipPath -CompressionLevel Optimal -Force
Write-Host "Backup created: $zipPath"


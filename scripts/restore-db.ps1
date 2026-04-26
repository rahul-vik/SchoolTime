param(
  [Parameter(Mandatory = $true)]
  [string]$BackupZip,
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupZip)) {
  throw "Backup zip not found: $BackupZip"
}

$dbDir = Join-Path $ProjectRoot "server\data"
if (!(Test-Path $dbDir)) {
  New-Item -ItemType Directory -Path $dbDir | Out-Null
}

$temp = Join-Path $env:TEMP ("schooltime-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Expand-Archive -Path $BackupZip -DestinationPath $temp -Force

  $srcDb = Get-ChildItem -Path $temp -Recurse -Filter "app.db" | Select-Object -First 1
  if (-not $srcDb) { throw "app.db not found inside backup zip." }

  Copy-Item $srcDb.FullName (Join-Path $dbDir "app.db") -Force

  $srcWal = Get-ChildItem -Path $temp -Recurse -Filter "app.db-wal" | Select-Object -First 1
  $srcShm = Get-ChildItem -Path $temp -Recurse -Filter "app.db-shm" | Select-Object -First 1

  if ($srcWal) { Copy-Item $srcWal.FullName (Join-Path $dbDir "app.db-wal") -Force }
  if ($srcShm) { Copy-Item $srcShm.FullName (Join-Path $dbDir "app.db-shm") -Force }

  Write-Host "Restore complete. Restart the API server before use."
}
finally {
  if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
}


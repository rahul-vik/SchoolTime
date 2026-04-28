$ErrorActionPreference = "Stop"

function Write-JsonOutput([hashtable]$payload) {
  $json = $payload | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
}

function Get-ChangedFiles {
  $all = @()

  $unstaged = git diff --name-only 2>$null
  if ($LASTEXITCODE -eq 0 -and $unstaged) { $all += $unstaged }

  $staged = git diff --cached --name-only 2>$null
  if ($LASTEXITCODE -eq 0 -and $staged) { $all += $staged }

  $untracked = git ls-files --others --exclude-standard 2>$null
  if ($LASTEXITCODE -eq 0 -and $untracked) { $all += $untracked }

  return $all | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Sort-Object -Unique
}

try {
  $changedFiles = Get-ChangedFiles
  if (-not $changedFiles -or $changedFiles.Count -eq 0) {
    Write-JsonOutput @{ followup_message = "" }
    exit 0
  }

  $codeChanged = $false
  foreach ($file in $changedFiles) {
    if ($file -match '^(src|server)/') {
      $codeChanged = $true
      break
    }
  }

  if (-not $codeChanged) {
    Write-JsonOutput @{ followup_message = "" }
    exit 0
  }

  $docsOrRulesTouched = $false
  foreach ($file in $changedFiles) {
    if (
      $file -match '^README\.md$' -or
      $file -match '^docs/' -or
      $file -match '^\.cursor/rules/' -or
      $file -match '^AGENTS\.md$'
    ) {
      $docsOrRulesTouched = $true
      break
    }
  }

  if (-not $docsOrRulesTouched) {
    Write-JsonOutput @{
      followup_message = "Policy check: source code changed but docs/rules were not updated. Update README/docs and relevant .cursor/rules before finishing."
    }
    exit 0
  }

  Write-JsonOutput @{ followup_message = "" }
  exit 0
}
catch {
  # Fail open to avoid blocking work if tooling is temporarily unavailable.
  Write-JsonOutput @{ followup_message = "" }
  exit 0
}

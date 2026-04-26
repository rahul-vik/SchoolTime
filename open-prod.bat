@echo off
setlocal

cd /d "%~dp0"

echo [SchoolTime] Ensuring this is a git repo...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [SchoolTime] ERROR: This folder is not a git repository.
  pause
  exit /b 1
)

echo [SchoolTime] Switching to main branch...
git checkout main
if errorlevel 1 (
  echo [SchoolTime] ERROR: Could not switch to 'main'. Resolve git conflicts first.
  pause
  exit /b 1
)

echo [SchoolTime] Checking remote sync status for main...
git fetch origin main >nul 2>&1

for /f %%i in ('git rev-list --count main..origin/main 2^>nul') do set BEHIND=%%i
for /f %%i in ('git rev-list --count origin/main..main 2^>nul') do set AHEAD=%%i
if "%BEHIND%"=="" set BEHIND=0
if "%AHEAD%"=="" set AHEAD=0

echo [SchoolTime] Local main: ahead=%AHEAD% behind=%BEHIND%
if not "%BEHIND%"=="0" (
  echo [SchoolTime] Remote has newer commits.
  choice /C YN /N /M "Apply remote updates to local main now? [Y/N]: "
  if errorlevel 2 (
    echo [SchoolTime] Keeping local main as-is. You can sync later using: git pull --ff-only
  ) else (
    echo [SchoolTime] Pulling latest main...
    git pull --ff-only
    if errorlevel 1 (
      echo [SchoolTime] WARNING: Fast-forward pull failed. Please resolve manually before running.
      pause
      exit /b 1
    )
  )
)

echo [SchoolTime] Opening project in Cursor (if installed)...
where cursor >nul 2>&1
if not errorlevel 1 (
  start "" cursor "%cd%"
) else (
  echo [SchoolTime] Cursor CLI not found. Skipping auto-open.
)

echo [SchoolTime] Starting production mode...
call npm run start:prod

endlocal


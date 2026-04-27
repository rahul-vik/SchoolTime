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

echo [SchoolTime] Switching to develop branch...
git checkout develop
if errorlevel 1 (
  echo [SchoolTime] ERROR: Could not switch to 'develop'. Resolve git conflicts or create the branch first.
  pause
  exit /b 1
)

echo [SchoolTime] Checking remote sync status for develop...
git fetch origin develop >nul 2>&1

for /f %%i in ('git rev-list --count develop..origin/develop 2^>nul') do set BEHIND=%%i
for /f %%i in ('git rev-list --count origin/develop..develop 2^>nul') do set AHEAD=%%i
if "%BEHIND%"=="" set BEHIND=0
if "%AHEAD%"=="" set AHEAD=0

echo [SchoolTime] Local develop: ahead=%AHEAD% behind=%BEHIND%
if not "%BEHIND%"=="0" (
  echo [SchoolTime] Remote has newer commits.
  choice /C YN /N /M "Apply remote updates to local develop now? [Y/N]: "
  if errorlevel 2 (
    echo [SchoolTime] Keeping local branch as-is. You can sync later using: git pull --ff-only
  ) else (
    echo [SchoolTime] Pulling latest develop...
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

echo [SchoolTime] Starting development servers...
call npm start

endlocal


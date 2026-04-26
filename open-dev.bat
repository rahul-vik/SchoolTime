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

echo [SchoolTime] Pulling latest develop...
git pull --ff-only >nul 2>&1

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


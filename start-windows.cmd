@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS with npm, then run this file again.
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major!==24||minor<14){console.error('Node.js 24.14 or newer within 24.x is required.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist "node_modules\.package-lock.json" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Opening the CareLink Doctor desktop application...
echo Close the application window to exit.
call npm start
if errorlevel 1 pause

@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from nodejs.org.
  pause
  exit /b 1
)
if not exist runtime.json (
  node setup.mjs
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Opening Director Studio. Keep this window open while making episodes.
start "" "http://127.0.0.1:4317"
node server.mjs
pause

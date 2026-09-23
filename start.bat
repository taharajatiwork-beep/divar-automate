@echo off
title Divar Pilot - Starting...
echo ============================================
echo   Divar Pilot — Chrome + Server
echo ============================================
echo.

:: ── Step 0: Kill old backend on port 3000 only ──
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    echo Stopping old server on port 3000 ^(PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)
echo.

:: ── Step 1: Launch Chrome with remote debugging ──
echo [1/2] Starting Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%~dp0divar-profile" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-blink-features=AutomationControlled ^
  --window-size=1280,900

echo Chrome launched on debug port 9222
echo.

:: ── Step 2: Wait for Chrome to start ──
echo [2/2] Waiting 3 seconds for Chrome...
timeout /t 3 /nobreak >nul

:: ── Step 3: Start the server ──
echo Starting Node.js server...
echo.
cd /d "%~dp0"
node src/server.js

pause

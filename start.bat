@echo off
title Divar Pilot
echo ============================================
echo   Divar Pilot
echo ============================================
echo.

:: ── Step 1: Start server ──
echo [1/3] Starting server...
cd /d "%~dp0"

:: Kill ONLY the process on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    echo Stopping old server (PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

start /b node src/server.js
echo Waiting for server...
timeout /t 3 /nobreak >nul
echo Server: OK
echo.

:: ── Step 2: Kill OLD debug Chrome on port 9222 only (not all Chrome!) ──
echo [2/3] Checking Chrome debug port...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222 " ^| findstr LISTENING') do (
    echo Stopping old debug Chrome (PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Launch Chrome with SEPARATE profile (divar-profile)
echo Starting Chrome (divar-profile)...
set "CHROME_PROFILE=%~dp0divar-profile"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%CHROME_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-blink-features=AutomationControlled ^
  --window-size=1280,900 ^
  http://localhost:5174

echo Waiting for Chrome...
timeout /t 5 /nobreak >nul
echo Chrome: OK
echo.

:: ── Step 3: Done ──
echo [3/3] Ready!
echo   Web UI: http://localhost:5174
echo   Server: http://localhost:3000
echo.
echo Close this window to stop.
pause >nul

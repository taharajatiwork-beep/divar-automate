@echo off
title Divar Pilot
echo ============================================
echo   Divar Pilot
echo ============================================
echo.

:: ── Step 1: Start server FIRST ──
echo [1/3] Starting server...
cd /d "%~dp0"

:: Kill old server on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

start /b node src/server.js
echo Waiting for server...
timeout /t 3 /nobreak >nul
echo Server: OK
echo.

:: ── Step 2: Close all Chrome, then relaunch with debug port ──
echo [2/3] Closing Chrome...
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting Chrome with debug port...
set "CHROME_PROFILE=%LOCALAPPDATA%\Google\Chrome\User Data"
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

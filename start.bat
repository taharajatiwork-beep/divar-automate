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

:: ── Step 0.5: Clean stale Chrome lock files ──
echo Cleaning stale Chrome lock files...
if exist "%~dp0divar-profile\SingletonLock" del /f "%~dp0divar-profile\SingletonLock" >nul 2>&1
if exist "%~dp0divar-profile\SingletonCookie" del /f "%~dp0divar-profile\SingletonCookie" >nul 2>&1
if exist "%~dp0divar-profile\SingletonSocket" del /f "%~dp0divar-profile\SingletonSocket" >nul 2>&1
echo.

:: ── Step 1: Launch Chrome with remote debugging ──
echo [1/3] Starting Chrome with profile...
echo   Profile: %~dp0divar-profile
echo.
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
echo [2/3] Waiting 4 seconds for Chrome to start...
timeout /t 4 /nobreak >nul

:: ── Step 3: Start the server ──
echo [3/3] Starting Node.js server...
echo.
cd /d "%~dp0"
node src/server.js

pause

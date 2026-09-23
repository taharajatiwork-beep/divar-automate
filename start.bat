@echo off
title Divar Pilot
echo ============================================
echo   Divar Pilot — Chrome + Server
echo ============================================
echo.

:: Kill old server on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    echo Stopping old server (PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)

:: Kill old Chrome debug session on port 9222
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222 " ^| findstr LISTENING') do (
    echo Stopping old debug Chrome (PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo.

:: ── Launch Chrome with DEFAULT profile (already logged into Divar) ──
echo [1/2] Starting Chrome (default profile)...
set "CHROME_PROFILE=%LOCALAPPDATA%\Google\Chrome\User Data"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%CHROME_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-blink-features=AutomationControlled ^
  --window-size=1280,900

echo Chrome launched — using your default profile (Divar login active)
echo.

:: ── Wait for Chrome ──
echo [2/2] Waiting 4 seconds for Chrome...
timeout /t 4 /nobreak >nul

:: ── Start server ──
echo Starting Node.js server...
echo.
cd /d "%~dp0"
node src/server.js
pause

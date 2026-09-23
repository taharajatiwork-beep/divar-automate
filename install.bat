@echo off
title Divar Pilot - Install
echo ============================================
echo   Divar Pilot — Installing dependencies
echo ============================================
echo.

:: ── Check for Node.js ──
echo Checking for Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%
echo.

:: ── Run npm install ──
echo Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm install failed.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation complete!
echo.
echo   Run start.bat to launch Chrome + Server
echo ============================================
echo.
pause

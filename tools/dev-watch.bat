@echo off
title Bleeds Client — Dev Mode
cd /d "%~dp0.."

echo.
echo  ================================================
echo   Bleeds Client — Dev Mode
echo  ================================================
echo.

echo  [1/5] Closing Discord...
taskkill /F /IM Discord.exe /T >nul 2>&1
taskkill /F /IM DiscordPTB.exe /T >nul 2>&1
taskkill /F /IM DiscordCanary.exe /T >nul 2>&1
taskkill /F /IM Update.exe /T >nul 2>&1
ping 127.0.0.1 -n 4 >nul
:waitloop
tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /i "Discord.exe" >nul
if not errorlevel 1 (
    ping 127.0.0.1 -n 2 >nul
    goto :waitloop
)
echo        Discord closed.

echo.
echo  [2/5] Building (initial)...
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] pnpm build failed. Aborting.
    pause
    exit /b 1
)
echo        Build complete.

echo.
echo  [3/5] Injecting dev build...
call pnpm inject
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] pnpm inject failed. Aborting.
    pause
    exit /b 1
)
echo        Injection complete.

echo.
echo  [4/5] Starting file watcher (new window)...
start "Bleeds Client — Watcher" cmd /k "cd /d "%~dp0.." && pnpm watch"
echo        Watcher started in a separate window.
echo        Any code changes will rebuild automatically.

echo.
echo  [5/5] Relaunching Discord...
set "DISCORD_PATH="
if exist "%LOCALAPPDATA%\DiscordCanary\Update.exe" (
    set "DISCORD_PATH=%LOCALAPPDATA%\DiscordCanary"
    set "DISCORD_EXE=DiscordCanary.exe"
) else if exist "%LOCALAPPDATA%\Discord\Update.exe" (
    set "DISCORD_PATH=%LOCALAPPDATA%\Discord"
    set "DISCORD_EXE=Discord.exe"
)
if defined DISCORD_PATH (
    start "" "%DISCORD_PATH%\Update.exe" --processStart %DISCORD_EXE%
    echo        Discord launched via Update.exe.
) else (
    echo  [WARN] No Discord installation found, manual restart required.
)

echo.
echo  ================================================
echo   Dev mode active!
echo   Watcher rebuilds on every save.
echo   To apply changes: run dev-inject.bat again.
echo  ================================================
echo.
timeout /t 5 /nobreak >nul

@echo off
:: Launcher wrapper for bleeds-install.ps1 (double-click to run)
title Bleeds Client — Install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bleeds-install.ps1"
if %errorlevel% neq 0 pause

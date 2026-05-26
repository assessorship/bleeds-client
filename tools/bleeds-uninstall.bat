@echo off
:: Launcher wrapper for bleeds-uninstall.ps1 (double-click to run)
title Bleeds Client — Uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bleeds-uninstall.ps1"
if %errorlevel% neq 0 pause

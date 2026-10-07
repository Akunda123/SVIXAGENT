@echo off
setlocal
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0akdagent-chatgpt-plugin\scripts\deploy-menu.ps1" -BundleRoot "%~dp0"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0akdagent-chatgpt-plugin\scripts\deploy.ps1" -BundleRoot "%~dp0" %*
)
if errorlevel 1 (
  echo Deployment failed. Read the error above; existing files were not deleted.
  pause
  exit /b 1
)
pause

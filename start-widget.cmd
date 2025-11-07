@echo off
REM Launch the Electron app pointing to this folder.
REM Fixes the issue where opening electron.exe alone shows the default page.
cd /d "%~dp0"
"%~dp0\node_modules\electron\dist\electron.exe" "%~dp0"


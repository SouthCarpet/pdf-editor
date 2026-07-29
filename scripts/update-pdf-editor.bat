@echo off
setlocal
title Update PDF Editor
cd /d "%~dp0.."

set "PDF_EDITOR_EXE=%CD%\src-tauri\target\release\pdf-editor.exe"
set "CARGO_NET_OFFLINE=true"
set "npm_config_offline=true"
set /a WAIT_COUNT=0

echo.
echo PDF Editor local update
echo Repository: %CD%
echo.
echo Waiting for pdf-editor.exe to exit...

:wait_for_exit
tasklist /FI "IMAGENAME eq pdf-editor.exe" /NH 2>nul | find /I "pdf-editor.exe" >nul
if errorlevel 1 goto build_frontend
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 60 goto wait_timeout
timeout /t 1 /nobreak >nul
goto wait_for_exit

:build_frontend
echo.
echo [1/2] Building frontend...
call npm run build
if errorlevel 1 goto build_failed

echo.
echo [2/2] Building release application from the local Cargo cache...
pushd src-tauri
cargo build --release --offline
set "BUILD_EXIT=%ERRORLEVEL%"
popd
if not "%BUILD_EXIT%"=="0" goto build_failed

if not exist "%PDF_EDITOR_EXE%" goto missing_exe

echo.
echo Update complete. Starting PDF Editor...
start "" "%PDF_EDITOR_EXE%"
exit /b 0

:wait_timeout
echo.
echo Update aborted: pdf-editor.exe did not exit within 60 seconds.
echo Close the application and run this updater again.
pause
exit /b 1

:missing_exe
echo.
echo Update failed: the release build completed but the application was not found:
echo %PDF_EDITOR_EXE%
pause
exit /b 1

:build_failed
echo.
echo Update failed. Review the build output above.
echo No packages were installed and no network access was used.
pause
exit /b 1

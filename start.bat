@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist server\.env (
  echo [X] The system is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
if not exist server\dist\index.js (
  echo [X] server\dist is missing. Run install.bat again.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('node server\scripts\setup.mjs ip') do set "IP=%%i"

rem the server runs in its own window; closing that window stops the system
start "AquaShine Server" /D "%~dp0server" cmd /k "node dist\index.js"

echo Waiting for the server...
set /a tries=0
:wait
set /a tries+=1
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/public/config -TimeoutSec 3) | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto :up
if %tries% LSS 15 goto :wait
echo [X] The server did not start - look at the "AquaShine Server" window for the error.
pause
exit /b 1

:up
echo.
echo ============================================================
echo   AquaShine is running
echo.
echo   On this computer:   http://localhost:4000
echo   Management panel:   http://localhost:4000/admin-login
echo   From phones on the same Wi-Fi:  http://%IP%:4000
echo.
echo   Login codes (SMS) are shown in the "AquaShine Server" window
echo   until an SMS company is connected.
echo   To stop: run stop.bat or close the server window.
echo ============================================================
start "" http://localhost:4000/admin-login
endlocal

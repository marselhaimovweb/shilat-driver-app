@echo off
setlocal EnableExtensions
chcp 65001 >nul
title AquaShine - Install
set "TARGET=D:\AquaShine"
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

echo ============================================================
echo   AquaShine car wash system - installer
echo   Installs to %TARGET%
echo ============================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [!] Not running as Administrator - the firewall rule will be skipped.
  echo     To let phones on the Wi-Fi reach the server, right-click install.bat
  echo     and choose "Run as administrator".
  echo.
)

if not exist D:\ (
  echo [X] Drive D: was not found. Edit TARGET at the top of install.bat.
  goto :fail
)

rem ---------- 1. Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
  echo [..] Node.js is not installed - installing Node.js LTS with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo [!] Node.js was installed. Close this window and run install.bat again.
  goto :end
)
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEMAJOR=%%v"
set "NODEMAJOR=%NODEMAJOR:v=%"
if %NODEMAJOR% LSS 20 (
  echo [X] Node.js 20 or newer is required. Installed: & node -v
  echo     Download it from https://nodejs.org
  goto :fail
)
echo [OK] Node.js & node -v

rem ---------- 2. copy files to D: ----------
if /i not "%SRC%"=="%TARGET%" (
  echo [..] Copying files to %TARGET% ...
  robocopy "%SRC%" "%TARGET%" /E /NFL /NDL /NJH /NJS /NP /XD node_modules .git .expo dist web /XF *.zip .env >nul
  if errorlevel 8 (
    echo [X] Copy failed.
    goto :fail
  )
)
cd /d "%TARGET%"
echo [OK] Files are in %TARGET%

rem ---------- 3. server ----------
echo [..] Installing server packages (a few minutes)...
pushd server
call npm ci --no-audit --no-fund
if errorlevel 1 goto :failpop
call npm run build
if errorlevel 1 goto :failpop
popd
echo [OK] Server built

rem ---------- 4. web app / web admin panel ----------
echo [..] Installing app packages and building the web panel (several minutes)...
pushd mobile
call npm ci --no-audit --no-fund
if errorlevel 1 goto :failpop
set "EXPO_PUBLIC_API_URL=same-origin"
call npx expo export --platform web --output-dir ..\web --clear
if errorlevel 1 goto :failpop
set "EXPO_PUBLIC_API_URL="
popd
echo [OK] Web panel built

rem ---------- 5. database + settings ----------
pushd server
node scripts\setup.mjs db
if errorlevel 1 goto :failpop
popd

rem ---------- 6. firewall + shortcuts ----------
net session >nul 2>&1
if not errorlevel 1 (
  netsh advfirewall firewall delete rule name="AquaShine Server" >nul 2>&1
  netsh advfirewall firewall add rule name="AquaShine Server" dir=in action=allow protocol=TCP localport=4000 >nul
  echo [OK] Firewall opened for port 4000
)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AquaShine - Start.lnk');$s.TargetPath='%TARGET%\start.bat';$s.WorkingDirectory='%TARGET%';$s.Save()" >nul 2>&1
echo [OK] Desktop shortcut "AquaShine - Start" created

echo.
echo ============================================================
echo   Installation finished.
echo   Start the system:   %TARGET%\start.bat  (or the desktop shortcut)
echo   Build Android APK:  %TARGET%\build-apk.bat
echo ============================================================
choice /c YN /m "Start the system now"
if errorlevel 2 goto :end
call "%TARGET%\start.bat"
goto :end

:failpop
popd
:fail
echo.
echo [X] Installation stopped because of the error above.
:end
pause
endlocal

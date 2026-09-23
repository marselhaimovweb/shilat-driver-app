@echo off
setlocal EnableExtensions
chcp 65001 >nul
title AquaShine - Build Android APK
cd /d "%~dp0"

echo ============================================================
echo   Build an Android APK with Expo EAS (free account, cloud build)
echo   First time only: create a free account at https://expo.dev/signup
echo ============================================================
echo.

if not exist mobile\node_modules (
  echo [X] Run install.bat first.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('node server\scripts\setup.mjs ip') do set "IP=%%i"
echo Which server should the app connect to?
echo   Press Enter for this computer on the local Wi-Fi: http://%IP%:4000
echo   Type demo for a demo app with sample data (no server needed)
echo   Or type a public address, e.g. https://api.my-carwash.co.il
set "URL="
set /p "URL=Server address: "
if "%URL%"=="" set "URL=http://%IP%:4000"

set "PROFILE=apk"
if /i "%URL%"=="demo" (
  set "PROFILE=apk-demo"
) else (
  node server\scripts\setup.mjs eas "%URL%"
  if errorlevel 1 goto :fail
)

cd mobile
rem the D: copy is not a git checkout - let EAS upload the folder as is (see .easignore)
set "EAS_NO_VCS=1"
echo.
echo [..] Signing in to Expo (skipped if already signed in)...
call npx --yes eas-cli@latest whoami >nul 2>&1
if errorlevel 1 call npx --yes eas-cli@latest login
if errorlevel 1 goto :fail

echo.
echo [..] Building in the Expo cloud (usually 10-20 minutes).
echo     Answer Y if asked to create the project or to generate a keystore.
call npx --yes eas-cli@latest build --platform android --profile %PROFILE%
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   Done. Open the link above (or scan the QR code) on the phone
echo   to download and install the APK.
echo   The same link is listed at https://expo.dev under Builds.
echo ============================================================
goto :end

:fail
echo.
echo [X] The build stopped because of the error above.
:end
pause
endlocal

@echo off
taskkill /FI "WINDOWTITLE eq AquaShine Server*" /T /F >nul 2>&1
echo AquaShine server stopped.
timeout /t 3 >nul

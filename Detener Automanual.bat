@echo off
title Detener AutomanualVCP

echo Deteniendo el servidor de AutomanualVCP...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\detener-servidor.ps1"
echo.
pause
exit /b %ERRORLEVEL%

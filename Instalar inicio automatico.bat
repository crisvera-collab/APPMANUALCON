@echo off
title AutomanualVCP - Instalar inicio automatico

echo ==========================================================
echo    AUTOMANUALVCP - Instalar inicio automatico
echo ==================================================
echo.
echo Crea dos tareas de Windows:
echo   1) Arrancar el servidor al iniciar sesion.
echo   2) Vigilarlo cada 10 minutos (si se cae, lo relanza).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\instalar-autoarranque.ps1"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%

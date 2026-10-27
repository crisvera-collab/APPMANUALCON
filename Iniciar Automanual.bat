@echo off
title AutomanualVCP - Iniciar servidor

echo ==========================================================
echo    AUTOMANUALVCP - Inicio del servidor
echo    Manual de Convivencia Colegio OEA I.E.D.
echo ==========================================================
echo.

rem Si el usuario habia pedido pausa con "Detener", se levanta aqui.
del "%~dp0backend\pausa.flag" >nul 2>&1

rem Repara las tareas de inicio automatico por si alguien las deshabilito
rem (marcha sola / vigilancia cada 10 minutos).
schtasks /Change /TN "AutomanualVCP"      /ENABLE >nul 2>&1
schtasks /Change /TN "AutomanualVCP-vigia" /ENABLE >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\asegurar-servidor.ps1"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Abriendo http://localhost:3000 en el navegador...
    start "" "http://localhost:3000"
    echo Puedes cerrar esta ventana: el servidor sigue funcionando.
    ping -n 6 127.0.0.1 >nul
) else (
    echo Hubo un problema. Revisa los mensajes de arriba.
    echo Log del servidor: backend\server-error.log
    pause
)
exit /b %RC%

@echo off
title AutomanualVCP - Permitir acceso desde la red

rem ==========================================================
rem  Abre el puerto 3000 en el Cortafuegos de Windows para
rem  que celulares y otras PC de la misma red puedan entrar
rem  a la app. Se ejecuta UNA sola vez por equipo.
rem  Si Windows pide permiso (UAC), dale "Si".
rem ==========================================================
echo.

rem Sin permiso de administrador, Windows no deja crear la regla:
rem la ventana se eleva sola y sigue en una ventana nueva.
fltmc >nul 2>&1
if errorlevel 1 (
    echo Pidiendo permiso de administrador a Windows...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

rem Se borra la regla anterior (si existe) para no duplicarla y se crea de nuevo.
netsh advfirewall firewall delete rule name="AutomanualVCP-puerto3000" >nul 2>&1
netsh advfirewall firewall add rule name="AutomanualVCP-puerto3000" dir=in action=allow protocol=TCP localport=3000 profile=any

if errorlevel 1 (
    echo.
    echo No se pudo crear la regla. Ejecuta este archivo con clic derecho
    echo ^> "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

echo Listo. Los celulares y PC de la misma red ya pueden entrar a la app.
echo.
echo En el telefono: conectate al MISMO WiFi y abre   http://IP-de-esta-PC:3000
echo (Descubre la IP con:  ipconfig   ->  IPv4 Address)
echo.
pause
exit /b 0

<#
  instalar-autoarranque.ps1 - Mantiene el servidor activo sin que nadie tenga
  que acordarse de arrancarlo.

  Crea dos tareas de Windows (una sola vez):
    AutomanualVCP       -> arranca el servidor al iniciar sesion.
    AutomanualVCP-vigia -> comprueba cada 10 minutos que siga activo y lo
                           relanza si se cayo o si quedo "a medias".

  Ambas ejecutan asegurar-servidor.ps1, que es idempotente: si el servidor ya
  esta sano no hace nada. Si existe backend\pausa.flag tampoco hace nada
  (respeta la pausa pedida con "Detener Automanual.bat").

  Desinstalar:
    schtasks /delete /tn AutomanualVCP /f
    schtasks /delete /tn AutomanualVCP-vigia /f
#>

$ErrorActionPreference = "SilentlyContinue"

$Asegurar = Join-Path $PSScriptRoot "asegurar-servidor.ps1"
$Comando  = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Asegurar + '"'

if ($Comando.Length -gt 260) {
  Write-Host "AVISO: la ruta del proyecto es muy larga para una tarea programada."
  Write-Host "       Ruta: $Asegurar"
}

Write-Host "Instalando el arranque automatico del servidor..."
Write-Host ""

# --------------------------------------------- 1) al iniciar sesion ---------
schtasks /Create /F /TN "AutomanualVCP" /TR $Comando /SC ONLOGON | Out-Null
$crearLogon = $LASTEXITCODE

if ($crearLogon -ne 0) {
  # Sin privilegios para la tarea ONLOGON: se usa la clave de inicio de
  # sesion del usuario (HKCU\...\Run), que no requiere administrador.
  $ruta = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  Set-ItemProperty -Path $ruta -Name "AutomanualVCP" -Value $Comando -ErrorAction Stop
  if ($?) {
    Write-Host "[OK] Arranque al iniciar sesion: clave de registro HKCU\Run (AutomanualVCP)."
    $modoLogon = "run"
  } else {
    Write-Host "[FALLO] No se pudo crear el arranque al iniciar sesion."
    $modoLogon = "fallo"
  }
} else {
  Write-Host "[OK] Tarea 'AutomanualVCP': arranca al iniciar sesion."
  $modoLogon = "tarea"
}

# ------------------------------------------------ 2) vigilancia 10 min ------
schtasks /Create /F /TN "AutomanualVCP-vigia" /TR $Comando /SC MINUTE /MO 10 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "[OK] Tarea 'AutomanualVCP-vigia': comprueba el servidor cada 10 minutos."
  $modoVigia = "si"
} else {
  Write-Host "[AVISO] No se pudo crear la vigilancia periodica (requiere permisos)."
  Write-Host "        El servidor arrancara al iniciar sesion, pero si se cae, habra que"
  Write-Host "        volver a ejecutar 'Iniciar Automanual.bat'."
  $modoVigia = "no"
}

Write-Host ""
Write-Host "Verificacion de las tareas:"
schtasks /Query /TN "AutomanualVCP" /FO LIST 2>&1 | Select-String -Pattern "Nombre de la tarea|TaskName|Status|Estado" | ForEach-Object { "   " + $_.Line }
schtasks /Query /TN "AutomanualVCP-vigia" /FO LIST 2>&1 | Select-String -Pattern "Nombre de la tarea|TaskName|Status|Estado" | ForEach-Object { "   " + $_.Line }

# --------------------------------------------- 3) cortafuegos -------------
# Sin esta regla, Windows bloquea las conexiones entrantes desde celulares
# u otras PC (el perfil "Publico", habitual en redes WiFi nuevas). La regla
# solo abre el puerto 3000 del servidor, nada mas.
Write-Host ""
Write-Host "Cortafuegos de Windows (acceso desde celular u otra PC)..."
$reglaExiste = $false
if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {
  $reglaExiste = [bool](Get-NetFirewallRule -DisplayName "AutomanualVCP-puerto3000" -ErrorAction SilentlyContinue)
}
if ($reglaExiste) {
  Write-Host "[OK] Regla de Cortafuegos ya existente (puerto 3000)."
} else {
  $creoRegla = $false
  try {
    New-NetFirewallRule -DisplayName "AutomanualVCP-puerto3000" -Direction Inbound `
      -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -Enabled True `
      -ErrorAction Stop | Out-Null
    $creoRegla = $true
  } catch { }
  if ($creoRegla) {
    Write-Host "[OK] Regla de Cortafuegos creada: los celulares ya pueden entrar."
  } else {
    Write-Host "[AVISO] No se pudo crear la regla (faltan permisos de administrador)."
    Write-Host "        Si el celular no conecta, ejecuta una sola vez"
    Write-Host "        'Permitir acceso desde celulares.bat' como administrador."
  }
}

Write-Host ""
if ($modoLogon -eq "fallo" -and $modoVigia -eq "no") {
  Write-Host "No se pudo instalar el autoarranque. Usa 'Iniciar Automanual.bat' manualmente."
  exit 1
}

Write-Host "Listo. A partir de ahora el servidor arranca solo cada vez que inicias sesion"
Write-Host "y se recupera solo si se cae."
Write-Host ""
Write-Host "Para desinstalar:"
Write-Host "   schtasks /delete /tn AutomanualVCP /f"
Write-Host "   schtasks /delete /tn AutomanualVCP-vigia /f"
Write-Host "   (y borra el valor AutomanualVCP de HKCU\...\Run si existe)"
exit 0

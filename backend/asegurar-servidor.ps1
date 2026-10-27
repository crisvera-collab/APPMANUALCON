<#
  asegurar-servidor.ps1 - Garantiza que el servidor de AutomanualVCP este activo.

  Comprobacion doble de salud:
    1) GET /api/salud   -> la API responde
    2) GET /index.html  -> los archivos estaticos (HTML/CSS/JS) se sirven

  El punto 2 es importante: un proceso viejo puede contestar la API y aun asi
  no servir las paginas (directorio movido/borrado). Ese caso se considera
  "no sano" y se reinicia el servidor.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File asegurar-servidor.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File asegurar-servidor.ps1 -Forzar

  Si existe backend\pausa.flag el script no arranca nada (el usuario pidio
  detener el servidor con "Detener Automanual.bat").

  Codigo de salida: 0 = servidor activo, 1 = no se pudo activar.
#>

param([switch]$Forzar)

$ErrorActionPreference = "SilentlyContinue"

$Puerto        = 3000
$Backend       = $PSScriptRoot
$ArchivoPausa  = Join-Path $Backend "pausa.flag"
$Log           = Join-Path $Backend "server.log"
$LogError      = Join-Path $Backend "server-error.log"
$Traza         = Join-Path $Backend "asegurar.log"
$SegundosEspera = 45

# Registro de lo que decide cada ejecucion (util cuando lo dispara una tarea
# programada y no hay ventana donde ver los mensajes). Se rotara si pasa de 256 KB.
function Traza([string]$Mensaje) {
  try {
    if ((Test-Path $Traza) -and ((Get-Item $Traza).Length -gt 262144)) {
      Move-Item $Traza ($Traza + ".anterior") -Force
    }
    Add-Content -Path $Traza -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " | " + $Mensaje) -Encoding ASCII
  } catch { }
}

Traza "---- inicio (Forzar=$Forzar, PSScriptRoot=$PSScriptRoot, cwd=$((Get-Location).Path)) ----"

function Probar-Salud {
  try {
    $api = Invoke-WebRequest -Uri "http://localhost:$Puerto/api/salud" -UseBasicParsing -TimeoutSec 3
    if ($api.StatusCode -ne 200) { return $false }
  } catch { return $false }

  try {
    $web = Invoke-WebRequest -Uri "http://localhost:$Puerto/index.html" -UseBasicParsing -TimeoutSec 3
    if ($web.StatusCode -ne 200) { return $false }
  } catch { return $false }

  return $true
}

# ---------------------------------------------------------------- pausa ----
if (Test-Path $ArchivoPausa) {
  Traza "sale: en pausa (pausa.flag)"
  Write-Host "El servidor esta en pausa (archivo backend\pausa.flag)."
  Write-Host "Para arrancarlo: doble clic en 'Iniciar Automanual.bat'."
  exit 0
}

# ------------------------------------- cortafuegos (celulares/otra PC) ----
# Sin la regla "AutomanualVCP-puerto3000", Windows bloquea las conexiones
# que llegan desde otros equipos y la app "no funciona en el celular" aunque
# el servidor este perfectamente. Se avisa hasta que la regla exista.
if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {
  $regla = Get-NetFirewallRule -DisplayName "AutomanualVCP-puerto3000" -ErrorAction SilentlyContinue
  if (-not $regla) {
    Traza "aviso: falta la regla de Cortafuegos para el puerto 3000"
    Write-Host "AVISO: si el celular u otra PC no puede entrar a la app, ejecuta una sola vez:"
    Write-Host "       'Permitir acceso desde celulares.bat' (clic derecho -> Ejecutar como administrador)"
    Write-Host ""
  } else {
    Traza "regla de Cortafuegos presente (puerto 3000)"
  }
}

# ------------------------------------------------------- ya esta sano ------
if (-not $Forzar -and (Probar-Salud)) {
  Traza "sale: el servidor ya estaba sano"
  Write-Host "El servidor ya esta activo en http://localhost:$Puerto"
  exit 0
}
Traza "el servidor NO esta sano; se comprueba el puerto $Puerto"

# ------------------------------------------- que hay en el puerto 3000 -----
$conexion = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conexion) {
  $proceso = Get-Process -Id $conexion.OwningProcess -ErrorAction SilentlyContinue
  Traza "puerto $Puerto ocupado por PID $($conexion.OwningProcess) ($(if ($proceso) { $proceso.ProcessName } else { 'desconocido' }))"

  if ($proceso -and $proceso.ProcessName -ne "node") {
    Traza "sale: el puerto lo ocupa otro programa, no se toca"
    Write-Host "AVISO: el puerto $Puerto lo ocupa otro programa ($($proceso.ProcessName), PID $($proceso.Id))."
    Write-Host "No se modifica nada. Cierra ese programa o cambia el puerto en server.js."
    exit 1
  }

  if ($proceso) {
    Write-Host "Servidor viejo o incompleto en el puerto $Puerto (PID $($proceso.Id)). Se detiene y se relanza..."
    Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
  }
} else {
  Traza "puerto $Puerto libre"
}

# ------------------------------------------------------- comprobar node -----
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Traza "sale: no se encontro node.exe en el PATH"
  Write-Host "No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentarlo."
  exit 1
}
Traza "node = $($node.Source)"

# ------------------------------------------- dependencias (npm) -----------
# Si la carpeta llego sin node_modules (descarga limpia, publicacion nueva),
# se instalan solas antes de arrancar. Solo ocurre cuando faltan.
if (-not (Test-Path (Join-Path $Backend "node_modules\express"))) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    Traza "falta npm para instalar las dependencias"
    Write-Host "Falta npm (se instala junto con Node.js)."
    Write-Host "Instala Node.js desde https://nodejs.org y vuelve a intentarlo."
    exit 1
  }
  Write-Host "Primera ejecucion: instalando componentes del servidor (npm install)..."
  Push-Location $Backend
  $salidaNpm = & npm install --no-audit --no-fund --loglevel=error 2>&1 | Out-String
  $rcNpm = $LASTEXITCODE
  Pop-Location
  if ($rcNpm -ne 0) {
    Traza "npm install fallo (codigo $rcNpm): $($salidaNpm.Trim())"
    Write-Host "No se pudieron instalar los componentes. Revisa tu conexion a internet y"
    Write-Host "vuelve a ejecutar 'Iniciar Automanual.bat'."
    exit 1
  }
  Traza "npm install OK (node_modules regenerada)"
  Write-Host "[OK] Componentes instalados."
}

# --------------------------------------------------------- arrancar ---------
if (Test-Path $Log)      { Remove-Item $Log -Force -ErrorAction SilentlyContinue }
if (Test-Path $LogError) { Remove-Item $LogError -Force -ErrorAction SilentlyContinue }

Write-Host "Arrancando el servidor en segundo plano (ventana oculta)..."
Traza "arrancando node server.js en $Backend"
$procesoNuevo = Start-Process -FilePath $node.Source `
              -ArgumentList "server.js" `
              -WorkingDirectory $Backend `
              -WindowStyle Hidden `
              -RedirectStandardOutput $Log `
              -RedirectStandardError  $LogError `
              -PassThru
Traza "node lanzado con PID $($procesoNuevo.Id)"

$limite = (Get-Date).AddSeconds($SegundosEspera)
while ((Get-Date) -lt $limite) {
  Start-Sleep -Milliseconds 600
  if (Probar-Salud) {
    Traza "OK: servidor activo y sirviendo la app"
    Write-Host "Servidor activo y sirviendo la app: http://localhost:$Puerto"
    exit 0
  }
}

Traza "FALLO: sin respuesta valida en $SegundosEspera segundos"
Write-Host "El servidor no respondio en $SegundosEspera segundos."
Write-Host "Revisa el log de errores: $LogError"
exit 1

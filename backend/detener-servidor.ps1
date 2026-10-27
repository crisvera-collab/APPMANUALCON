<#
  detener-servidor.ps1 - Detiene el servidor de AutomanualVCP (puerto 3000).

  Ademas crea backend\pausa.flag: la tarea de vigilancia (AutomanualVCP-vigia)
  y el arranque automatico respetan ese archivo y no vuelven a levantar el
  servidor hasta que el usuario ejecute "Iniciar Automanual.bat" (que lo borra).
#>

$ErrorActionPreference = "SilentlyContinue"

$Puerto        = 3000
$Backend       = $PSScriptRoot
$ArchivoPausa  = Join-Path $Backend "pausa.flag"

Set-Content -Path $ArchivoPausa -Value ("Detenido " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding ASCII

$conexion = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conexion) {
  $proceso = Get-Process -Id $conexion.OwningProcess -ErrorAction SilentlyContinue
  if ($proceso -and $proceso.ProcessName -eq "node") {
    Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    Write-Host "Servidor detenido (PID $($proceso.Id))."
  } elseif ($proceso) {
    Write-Host "AVISO: el puerto $Puerto lo ocupa $($proceso.ProcessName). No se detiene nada."
  }
} else {
  Write-Host "El servidor no estaba corriendo."
}

Write-Host "Queda en pausa hasta que vuelvas a ejecutar 'Iniciar Automanual.bat'."
exit 0

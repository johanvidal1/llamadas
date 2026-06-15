# backup.ps1 - Crea backup del código (git) y base de datos (PostgreSQL/Docker)

param(
    [string]$Mensaje = ""
)

$fecha = Get-Date -Format "dd/MM/yyyy HH:mm"
$fechaArchivo = Get-Date -Format "yyyyMMdd_HHmm"

if (-not $Mensaje) {
    $Mensaje = Read-Host "Descripción del backup (Enter para omitir)"
}
if (-not $Mensaje) { $Mensaje = "backup manual" }

Set-Location $PSScriptRoot

# ── 1. GIT COMMIT ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 1/2 ] Guardando código en Git..." -ForegroundColor Cyan

$gitStatus = git status --porcelain
if ($gitStatus) {
    git add -A
    git commit -m "$Mensaje - $fecha"
    $hash = git rev-parse --short HEAD
    Write-Host "        Commit creado: $hash" -ForegroundColor Green
    Write-Host "        Restaurar con: git reset --hard $hash" -ForegroundColor Yellow
} else {
    Write-Host "        Sin cambios pendientes en el código." -ForegroundColor Gray
    $hash = git rev-parse --short HEAD
    Write-Host "        Commit actual:  $hash" -ForegroundColor Gray
}

# ── 2. DUMP BASE DE DATOS ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2/2 ] Haciendo dump de la base de datos..." -ForegroundColor Cyan

$backupsDir = "$PSScriptRoot\backups"
if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }

$archivoSql = "$backupsDir\db_$fechaArchivo.sql"

$contenedor = docker ps --filter "name=llamadas_db" --format "{{.Names}}" 2>&1
if ($contenedor -eq "llamadas_db") {
    docker exec llamadas_db pg_dump -U crm_user llamadas_crm | Out-File -Encoding utf8 $archivoSql
    $tamaño = [math]::Round((Get-Item $archivoSql).Length / 1KB, 1)
    Write-Host "        Archivo: backups\db_$fechaArchivo.sql ($tamaño KB)" -ForegroundColor Green
    Write-Host "        Restaurar con: docker exec -i llamadas_db psql -U crm_user llamadas_crm < `"$archivoSql`"" -ForegroundColor Yellow
} else {
    Write-Host "        Docker no está corriendo o el contenedor 'llamadas_db' no está activo." -ForegroundColor Red
    Write-Host "        Iniciá Docker Desktop y ejecutá: docker-compose up -d" -ForegroundColor Yellow
}

# ── RESUMEN ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Backup completado: $Mensaje" -ForegroundColor Green
Write-Host ""

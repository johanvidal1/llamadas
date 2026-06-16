# baseline-production-migrations.ps1
# One-time fix for Prisma P3005 on Render: prod DB has tables but no _prisma_migrations history.
# Marks init + assignment_by_contact as already applied, then deploys the 3 newer migrations.

$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $backendRoot

if (-not $env:DATABASE_URL) {
    Write-Host ""
    Write-Host "ERROR: DATABASE_URL no está definida." -ForegroundColor Red
    Write-Host ""
    Write-Host "Opciones:" -ForegroundColor Yellow
    Write-Host "  A) Render Shell (recomendado): copia la External Database URL del dashboard y ejecuta:"
    Write-Host '     export DATABASE_URL="postgresql://..."'
    Write-Host "     bash scripts/baseline-production-migrations.sh"
    Write-Host ""
    Write-Host "  B) Local (Windows):"
    Write-Host '     $env:DATABASE_URL = "postgresql://..."   # External URL de Render (dpg-...render.com)'
    Write-Host "     .\scripts\baseline-production-migrations.ps1"
    Write-Host ""
    exit 1
}

if ($env:DATABASE_URL -notmatch "dpg-|render\.com") {
    Write-Host ""
    Write-Host "ADVERTENCIA: DATABASE_URL no parece ser de Render (esperado dpg- o render.com)." -ForegroundColor Yellow
    Write-Host "URL actual: $($env:DATABASE_URL.Substring(0, [Math]::Min(60, $env:DATABASE_URL.Length)))..."
    $confirm = Read-Host "¿Continuar de todos modos? (s/N)"
    if ($confirm -notmatch "^[sS]") {
        Write-Host "Cancelado."
        exit 1
    }
}

Write-Host ""
Write-Host "=== Baseline migraciones producción (P3005) ===" -ForegroundColor Cyan
Write-Host "Directorio: $backendRoot"
Write-Host ""

$baselineMigrations = @(
    "20260615080248_init",
    "20260615120000_assignment_by_contact"
)

$deployMigrations = @(
    "20260615143000_import_batch_file_metadata",
    "20260615150000_import_batch_source_row_count",
    "20260616000000_import_batch_blocked"
)

Write-Host "[1/2] Marcando migraciones ya presentes en prod como aplicadas..." -ForegroundColor Cyan
foreach ($migration in $baselineMigrations) {
    Write-Host "  -> resolve --applied $migration"
    npx prisma migrate resolve --applied $migration
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR en resolve --applied $migration (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "[2/2] Desplegando migraciones pendientes..." -ForegroundColor Cyan
foreach ($migration in $deployMigrations) {
    Write-Host "  -> deploy (incluye $migration)"
}
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR en migrate deploy (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Baseline completado. Migraciones resueltas:" -ForegroundColor Green
foreach ($migration in $baselineMigrations) {
    Write-Host "  - $migration (resolve --applied)"
}
Write-Host "Migraciones desplegadas:" -ForegroundColor Green
foreach ($migration in $deployMigrations) {
    Write-Host "  - $migration"
}
Write-Host ""
Write-Host "Siguiente paso: redeploy de llamadas-backend en Render (o esperar al próximo deploy)." -ForegroundColor Yellow
Write-Host ""

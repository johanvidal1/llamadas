# fix-assignment-contact-id-prod.ps1
# Idempotent fix: production DB has assignment_by_contact marked applied but SQL never ran.
# Requires DATABASE_URL. Safe to re-run (exits 0 if Assignment.contactId already exists).
#
# Partial states — see comments in fix-assignment-contact-id-prod.sh

$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$migrationSql = Join-Path $backendRoot "prisma/migrations/20260615120000_assignment_by_contact/migration.sql"
Set-Location $backendRoot

if (-not $env:DATABASE_URL) {
    Write-Host "ERROR: DATABASE_URL is not set." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $migrationSql)) {
    Write-Host "ERROR: Migration SQL not found: $migrationSql" -ForegroundColor Red
    exit 1
}

function Write-Log([string]$Message) {
    Write-Host "[fix-assignment-contact-id] $Message"
}

function Get-AssignmentColumns {
    $nodeScript = @"
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const rows = await p.`$queryRawUnsafe(
    \"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Assignment' ORDER BY column_name\"
  );
  for (const r of rows) console.log(r.column_name);
  await p.`$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
"@
    $lines = node -e $nodeScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $lines
        exit $LASTEXITCODE
    }
    return @($lines | Where-Object { $_ -match '\S' })
}

function Test-AssignmentColumn([string]$Name, [string[]]$Columns) {
    return $Columns -contains $Name
}

Write-Log "Assignment columns (before):"
$beforeCols = Get-AssignmentColumns
$beforeCols | ForEach-Object { Write-Host "  $_" }

if (Test-AssignmentColumn "contactId" $beforeCols) {
    Write-Log "Assignment.contactId already exists — nothing to do."
    exit 0
}

if (-not (Test-AssignmentColumn "companyId" $beforeCols)) {
    Write-Log "ERROR: contactId missing and companyId missing — cannot apply assignment_by_contact SQL safely."
    Write-Log "Inspect Assignment table and _prisma_migrations; restore backup if needed."
    exit 1
}

Write-Log "Applying migration SQL: $migrationSql"
npx prisma db execute --file $migrationSql
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Log "Assignment columns (after fix):"
$afterCols = Get-AssignmentColumns
$afterCols | ForEach-Object { Write-Host "  $_" }

if (-not (Test-AssignmentColumn "contactId" $afterCols)) {
    Write-Log "ERROR: contactId still missing after executing migration SQL."
    exit 1
}

Write-Log "Running prisma migrate deploy..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Log "Migration status:"
npx prisma migrate status

Write-Log "Done."

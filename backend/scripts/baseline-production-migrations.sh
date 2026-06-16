#!/usr/bin/env bash
# One-time fix for Prisma P3005 on Render: prod DB has tables but no _prisma_migrations history.
# Marks init + assignment_by_contact as already applied, then deploys the 3 newer migrations.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo ""
  echo "ERROR: DATABASE_URL is not set."
  echo ""
  echo "Render Shell (recommended):"
  echo '  export DATABASE_URL="postgresql://crm_user:...@dpg-....oregon-postgres.render.com/llamadas_crm"'
  echo "  bash scripts/baseline-production-migrations.sh"
  echo ""
  exit 1
fi

echo ""
echo "=== Baseline production migrations (P3005) ==="
echo "Working directory: $BACKEND_ROOT"
echo ""

BASELINE_MIGRATIONS=(
  "20260615080248_init"
  "20260615120000_assignment_by_contact"
)

DEPLOY_MIGRATIONS=(
  "20260615143000_import_batch_file_metadata"
  "20260615150000_import_batch_source_row_count"
  "20260616000000_import_batch_blocked"
)

resolve_applied_if_needed() {
  local migration=$1
  local output=""
  local exit_code=0

  output="$(npx prisma migrate resolve --applied "$migration" 2>&1)" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo "  OK: $migration marked as applied"
    return 0
  fi

  if echo "$output" | grep -q 'P3008'; then
    echo "  SKIP: $migration (P3008 - already in _prisma_migrations)"
    return 0
  fi

  if echo "$output" | grep -q 'P3017'; then
    echo "  SKIP: $migration (P3017 - migration folder not found locally)"
    return 0
  fi

  echo "  ERROR resolve --applied $migration:"
  echo "$output"
  return 1
}

echo "[1/2] Marking migrations already in prod as applied..."
for migration in "${BASELINE_MIGRATIONS[@]}"; do
  echo "  -> resolve --applied $migration"
  resolve_applied_if_needed "$migration" || exit 1
done

echo ""
echo "[2/2] Deploying pending migrations..."
for migration in "${DEPLOY_MIGRATIONS[@]}"; do
  echo "  -> will apply $migration"
done
npx prisma migrate deploy

echo ""
echo "Baseline complete."
echo ""

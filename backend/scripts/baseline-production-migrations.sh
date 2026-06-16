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
  echo "Or run from Render dashboard > llamadas-db > Connect > External Database URL,"
  echo "then paste into the export command above."
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

echo "[1/2] Marking migrations already in prod as applied..."
for migration in "${BASELINE_MIGRATIONS[@]}"; do
  echo "  -> resolve --applied $migration"
  npx prisma migrate resolve --applied "$migration"
done

echo ""
echo "[2/2] Deploying pending migrations..."
for migration in "${DEPLOY_MIGRATIONS[@]}"; do
  echo "  -> will apply $migration"
done
npx prisma migrate deploy

echo ""
echo "Baseline complete."
echo "Resolved (already in prod):"
for migration in "${BASELINE_MIGRATIONS[@]}"; do
  echo "  - $migration"
done
echo "Deployed:"
for migration in "${DEPLOY_MIGRATIONS[@]}"; do
  echo "  - $migration"
done
echo ""
echo "Next: trigger a redeploy of llamadas-backend on Render."
echo ""

#!/usr/bin/env bash
# Idempotent fix: production DB has assignment_by_contact marked applied but SQL never ran.
# Requires DATABASE_URL. Safe to re-run (exits 0 if Assignment.contactId already exists).
#
# Partial states (manual intervention may be required):
#   - contactId present, companyId absent     -> already migrated; script exits 0.
#   - contactId absent, companyId present     -> runs prisma/migrations/.../migration.sql.
#   - contactId present, companyId present    -> migration interrupted mid-flight; inspect
#     _AssignmentMigration temp table and finish DROP COLUMN companyId / constraints by hand.
#   - contactId absent, companyId absent      -> unknown/broken schema; do not run migration.sql
#     blindly (data may be inconsistent). Restore from backup or inspect Assignment rows.
#   - Table "_AssignmentMigration" still exists -> previous run failed during INSERT; resolve
#     temp data before re-running migration SQL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATION_SQL="$BACKEND_ROOT/prisma/migrations/20260615120000_assignment_by_contact/migration.sql"

cd "$BACKEND_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

if [[ ! -f "$MIGRATION_SQL" ]]; then
  echo "ERROR: Migration SQL not found: $MIGRATION_SQL" >&2
  exit 1
fi

log() {
  echo "[fix-assignment-contact-id] $*"
}

list_assignment_columns() {
  node -e "
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const rows = await p.\$queryRawUnsafe(
    \"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Assignment' ORDER BY column_name\"
  );
  for (const r of rows) console.log(r.column_name);
  await p.\$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
"
}

has_column() {
  local name=$1
  list_assignment_columns | grep -Fxq "$name"
}

log "Assignment columns (before):"
BEFORE_COLS="$(list_assignment_columns)"
echo "$BEFORE_COLS" | sed 's/^/  /'

if has_column "contactId"; then
  log "Assignment.contactId already exists — nothing to do."
  exit 0
fi

if ! has_column "companyId"; then
  log "ERROR: contactId missing and companyId missing — cannot apply assignment_by_contact SQL safely." >&2
  log "Inspect Assignment table and _prisma_migrations; restore backup if needed." >&2
  exit 1
fi

log "Applying migration SQL: $MIGRATION_SQL"
npx prisma db execute --file "$MIGRATION_SQL"

log "Assignment columns (after fix):"
AFTER_COLS="$(list_assignment_columns)"
echo "$AFTER_COLS" | sed 's/^/  /'

if ! has_column "contactId"; then
  log "ERROR: contactId still missing after executing migration SQL." >&2
  exit 1
fi

log "Running prisma migrate deploy..."
npx prisma migrate deploy

log "Migration status:"
npx prisma migrate status

log "Done."
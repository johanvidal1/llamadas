#!/usr/bin/env bash
# Idempotent production migrate wrapper for Render startCommand.
# On deploy failure, marks baseline migrations as applied (when schema already matches)
# and retries deploy. Safe to run on every deploy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

BASELINE_MIGRATIONS=(
  "20260615080248_init"
  "20260615120000_assignment_by_contact"
)

log() {
  echo "[migrate-deploy-prod] $*"
}

resolve_applied_if_needed() {
  local migration=$1
  local output=""
  local exit_code=0

  output="$(npx prisma migrate resolve --applied "$migration" 2>&1)" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log "Marked as applied: $migration"
    return 0
  fi

  if echo "$output" | grep -q 'P3008'; then
    log "Skip resolve $migration (P3008: already recorded as applied)"
    return 0
  fi

  if echo "$output" | grep -q 'P3017'; then
    log "Skip resolve $migration (P3017: migration not found - will rely on deploy/SQL)"
    return 0
  fi

  log "FAILED resolve --applied $migration:"
  echo "$output" >&2
  return 1
}

run_deploy() {
  local output=""
  local exit_code=0
  output="$(npx prisma migrate deploy 2>&1)" || exit_code=$?
  echo "$output"
  return $exit_code
}

log "Running prisma migrate deploy..."
if run_deploy; then
  log "migrate deploy succeeded."
  exit 0
fi

log "migrate deploy failed; attempting baseline resolve + retry..."

for migration in "${BASELINE_MIGRATIONS[@]}"; do
  resolve_applied_if_needed "$migration" || exit 1
done

log "Retrying prisma migrate deploy..."
if run_deploy; then
  log "migrate deploy succeeded after baseline resolve."
  exit 0
fi

log "ERROR: prisma migrate deploy still failing after baseline resolve." >&2
log "Run: npx prisma migrate status" >&2
exit 1

#!/usr/bin/env bash
# deploy-staging.sh — actualiza CRM staging en Ubuntu (pruebacrm.optickcloud.com)
# NO toca Render / crm.optickcloud.com. NO hace git push.
#
# Uso:
#   bash /opt/llamadas/scripts/deploy-staging.sh           # fetch + checkout + pull + compose
#   bash /opt/llamadas/scripts/deploy-staging.sh --pull-only  # solo git (sin compose)
#   bash /opt/llamadas/scripts/deploy-staging.sh --check      # preflight + fetch info (sin checkout ni compose)
#
# Override: BRANCH=staging (default) o BRANCH=otra-rama
set -euo pipefail

REPO_DIR="/opt/llamadas"
BRANCH="${BRANCH:-staging}"
ENV_FILE="${REPO_DIR}/.env"
PULL_ONLY=0
CHECK_ONLY=0

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }
warn() { log "WARN: $*"; }
die() { log "ERROR: $*"; exit 1; }

usage() {
  cat <<'USAGE'
Uso: deploy-staging.sh [--pull-only|--check|-h]

  (sin flags)   git fetch/checkout/pull + docker compose build && up -d + health
  --pull-only   solo git (fetch/checkout/pull); no rebuild de contenedores
  --check       preflight + fetch; no cambia branch ni corre compose
  -h, --help    esta ayuda

Variables: BRANCH (default: staging)
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --pull-only) PULL_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "flag desconocido: $arg (usa --help)" ;;
  esac
done

cd "$REPO_DIR" || die "no se puede cd a ${REPO_DIR}"

[[ -d .git ]] || die "${REPO_DIR} no es un repo git"

if [[ ! -f "$ENV_FILE" ]]; then
  warn "no existe ${ENV_FILE} — compose/up fallará sin secretos; crea desde .env.example"
fi

# Estado sucio: avisar, no abortar (staging suele tener cambios locales de ops)
dirty="$(git status --porcelain 2>/dev/null || true)"
if [[ -n "$dirty" ]]; then
  warn "working tree sucio en ${REPO_DIR} (revisa antes de deploy):"
  printf '%s\n' "$dirty" | head -n 40
  if [[ "$(printf '%s\n' "$dirty" | wc -l)" -gt 40 ]]; then
    warn "... (más líneas omitidas; git status -sb)"
  fi
fi

log "=== Deploy staging Ubuntu (NO afecta Render) ==="
log "Repo: ${REPO_DIR} | branch objetivo: ${BRANCH}"
log "Recordatorio: crm.optickcloud.com (Render) NO se actualiza con este script."

log "git fetch origin..."
git fetch origin

remote_staging_exists=0
if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
  remote_staging_exists=1
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "Modo --check: no se cambia de rama ni se corre compose."
  log "HEAD local: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
  if [[ "$remote_staging_exists" -eq 1 ]]; then
    log "origin/${BRANCH} existe: $(git rev-parse --short "origin/${BRANCH}")"
  else
    warn "origin/${BRANCH} NO existe en GitHub."
    warn "Desde el laptop: crea y push la rama '${BRANCH}', luego vuelve a correr este script."
  fi
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    log "rama local ${BRANCH}: $(git rev-parse --short "${BRANCH}")"
  else
    log "rama local ${BRANCH}: ausente"
  fi
  log "Check OK. Render no fue tocado. No se hizo push."
  exit 0
fi

if [[ "$remote_staging_exists" -eq 1 ]]; then
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "${BRANCH}"
  else
    git checkout -b "${BRANCH}" --track "origin/${BRANCH}"
  fi
  log "git pull --ff-only origin ${BRANCH}..."
  git pull --ff-only "origin" "${BRANCH}"
else
  warn "origin/${BRANCH} no existe en el remoto."
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "${BRANCH}"
    warn "Usando rama local ${BRANCH} (sin tracking remoto)."
  else
    # Crear staging local desde HEAD actual (típicamente main) SIN push
    git checkout -b "${BRANCH}"
    warn "Creada rama local '${BRANCH}' desde $(git rev-parse --short HEAD)."
  fi
  cat <<MSG

************************************************************************
  ACCIÓN REQUERIDA EN EL LAPTOP (no desde este servidor):
  1. Asegura que la rama '${BRANCH}' exista en GitHub (push desde laptop).
  2. Confirma en Render Dashboard que Auto-Deploy sigue en 'main' solamente.
  3. En el servidor: git fetch && este script otra vez.
  Este servidor NUNCA debe hacer git push a GitHub.
************************************************************************

MSG
fi

log "HEAD: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

if [[ "$PULL_ONLY" -eq 1 ]]; then
  log "Modo --pull-only: omitiendo docker compose."
  log "Listo (solo git). Render no fue tocado. No se hizo push."
  exit 0
fi

log "docker compose build && up -d (vía sg docker)..."
sg docker -c 'docker compose build && docker compose up -d'

log "Health check..."
health_ok=0
if curl -fsS -H 'Host: pruebacrm.optickcloud.com' http://127.0.0.1/api/health >/dev/null 2>&1; then
  health_ok=1
  log "OK: /api/health via Host pruebacrm.optickcloud.com"
elif curl -fsS -H 'Host: pruebacrm.optickcloud.com' http://127.0.0.1/ >/dev/null 2>&1; then
  health_ok=1
  log "OK: frontend responde (api/health no disponible; raíz OK)"
else
  warn "Health check local falló (curl 127.0.0.1). Revisa: sg docker -c 'docker compose ps'"
fi

log "=== Fin deploy staging ==="
log "Staging: https://pruebacrm.optickcloud.com"
log "Este script NO despliega ni reinicia Render (crm.optickcloud.com)."
log "Nunca hagas git push desde este servidor."
[[ "$health_ok" -eq 1 ]] || exit 1

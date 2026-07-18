#!/usr/bin/env bash
# deploy-prod.sh — despliega CRM PRODUCCIÓN en Ubuntu (crm.optickcloud.com)
# NO toca staging (/opt/llamadas). NO hace git push. NO toca UFW/sshd.
#
# Uso:
#   bash /opt/llamadas-prod/scripts/deploy-prod.sh              # fetch + checkout + pull + compose
#   bash /opt/llamadas-prod/scripts/deploy-prod.sh --pull-only  # solo git (sin compose)
#   bash /opt/llamadas-prod/scripts/deploy-prod.sh --check      # preflight (sin checkout ni compose)
#
# Override: BRANCH=main (default) o BRANCH=otra-rama
set -euo pipefail

REPO_DIR="/opt/llamadas-prod"
BRANCH="${BRANCH:-main}"
ENV_FILE="${REPO_DIR}/.env.prod"
COMPOSE_FILE="${REPO_DIR}/docker-compose.prod.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"
PULL_ONLY=0
CHECK_ONLY=0

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }
warn() { log "WARN: $*"; }
die() { log "ERROR: $*"; exit 1; }

usage() {
  cat <<'USAGE'
Uso: deploy-prod.sh [--pull-only|--check|-h]

  (sin flags)   git fetch/checkout/pull + docker compose build && up -d + health
  --pull-only   solo git (fetch/checkout/pull); no rebuild de contenedores
  --check       preflight + fetch; no cambia branch ni corre compose
  -h, --help    esta ayuda

Variables: BRANCH (default: main)

Compose: docker-compose.prod.yml + .env.prod (staging usa docker-compose.yml)
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

[[ -f "$ENV_FILE" ]] || die "no existe ${ENV_FILE} — crea y llena los secretos primero"
[[ -f "$COMPOSE_FILE" ]] || die "no existe ${COMPOSE_FILE} — pull main / verifica el repo"

if grep -q 'CHANGE_ME' "$ENV_FILE"; then
  die "hay valores CHANGE_ME en ${ENV_FILE} — llena los secretos antes de desplegar"
fi

if [[ ! -d .git ]]; then
  warn "${REPO_DIR} no es un repo git — se omite la fase git (solo compose)."
else
  # Producción: abortar si el working tree está sucio (a diferencia de staging)
  dirty="$(git status --porcelain 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    warn "working tree sucio en ${REPO_DIR}:"
    printf '%s\n' "$dirty" | head -n 40
    die "producción exige working tree limpio. Revisa/descarta cambios y reintenta."
  fi

  log "=== Deploy PRODUCCIÓN Ubuntu ==="
  log "Repo: ${REPO_DIR} | branch objetivo: ${BRANCH}"
  log "Compose: ${COMPOSE_FILE} + ${ENV_FILE}"

  log "git fetch origin..."
  git fetch origin

  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    log "Modo --check: no se cambia de rama ni se corre compose."
    log "HEAD local: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
    if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
      log "origin/${BRANCH}: $(git rev-parse --short "origin/${BRANCH}")"
    else
      warn "origin/${BRANCH} NO existe en el remoto."
    fi
    if sg docker -c "${COMPOSE} config" >/dev/null 2>&1; then
      log "OK: docker compose config"
    else
      warn "docker compose config falló — revisa ${COMPOSE_FILE} y ${ENV_FILE}"
    fi
    log "Check OK. No se hizo push."
    exit 0
  fi

  git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}" \
    || die "origin/${BRANCH} no existe en el remoto — push desde el laptop primero."

  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "${BRANCH}"
  else
    git checkout -b "${BRANCH}" --track "origin/${BRANCH}"
  fi
  log "git pull --ff-only origin ${BRANCH}..."
  git pull --ff-only origin "${BRANCH}"
  log "HEAD: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
fi

if [[ "$PULL_ONLY" -eq 1 ]]; then
  log "Modo --pull-only: omitiendo docker compose."
  exit 0
fi

log "Validando compose config..."
sg docker -c "${COMPOSE} config" >/dev/null || die "docker compose config inválido"

log "docker compose build && up -d (vía sg docker)..."
# Preferir no recrear db si no cambió la definición: Compose solo recrea servicios con diff.
sg docker -c "${COMPOSE} build && ${COMPOSE} up -d"

log "Health check..."
health_ok=0
if curl -fsS -H 'Host: crm.optickcloud.com' http://127.0.0.1/api/health >/dev/null 2>&1; then
  health_ok=1
  log "OK: /api/health via Host crm.optickcloud.com"
elif sg docker -c "docker exec llamadas-prod-api curl -fsS http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  health_ok=1
  log "OK: /api/health dentro del contenedor (Caddy aún no enruta crm.optickcloud.com)"
else
  warn "Health check falló. Revisa: sg docker -c '${COMPOSE} ps'"
fi

log "=== Fin deploy producción ==="
log "Nunca hagas git push desde este servidor."
[[ "$health_ok" -eq 1 ]] || exit 1

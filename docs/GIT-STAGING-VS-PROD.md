# Git: staging vs producción (Ubuntu)

Antes: producción en Render. **Ahora ambos entornos viven en Ubuntu** (mismo host o paths separados). Render queda solo como legado — desactivar Auto-Deploy si aún está encendido; no es el camino diario de prod.

| Campo | Staging | Producción |
|-------|---------|------------|
| Host | Ubuntu `servidoroptick` | Ubuntu (mismo servidor / path separado) |
| Dominio | `pruebacrm.optickcloud.com` | `crm.optickcloud.com` |
| Rama Git | **`staging`** | **`main`** |
| Código en servidor | `/opt/llamadas` | `/opt/llamadas-prod` |
| Compose | `docker-compose.yml` + `.env` | **`docker-compose.prod.yml`** + **`.env.prod`** |
| Script | `bash /opt/llamadas/scripts/deploy-staging.sh` | `bash /opt/llamadas-prod/scripts/deploy-prod.sh` |
| Proxy | Caddy en `/opt/platform` | Caddy en `/opt/platform` |
| Repo | https://github.com/johanvidal1/llamadas | igual |

## Separación (no mezclar)

1. **Producción (Ubuntu):** solo rama `main` + `deploy-prod.sh` en el path de prod. No uses el script de staging para actualizar `crm.optickcloud.com`.
2. **Staging (Ubuntu):** solo rama `staging` + `deploy-staging.sh` en `/opt/llamadas`. No `git push` desde el servidor.
3. **Laptop:** fuente de verdad para GitHub — `git push` únicamente desde el laptop. Servidor: `pull` / `fetch` solamente.
4. **Caddy / platform:** `/opt/platform` — no tocar para deploys de app.
5. **Render (legado):** no es el deploy diario. Si Auto-Deploy sigue activo, **desactívalo** para evitar un segundo destino en paralelo.

## Deploy staging (Ubuntu)

```bash
bash /opt/llamadas/scripts/deploy-staging.sh           # git + compose build/up + health
bash /opt/llamadas/scripts/deploy-staging.sh --pull-only
bash /opt/llamadas/scripts/deploy-staging.sh --check
```

Override: `BRANCH=staging` (default).

El script:

- `git fetch origin`
- checkout `staging` (tracking `origin/staging` si existe; si no, rama local y mensaje para el laptop)
- `git pull --ff-only` cuando hay remoto
- `sg docker -c 'docker compose build && docker compose up -d'`
- health: `curl` a `127.0.0.1` con `Host: pruebacrm.optickcloud.com`

**No** hace push. **No** actualiza producción ni habla con Render.

## Deploy producción (Ubuntu)

```bash
bash /opt/llamadas-prod/scripts/deploy-prod.sh
# Flags: --pull-only | --check
```

`deploy-prod.sh` usa:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod …
```

**No** uses el `docker-compose.yml` de staging en `/opt/llamadas-prod`. Ese archivo es staging-oriented en el repo; prod vive en `docker-compose.prod.yml` (mismo contenido operativo que el compose local histórico de prod: contenedores `llamadas-prod-*`, imágenes `*:prod`, volume `llamadas_prod_data`).

Validar sin recrear nada:

```bash
cd /opt/llamadas-prod
sg docker -c 'docker compose -f docker-compose.prod.yml --env-file .env.prod config'
```

Flujo esperado:

1. Laptop: merge `staging` → `main` → `git push origin main`
2. Servidor: `bash /opt/llamadas-prod/scripts/deploy-prod.sh` (pull `main` + compose build/up + health `crm.optickcloud.com`)

**No** recrear el volume de Postgres (`llamadas_prod_data`) en deploys normales. **No** `skip-worktree` en `docker-compose.yml` de prod: con `docker-compose.prod.yml` el pull de `main` ya no pelea con un compose local divergente.

## Laptop (fuente de verdad para GitHub)

1. Crear/push `staging` si falta:

```bash
git checkout -b staging   # o desde main
git push -u origin staging
```

2. Desarrollo diario: commits → `git push origin staging`.
3. Staging en servidor: tras el push, `bash /opt/llamadas/scripts/deploy-staging.sh`.
4. Producción: merge a `main` → `git push origin main` → en el servidor `bash /opt/llamadas-prod/scripts/deploy-prod.sh`.
5. **No** dependas de Render Auto-Deploy. Si el servicio Render sigue existiendo, desactiva Auto-Deploy.

## Servidor: tras push a `staging`

```bash
bash /opt/llamadas/scripts/deploy-staging.sh
```

## Deploy Key SSH (read-only, opcional)

Hoy el remote suele ser HTTPS. Para Deploy Key:

```bash
# Solo si NO existe ya:
test -f ~/.ssh/github_llamadas_deploy || \
  ssh-keygen -t ed25519 -f ~/.ssh/github_llamadas_deploy -N '' -C 'llamadas-staging-ro'

cat ~/.ssh/github_llamadas_deploy.pub
```

En GitHub → repo **llamadas** → Settings → Deploy keys → Add key → **Allow write access: NO**.

`~/.ssh/config` (ejemplo):

```
Host github.com-llamadas
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_llamadas_deploy
  IdentitiesOnly yes
```

Remote (solo cuando la key esté en GitHub):

```bash
git -C /opt/llamadas remote set-url origin git@github.com-llamadas:johanvidal1/llamadas.git
```

Sin write access no se puede push aunque alguien lo intente con esa key.

## Checklist de seguridad

- [ ] Staging = `/opt/llamadas` + `staging` + `deploy-staging.sh` solamente
- [ ] Prod = `/opt/llamadas-prod` (verificar `ls`) + `main` + `deploy-prod.sh` (verificar `ls`)
- [ ] Laptop: push; servidor: pull/fetch solamente (sin credenciales de push)
- [ ] `.env` no en git (`chmod 600`)
- [ ] Caddy en `/opt/platform` intacto en deploys de app
- [ ] Render Auto-Deploy desactivado si el servicio legado aún existe
- [ ] No reiniciar SSH / no tocar UFW sin confirmación explícita (`CONFIRMAR SSHD` / `CONFIRMAR UFW`)
- [ ] DNS prod (`crm.optickcloud.com`) ya apunta a Ubuntu; no cambiar registros DNS sin necesidad (evitar roturas accidentales)

## Relacionado

- Multi-tenant plan: [MULTI-TENANT-FASE1.md](./MULTI-TENANT-FASE1.md)
- Backup / restore prod: [BACKUP-RESTORE-PROD.md](./BACKUP-RESTORE-PROD.md)
- README ops: raíz del repo / `/opt/llamadas/README.md` en staging

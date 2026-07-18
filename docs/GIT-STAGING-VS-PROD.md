# Git: staging vs producción (Ubuntu)

Antes: producción en Render. **Ahora ambos entornos viven en Ubuntu** (mismo host o paths separados). Render queda solo como legado — desactivar Auto-Deploy si aún está encendido; no es el camino diario de prod.

| Campo | Staging | Producción |
|-------|---------|------------|
| Host | Ubuntu `servidoroptick` | Ubuntu (mismo servidor / path separado) |
| Dominio | `pruebacrm.optickcloud.com` | `crm.optickcloud.com` |
| Rama Git | **`staging`** | **`main`** |
| Código en servidor | `/opt/llamadas` | `/opt/llamadas-prod` *(verificar en servidor con `ls`)* |
| Script | `bash /opt/llamadas/scripts/deploy-staging.sh` | `bash /opt/llamadas-prod/scripts/deploy-prod.sh` *(verificar en servidor con `ls`)* |
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
# En el servidor — path y script a confirmar con ls si hace falta:
ls /opt/llamadas-prod
ls /opt/llamadas-prod/scripts/deploy-prod.sh
bash /opt/llamadas-prod/scripts/deploy-prod.sh
```

Flujo esperado (análogo a staging):

1. Laptop: merge a `main` → `git push origin main`
2. Servidor: pull de `main` vía `deploy-prod.sh` (compose build/up + health para `crm.optickcloud.com`)

Si `deploy-prod.sh` aún no está en el repo del laptop, documenta/verifica en el servidor; no inventar Auto-Deploy en la nube.

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
- README ops: raíz del repo / `/opt/llamadas/README.md` en staging

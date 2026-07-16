# Git: Render (prod) vs Ubuntu (staging)

| Campo | Valor |
|-------|--------|
| Host | `servidoroptick` |
| Repo | https://github.com/johanvidal1/llamadas |
| Prod | Render → `crm.optickcloud.com` ← rama **`main`** + Auto-Deploy |
| Staging | Ubuntu → `pruebacrm.optickcloud.com` ← rama **`staging`** + script manual |
| Código | `/opt/llamadas` |
| Script | `/opt/llamadas/scripts/deploy-staging.sh` |

## Separación (no mezclar)

1. **Render / producción:** solo `main`. No cambiar Auto-Deploy a `staging`. No disparar deploys desde este host.
2. **Ubuntu / staging:** solo `staging` + `deploy-staging.sh`. No `git push` desde el servidor.
3. **Caddy / tunnel:** `/opt/platform` — no tocar para deploys de app.

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

**No** hace push. **No** habla con la API de Render.

## Laptop (fuente de verdad para GitHub)

1. Crear/push `staging` si falta:

```bash
git checkout -b staging   # o desde main
git push -u origin staging
```

2. Desarrollo diario: commits → `git push origin staging`.
3. Producción: merge a `main` → push `main` → Render Auto-Deploy (fuera de este servidor).
4. En Render Dashboard: **Settings → Build & Deploy → Auto-Deploy branch = `main`**.

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

- [ ] Render Auto-Deploy = `main` solamente
- [ ] Servidor: solo pull/fetch; sin credenciales de push
- [ ] `.env` no en git (`chmod 600`)
- [ ] Deploy = script manual, no webhook a Render desde staging
- [ ] No reiniciar SSH / no tocar UFW sin confirmación explícita

## Relacionado

- Plan Fase C: `/home/adminoptick/docs/FASE-C-despliegue-crm-staging.md`
- README ops: `/opt/llamadas/README.md`

# Caddy / DNS wildcard — `*.optickcloud.com` (PR4)

Runbook multi-tenant Fase 1. Caddy vive en **`/opt/platform`** (fuera del compose CRM).  
Plantilla: [`Caddyfile.example`](./Caddyfile.example).

## Arquitectura actual (servidor Ubuntu)

| Pieza | Detalle |
|-------|---------|
| Proxy | Contenedor `caddy` en red Docker `proxy` |
| Público | **Cloudflare Tunnel** (`cloudflared`) → `http://caddy:80` |
| TLS | En el **edge de Cloudflare** (`auto_https off` en Caddy) |
| Staging | `pruebacrm.optickcloud.com` → `llamadas-api` / `llamadas-frontend` (`/opt/llamadas`) |
| Prod | `crm.optickcloud.com` (+ `prodtest`) → `llamadas-prod-api` / `llamadas-prod-frontend` (`/opt/llamadas-prod`) |
| Wildcard | `{slug}.optickcloud.com` → **prod** (nunca staging DB) |

Sitios con hostname **explícito** en el Caddyfile ganan al bloque `*.optickcloud.com`.

## Política staging vs prod

- Clientes reales / slug de tenant → contenedores **prod**.
- Staging: `pruebacrm` + opcional `mt-staging.optickcloud.com` (smoke PR4) → contenedores **staging**.
- No mezclar DBs. No apuntar el wildcard a `llamadas-api`.

## Qué hace el usuario en Cloudflare (DNS + Tunnel)

Caddy solo recibe lo que el túnel le envía. Sin Public Hostname, el bloque wildcard no ve tráfico público.

### 1) DNS (zona `optickcloud.com`)

Con Cloudflare Tunnel lo habitual es:

1. En Zero Trust → Networks → Tunnels → tu túnel → **Public Hostname**.
2. Añadir:
   - `pruebacrm` (ya debería existir) → `http://caddy:80`
   - `crm` → `http://caddy:80`
   - `monitor` → `http://caddy:80` (Beszel)
   - **`*`** (wildcard) → `http://caddy:80`  ← **necesario para tenants**
   - Opcional smoke staging: `mt-staging` → `http://caddy:80`
3. Cloudflare crea/ajusta DNS (CNAME a `….cfargotunnel.com` o equivalente).  
   Si el wildcard DNS ya existe como A a la IP pública y **no** usáis túnel para ese host, no cambiar sin plan; hoy el diseño documentado es **túnel**.

**No** hace falta DNS-01 / token API de Let's Encrypt en Caddy mientras `auto_https off` y TLS lo haga Cloudflare.

### 2) Si algún día se publica sin túnel (LEGACY)

Entonces sí: quitar `auto_https off`, usar site blocks HTTPS, y para `*.optickcloud.com` configurar **DNS challenge** (p. ej. Cloudflare API token en Caddy). No es el camino actual.

### 3) SSL wildcard en Cloudflare

Universal SSL de Cloudflare suele cubrir `*.optickcloud.com` (un nivel). Verificar en SSL/TLS → Edge Certificates que el certificado incluya el wildcard.

## Aplicar en el servidor (seguro)

**No** tocar UFW ni sshd. Solo Caddyfile + validate + reload.

```bash
# En adminoptick@servidoroptick (LAN o Remote SSH)
cd /opt/platform

# 1) Backup
cp -a Caddyfile "Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"

# 2) Editar: fusionar bloques nuevos desde el repo
#    Laptop: infra/platform/Caddyfile.example
#    Mantener bloques existentes de pruebacrm / crm / monitor / prodtest.
#    Añadir: mt-staging (staging) + http://*.optickcloud.com (prod).

# 3) Validar (dentro del contenedor)
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# 4) Solo si validate OK — reload (sin recrear el contenedor)
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Si `validate` falla: **no** reload; restaurar el `.bak` y corregir.

### Rollback rápido

```bash
cd /opt/platform
cp -a Caddyfile.bak.YYYYMMDD-HHMMSS Caddyfile
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Verificación

```bash
# LAN / Host header (staging intacto)
curl -fsS -H 'Host: pruebacrm.optickcloud.com' http://127.0.0.1/api/health

# Prod host (stack prod)
curl -fsS -H 'Host: crm.optickcloud.com' http://127.0.0.1/api/health

# Wildcard → prod (404 tenant si el slug no existe en DB prod; health no usa tenant)
curl -fsS -H 'Host: cualquier-slug.optickcloud.com' http://127.0.0.1/api/health

# Tras Public Hostname en Cloudflare:
curl -fsS https://pruebacrm.optickcloud.com/api/health
curl -fsS https://crm.optickcloud.com/api/health
```

Backend (PR2): `resolveTenant` mapea `*.optickcloud.com` → slug; aliases `pruebacrm` / `crm` / `mt-staging` → Optick `crm`.  
CORS (PR2): origen `https://[\w-]+\.optickcloud\.com` aceptado.

## Checklist PR4

- [ ] Backup Caddyfile en `/opt/platform`
- [ ] Bloques `pruebacrm` / `crm` / `monitor` / `prodtest` intactos
- [ ] Bloque `*.optickcloud.com` → `llamadas-prod-*`
- [ ] Opcional: `mt-staging` → staging
- [ ] `caddy validate` OK + reload
- [ ] Cloudflare: Public Hostname `*` → `http://caddy:80`
- [ ] Health OK en pruebacrm y crm
- [ ] Docs checklist en `docs/MULTI-TENANT-FASE1.md` actualizado

## Relacionado

- Plan: [`docs/MULTI-TENANT-FASE1.md`](../../docs/MULTI-TENANT-FASE1.md) §4 y §8 PR4
- Git staging vs prod: [`docs/GIT-STAGING-VS-PROD.md`](../../docs/GIT-STAGING-VS-PROD.md)
- No instalar Node/Postgres en el host; apps solo en Docker.

# Alta de tenants (onboarding MVP)

API + UI de plataforma para crear un tenant (slug + nombre) y su admin inicial, sin el script `seed-tenant-demo`.

## Quién puede usarlo

- Usuario con `isSuperAdmin` **o** `isSystemOwner`
- Solo en el tenant **Optick** (`slug: crm`, hosts `pruebacrm.optickcloud.com` / `crm.optickcloud.com` / localhost / `mt-staging`)
- En la UI: menú **Tenants** → `/platform/tenants`

## Crear un tenant (UI)

1. Entra en Optick (staging: https://pruebacrm.optickcloud.com).
2. Inicia sesión como super-admin / dueño del sistema.
3. Abre **Tenants** en el menú.
4. **Nuevo tenant** → nombre, slug (`acme-test`), datos del admin (email, nombre, contraseña ≥ 6).
5. Al crear, la API responde con `url: https://{slug}.optickcloud.com`.

DNS wildcard `*.optickcloud.com` ya está configurado (Caddy + Cloudflare).

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/platform/tenants` | Lista tenants |
| `POST` | `/api/platform/tenants` | Crea tenant ACTIVE + admin |
| `PATCH` | `/api/platform/tenants/:id` | `{ status: "ACTIVE" \| "SUSPENDED" }` |

Body `POST`:

```json
{
  "name": "Acme Call Center",
  "slug": "acme-test",
  "adminEmail": "admin@acme.com",
  "adminName": "Admin Acme",
  "adminPassword": "secreto1"
}
```

Respuesta `201`:

```json
{
  "tenant": { "id": "...", "name": "...", "slug": "acme-test", "status": "ACTIVE" },
  "admin": { "id": "...", "email": "admin@acme.com", "name": "Admin Acme" },
  "url": "https://acme-test.optickcloud.com"
}
```

- Slug tomado o reservado → `409` / `400`
- Host no Optick o sin flags de plataforma → `403`

### ALS / Prisma (importante)

El middleware deja ALS = Optick. Crear el `User` admin **debe** hacerse con `runWithTenant(newTenantId, …)`; si no, la extensión Prisma estamparía `tenantId` de Optick.

`Tenant` no está en tablas scoped → el `create` del tenant es seguro sin cambiar ALS.

## Staging smoke (no usar prod)

**Importante:** el DNS público `*.optickcloud.com` apunta a **producción**. Un navegador a `https://acme-test.optickcloud.com` golpea prod, no staging.

1. Deploy staging: `bash /opt/llamadas/scripts/deploy-staging.sh`
2. En https://pruebacrm.optickcloud.com crea un slug de prueba (ej. `acme-test`).
3. Verifica en la **DB/API de staging** (no abras el URL público del slug):

```bash
# En el servidor Ubuntu (staging), contra Caddy local o el contenedor API:
curl -sS -H 'Host: acme-test.optickcloud.com' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"secreto1"}' \
  http://127.0.0.1/api/auth/login

# O vía docker:
docker exec -i llamadas-api curl -sS -H 'Host: acme-test.optickcloud.com' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"secreto1"}' \
  http://127.0.0.1:3001/api/auth/login
```

4. Confirma `200` + JWT con `tenantId` del nuevo tenant.
5. Opcional: suspender/reactivar desde la UI; no dejes basura innecesaria (puedes dejar `acme-test` SUSPENDED en staging).

**No** crear tenants de prueba en producción con este flujo.

## Fuera de MVP (Fase 2)

- `maxAgents` / plan / settings por tenant (hoy el tope de agentes es global `MAX_AGENTS = 25`)
- Onboarding self-serve / facturación
- UI de borrado definitivo de tenant

# Multi-tenant Fase 1 — Shared DB + tenantId

Documento de arquitectura (plan antes de código). **No implementar** schema, middleware ni deploy hasta completar checklist y PRs en orden.

| Campo | Valor |
|-------|--------|
| Estado | Plan acordado — documentación only |
| Enfoque | Shared Postgres + columna `tenantId` |
| Stack | Node/Express + React + Prisma + Docker Compose (Ubuntu) |
| Prod | Ubuntu (`crm.optickcloud.com`) — **no** Render como destino primario |
| Staging | Ubuntu (`pruebacrm.optickcloud.com`) |
| Proxy | Caddy en `/opt/platform` (fuera del compose de la app) |
| Deploy app | `git pull --ff-only` + `docker compose build && up` vía scripts |

---

## 1. Objetivo y principios

### Objetivo

Transformar el CRM de **single-tenant** (hoy 100 %: `User.email` globalmente `@unique`, sin `tenantId`) a **SaaS multi-tenant** con:

- Una sola base Postgres compartida
- Aislamiento por columna `tenantId`
- Subdominios `clienteA.optickcloud.com` (mismo codebase, mismos contenedores)
- Mismo deploy Docker Compose; sin stack por cliente en Fase 1

### Principios

1. **Un deploy, un código, muchos tenants.** El aislamiento no es por contenedor ni por DB.
2. **El riesgo real no es Caddy:** es olvidar el filtro `tenantId` en una query y filtrar datos entre clientes.
3. **Host (subdominio) = fuente de verdad** del tenant; JWT debe incluir y validar el mismo `tenantId`.
4. **Expand → backfill → constrain.** Nunca exigir `NOT NULL` antes de rellenar filas existentes.
5. **Staging primero** (dump real o copia). Staging y prod **no** comparten la DB multi-tenant de clientes.
6. **Plan antes de código.** Este doc es el contrato; PRs posteriores lo implementan sin improvisar.

---

## 2. Diseño del schema

### Modelo `Tenant`

```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String   // "Optick", "Cliente A"
  slug      String   @unique  // "crm", "clientea" → clientea.optickcloud.com
  status    String   @default("ACTIVE") // ACTIVE | SUSPENDED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users User[]
  // …resto de relaciones según tablas con tenantId
}
```

- **Slug = subdominio.** No exponer el `id` en la URL pública.
- Campos opcionales para fases posteriores (no Día 1): `plan`, `maxAgents`, `customDomain`, `settings` (JSON).

### Tablas que necesitan `tenantId` (mínimo Fase 1)

| Modelo | Acción |
|--------|--------|
| `User` | `tenantId` NOT NULL + FK + `@@unique([tenantId, email])` |
| `ImportBatch` | `tenantId` + índice |
| `Company` | `tenantId` + índice (p. ej. `[tenantId, ruc]`) |
| `Contact` | `tenantId` + índice |
| `AssignmentRun` | `tenantId` + índice |
| `Assignment` | `tenantId` + índice |
| `CallLog` | `tenantId` + índice |
| `Callback` | `tenantId` + índice |
| `DailyAgentMetrics` | `tenantId` + revisar unique compuesto (`date`, `agentId` → incluir tenant si aplica) |

Cada una: `tenantId String` + relación `tenant Tenant` + `@@index([tenantId])` (y compuestos de negocio según caso).

### `UserSession` y `AgentResetLog`

Pueden **heredar** el tenant vía `userId` / `resetById`. En Fase 1 es **más seguro denormalizar** `tenantId` para audits y queries directas (listados, borrados por tenant, métricas de seguridad). Decisión recomendada: agregar `tenantId` también a estas tablas.

Tablas relacionadas a revisar en el mismo PR de schema (herencia o denormalización): `AssignmentRelease`, `MobileLine` — al menos filtrar siempre por el padre que ya tiene `tenantId`, o denormalizar si hay queries directas.

### Email: único por tenant, no global

Hoy: `email String @unique` (global).

**Fase 1:** `@@unique([tenantId, email])` — **no** email único en todo el SaaS.

| Opción | Pros | Contras |
|--------|------|---------|
| Único por tenant | Mismo email en dos empresas; estándar SaaS B2B | Login siempre con contexto de tenant (subdominio) |
| Único global | Identidad única en el SaaS | Bloquea `admin@empresa.com` en dos clientes; peor DX comercial |

Para vender CRM a empresas distintas, **por tenant** es lo correcto. El login ocurre en `clienteA.optickcloud.com` → tenant ya resuelto → `findFirst({ where: { email, tenantId } })`.

### Platform admin: tenant Optick (slug `crm`)

Roles existentes: `isSuperAdmin` / `isSystemOwner`.

| Opción | Descripción |
|--------|-------------|
| A | `tenantId` nullable + flag platform admin |
| **B (Fase 1)** | Todo user con `tenantId` NOT NULL; tenant especial Optick (`slug: "crm"`); super-admin vive ahí |

**Preferir B en Fase 1:** más simple, evita nullables en toda la app, y `crm.optickcloud.com` sigue siendo el bookmark actual.

### Índices y unicidades

```prisma
@@unique([tenantId, email])     // User — reemplaza email @unique global
@@index([tenantId])             // todas las tablas de negocio
@@index([tenantId, ruc])        // Company (o @@unique si RUC no debe repetirse por tenant)
@@index([tenantId, createdAt])  // listados / dashboards
```

`DailyAgentMetrics` hoy: `@@unique([date, agentId])`. Con multi-tenant, un `agentId` ya es único global (cuid), así que el unique actual puede bastar; igual indexar `tenantId` para listados admin por tenant.

---

## 3. Resolución de tenant en el backend

### Fuentes (prioridad)

| Fuente | Seguridad | Uso |
|--------|-----------|-----|
| `Host` / `X-Forwarded-Host` | Alta | **Fuente de verdad** |
| JWT `tenantId` | Imprescindible post-login | Debe coincidir con `req.tenant.id` |
| Header `X-Tenant-Slug` | Fácil de falsificar | **Solo local/dev** |

Same-origin (`clienteA.optickcloud.com` → `/api/...` vía Caddy): el frontend **no** necesita header especial; el `Host` ya viaja.

### Flujo

1. Middleware `resolveTenant` (antes de rutas de negocio): host → slug → `Tenant` → `req.tenant`.
2. Login: busca user en **ese** `tenantId` únicamente.
3. JWT incluye `{ id, tenantId, tokenVersion, ... }`.
4. `authenticate`: `payload.tenantId === req.tenant.id` o 401/403.
5. Todas las queries de negocio: `where: { tenantId: req.tenant.id, ... }`.

### Ejemplo middleware Express

```ts
// middleware/tenant.ts (ejemplo — implementar en PR 2)
import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'

export type TenantContext = {
  id: string
  slug: string
  name: string
  status: string
}

export interface TenantRequest extends Request {
  tenant?: TenantContext
}

const RESERVED = new Set(['www', 'api', 'pruebacrm', 'mail', 'status'])

function slugFromHost(hostHeader: string | undefined): string | null {
  const host = (hostHeader ?? '').split(':')[0].toLowerCase()
  const root = 'optickcloud.com'
  if (!host.endsWith(`.${root}`) && host !== root) return null
  if (host === root || host === `www.${root}`) return null
  const slug = host.slice(0, -(root.length + 1)).split('.')[0]
  if (!slug || RESERVED.has(slug)) return null
  return slug
}

export async function resolveTenant(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  const host =
    (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    req.headers.host

  let slug = slugFromHost(host)
  // Solo en NODE_ENV=development:
  // slug = slug ?? (req.headers['x-tenant-slug'] as string | undefined) ?? null

  if (!slug) {
    return res.status(400).json({ error: 'Tenant no resuelto (host inválido)' })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  })

  if (!tenant || tenant.status !== 'ACTIVE') {
    return res.status(404).json({ error: 'Tenant no encontrado o suspendido' })
  }

  req.tenant = tenant
  next()
}
```

### Orden conceptual en `index.ts`

```ts
app.set('trust proxy', 1)
app.use(cors(/* ver abajo */))
app.use('/api/health', healthRouter) // puede omitir tenant
app.use(resolveTenant)
app.use('/api/auth', authRouter)     // login scoped a req.tenant.id
app.use('/api', authMiddleware, apiRouters)
```

### CORS

Hoy: lista fija vía `FRONTEND_URL`. En multi-tenant hace falta una **función `origin`** que valide el patrón (el paquete `cors` no soporta `*` en medio del hostname):

```ts
const TENANT_ORIGIN = /^https:\/\/[\w-]+\.optickcloud\.com$/

cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true) // same-origin / curl
    if (TENANT_ORIGIN.test(origin)) return cb(null, true)
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
      return cb(null, true)
    }
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
})
```

### Login scoped

```ts
// Pseudocódigo
const user = await prisma.user.findFirst({
  where: { email, tenantId: req.tenant!.id, active: true },
})
// jwt.sign({ id: user.id, tenantId: user.tenantId, tokenVersion: user.tokenVersion }, ...)
```

En `authenticate`: rechazar si `payload.tenantId !== req.tenant.id`.

---

## 4. Caddy / DNS

Caddy vive en **`/opt/platform`** (red proxy externa). **No** meter Caddy dentro del compose del CRM.

### DNS

- Wildcard: `*.optickcloud.com` → IP pública del Ubuntu (A/AAAA o CNAME según setup).
- Mantener `crm.optickcloud.com` como slug `crm` (tenant Optick) para no romper bookmarks.
- Staging: `pruebacrm.optickcloud.com` sigue en stack/env **separado**; no mezclar datos staging ↔ prod.

### Caddyfile (concepto)

Un site block wildcard hacia los **mismos** contenedores:

```caddyfile
*.optickcloud.com {
  encode gzip

  @api path /api/*
  handle @api {
    reverse_proxy llamadas-api:3000
  }

  handle {
    reverse_proxy llamadas-frontend:80
  }
}
```

Ajustar nombres de red/container al compose real (`container_name` + red `proxy`).

Puntos clave:

- **Un frontend, un API** para todos los tenants.
- Aislamiento = Host → middleware de app, no un contenedor por cliente.
- **Let’s Encrypt wildcard** suele requerir **DNS challenge** (p. ej. token API de Cloudflare), no solo HTTP-01.
- Frontend en prod: preferir same-origin / relative `/api` (`window.location.origin`) para no bakear un solo dominio en la imagen.

### Staging vs prod

| Entorno | Dominio | DB |
|---------|---------|-----|
| Staging | `pruebacrm.optickcloud.com` (+ subdominios de prueba si hace falta) | Postgres de staging |
| Prod | `crm.optickcloud.com` + `*.optickcloud.com` | Postgres de prod |

**Nunca** poner tenants de clientes reales y datos de prueba en la misma DB multi-tenant de producción.

---

## 5. Migración backfill (sin romper prod)

Regla: **expand → backfill → constrain → middleware**.

### Paso A — Expand (Prisma migrate)

1. Crear tabla `Tenant`.
2. Agregar `tenantId String?` (nullable) a todas las tablas afectadas.
3. Deploy / migrate que **aún no exige** tenant en runtime (código viejo sigue OK).

### Paso B — Seed tenant Optick + backfill

```sql
INSERT INTO "Tenant" (id, name, slug, status, "createdAt", "updatedAt")
VALUES ('cl_optick_xxx', 'Optick', 'crm', 'ACTIVE', NOW(), NOW());

UPDATE "User" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "ImportBatch" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "Company" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "Contact" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "AssignmentRun" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "Assignment" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "CallLog" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "Callback" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
UPDATE "DailyAgentMetrics" SET "tenantId" = 'cl_optick_xxx' WHERE "tenantId" IS NULL;
-- UserSession / AgentResetLog / AssignmentRelease / MobileLine según decisión de denormalizar
```

Alternativa: script Node (Prisma) en transacción que cree el tenant y haga los `updateMany`.

### Paso C — Constrain

1. Verificar `SELECT COUNT(*) FROM "User" WHERE "tenantId" IS NULL` (= 0 en todas las tablas).
2. `tenantId` → `NOT NULL` + FK a `Tenant`.
3. Drop unique global de email (`User_email_key`); crear `@@unique([tenantId, email])`.
4. Aplicar índices compuestos.

### Paso D — Código que exige tenant

Deploy del middleware + login scoped + filtros en queries (PRs 2–3).

### Operativa

1. **Staging primero:** restore de `pg_dump` de prod (o copia), migrar y probar end-to-end.
2. **Antes de prod:** `pg_dump` fresco + restore de prueba en otro volume/DB.
3. Ventana: entre B y C la app vieja sigue; entre C y D no debe haber código que asuma email global único sin tenant.
4. DNS: `crm.optickcloud.com` → slug `crm`.

---

## 6. Checklist Fase 1 (antes de vender el 2.º tenant)

- [ ] Schema + backfill Optick (`slug: crm`) en **staging**
- [ ] `resolveTenant` + JWT con `tenantId` + match obligatorio
- [ ] Login scoped a `req.tenant.id`
- [ ] CORS por función para `*.optickcloud.com`
- [ ] Auditoría: **cero** `findMany` / `findFirst` / `update` / `delete` de negocio sin `tenantId`
- [ ] Caddy wildcard + DNS (o subdominios de prueba) en staging
- [ ] Segundo tenant vacío (`demo`) creado
- [ ] Prueba de aislamiento: usuario de A **no** ve datos de B (API + UI)
- [ ] Token de A contra host de B → 401/403
- [ ] Backup/restore documentado post-migración
- [ ] Recién entonces onboarding de cliente real

---

## 7. Fuera de alcance Fase 1

- Billing / suscripciones / límites por plan
- Custom domains por cliente (solo subdominios `*.optickcloud.com`)
- Panel platform completo para alta de tenants (seed/script basta)
- Row-Level Security (RLS) en Postgres como **único** control (útil después como red de seguridad, no Día 1)
- Database-per-tenant o schema-per-tenant
- Contenedor / compose por cliente
- Migrar prod a Render o recomendar Render como hosting primario

---

## 8. Orden de PRs sugerido

| # | PR | Contenido | Entorno primero |
|---|-----|-----------|-----------------|
| 1 | Schema + backfill | `Tenant`, `tenantId` nullable → backfill → NOT NULL + unique compuesto | Staging |
| 2 | Middleware + auth | `resolveTenant`, JWT `tenantId`, login scoped, CORS | Staging |
| 3 | Query filters | Auditoría y parches: todas las rutas Prisma con `tenantId` | Staging |
| 4 | Caddy / DNS | Wildcard, LE DNS challenge, `crm` + demo hosts | Staging → prod (ops) |
| 5 | Tenant demo | Crear `demo`, smoke test aislamiento, checklist §6 | Staging; prod solo tras OK |

**Regla:** no abrir venta del segundo tenant hasta cerrar checklist §6.

---

## Relacionado

- Deploy staging vs prod Git: [GIT-RENDER-VS-UBUNTU.md](./GIT-RENDER-VS-UBUNTU.md)
- Compose CRM: `docker-compose.yml` (Caddy **no** va aquí; `/opt/platform`)
- Schema actual (single-tenant): `backend/prisma/schema.prisma`

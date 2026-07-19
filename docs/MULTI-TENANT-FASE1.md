# Multi-tenant Fase 1 — Shared DB + tenantId

Documento de arquitectura y checklist Fase 1. **PRs en orden** (ver §8); no saltar a middleware/Caddy antes de schema+backfill en staging.

| Campo | Valor |
|-------|--------|
| Estado | PR5 — Tenant `demo` + aislamiento (staging); residual `$queryRaw` cerrado |
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
// PR2 implementado: backend/src/middleware/tenant.ts + lib/tenant.ts
// HOST_SLUG_ALIASES: pruebacrm / crm / mt-staging / localhost / 127.0.0.1 → slug `crm`.
// RESERVED: www, api, mail, status, monitor, prodtest, mt-staging.
// Otros `*.optickcloud.com` → primer label = slug → Tenant.findUnique.
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

Plantilla + runbook: [`infra/platform/Caddyfile.example`](../infra/platform/Caddyfile.example) y [`infra/platform/README-CADDY-WILDCARD.md`](../infra/platform/README-CADDY-WILDCARD.md).

### Realidad en Ubuntu (hoy)

- Público: **Cloudflare Tunnel** (`cloudflared` → `caddy:80` en red `proxy`). TLS en el edge de Cloudflare; Caddy con `auto_https off`.
- Staging: `http://pruebacrm.optickcloud.com` → `llamadas-api:3000` / `llamadas-frontend:80`
- Prod: `http://crm.optickcloud.com` (+ `prodtest`) → `llamadas-prod-api:3000` / `llamadas-prod-frontend:80`
- Hosts explícitos **ganan** al wildcard en Caddy.

### DNS / Tunnel (acciones del usuario)

1. Cloudflare Zero Trust → Tunnel → **Public Hostname**:
   - Existentes: `pruebacrm`, `crm`, `monitor` (y `prodtest` si aplica) → `http://caddy:80`
   - **Nuevo:** `*` (`*.optickcloud.com`) → `http://caddy:80`
   - Opcional smoke staging: `mt-staging` → `http://caddy:80`
2. DNS: dejar que Cloudflare gestione el CNAME del túnel; no apuntar el wildcard de clientes a staging.
3. SSL: Universal SSL debe cubrir `*.optickcloud.com` (un nivel).
4. **Let’s Encrypt DNS-01 en Caddy:** solo si se publica **sin** túnel (legacy). Con el diseño actual **no** hace falta.

### Caddyfile (wildcard → prod)

```caddyfile
# Hosts explícitos (pruebacrm, crm, monitor, …) arriba — no borrarlos.

http://*.optickcloud.com {
  handle /api/* {
    reverse_proxy llamadas-prod-api:3000
  }
  handle {
    reverse_proxy llamadas-prod-frontend:80
  }
}
```

Puntos clave:

- **Un frontend + un API de prod** para todos los tenants reales.
- Aislamiento = Host → middleware de app, no un contenedor por cliente.
- Wildcard **nunca** a contenedores staging (`llamadas-api` / `llamadas-frontend`).
- Frontend: same-origin / relative `/api` vía Caddy.

### Staging vs prod

| Entorno | Dominio | Upstream Caddy | DB |
|---------|---------|----------------|-----|
| Staging | `pruebacrm.optickcloud.com`, opcional `mt-staging.optickcloud.com` | `llamadas-api` / `llamadas-frontend` | Postgres staging |
| Prod | `crm.optickcloud.com` + `*.optickcloud.com` | `llamadas-prod-api` / `llamadas-prod-frontend` | Postgres prod |

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

- [x] Schema + backfill Optick (`slug: crm`) en **staging** — PR1: migración `20260718120000_multi_tenant_optick` (expand→backfill→constrain en una transacción) + script `backend/scripts/backfill-tenant-optick.ts`
- [x] `resolveTenant` + JWT con `tenantId` + match obligatorio — PR2: `middleware/tenant.ts`, `lib/tenant.ts` (aliases), `middleware/auth.ts` (match + compat tokens viejos sin `tenantId` solo en Optick)
- [x] Login scoped a `req.tenant.id` — PR2: JWT `{ id, email, role, name, tenantId, tokenVersion }`
- [x] CORS por función para `*.optickcloud.com` (+ lista `FRONTEND_URL` / `CORS_EXTRA_ORIGINS`)
- [x] Auditoría: queries Prisma de negocio con `tenantId` — PR3: AsyncLocalStorage + Prisma `$extends` (`lib/tenantContext.ts`, `lib/prisma.ts`); `resolveTenant` hace `runWithTenant`; modelos en `TENANT_SCOPED_TABLES`
- [x] Residual PR3 `$queryRaw` — cerrado: `sqlAndTenant` / `resolveTenantIdForSql` en `lib/tenant.ts`; reportes, métricas, disposition, call activity, agent reset (ver § PR3 residual abajo)
- [x] Caddy wildcard + DNS runbook — PR4: `infra/platform/Caddyfile.example` + `README-CADDY-WILDCARD.md`; wildcard → **prod**; smoke opcional `mt-staging` → staging; CORS/`resolveTenant` ya cubren `*.optickcloud.com`
- [x] Cloudflare: Public Hostname `*.optickcloud.com` → `http://caddy:80` (operador; prerequisito PR5)
- [x] Segundo tenant (`demo`) — script idempotente `backend/scripts/seed-tenant-demo.ts` (admin + agent + company marker)
- [x] Prueba de aislamiento staging: login Host Optick vs `demo`; listados companies sin cross-visibility (ver § PR5)
- [x] Token / credenciales de A contra host de B → 401 (login scoped + JWT match)
- [x] Backup/restore documentado post-migración — drill scratch OK 2026-07-18; runbook [`BACKUP-RESTORE-PROD.md`](./BACKUP-RESTORE-PROD.md) (dump ref. `/opt/backups/crm/llamadas_prod_pre_multitenant_20260718-165958.dump`)
- [x] Onboarding de cliente (MVP plataforma) — `POST/GET /api/platform/tenants` + UI `/platform/tenants` + runbook [`TENANT-ONBOARDING.md`](./TENANT-ONBOARDING.md) (staging only; no cliente de pago aún)
- [ ] Cliente real de pago (post-MVP UI; smoke staging primero)

**Residual PR3 — cerrado (antes de PR5):** `$queryRaw` en reportes/métricas **no** pasa por la extensión Prisma. Mitigación: `resolveTenantIdForSql()` + `sqlAndTenant(alias)` inyectan `AND …."tenantId" = $id` desde ALS. Sin ALS en HTTP → throw; scripts: id explícito, `runWithTenant`, o `ALLOW_UNSCOPED_PRISMA=1` (fallback Optick). Cubierto: `reportCharts`, `reportTrends`, `callActivity`, `companyDisposition`, `dailyAgentMetrics`, `agentReset`.

**Hotfix ALS (post–PR5):** binding ALS hasta fin de response + fail-closed Prisma/SQL (ver § Aplicar PR3). Evita fuga intermitente Optick↔otro tenant en dashboard.

**Cache in-memory dashboard/reports:** las claves de `dashboardStatsCache` / `reportsCache` en `backend/src/routes/dashboard.ts` incluyen `tenantId`. Sin eso, un admin vacío en otro slug podía envenenar el cache compartido del proceso API (~45s / 5min). «Actualizar» en Dashboard envía `refresh=true` para bypassear.

### Aplicar PR1 en staging (Ubuntu)

Tras `git push origin staging`:

```bash
bash /opt/llamadas/scripts/deploy-staging.sh
```

El contenedor API corre `prisma migrate deploy` al arrancar (`migrate-deploy-prod.sh`). La migración única crea `Tenant`, inserta Optick (`id=clopticktenantcrm0001`, `slug=crm`), añade `tenantId`, backfill, `NOT NULL` + FKs, y reemplaza `User.email` único global por `@@unique([tenantId, email])`.

Verificación opcional (repair / no-op si ya migró):

```bash
docker exec -it llamadas-api npx ts-node --transpile-only scripts/backfill-tenant-optick.ts
```

**No** aplicar esta migración en prod (`main`) hasta cerrar checklist y PRs 2–3 en staging.

Creates de negocio en PR1 usaban `OPTICK_TENANT_ID` fijo (`backend/src/lib/tenant.ts`). PR2: login/JWT usan `req.tenant.id`. PR3: extensión Prisma fuerza `tenantId` desde ALS (`req.tenant.id`) en creates/wheres de modelos scoped; el hardcode Optick en rutas queda como fallback sin ALS (seed/scripts). Tokens JWT sin `tenantId` (pre-PR2) solo se aceptan si `req.tenant.id === OPTICK_TENANT_ID`; el siguiente login emite el formato nuevo.

### Aplicar PR2 en staging (Ubuntu)

Tras `git push origin staging`:

```bash
bash /opt/llamadas/scripts/deploy-staging.sh
```

Verificar: `GET /api/health` OK; login en `https://pruebacrm.optickcloud.com` con admin/agente Optick; JWT decodificado incluye `tenantId=clopticktenantcrm0001`.

**No** desplegar en prod (`main`) hasta cerrar checklist y PRs 2–3 en staging.

### Aplicar PR3 en staging (Ubuntu)

Tras `git push origin staging`:

```bash
bash /opt/llamadas/scripts/deploy-staging.sh
```

Verificar: `GET /api/health` OK; login Optick; listados autenticados (clientes / my-leads) siguen con datos.

Implementación: `resolveTenant` → `runWithTenant(req.tenant.id)` **hasta `res` finish/close** (el `run()` debe devolver una Promise para que ALS no se pierda en handlers async); extensión Prisma inyecta `tenantId` en `where`/`data` para `TENANT_SCOPED_TABLES`. Sin ALS en modelo scoped → **rechazo** (`Tenant context missing`), no passthrough. Scripts: `runWithTenant` / `getPrismaBase()` / `ALLOW_UNSCOPED_PRISMA=1`. Creates con `OPTICK_TENANT_ID` hardcodeado se sobrescriben con el tenant del request. `/api/health` sin tenant; `/api/contact` (formulario) no toca tablas scoped.

**Residual `$queryRaw` — cerrado:** `sqlAndTenant` / `resolveTenantIdForSql` en `lib/tenant.ts`; inyectado en reportes/métricas/disposition/call activity/agent reset. Sin ALS en request path → throw (no fallback Optick); scripts con `ALLOW_UNSCOPED_PRISMA=1` o `runWithTenant` / id explícito.

**Smoke post-fix ALS (prod/staging):** en `crm` y en el slug del otro tenant, refrescar dashboard varias veces: números distintos (no ambos ~Optick ni ambos 0 por fuga). En el tenant no-Optick, dashboard y registros/listas deben ser coherentes (no dashboard lleno + listas vacías). Log API no debe mostrar `Tenant context missing` en tráfico normal. Local: `npx ts-node --transpile-only scripts/verify-tenant-context.ts`.

**No** desplegar en prod (`main`) hasta cerrar checklist §6.

### Aplicar PR4 (Caddy / DNS) — Ubuntu

1. **Repo (laptop):** cambios en `infra/platform/` + docs; backend alias `mt-staging` (opcional). Push `staging` y, si hace falta smoke en staging app: `bash /opt/llamadas/scripts/deploy-staging.sh`.
2. **Caddy (servidor):** ver runbook [`infra/platform/README-CADDY-WILDCARD.md`](../infra/platform/README-CADDY-WILDCARD.md) — backup → fusionar Caddyfile → `caddy validate` → `caddy reload`. **No** UFW / **no** sshd.
3. **Cloudflare (operador):** Public Hostname `*` → `http://caddy:80` (y opcional `mt-staging`). Sin esto el wildcard no recibe tráfico público.
4. Verificar: `curl` health con `Host: pruebacrm…` y `Host: crm…` en `127.0.0.1`; luego HTTPS público.

**Aplicado en servidor (2026-07-18):** `/opt/platform/Caddyfile` actualizado (backup `Caddyfile.bak.20260718-132612`); validate + reload OK; health OK para `pruebacrm`, `crm`, `mt-staging` y un host wildcard de prueba vía `Host` en LAN. **Pendiente del operador:** Public Hostname Cloudflare `*` (y opcional `mt-staging`).

**No** merge a `main` / **no** `deploy-prod.sh` solo por PR4 de docs; el reload de Caddy es aditivo si se mantienen los site blocks existentes.

### Aplicar PR5 (tenant demo + aislamiento) — staging

Tras cerrar residual `$queryRaw` y desplegar:

```bash
bash /opt/llamadas/scripts/deploy-staging.sh
docker exec -it llamadas-api node scripts/seed-tenant-demo.cjs
```

(`.cjs` runs in the production API image without `ts-node`. TypeScript twin: `scripts/seed-tenant-demo.ts`.)

Defaults staging (override con env): `demo-admin@optick.demo` / `DemoAdmin123!`, `demo-agent@optick.demo` / `DemoAgent123!`.

`resolveTenant`: `demo.optickcloud.com` → slug `demo` (no reserved; primer label del wildcard). Aliases Optick (`pruebacrm`, `crm`, `mt-staging`, localhost) siguen en slug `crm`.

**Importante — routing:** el Caddyfile wildcard `*.optickcloud.com` apunta a **prod**. En staging, smoke con Host header al API staging (contenedor `llamadas-api:3000` o curl LAN), no asumir que HTTPS público `demo.optickcloud.com` pegue a staging.

Checklist aislamiento (curl) — script: `backend/scripts/smoke-tenant-isolation.sh` (correr **dentro** de `llamadas-api`):

```bash
# tras git pull en /opt/llamadas
sg docker -c 'docker cp /opt/llamadas/backend/scripts/smoke-tenant-isolation.sh llamadas-api:/tmp/smoke.sh'
sg docker -c 'docker exec llamadas-api bash /tmp/smoke.sh'
```

1. Login Optick: `Host: pruebacrm.optickcloud.com` + credenciales Optick → 200 + JWT `tenantId=clopticktenantcrm0001`
2. Login demo: `Host: demo.optickcloud.com` + `demo-admin@optick.demo` → 200 + JWT tenant demo
3. Cross-login: Optick creds en Host demo → 401; demo creds en Host pruebacrm → 401
4. List companies (auth token): Optick no ve `DEMO-00000001`; demo no ve companies Optick
5. Token demo contra Host Optick `/api/auth/me` → 401 `TENANT_MISMATCH`

**No** `deploy-prod` / **no** push `main` por PR5 hasta checklist §6 restante (backup/restore + onboarding real).

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

- Deploy staging vs prod Git: [GIT-STAGING-VS-PROD.md](./GIT-STAGING-VS-PROD.md)
- Compose CRM: `docker-compose.yml` (Caddy **no** va aquí; `/opt/platform`)
- Schema actual (single-tenant): `backend/prisma/schema.prisma`

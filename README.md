# CRM Llamadas — Sistema de Call Center

Sistema profesional de call center para gestión de campañas de migración de operador.

## Acceso rápido

| Servicio | URL |
|----------|-----|
| **Frontend (App)** | http://localhost:5173 |
| **Backend (API)** | http://localhost:3001 |

**Credenciales iniciales:**
- Email: `admin@llamadas.com`
- Contraseña: `Admin123!`
- ⚠️ Cambia la contraseña tras el primer login en Agentes > Editar

---

## Cómo iniciar el sistema

Desde la raíz del repo: `.\start.ps1` (inicio limpio) o `.\restart.ps1` (libera puertos 3001/5173 y reinicia).

### Opción A — Dos terminales separadas (recomendado)

**Terminal 1 — Backend:**
```powershell
npm --prefix "backend" run dev
```

**Terminal 2 — Frontend:**
```powershell
npm --prefix "frontend" run dev
```

---

## Funcionalidades

### Para el Administrador
| Función | Descripción |
|---------|-------------|
| **Dashboard** | Estadísticas globales: clientes, llamadas, callbacks, rendimiento por agente |
| **Importar datos** | Sube Excel (.xlsx) o CSV con la base de clientes potenciales |
| **Clientes** | Listado completo con filtros por estado y búsqueda |
| **Asignaciones** | Distribuye lotes de clientes entre los agentes del equipo |
| **Agentes** | Crea, edita y desactiva cuentas de agentes |
| **Agenda Callbacks** | Ve todos los callbacks del equipo pendientes y vencidos |

### Para el Agente
| Función | Descripción |
|---------|-------------|
| **Mi Dashboard** | Sus estadísticas personales y llamadas recientes |
| **Mis Clientes** | Los clientes asignados con botón de registrar llamada |
| **Mis Callbacks** | Sus callbacks pendientes ordenados por fecha |

---

## Flujo de trabajo

```
1. Admin importa Excel/CSV de clientes potenciales
        ↓
2. Admin asigna lotes (ej: 100 clientes) a cada agente
        ↓
3. Agente ve su lista → llama al cliente → registra resultado:
   ├── ✅ Interesado       → Estado actualizado
   ├── ❌ No interesado     → Cerrado
   ├── 📵 Sin respuesta    → Queda En Progreso
   ├── ⏳ Ocupado           → Queda En Progreso
   ├── 📅 Callback          → Se agenda automáticamente
   └── 🚫 No llamar         → Lista negra
        ↓
4. Callbacks aparecen en la Agenda con alerta de vencimiento
        ↓
5. Admin monitorea rendimiento en el Dashboard
```

---

## Formato del archivo de importación

El sistema reconoce automáticamente estas columnas (cualquier nombre similar):

| Campo | Nombres aceptados |
|-------|-------------------|
| Nombre | nombre, name, cliente |
| Teléfono | telefono, phone, celular, movil |
| Teléfono 2 | telefono2, tel2, celular2 |
| Email | email, correo |
| Dirección | direccion, address, domicilio |
| Operador actual | operador, compañia, company |
| Plan/Tarifa | plan, tarifa |
| Notas | notas, comentarios, observaciones |

**El único campo obligatorio es el teléfono.** Si no hay nombre, se usa el teléfono como nombre.

---

## Migración a producción (PostgreSQL)

Cuando quieras desplegar en un servidor real:

1. Instala PostgreSQL o usa Docker:
   ```bash
   docker compose up -d
   ```

2. Cambia el `backend/.env`:
   ```env
   DATABASE_URL="postgresql://crm_user:crm_pass_2024@localhost:5432/llamadas_crm"
   ```

3. Actualiza `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

4. Reinstala el cliente Prisma:
   ```bash
   cd backend
   npm run db:migrate
   npm run db:generate
   npm run db:seed
   ```

---

## Migraciones de base de datos (Prisma Migrate)

El proyecto usa migraciones versionadas en lugar de `db push` para despliegues seguros.

| Entorno | Comando | Uso |
|---------|---------|-----|
| **Desarrollo** | `npm run db:migrate` | Crea y aplica migraciones locales (`prisma migrate dev`) |
| **Producción** | `npm run db:migrate:deploy` | Aplica migraciones pendientes (`prisma migrate deploy`) |

**Reglas importantes:**
- En desarrollo, crea migraciones con `npm run db:migrate` cada vez que cambies `schema.prisma`.
- En producción (Render), el `startCommand` ejecuta `scripts/migrate-deploy-prod.sh`: aplica migraciones pendientes y, si falla (p. ej. P3005), marca `init` y `assignment_by_contact` como aplicadas y reintenta el deploy.
- **Nunca** uses `prisma migrate reset` ni `db push --force-reset` en producción.

### Render: baseline migraciones (P3005)

Si el deploy falla con:

```
Error P3005: The database schema is not empty (no migration baseline)
```

significa que la base de datos de producción ya tiene tablas (p. ej. por un `db push` anterior) pero **no** tiene historial en `_prisma_migrations`. En deploys nuevos esto lo intenta automáticamente `migrate-deploy-prod.sh`. Si aún falla, usa el baseline manual (una vez) con los pasos siguientes.

| Acción | Migraciones |
|--------|-------------|
| **Marcar como ya aplicadas** (`migrate resolve --applied`) | `20260615080248_init`, `20260615120000_assignment_by_contact` |
| **Aplicar con deploy** | `20260615143000_import_batch_file_metadata`, `20260615150000_import_batch_source_row_count`, `20260616000000_import_batch_blocked` |

#### Opción A — Render Shell (recomendado)

1. En Render: **llamadas-db** → **Connect** → copia la **External Database URL**.
2. Abre **Shell** del servicio **llamadas-backend** (o cualquier servicio con Node/npm en `backend/`).
3. Ejecuta:

```bash
export DATABASE_URL="postgresql://crm_user:...@dpg-....oregon-postgres.render.com/llamadas_crm"
cd backend   # si el shell arranca en la raíz del repo

npx prisma migrate resolve --applied 20260615080248_init
npx prisma migrate resolve --applied 20260615120000_assignment_by_contact
npx prisma migrate deploy
```

O usa el script incluido:

```bash
export DATABASE_URL="postgresql://..."
bash scripts/baseline-production-migrations.sh
# equivalente npm: npm run db:baseline:prod
```

4. **Manual Deploy** de `llamadas-backend` (o espera al siguiente push). El `startCommand` (`bash scripts/migrate-deploy-prod.sh && db seed && npm start`) debería pasar sin pasos manuales.

#### Opción B — Local con External Database URL

Desde tu máquina, apuntando a la BD externa de Render (no uses la URL interna del servicio):

**Windows (PowerShell):**

```powershell
$env:DATABASE_URL = "postgresql://crm_user:...@dpg-....oregon-postgres.render.com/llamadas_crm"
cd backend
.\scripts\baseline-production-migrations.ps1
```

**Linux / macOS / Git Bash:**

```bash
export DATABASE_URL="postgresql://..."
cd backend
npm run db:baseline:prod
```

> ⚠️ Usa la **External Database URL** del dashboard de Render. El `startCommand` ya incluye reintento automático de baseline; los scripts `baseline-production-migrations` son respaldo manual si hace falta.

### Fix: Assignment.contactId missing in prod

If the API fails with `The column Assignment.contactId does not exist` (often after `migrate resolve --applied` on `20260615120000_assignment_by_contact` without running its SQL), use the idempotent fix script **before** resolving that migration again.

| Script | Uso |
|--------|-----|
| `backend/scripts/fix-assignment-contact-id-prod.sh` | Render Shell / Linux |
| `backend/scripts/fix-assignment-contact-id-prod.ps1` | Windows (PowerShell) |

1. Set `DATABASE_URL` to the Render **External Database URL** (never commit credentials).
2. From `backend/`:

**Render Shell:**
```bash
export DATABASE_URL="postgresql://crm_user:...@dpg-....oregon-postgres.render.com/llamadas_crm"
bash scripts/fix-assignment-contact-id-prod.sh
```

**Windows:**
```powershell
$env:DATABASE_URL = "postgresql://crm_user:...@dpg-....oregon-postgres.render.com/llamadas_crm"
cd backend
.\scripts\fix-assignment-contact-id-prod.ps1
```

The script checks `information_schema` for `Assignment.contactId`. If missing and `companyId` still exists, it runs `prisma/migrations/20260615120000_assignment_by_contact/migration.sql`, then `prisma migrate deploy` and `migrate status`. If `contactId` already exists, it exits successfully without changes.

`migrate-deploy-prod.sh` will **not** mark `assignment_by_contact` as applied unless `contactId` is present, so this mismatch should not recur after the fix.

---

## Estructura del proyecto

```
Llamadas/
├── backend/
│   ├── prisma/schema.prisma    # Modelos de la BD
│   ├── src/
│   │   ├── index.ts            # Entry point Express
│   │   ├── middleware/         # Auth JWT, manejo de errores
│   │   ├── routes/             # auth, users, imports, clients, etc.
│   │   └── lib/                # Prisma client, parser Excel/CSV
│   └── .env                    # Variables de entorno
├── frontend/
│   └── src/
│       ├── pages/              # Login, Dashboard, Imports, Clients...
│       ├── components/         # Layout, CallModal, StatusBadge
│       ├── api/client.ts       # Todas las llamadas a la API
│       └── contexts/           # AuthContext (JWT)
└── docker-compose.yml          # PostgreSQL para producción
```

---

## Tecnologías

- **Backend:** Node.js · Express · TypeScript · Prisma ORM · SQLite/PostgreSQL
- **Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · TanStack Query
- **Auth:** JWT (24h) · bcrypt (12 rounds) · RBAC (ADMIN/AGENT)
- **Import:** xlsx · csv-parser (mapeo automático de columnas)
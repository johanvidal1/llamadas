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
   npx prisma db push
   npx prisma generate
   npm run db:seed
   ```

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

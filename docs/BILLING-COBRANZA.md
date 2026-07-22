# Cobranza / billing (aviso a ADMIN)

Campos en `Tenant` (editables en **Tenants → Cobranza** por system owner / super-admin):

| Campo | Default | Uso |
|-------|---------|-----|
| `billingEnabled` | `false` | Activar aviso por cliente de pago |
| `billingDay` | `1` | Día de vencimiento (1–28) |
| `graceDays` | `7` | Gracia hasta `billingDay + graceDays` |
| `paidThrough` | null | Fin del período cubierto (YMD); banner oculto si hoy ≤ fecha |
| `billingContact` | null | WhatsApp/email en el CTA del banner |
| `billingNotes` | null | Notas internas (solo plataforma) |

**Fases** (servidor, `APP_TIMEZONE` = America/Lima): `DUE_SOON` → `DUE` → `GRACE` → `OVERDUE`. Optick (`crm`) nunca muestra banner.

**Quién ve el aviso:** solo `ADMIN` del tenant. «Entendido» oculta el strip **ese día** (localStorage).

**Tras mora:** suspender manualmente con **Suspender** (no hay auto-suspensión).

API: `GET /api/billing/status`, `PATCH /api/platform/tenants/:id` (campos de billing).

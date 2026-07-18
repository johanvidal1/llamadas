# Backup / restore — producción Optick CRM (Ubuntu)

Runbook post–multi-tenant. **No** toca UFW ni sshd. **Nunca** ejecutes `pg_restore --clean` (ni `DROP DATABASE`) contra la DB live `llamadas_prod` sin una ventana de desastre explícita y un dump fresco verificado.

## Dónde viven los dumps

| Path | Uso |
|------|-----|
| `/opt/backups/crm/` | Dumps canónicos en el servidor Optick |
| `/opt/backups/crm/backup.log` | Log del cron de backup (staging hoy) |
| `/opt/backups/crm/README.md` | Notas del backup automático staging |

**Dump de referencia (pre–multi-tenant, 2026-07-18):**

```text
/opt/backups/crm/llamadas_prod_pre_multitenant_20260718-165958.dump
```

- Formato: `pg_dump -Fc` (custom), gzip interno  
- Origen: Postgres **18.4** (`llamadas-prod-db`, imagen `postgres:18-alpine`)  
- DB origen: `llamadas_prod`  
- Contiene tablas clásicas (`User`, `Company`, `Contact`, `CallLog`, …). **No** incluye tabla `Tenant` (pre–migración multi-tenant).

Retención habitual del directorio: ~7 días para dumps/cron staging. Los dumps con nombre especial (`*_pre_multitenant_*`) conviene **no** borrarlos a mano hasta tener otro restore drill OK post-migración.

## Credenciales / contenedor (sin secretos)

Leer en el servidor (no pegar passwords en tickets/chats):

```bash
grep -E '^(POSTGRES_USER|POSTGRES_DB|DATABASE_URL)=' /opt/llamadas-prod/.env.prod | cut -d= -f1
# Valores típicos (no secretos): POSTGRES_USER=llamadas_prod, POSTGRES_DB=llamadas_prod
# Contenedor: llamadas-prod-db
```

Dentro del contenedor, `psql` / `pg_dump` / `pg_restore` como `llamadas_prod` suelen funcionar **sin** exponer `POSTGRES_PASSWORD` (auth local del entrypoint).

## Cómo tomar un backup nuevo (prod)

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
OUT=/opt/backups/crm/llamadas_prod_${TS}.dump
docker exec llamadas-prod-db pg_dump -U llamadas_prod -d llamadas_prod -Fc --no-owner --no-acl -f /tmp/pg.dump
docker cp llamadas-prod-db:/tmp/pg.dump "$OUT"
docker exec llamadas-prod-db rm -f /tmp/pg.dump
ls -lh "$OUT"
# Opcional: listar TOC
docker cp "$OUT" llamadas-prod-db:/tmp/pg.dump
docker exec llamadas-prod-db pg_restore -l /tmp/pg.dump | head -60
docker exec llamadas-prod-db rm -f /tmp/pg.dump
```

Notas:

- Usar el **mismo major** de Postgres que el dump (`18` hoy). `pg_restore` de una imagen 16 falla con `unsupported version (1.16)`.
- El cron actual (`15 3 * * *` → `/opt/llamadas/scripts/backup.sh`) respalda **staging** (`llamadas-db`). Para prod, preferir el comando de arriba hasta que exista un `backup-prod.sh` dedicado.

## Drill: restore a base scratch (recomendado)

Objetivo: validar que el dump abre y tiene datos **sin** tocar `llamadas_prod`.

```bash
DUMP=/opt/backups/crm/llamadas_prod_pre_multitenant_20260718-165958.dump   # o un dump fresco
SCRATCH=llamadas_crm_restore_test
CTR=llamadas-prod-db
USER=llamadas_prod

docker cp "$DUMP" "$CTR:/tmp/restore_test.dump"
docker exec "$CTR" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;"
docker exec "$CTR" psql -U "$USER" -d postgres -c "CREATE DATABASE $SCRATCH OWNER $USER;"
docker exec "$CTR" pg_restore -U "$USER" -d "$SCRATCH" --no-owner --no-acl /tmp/restore_test.dump

# Verificación (nombres entre comillas: Prisma)
docker exec "$CTR" psql -U "$USER" -d "$SCRATCH" -c '
SELECT '"'"'User'"'"' AS tbl, COUNT(*) FROM "User"
UNION ALL SELECT '"'"'Company'"'"', COUNT(*) FROM "Company"
UNION ALL SELECT '"'"'Contact'"'"', COUNT(*) FROM "Contact"
ORDER BY 1;'

# Cleanup obligatorio
docker exec "$CTR" psql -U "$USER" -d postgres -c "DROP DATABASE $SCRATCH;"
docker exec "$CTR" rm -f /tmp/restore_test.dump
docker exec "$CTR" psql -U "$USER" -d postgres -c '\l'   # debe seguir existiendo llamadas_prod
```

### Drill ejecutado (2026-07-18)

| Check | Resultado |
|-------|-----------|
| TOC / versión | Dump 1.16, Postgres 18.4; tablas `User`/`Company`/…; **sin** `Tenant` |
| Scratch restore | OK (`RESTORE_EXIT=0`) |
| Conteos | User 18 · Company 7742 · Contact 22811 · CallLog 4662 |
| Live `llamadas_prod` | Intacta; scratch dropeada |

## Desastre: restore sobre prod (alto nivel, cauteloso)

Solo con:

1. Confirmación explícita del operador  
2. Dump fresco **y** drill scratch OK  
3. App en mantenimiento / API parada si hace falta  
4. Entender que **`--clean` / drop de `llamadas_prod` destruye datos live**

Esquema seguro (preferido): restore a scratch → validar → renombrar DBs (swap) en ventana corta, o restore a DB nueva y cambiar `DATABASE_URL` / redeploy API apuntando a la DB restaurada.

Esquema peligroso (evitar salvo no haya otra opción):

```bash
# PELIGRO: --clean sobre la DB live borra objetos existentes.
# No ejecutar contra llamadas_prod sin confirmación escrita.
# docker exec llamadas-prod-db pg_restore ... --clean -d llamadas_prod ...
```

**No** recrear el volume Docker de Postgres (`*_pgdata`) “para limpiar” salvo pérdida total de disco; eso también borra todo.

Tras un restore de desastre:

- Arrancar API y dejar que `prisma migrate deploy` aplique migraciones pendientes (p. ej. multi-tenant) si el dump es anterior.  
- Smoke login en `crm.optickcloud.com`.  
- **Cambiar claves demo tras pruebas** (no reutilizar secrets de drill en tenants demo).

## Relacionado

- Staging vs prod: [`GIT-STAGING-VS-PROD.md`](./GIT-STAGING-VS-PROD.md)  
- Checklist multi-tenant: [`MULTI-TENANT-FASE1.md`](./MULTI-TENANT-FASE1.md) §6  
- Cutover legado Render: `/opt/llamadas-prod/scripts/cutover-prep.md` (en servidor)

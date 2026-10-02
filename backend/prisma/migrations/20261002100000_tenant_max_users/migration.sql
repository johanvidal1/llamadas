-- Cupo persistido por tenant (plazas de cliente). Default 25 backfill automático (NOT NULL DEFAULT).
-- No borra datos. Nombre de producto: maxUsers (docs históricos decían maxAgents).

ALTER TABLE "Tenant" ADD COLUMN "maxUsers" INTEGER NOT NULL DEFAULT 25;

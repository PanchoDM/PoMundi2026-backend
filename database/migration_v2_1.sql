-- ════════════════════════════════════════════════════════════════════════════
-- PollaMundial2026 v2.1 — Migración: penales + índices de rendimiento
-- Ejecutar en el SQL Editor de Supabase (es idempotente, se puede correr 2 veces)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Ronda de penales (fases eliminatorias)
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS penales_habilitados BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS penales_local       SMALLINT NULL DEFAULT NULL;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS penales_visitante   SMALLINT NULL DEFAULT NULL;

-- 2) Columnas de fases (por si la tabla es antigua)
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS grupo   VARCHAR(2)  NULL;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS jornada SMALLINT    NULL;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS ronda   VARCHAR(20) NULL;

-- 3) ÍNDICES DE RENDIMIENTO
-- Listado principal: siempre se ordena por fecha y se filtra por visibilidad
CREATE INDEX IF NOT EXISTS idx_partidos_fecha           ON partidos (fecha_partido);
CREATE INDEX IF NOT EXISTS idx_partidos_visibles_fecha  ON partidos (fecha_partido) WHERE visible_usuarios = TRUE;
-- Cron de cierre: busca partidos abiertos por fecha
CREATE INDEX IF NOT EXISTS idx_partidos_abiertos        ON partidos (fecha_partido) WHERE apuestas_abiertas = TRUE;
-- Scoring y stats: lookup de predicciones por partido
CREATE INDEX IF NOT EXISTS idx_predicciones_partido     ON predicciones (partido_id);
-- "Mis predicciones" y racha: lookup por usuario
CREATE INDEX IF NOT EXISTS idx_predicciones_usuario     ON predicciones (usuario_id, id DESC);
-- Leaderboard: orden por puntos
CREATE INDEX IF NOT EXISTS idx_usuarios_ranking         ON usuarios (puntos_totales DESC, aciertos_exactos DESC) WHERE rol = 'user';

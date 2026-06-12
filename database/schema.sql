-- PollaMundial2026 - Esquema PostgreSQL v2.0 (Supabase)

CREATE TABLE IF NOT EXISTS usuarios (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  nombre_usuario   VARCHAR(50)  NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  puntos_totales   INTEGER      NOT NULL DEFAULT 0,
  aciertos_exactos INTEGER      NOT NULL DEFAULT 0,
  rol              VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (rol IN ('user','admin')),
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partidos (
  id                 SERIAL       PRIMARY KEY,
  equipo_local       VARCHAR(60)  NOT NULL,
  equipo_visitante   VARCHAR(60)  NOT NULL,
  fecha_partido      TIMESTAMP    NOT NULL,
  grupo              VARCHAR(2)   NULL,
  jornada            SMALLINT     NULL,
  goles_local_mt     SMALLINT     NULL DEFAULT NULL,
  goles_visitante_mt SMALLINT     NULL DEFAULT NULL,
  estado             VARCHAR(20)  NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','medio_tiempo','finalizado')),
  apuestas_abiertas  BOOLEAN      NOT NULL DEFAULT TRUE,
  visible_usuarios   BOOLEAN      NOT NULL DEFAULT TRUE,
  ronda              VARCHAR(20)  NULL,
  penales_habilitados BOOLEAN     NOT NULL DEFAULT FALSE,
  penales_local      SMALLINT     NULL DEFAULT NULL,
  penales_visitante  SMALLINT     NULL DEFAULT NULL,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migración para tablas existentes (ejecutar en Supabase SQL Editor):
-- ALTER TABLE partidos ADD COLUMN IF NOT EXISTS grupo   VARCHAR(2)  NULL;
-- ALTER TABLE partidos ADD COLUMN IF NOT EXISTS jornada SMALLINT    NULL;
-- ALTER TABLE partidos ADD COLUMN IF NOT EXISTS ronda   VARCHAR(20) NULL; -- necesario para fases eliminatorias

CREATE TABLE IF NOT EXISTS predicciones (
  id                           SERIAL      PRIMARY KEY,
  usuario_id                   VARCHAR(36) NOT NULL,
  partido_id                   INTEGER     NOT NULL,
  goles_local_esperados_mt     SMALLINT    NOT NULL,
  goles_visitante_esperados_mt SMALLINT    NOT NULL,
  tendencia_apostada           VARCHAR(10) NOT NULL CHECK (tendencia_apostada IN ('local','empate','visitante')),
  puntos_obtenidos             INTEGER     NULL DEFAULT NULL,
  created_at                   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, partido_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE
);

-- ÍNDICES DE RENDIMIENTO (v2.1) — ver database/migration_v2_1.sql para BD existentes
CREATE INDEX IF NOT EXISTS idx_partidos_fecha          ON partidos (fecha_partido);
CREATE INDEX IF NOT EXISTS idx_partidos_visibles_fecha ON partidos (fecha_partido) WHERE visible_usuarios = TRUE;
CREATE INDEX IF NOT EXISTS idx_partidos_abiertos       ON partidos (fecha_partido) WHERE apuestas_abiertas = TRUE;
CREATE INDEX IF NOT EXISTS idx_predicciones_partido    ON predicciones (partido_id);
CREATE INDEX IF NOT EXISTS idx_predicciones_usuario    ON predicciones (usuario_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_usuarios_ranking        ON usuarios (puntos_totales DESC, aciertos_exactos DESC) WHERE rol = 'user';

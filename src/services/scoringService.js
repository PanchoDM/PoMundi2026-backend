const pool = require('../config/database');

/**
 * Calcula y reparte puntos para todas las predicciones de un partido finalizado.
 * Reglas:
 *   - Marcador exacto al medio tiempo → 7 puntos
 *   - Tendencia correcta (local/empate/visitante) → 3 puntos
 *   - Sin acierto → 0 puntos
 *
 * RENDIMIENTO v2.1: antes se ejecutaban 2 queries POR predicción (N+1).
 * Ahora todo se resuelve en UNA sola sentencia set-based con CTE:
 * se puntúan las predicciones pendientes y, con esas mismas filas
 * (RETURNING), se acumulan los puntos por usuario. Es atómico e
 * idempotente: si se vuelve a llamar, no hay filas pendientes y no
 * se duplica ningún punto.
 */
async function calcularYRepartirPuntos(partidoId) {
  const { rows } = await pool.query(
    'SELECT goles_local_mt, goles_visitante_mt FROM partidos WHERE id = $1',
    [partidoId]
  );
  const partido = rows[0];
  if (!partido) throw new Error(`Partido ${partidoId} no encontrado`);

  const { goles_local_mt: gl, goles_visitante_mt: gv } = partido;
  if (gl === null || gv === null) throw new Error('El partido no tiene marcador registrado');

  const tendenciaReal = gl > gv ? 'local' : gl < gv ? 'visitante' : 'empate';

  const { rows: acreditados } = await pool.query(
    `WITH puntuadas AS (
       UPDATE predicciones
       SET puntos_obtenidos = CASE
         WHEN goles_local_esperados_mt = $2 AND goles_visitante_esperados_mt = $3 THEN 7
         WHEN tendencia_apostada = $4 THEN 3
         ELSE 0
       END
       WHERE partido_id = $1 AND puntos_obtenidos IS NULL
       RETURNING usuario_id, puntos_obtenidos
     ),
     agregado AS (
       SELECT usuario_id,
              SUM(puntos_obtenidos)                        AS pts,
              COUNT(*) FILTER (WHERE puntos_obtenidos = 7) AS exactos
       FROM puntuadas
       GROUP BY usuario_id
       HAVING SUM(puntos_obtenidos) > 0
     )
     UPDATE usuarios u
     SET puntos_totales   = u.puntos_totales   + a.pts,
         aciertos_exactos = u.aciertos_exactos + a.exactos
     FROM agregado a
     WHERE u.id = a.usuario_id
     RETURNING u.id`,
    [partidoId, gl, gv, tendenciaReal]
  );

  console.log(`[Scoring] Partido ${partidoId}: puntos acreditados a ${acreditados.length} usuario(s) en 1 query`);
}

module.exports = { calcularYRepartirPuntos };

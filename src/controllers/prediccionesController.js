const pool          = require('../config/database');
const { getStreak } = require('../services/streakService');
const { apuestasVencidas } = require('../utils/limaTime');

async function crear(req, res) {
  const { partido_id, goles_local_esperados_mt, goles_visitante_esperados_mt } = req.body;
  const usuarioId = req.user.id;

  if (partido_id == null || goles_local_esperados_mt == null || goles_visitante_esperados_mt == null)
    return res.status(400).json({ message: 'partido_id, goles_local y goles_visitante son requeridos' });

  try {
    // PostgreSQL: Extraemos { rows } y usamos $1
    const { rows: partidos } = await pool.query(
      'SELECT apuestas_abiertas, estado, fecha_partido FROM partidos WHERE id = $1', [partido_id]
    );

    if (partidos.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = partidos[0];
    // Las apuestas cierran 5 minutos después de la hora oficial de inicio,
    // sin importar si el cron de cierre automático ya alcanzó a marcar el flag.
    if (!partido.apuestas_abiertas || partido.estado === 'finalizado' || apuestasVencidas(partido.fecha_partido))
      return res.status(403).json({ message: 'Las apuestas para este partido están cerradas' });

    const gl = Number(goles_local_esperados_mt);
    const gv = Number(goles_visitante_esperados_mt);
    const tendencia = gl > gv ? 'local' : gl < gv ? 'visitante' : 'empate';

    // PostgreSQL: usamos $1, $2, $3, $4, $5
    await pool.query(
      `INSERT INTO predicciones
         (usuario_id, partido_id, goles_local_esperados_mt, goles_visitante_esperados_mt, tendencia_apostada)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuarioId, partido_id, gl, gv, tendencia]
    );
    res.status(201).json({ message: 'Predicción guardada', tendencia });
  } catch (err) {
    console.error("Error al guardar predicción:", err);
    if (err.code === '23505')
      return res.status(409).json({ message: 'Ya tienes una predicción para este partido' });
    res.status(500).json({ message: 'Error interno' });
  }
}

async function getMias(req, res) {
  try {
    // PostgreSQL: Extraemos { rows } y usamos $1
    const { rows } = await pool.query(
      `SELECT pr.id, pr.partido_id, p.equipo_local, p.equipo_visitante, p.fecha_partido,
              pr.goles_local_esperados_mt, pr.goles_visitante_esperados_mt,
              pr.tendencia_apostada, pr.puntos_obtenidos
       FROM predicciones pr
       JOIN partidos p ON p.id = pr.partido_id
       WHERE pr.usuario_id = $1
       ORDER BY p.fecha_partido ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error al obtener mis predicciones:", err);
    res.status(500).json({ message: 'Error interno' });
  }
}

async function getStreakEndpoint(req, res) {
  try {
    const result = await getStreak(req.user.id);
    res.json(result);
  } catch (err) {
    console.error("Error en racha:", err);
    res.status(500).json({ message: 'Error al obtener racha' });
  }
}

module.exports = { crear, getMias, getStreakEndpoint };
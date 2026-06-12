const pool     = require('../config/database');
const { broadcast } = require('../services/sseService');
const { calcularYRepartirPuntos } = require('../services/scoringService');
const { golesValidos } = require('../middleware/security');

async function getAll(req, res) {
  try {
    const isAdmin = req.user?.rol === 'admin';
    // PostgreSQL usa booleanos reales (true/false), no 1 o 0
    const whereClause = isAdmin ? '' : 'WHERE visible_usuarios = true';

    // PostgreSQL devuelve un objeto, extraemos { rows }
    const { rows } = await pool.query(
      `SELECT id, equipo_local, equipo_visitante, fecha_partido,
              grupo, jornada, ronda,
              goles_local_mt, goles_visitante_mt, estado, apuestas_abiertas, visible_usuarios,
              penales_habilitados, penales_local, penales_visitante
       FROM partidos ${whereClause} ORDER BY fecha_partido ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error en getAll:', error);
    res.status(500).json({ message: 'Error al obtener partidos' });
  }
}

async function getById(req, res) {
  try {
    // PostgreSQL usa $1, $2 para los parámetros, no signos de interrogación (?)
    const { rows } = await pool.query(
      'SELECT * FROM partidos WHERE id = $1', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error interno' });
  }
}

// FUNCIONALIDAD ADMIN: crear nuevo partido
async function crear(req, res) {
  const { equipo_local, equipo_visitante, fecha_partido, grupo, jornada } = req.body;
  if (!equipo_local?.trim() || !equipo_visitante?.trim() || !fecha_partido)
    return res.status(400).json({ message: 'equipo_local, equipo_visitante y fecha_partido son requeridos' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO partidos (equipo_local, equipo_visitante, fecha_partido, grupo, jornada)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [equipo_local.trim(), equipo_visitante.trim(), fecha_partido,
       grupo?.toUpperCase() || null, jornada ? +jornada : null]
    );
    const newPartido = {
      id:              rows[0].id,
      equipo_local:    equipo_local.trim(),
      equipo_visitante: equipo_visitante.trim(),
      fecha_partido,
      grupo:           grupo?.toUpperCase() || null,
      jornada:         jornada ? +jornada : null,
      estado:          'pendiente',
      apuestas_abiertas: true,
    };
    // Notificar a todos los usuarios conectados que hay una nueva apuesta disponible
    broadcast('bet-opened', {
      partido_id: newPartido.id,
      match_name: `${newPartido.equipo_local} vs ${newPartido.equipo_visitante}`,
    });
    res.status(201).json(newPartido);
  } catch (error) {
    console.error('Error en crear:', error);
    res.status(500).json({ message: 'Error al crear partido' });
  }
}

// FUNCIONALIDAD ADMIN: toggle apuestas_abiertas + notificación SSE
async function toggleApuestas(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, apuestas_abiertas FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];
    const nuevoEstado = !partido.apuestas_abiertas;

    await pool.query(
      'UPDATE partidos SET apuestas_abiertas = $1 WHERE id = $2',
      [nuevoEstado, req.params.id]
    );

    const matchName = `${partido.equipo_local} vs ${partido.equipo_visitante}`;
    broadcast(nuevoEstado ? 'bet-opened' : 'bet-closed', {
      partido_id: partido.id,
      match_name: matchName,
    });

    res.json({ id: req.params.id, apuestas_abiertas: nuevoEstado });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar partido' });
  }
}

// FUNCIONALIDAD ADMIN: subir resultado en tiempo real
async function actualizarResultado(req, res) {
  const { goles_local_mt, goles_visitante_mt, estado } = req.body;
  const estadosValidos = ['pendiente', 'medio_tiempo', 'finalizado'];

  if (goles_local_mt === undefined || goles_visitante_mt === undefined || !estado)
    return res.status(400).json({ message: 'goles_local_mt, goles_visitante_mt y estado son requeridos' });
  if (!estadosValidos.includes(estado))
    return res.status(400).json({ message: 'Estado inválido' });
  // SEGURIDAD: validar que los goles sean enteros entre 0 y 20
  if (!golesValidos(goles_local_mt, goles_visitante_mt))
    return res.status(400).json({ message: 'Los goles deben ser enteros entre 0 y 20' });

  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, estado AS "estadoActual" FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];

    // LOCK: solo se bloquea cuando el partido ya está finalizado
    if (partido.estadoActual === 'finalizado') {
      return res.status(400).json({
        message: 'El partido ya está finalizado. No se puede modificar el resultado.',
      });
    }

    await pool.query(
      `UPDATE partidos
       SET goles_local_mt = $1, goles_visitante_mt = $2, estado = $3,
           apuestas_abiertas = $4
       WHERE id = $5`,
      [
        Number(goles_local_mt),
        Number(goles_visitante_mt),
        estado,
        estado === 'pendiente' ? true : false,
        req.params.id,
      ]
    );

    // Repartir puntos cuando se registra el marcador de medio tiempo o finalizado
    if (estado === 'medio_tiempo' || estado === 'finalizado') {
      await calcularYRepartirPuntos(partido.id);
    }

    const matchName = `${partido.equipo_local} vs ${partido.equipo_visitante}`;
    broadcast('score-updated', {
      partido_id:        partido.id,
      match_name:        matchName,
      goles_local_mt:    Number(goles_local_mt),
      goles_visitante_mt: Number(goles_visitante_mt),
      estado,
    });

    res.json({ message: 'Resultado actualizado', partido_id: partido.id, estado });
  } catch (error) {
    console.error('[actualizarResultado]', error.message);
    res.status(500).json({ message: 'Error al actualizar resultado' });
  }
}

// FUNCIONALIDAD ADMIN: eliminar partido (solo si está pendiente)
async function eliminar(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, estado FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];

    if (partido.estado !== 'pendiente') {
      return res.status(400).json({
        message: `No se puede eliminar: el partido ya tiene resultado registrado (${partido.estado}).`,
      });
    }

    await pool.query('DELETE FROM partidos WHERE id = $1', [req.params.id]);

    const matchName = `${partido.equipo_local} vs ${partido.equipo_visitante}`;
    broadcast('partido-eliminado', { partido_id: partido.id, match_name: matchName });

    res.json({ message: `Partido "${matchName}" eliminado correctamente` });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar partido' });
  }
}

// FUNCIONALIDAD ADMIN: mostrar/ocultar partido a los usuarios
async function toggleVisibilidad(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, visible_usuarios FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];
    const nuevoEstado = !partido.visible_usuarios;

    await pool.query(
      'UPDATE partidos SET visible_usuarios = $1 WHERE id = $2',
      [nuevoEstado, req.params.id]
    );
    res.json({ id: req.params.id, visible_usuarios: nuevoEstado });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar visibilidad' });
  }
}

// FUNCIONALIDAD ADMIN: actualiza goles temporalmente sin finalizar el partido
// ni ejecutar scoringService
async function marcadorEnVivo(req, res) {
  const { goles_local_mt, goles_visitante_mt } = req.body;
  if (goles_local_mt === undefined || goles_visitante_mt === undefined)
    return res.status(400).json({ message: 'goles_local_mt y goles_visitante_mt son requeridos' });
  if (!golesValidos(goles_local_mt, goles_visitante_mt))
    return res.status(400).json({ message: 'Los goles deben ser enteros entre 0 y 20' });

  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, estado FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];
    if (partido.estado === 'finalizado')
      return res.status(400).json({ message: 'El partido ya está finalizado y no puede modificarse' });

    // Si el partido aún no había arrancado, la primera actualización de marcador
    // en vivo lo pasa a estado 'medio_tiempo' (en curso)
    const nuevoEstado = partido.estado === 'pendiente' ? 'medio_tiempo' : partido.estado;

    await pool.query(
      'UPDATE partidos SET goles_local_mt = $1, goles_visitante_mt = $2, estado = $3 WHERE id = $4',
      [Number(goles_local_mt), Number(goles_visitante_mt), nuevoEstado, req.params.id]
    );

    broadcast('score-updated', {
      partido_id:         partido.id,
      match_name:         `${partido.equipo_local} vs ${partido.equipo_visitante}`,
      goles_local_mt:     Number(goles_local_mt),
      goles_visitante_mt: Number(goles_visitante_mt),
      estado:             nuevoEstado,
    });

    res.json({ message: 'Marcador en vivo actualizado', partido_id: +req.params.id });
  } catch (error) {
    console.error('[marcadorEnVivo]', error.message);
    res.status(500).json({ message: 'Error al actualizar marcador en vivo' });
  }
}

// FUNCIONALIDAD ADMIN: ocultar/mostrar todos los partidos de un grupo o ronda de golpe
async function visibilidadFase(req, res) {
  const { tipo, valor, visible } = req.body;
  if (!['grupo', 'ronda'].includes(tipo) || !valor || typeof visible !== 'boolean')
    return res.status(400).json({ message: 'tipo (grupo|ronda), valor y visible (boolean) son requeridos' });

  const col = tipo === 'grupo' ? 'grupo' : 'ronda';
  const valorNorm = tipo === 'grupo' ? String(valor).toUpperCase() : valor;
  try {
    const { rows } = await pool.query(
      `UPDATE partidos SET visible_usuarios = $1 WHERE ${col} = $2 RETURNING id`,
      [visible, valorNorm]
    );
    res.json({ updated: rows.length, tipo, valor: valorNorm, visible });
  } catch (error) {
    console.error('[visibilidadFase]', error.message);
    res.status(500).json({ message: 'Error al actualizar visibilidad de fase' });
  }
}


// ════════════════════════════════════════════════════════════════════════════
// NUEVO v2.1 — Penales, estadísticas y acciones masivas
// ════════════════════════════════════════════════════════════════════════════

// FUNCIONALIDAD ADMIN: habilitar/deshabilitar ronda de penales en un partido
async function togglePenales(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, penales_habilitados, estado FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];
    const nuevoEstado = !partido.penales_habilitados;

    await pool.query(
      `UPDATE partidos
       SET penales_habilitados = $1,
           penales_local       = CASE WHEN $1 THEN COALESCE(penales_local, 0)     ELSE NULL END,
           penales_visitante   = CASE WHEN $1 THEN COALESCE(penales_visitante, 0) ELSE NULL END
       WHERE id = $2`,
      [nuevoEstado, req.params.id]
    );

    broadcast('penales-updated', {
      partido_id:          partido.id,
      match_name:          `${partido.equipo_local} vs ${partido.equipo_visitante}`,
      penales_habilitados: nuevoEstado,
      penales_local:       nuevoEstado ? 0 : null,
      penales_visitante:   nuevoEstado ? 0 : null,
    });

    res.json({ id: +req.params.id, penales_habilitados: nuevoEstado });
  } catch (error) {
    console.error('[togglePenales]', error.message);
    res.status(500).json({ message: 'Error al actualizar penales' });
  }
}

// FUNCIONALIDAD ADMIN: actualizar el marcador de la tanda de penales en vivo
async function actualizarPenales(req, res) {
  const { penales_local, penales_visitante } = req.body;
  if (penales_local === undefined || penales_visitante === undefined)
    return res.status(400).json({ message: 'penales_local y penales_visitante son requeridos' });
  if (!golesValidos(penales_local, penales_visitante))
    return res.status(400).json({ message: 'Los penales deben ser enteros entre 0 y 20' });

  try {
    const { rows } = await pool.query(
      'SELECT id, equipo_local, equipo_visitante, penales_habilitados FROM partidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });

    const partido = rows[0];
    if (!partido.penales_habilitados)
      return res.status(400).json({ message: 'La ronda de penales no está habilitada para este partido' });

    await pool.query(
      'UPDATE partidos SET penales_local = $1, penales_visitante = $2 WHERE id = $3',
      [Number(penales_local), Number(penales_visitante), req.params.id]
    );

    broadcast('penales-updated', {
      partido_id:          partido.id,
      match_name:          `${partido.equipo_local} vs ${partido.equipo_visitante}`,
      penales_habilitados: true,
      penales_local:       Number(penales_local),
      penales_visitante:   Number(penales_visitante),
    });

    res.json({ message: 'Marcador de penales actualizado', partido_id: +req.params.id });
  } catch (error) {
    console.error('[actualizarPenales]', error.message);
    res.status(500).json({ message: 'Error al actualizar penales' });
  }
}

// ESTADÍSTICAS: distribución de predicciones de la comunidad para un partido
// (probabilidades implícitas: % que apostó local / empate / visitante)
async function statsPartido(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         (COUNT(*))::int                                                   AS total,
         (COUNT(*) FILTER (WHERE tendencia_apostada = 'local'))::int      AS local,
         (COUNT(*) FILTER (WHERE tendencia_apostada = 'empate'))::int     AS empate,
         (COUNT(*) FILTER (WHERE tendencia_apostada = 'visitante'))::int  AS visitante,
         ROUND(AVG(goles_local_esperados_mt), 1)::float                   AS avg_local,
         ROUND(AVG(goles_visitante_esperados_mt), 1)::float               AS avg_visitante
       FROM predicciones WHERE partido_id = $1::int`,
      [req.params.id]
    );
    const s     = rows[0];
    const total = Number(s.total) || 0;
    const pct   = n => total ? Math.round((Number(n) / total) * 100) : 0;
    res.json({
      partido_id:    +req.params.id,
      total,
      local:         Number(s.local),
      empate:        Number(s.empate),
      visitante:     Number(s.visitante),
      pct_local:     pct(s.local),
      pct_empate:    pct(s.empate),
      pct_visitante: pct(s.visitante),
      avg_local:     s.avg_local,
      avg_visitante: s.avg_visitante,
    });
  } catch (error) {
    console.error('[statsPartido]', error.message);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
}

// FUNCIONALIDAD ADMIN: resumen general del torneo
async function resumen(req, res) {
  try {
    const [{ rows: p }, { rows: u }, { rows: pr }] = await Promise.all([
      pool.query(`SELECT
        COUNT(*)::int                                         AS total,
        COUNT(*) FILTER (WHERE estado = 'pendiente')::int     AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'medio_tiempo')::int  AS en_vivo,
        COUNT(*) FILTER (WHERE estado = 'finalizado')::int    AS finalizados,
        COUNT(*) FILTER (WHERE apuestas_abiertas)::int        AS apuestas_abiertas
        FROM partidos`),
      pool.query(`SELECT COUNT(*)::int AS usuarios FROM usuarios WHERE rol = 'user'`),
      pool.query(`SELECT COUNT(*)::int AS predicciones FROM predicciones`),
    ]);
    res.json({ partidos: p[0], usuarios: u[0].usuarios, predicciones: pr[0].predicciones });
  } catch (error) {
    console.error('[resumen]', error.message);
    res.status(500).json({ message: 'Error al obtener resumen' });
  }
}

// FUNCIONALIDAD ADMIN: cerrar TODAS las apuestas abiertas de golpe
async function cerrarTodas(req, res) {
  try {
    const { rows: cerrados } = await pool.query(
      `UPDATE partidos SET apuestas_abiertas = FALSE
       WHERE apuestas_abiertas = TRUE
       RETURNING id, equipo_local, equipo_visitante`
    );
    cerrados.forEach(p => broadcast('bet-closed', {
      partido_id: p.id,
      match_name: `${p.equipo_local} vs ${p.equipo_visitante}`,
    }));
    res.json({ cerrados: cerrados.length });
  } catch (error) {
    console.error('[cerrarTodas]', error.message);
    res.status(500).json({ message: 'Error al cerrar apuestas' });
  }
}

module.exports = { getAll, getById, crear, toggleApuestas, actualizarResultado, eliminar, toggleVisibilidad, marcadorEnVivo, visibilidadFase, togglePenales, actualizarPenales, statsPartido, resumen, cerrarTodas };

/**
 * closeApuestasCron.js — Cierra apuestas automáticamente 5 minutos después
 * de la hora oficial de inicio de cada partido.
 *
 * Lógica:
 *   - Se ejecuta cada minuto.
 *   - Calcula el "umbral Lima" = hora actual UTC −5h −5min.
 *   - Cierra (apuestas_abiertas = FALSE) todo partido cuya fecha_partido ≤ umbral.
 *
 * Por qué así:
 *   - Las fechas en BD están guardadas como string en hora Lima (UTC-5), sin tz.
 *   - Restamos 5h para convertir UTC → Lima, y luego 5min para obtener el
 *     instante exacto en que vence el plazo de apuestas (regla de negocio).
 *   - Al comparar strings ISO-like 'YYYY-MM-DD HH:mm:ss' en Postgres,
 *     el orden lexicográfico es idéntico al cronológico → la comparación es correcta.
 */
const cron       = require('node-cron');
const pool       = require('../config/database');
const { broadcast } = require('../services/sseService');
const { CIERRE_APUESTAS_MS, limaThresholdString } = require('../utils/limaTime');

async function cerrarApuestasVencidas() {
  try {
    const umbral = limaThresholdString(CIERRE_APUESTAS_MS);

    const { rows: cerrados } = await pool.query(
      `UPDATE partidos
       SET apuestas_abiertas = FALSE
       WHERE apuestas_abiertas = TRUE
         AND fecha_partido <= $1
       RETURNING id, equipo_local, equipo_visitante`,
      [umbral]
    );

    if (!cerrados.length) return;

    console.log(`[Cron:closeApuestas] ${cerrados.length} partido(s) cerrado(s) al umbral ${umbral}`);

    // Un evento 'bet-closed' por partido (mismo formato que el cierre manual)
    cerrados.forEach(p => {
      const match_name = `${p.equipo_local} vs ${p.equipo_visitante}`;
      console.log(`  ✓ #${p.id} ${match_name}`);
      broadcast('bet-closed', { partido_id: p.id, match_name });
    });
  } catch (err) {
    console.error('[Cron:closeApuestas] Error:', err.message);
  }
}

// Ejecutar cada minuto
cron.schedule('* * * * *', cerrarApuestasVencidas, { timezone: 'America/Lima' });

console.log('[Cron:closeApuestas] Scheduler activo — cierre automático de apuestas cada minuto');
module.exports = { cerrarApuestasVencidas };

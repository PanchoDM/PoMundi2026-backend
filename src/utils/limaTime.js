/**
 * limaTime.js — Utilidades para comparar fechas contra "ahora en Lima".
 *
 * Las fechas en BD están guardadas como TIMESTAMP naive en hora Lima (UTC-5).
 * El driver pg las entrega como Date interpretando los valores literales como
 * si fueran UTC, así que para comparar contra "ahora" hay que restarle el
 * offset de Lima a Date.now() (mismo criterio usado en el frontend).
 */
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 en milisegundos
const CIERRE_APUESTAS_MS = 5 * 60 * 1000;  // Cierre de apuestas: 5 minutos tras el inicio

function nowLimaEpoch() {
  return Date.now() - LIMA_OFFSET_MS;
}

// Umbral en formato 'YYYY-MM-DD HH:mm:ss' comparable lexicográficamente
// contra la columna fecha_partido (usado por queries SQL).
function limaThresholdString(marginMs) {
  const d = new Date(Date.now() - LIMA_OFFSET_MS - marginMs);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// true si ya transcurrió el margen de cierre (por defecto 5 min) desde fechaPartido
function apuestasVencidas(fechaPartido, marginMs = CIERRE_APUESTAS_MS) {
  const inicio = new Date(fechaPartido).getTime();
  if (isNaN(inicio)) return false;
  return nowLimaEpoch() - inicio > marginMs;
}

module.exports = { LIMA_OFFSET_MS, CIERRE_APUESTAS_MS, nowLimaEpoch, limaThresholdString, apuestasVencidas };

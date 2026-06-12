const pool = require('../config/database');

// RENDIMIENTO: caché en memoria de 30 s — el ranking no necesita ser
// recalculado en cada request cuando cientos de usuarios lo consultan a la vez.
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000;

async function getLeaderboard(req, res) {
  try {
    const now = Date.now();
    if (cache && now - cacheAt < CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cache);
    }

    const { rows } = await pool.query(
      `SELECT nombre_usuario, puntos_totales, aciertos_exactos, rol,
              RANK() OVER (ORDER BY puntos_totales DESC, aciertos_exactos DESC) AS posicion
       FROM usuarios
       WHERE rol = 'user'
       ORDER BY puntos_totales DESC, aciertos_exactos DESC`
    );
    cache = rows;
    cacheAt = now;
    res.setHeader('X-Cache', 'MISS');
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Error al obtener tabla de posiciones' });
  }
}

module.exports = { getLeaderboard };

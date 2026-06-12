require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { securityHeaders, rateLimit } = require('./middleware/security');

const app = express();
app.set('trust proxy', 1); // Render/proxies: IP real en x-forwarded-for

// ── Seguridad ────────────────────────────────────────────────────────────────
app.use(securityHeaders);

// CORS estricto: en producción solo el frontend de GitHub Pages; en local, localhost:4200
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Límite de payload: evita JSON gigantes maliciosos
app.use(express.json({ limit: '10kb' }));

// Rate limit global (todas las rutas API)
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

// Rutas
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/partidos',     require('./routes/partidos'));
app.use('/api/predicciones', require('./routes/predicciones'));
app.use('/api/leaderboard',  require('./routes/leaderboard'));
app.use('/api/notifications', require('./routes/notifications'));

// Cron jobs
require('./cron/liveScoresCron');
require('./cron/closeApuestasCron');

app.get('/api/health', (_, res) => res.json({ status: 'ok', app: 'PollaMundial2026 v2.1' }));

// Manejador de errores centralizado: nunca filtra stack traces al cliente
app.use((err, req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origen no permitido' });
  }
  console.error('[ErrorHandler]', err.message);
  res.status(500).json({ message: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 PollaMundial2026 Backend corriendo en http://localhost:${PORT}`);

  // Keep-alive: evita que Render (free tier) hiberne el servidor por inactividad.
  const APP_URL = process.env.APP_URL;
  if (APP_URL) {
    const { get } = APP_URL.startsWith('https') ? require('https') : require('http');
    setInterval(() => {
      get(`${APP_URL}/api/health`, res => {
        console.log(`[keep-alive] ping → ${res.statusCode}`);
        res.resume();
      }).on('error', err => console.error(`[keep-alive] error: ${err.message}`));
    }, 10 * 60 * 1000);
    console.log(`[keep-alive] activo → ${APP_URL}/api/health`);
  }
});

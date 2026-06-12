const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const { addClient }   = require('../services/sseService');

/**
 * SEGURIDAD SSE — ticket de un solo propósito y corta duración.
 *
 * Antes el JWT de sesión completo viajaba en la query string (queda en logs,
 * historial y proxies). Ahora el cliente pide un "ticket" efímero (60 s) con
 * su JWT en el header Authorization, y usa ese ticket para abrir el stream.
 * Si el ticket se filtra, expira en segundos y no sirve para llamar a la API.
 */
router.post('/ticket', verifyToken, (req, res) => {
  const ticket = jwt.sign(
    { sub: req.user.id, purpose: 'sse' },
    process.env.JWT_SECRET,
    { expiresIn: '60s' }
  );
  res.json({ ticket });
});

// SSE: EventSource no soporta headers custom, el ticket efímero viene como query param
router.get('/stream', (req, res) => {
  const ticket = req.query.ticket || req.query.token; // retro-compatible
  if (!ticket) return res.status(401).end();

  try {
    const payload = jwt.verify(ticket, process.env.JWT_SECRET);
    // Solo se aceptan tickets emitidos para SSE o (legacy) tokens de sesión
    if (payload.purpose && payload.purpose !== 'sse') return res.status(401).end();
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat cada 25 s para mantener la conexión viva
  const heartbeat = setInterval(() => { try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); } }, 25000);

  addClient(res);
  req.on('close', () => clearInterval(heartbeat));
});

module.exports = router;

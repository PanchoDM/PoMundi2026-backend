/**
 * security.js — Middlewares de seguridad sin dependencias externas.
 *
 *  1. securityHeaders : cabeceras tipo "helmet" (clickjacking, MIME-sniffing, etc.)
 *  2. rateLimit       : limitador de peticiones en memoria (anti fuerza bruta / abuso)
 *  3. golesValidos    : valida que un marcador sea un entero entre 0 y 20
 */

// ── 1. Cabeceras de seguridad ────────────────────────────────────────────────
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');          // evita MIME-sniffing
  res.setHeader('X-Frame-Options', 'DENY');                     // evita clickjacking
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // API JSON: nunca debe ejecutarse como documento
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  next();
}

// ── 2. Rate limiting en memoria ──────────────────────────────────────────────
/**
 * rateLimit({ windowMs, max, message })
 * Cuenta peticiones por IP en una ventana deslizante simple.
 * Suficiente para una instancia única (Render free tier).
 */
function rateLimit({ windowMs = 60_000, max = 100, message = 'Demasiadas peticiones, inténtalo más tarde' } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Limpieza periódica para no acumular memoria
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
}

// ── 3. Validación de marcadores ──────────────────────────────────────────────
function golesValidos(...valores) {
  return valores.every(v => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 20;
  });
}

module.exports = { securityHeaders, rateLimit, golesValidos };

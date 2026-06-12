const router = require('express').Router();
const { register, login } = require('../controllers/authController');
const { rateLimit } = require('../middleware/security');

// Anti fuerza bruta: máximo 10 intentos de login/registro por IP cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
});

router.post('/register', authLimiter, register);
router.post('/login',    authLimiter, login);

module.exports = router;

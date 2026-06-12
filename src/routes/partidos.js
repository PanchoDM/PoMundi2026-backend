const router = require('express').Router();
const { verifyToken, adminOnly } = require('../middleware/auth');
const {
  getAll, getById, crear, toggleApuestas, actualizarResultado, eliminar,
  toggleVisibilidad, marcadorEnVivo, visibilidadFase,
  togglePenales, actualizarPenales, statsPartido, resumen, cerrarTodas,
} = require('../controllers/partidosController');

// ⚠ Las rutas estáticas van ANTES de '/:id' para que Express no las capture como id
router.get('/',          verifyToken,            getAll);
router.get('/resumen',   verifyToken, adminOnly, resumen);
router.put('/visibilidad-fase', verifyToken, adminOnly, visibilidadFase);
router.patch('/cerrar-todas',   verifyToken, adminOnly, cerrarTodas);

router.get('/:id',       verifyToken,            getById);
router.get('/:id/stats', verifyToken,            statsPartido);
router.post('/',         verifyToken, adminOnly, crear);
router.patch('/:id/toggle-apuestas',    verifyToken, adminOnly, toggleApuestas);
router.patch('/:id/resultado',          verifyToken, adminOnly, actualizarResultado);
router.delete('/:id',                   verifyToken, adminOnly, eliminar);
router.patch('/:id/toggle-visibilidad', verifyToken, adminOnly, toggleVisibilidad);
router.put('/:id/marcador-en-vivo',     verifyToken, adminOnly, marcadorEnVivo);
router.patch('/:id/toggle-penales',     verifyToken, adminOnly, togglePenales);
router.put('/:id/penales',              verifyToken, adminOnly, actualizarPenales);

module.exports = router;

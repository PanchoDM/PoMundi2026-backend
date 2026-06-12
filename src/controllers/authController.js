const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../config/database');

async function register(req, res) {
  const { nombre_usuario, password } = req.body;
  if (!nombre_usuario || !password)
    return res.status(400).json({ message: 'nombre_usuario y password son requeridos' });

  if (!nombre_usuario.trim().toLowerCase().endsWith('@pollamundial2026.com'))
    return res.status(403).json({ message: 'ingrese la credencial correcta' });

  // SEGURIDAD: política de contraseña fuerte (mín. 8 caracteres, letras y números)
  if (typeof password !== 'string' || password.length < 8 || password.length > 72 ||
      !/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 8 caracteres e incluir letras y números',
    });

  if (nombre_usuario.trim().length > 50)
    return res.status(400).json({ message: 'El nombre de usuario es demasiado largo' });

  try {
    const hash = await bcrypt.hash(password, 12);
    // Para PostgreSQL usamos $1, $2. Y quitamos el ID manual porque Supabase lo pone solo (int4)
    await pool.query(
      'INSERT INTO usuarios (nombre_usuario, password_hash) VALUES ($1, $2)',
      [nombre_usuario.trim(), hash]
    );
    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ message: 'El nombre de usuario ya existe' });
    console.error("Error en registro:", err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
}

async function login(req, res) {
  const { nombre_usuario, password } = req.body;
  if (!nombre_usuario || !password)
    return res.status(400).json({ message: 'Credenciales requeridas' });

  if (!nombre_usuario.trim().toLowerCase().endsWith('@pollamundial2026.com'))
    return res.status(403).json({ message: 'ingrese la credencial correcta' });

  try {
    // Consulta adaptada para PostgreSQL usando $1 y leyendo result.rows
    const result = await pool.query(
      'SELECT id, nombre_usuario, password_hash, puntos_totales, aciertos_exactos, rol FROM usuarios WHERE nombre_usuario = $1',
      [nombre_usuario]
    );
    
    const user = result.rows[0]; // Así lee los datos PostgreSQL

    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ message: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id, nombre_usuario: user.nombre_usuario, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id:              user.id,
        nombre_usuario:  user.nombre_usuario,
        puntos_totales:  user.puntos_totales,
        aciertos_exactos: user.aciertos_exactos,
        rol:             user.rol,
      },
    });
  } catch (error) {
    console.error("Error en login:", error); // Esto imprimirá el error real en Render si vuelve a fallar
    res.status(500).json({ message: 'Error interno del servidor' });
  }
}

module.exports = { register, login };
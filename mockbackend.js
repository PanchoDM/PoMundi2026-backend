const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/auth/login', (req, res) => {
  res.json({ token: 'fake-jwt', user: { id: 'u1', nombre_usuario: 'tester@pollamundial2026.com', puntos_totales: 10, aciertos_exactos: 1, rol: 'user' } });
});

app.get('/api/partidos', (req, res) => {
  res.json([{
    id: 1,
    equipo_local: 'Mexico',
    equipo_visitante: 'Sudafrica',
    fecha_partido: new Date(Date.now() + 3600_000).toISOString(),
    grupo: 'A', jornada: 1, ronda: null,
    goles_local_mt: null, goles_visitante_mt: null,
    estado: 'pendiente',
    apuestas_abiertas: true,
    visible_usuarios: true,
    penales_habilitados: false, penales_local: null, penales_visitante: null,
  }]);
});

app.get('/api/partidos/:id/stats', (req, res) => {
  console.log('STATS REQUEST for', req.params.id);
  res.json({
    partido_id: +req.params.id,
    total: 5, local: 2, empate: 1, visitante: 2,
    pct_local: 40, pct_empate: 20, pct_visitante: 40,
    avg_local: 1.4, avg_visitante: 1.2,
  });
});

app.get('/api/predicciones/mias', (req, res) => {
  res.json([{
    id: 1, partido_id: 1, equipo_local: 'Mexico', equipo_visitante: 'Sudafrica',
    fecha_partido: new Date(Date.now() + 3600_000).toISOString(),
    goles_local_esperados_mt: 2, goles_visitante_esperados_mt: 1,
    tendencia_apostada: 'local', puntos_obtenidos: null,
  }]);
});

app.get('/api/predicciones/mi-racha', (req, res) => {
  res.json({ streak: 'neutral', message: null });
});

app.post('/api/notifications/ticket', (req, res) => {
  res.json({ ticket: 'fake-ticket' });
});

app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const interval = setInterval(() => res.write(':ping\n\n'), 15000);
  req.on('close', () => clearInterval(interval));
});

app.listen(3000, () => console.log('mock backend on 3000'));

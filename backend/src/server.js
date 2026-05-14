const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getDatabase } = require('./db/database');
const { initDatabase } = require('./db/schema');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const municipioRoutes = require('./routes/municipio.routes');

const { authenticateToken, requireRole } = require('./middlewares/auth.middleware');

const app = express();

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/municipio', municipioRoutes);

app.get('/api/health', async (req, res) => {
  const db = await getDatabase();

  const result = await db.get('SELECT 1 AS database_ok');

  res.json({
    ok: true,
    message: 'Backend oficinas-empleo funcionando correctamente',
    database: result.database_ok === 1 ? 'conectada' : 'error',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/debug/tables', authenticateToken, requireRole('admin'), async (req, res) => {
  const db = await getDatabase();

  const tables = await db.all(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);

  res.json({
    ok: true,
    tables
  });
});

app.get('/api/debug/users', authenticateToken, requireRole('admin'), async (req, res) => {
  const db = await getDatabase();

  const users = await db.all(`
    SELECT
      id,
      name,
      username,
      role,
      municipality_name,
      active,
      created_at
    FROM users
    ORDER BY id ASC;
  `);

  res.json({
    ok: true,
    users
  });
});

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
      console.log('Base de datos SQLite conectada correctamente');
      console.log('Tablas iniciales verificadas correctamente');
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();

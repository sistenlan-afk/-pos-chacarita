const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Crear tablas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      rol VARCHAR(20) DEFAULT 'vendedor',
      creado TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ventas (
      id SERIAL PRIMARY KEY,
      datos JSONB,
      total NUMERIC,
      fecha TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("Tablas listas");
}
initDB();

// Registrar usuario con PIN encriptado
app.post('/api/usuarios', async (req, res) => {
  const { nombre, pin, rol } = req.body;
  const hash = await bcrypt.hash(pin, 10);
  const result = await pool.query(
    'INSERT INTO usuarios (nombre, pin_hash, rol) VALUES ($1, $2, $3) RETURNING id, nombre, rol',
    [nombre, hash, rol]
  );
  res.json(result.rows[0]);
});

// Login con PIN
app.post('/api/login', async (req, res) => {
  const { nombre, pin } = req.body;
  const result = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [nombre]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario no existe' });
  const valido = await bcrypt.compare(pin, result.rows[0].pin_hash);
  if (!valido) return res.status(401).json({ error: 'PIN incorrecto' });
  res.json({ ok: true, usuario: { id: result.rows[0].id, nombre: result.rows[0].nombre, rol: result.rows[0].rol } });
});

// Listar usuarios
app.get('/api/usuarios', async (req, res) => {
  const result = await pool.query('SELECT id, nombre, rol, creado FROM usuarios ORDER BY id');
  res.json(result.rows);
});

app.get('/', (req, res) => res.send('POS Chacarita Backend OK'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
      fecha TIMESTAMP DEFAULT NOW(),
      usuario VARCHAR(100)
    );
  `);
  console.log("Tablas listas");
}
initDB();

app.post('/api/usuarios', async (req, res) => {
  const { nombre, pin, rol } = req.body;
  const hash = await bcrypt.hash(pin, 10);
  const result = await pool.query(
    'INSERT INTO usuarios (nombre, pin_hash, rol) VALUES ($1, $2, $3) RETURNING id, nombre, rol',
    [nombre, hash, rol || 'vendedor']
  );
  res.json(result.rows[0]);
});

app.post('/api/login', async (req, res) => {
  const { nombre, pin } = req.body;
  const result = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [nombre]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario no existe' });
  const valido = await bcrypt.compare(pin, result.rows[0].pin_hash);
  if (!valido) return res.status(401).json({ error: 'PIN incorrecto' });
  res.json({ ok: true, usuario: { id: result.rows[0].id, nombre: result.rows[0].nombre, rol: result.rows[0].rol } });
});

app.get('/api/usuarios', async (req, res) => {
  const result = await pool.query('SELECT id, nombre, rol, creado FROM usuarios ORDER BY id');
  res.json(result.rows);
});

app.post('/api/ventas', async (req, res) => {
  const { datos, total, usuario } = req.body;
  const result = await pool.query('INSERT INTO ventas (datos, total, usuario) VALUES ($1, $2, $3) RETURNING id', [JSON.stringify(datos), total, usuario]);
  res.json({id: result.rows[0].id, ok:true});
});

app.get('/api/ventas', async (req, res) => {
  const result = await pool.query('SELECT * FROM ventas ORDER BY id DESC LIMIT 100');
  res.json(result.rows);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor POS La Chacarita en puerto ${PORT}`));

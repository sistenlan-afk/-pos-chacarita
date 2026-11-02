/* API del POS CHACARITA ARATOCA  ·  Node + Express + PostgreSQL (Render)
   Variables de entorno (se configuran en Render → Environment):
     DATABASE_URL   cadena de conexión de la base PostgreSQL (obligatoria)
     API_KEY        clave que el POS envía en cada petición (obligatoria)
     ALLOWED_ORIGIN (opcional) dominio permitido si el index.html está en otro sitio, ej. https://usuario.github.io */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
const { TABLAS, ddl, upsertSql, filas } = require('./esquema');

const app = express();
const url = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: url,
  ssl: url && !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : false,
  max: 5
});
pool.on('error', e => console.error('Error en conexión inactiva:', e.message));

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, allowedHeaders: ['Content-Type', 'x-api-key'] }));
app.use(express.json({ limit: '10mb' }));

/* ---------- Esquema: se crea solo al arrancar (reintenta hasta que la base responda) ---------- */
let dbLista = false;
async function iniciarBD() {
  while (!dbLista) {
    try {
      for (const sql of ddl()) await pool.query(sql);
      dbLista = true;
      console.log('Tablas verificadas/creadas:', TABLAS.map(t => t.nombre).join(', '), ', caja_estado, cierres');
    } catch (e) {
      console.error('BD no disponible todavía:', e.message, '- reintento en 10 s');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

/* ---------- Health (lo usa el indicador verde/rojo del POS) ---------- */
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.status(dbLista ? 200 : 503).json({ ok: dbLista }); }
  catch (e) { res.status(500).json({ ok: false }); }
});

/* ---------- Autenticación por clave ---------- */
function auth(req, res, next) {
  const clave = process.env.API_KEY;
  if (!clave) return res.status(500).json({ error: 'API_KEY no está configurada en el servidor' });
  const a = Buffer.from(String(req.get('x-api-key') || '')), b = Buffer.from(clave);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

/* ---------- POST /api/sync: guarda (upsert) todo lo que envía el POS. Nunca borra registros. ---------- */
app.post('/api/sync', auth, async (req, res) => {
  const body = req.body || {};
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const t of TABLAS) {
      const rows = filas(t, body[t.campo]);
      if (rows.length) await c.query(upsertSql(t), [JSON.stringify(rows)]);
    }
    if (body.caja && typeof body.caja === 'object')
      await c.query('INSERT INTO caja_estado (id, datos, actualizado) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now()', [JSON.stringify(body.caja)]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Error en /api/sync:', e.message);
    res.status(500).json({ error: 'No se pudo guardar' });
  } finally { c.release(); }
});

/* ---------- GET /api/snapshot: devuelve todo (para cargar un equipo nuevo/vacío) ---------- */
app.get('/api/snapshot', auth, async (req, res) => {
  try {
    const out = {};
    for (const t of TABLAS) out[t.campo] = (await pool.query(`SELECT datos FROM ${t.nombre} ORDER BY ${t.orden}`)).rows.map(r => r.datos);
    const caja = await pool.query('SELECT datos FROM caja_estado WHERE id = 1');
    out.caja = caja.rows[0] ? caja.rows[0].datos : null;
    res.json(out);
  } catch (e) { console.error('Error en /api/snapshot:', e.message); res.status(500).json({ error: 'No se pudo leer' }); }
});

/* ---------- POST /api/cierre: historial de cierres de turno ---------- */
app.post('/api/cierre', auth, async (req, res) => {
  const d = req.body || {};
  try {
    await pool.query('INSERT INTO cierres (cajero, efectivo_esperado, datos) VALUES ($1, $2, $3)', [d.cajero || null, Number(d.efectivoEsperado) || 0, JSON.stringify(d)]);
    res.json({ ok: true });
  } catch (e) { console.error('Error en /api/cierre:', e.message); res.status(500).json({ error: 'No se pudo guardar el cierre' }); }
});

/* ---------- Sirve el POS (index.html) desde el mismo servicio ---------- */
const publica = path.join(__dirname, 'public');
if (fs.existsSync(path.join(publica, 'index.html'))) app.use(express.static(publica));
else app.get('/', (req, res) => { const f = path.join(__dirname, 'index.html'); fs.existsSync(f) ? res.sendFile(f) : res.send('API del POS activa'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('POS API escuchando en puerto', PORT));
iniciarBD();

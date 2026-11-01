const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });

async function init(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, pin TEXT, rol TEXT DEFAULT 'vendedor', activo BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS productos (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, codigo TEXT, categoria TEXT DEFAULT 'General', precio NUMERIC DEFAULT 0, stock NUMERIC DEFAULT 0, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS clientes (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, documento TEXT, telefono TEXT, direccion TEXT, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS proveedores (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, documento TEXT, telefono TEXT, direccion TEXT, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS ventas (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT NOW(), datos JSONB, total NUMERIC DEFAULT 0, usuario TEXT, cliente TEXT, tipo TEXT DEFAULT 'contado', pagos JSONB, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cierres (id SERIAL PRIMARY KEY, fecha DATE NOT NULL UNIQUE, usuario TEXT, base_inicial NUMERIC DEFAULT 0, efectivo_esperado NUMERIC DEFAULT 0, efectivo_contado NUMERIC DEFAULT 0, total_ventas NUMERIC DEFAULT 0, pagos JSONB, observaciones TEXT, created_at TIMESTAMP DEFAULT NOW());
  `);
  // MIGRACION PARA BASE VIEJA
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN`).catch(()=>{});
  await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS pagos JSONB`).catch(()=>{});
  await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo TEXT`).catch(()=>{});

  await pool.query(`UPDATE usuarios SET pin='1234' WHERE LOWER(nombre)=LOWER('JOEL') AND (pin IS NULL OR pin='')`).catch(()=>{});
  
  const u = await pool.query(`SELECT * FROM usuarios WHERE LOWER(nombre)=LOWER('JOEL')`).catch(()=>({rows:[]}));
  if(u.rows.length===0){
    await pool.query(`INSERT INTO usuarios(nombre,pin,rol) VALUES('JOEL','1234','admin') ON CONFLICT (nombre) DO UPDATE SET pin='1234', rol='admin'`).catch(async()=>{
      await pool.query(`INSERT INTO usuarios(nombre,pin,rol) VALUES('JOEL','1234','admin')`);
    });
    await pool.query(`INSERT INTO usuarios(nombre,pin,rol) VALUES('CARLOS','0000','vendedor') ON CONFLICT DO NOTHING`).catch(()=>{});
  }
  console.log("POS V15.2 listo");
}
init();

app.post('/api/login', async (req,res)=>{
  try{
    const {nombre,pin}=req.body;
    let r;
    try{
      r=await pool.query("SELECT * FROM usuarios WHERE LOWER(nombre)=LOWER($1) AND pin=$2",[nombre.trim(),pin.trim()]);
    }catch(e){
      // Si falla por pin no existe, busca sin pin y crea
      r=await pool.query("SELECT * FROM usuarios WHERE LOWER(nombre)=LOWER($1)",[nombre.trim()]);
      if(r.rows.length===0){
        await pool.query("INSERT INTO usuarios(nombre,pin,rol) VALUES($1,$2,'admin')",[nombre.trim(),pin.trim()]);
        r=await pool.query("SELECT * FROM usuarios WHERE LOWER(nombre)=LOWER($1)",[nombre.trim()]);
      }
    }
    if(r.rows.length===0) return res.status(401).json({error:'Usuario o PIN incorrecto'});
    if(r.rows[0].pin && r.rows[0].pin!==pin.trim()) return res.status(401).json({error:'PIN incorrecto'});
    res.json({usuario:r.rows[0]});
  }catch(e){ res.status(500).json({error:e.message}) }
});

app.get('/api/usuarios', async (req,res)=>{ const r=await pool.query("SELECT id,nombre,rol,activo FROM usuarios ORDER BY id"); res.json(r.rows); });
app.post('/api/usuarios', async (req,res)=>{ try{const {nombre,pin,rol}=req.body; const r=await pool.query("INSERT INTO usuarios(nombre,pin,rol) VALUES($1,$2,$3) RETURNING *",[nombre.trim(),pin.trim(),rol||'vendedor']); res.json(r.rows[0]);}catch(e){res.status(400).json({error:'Usuario ya existe'})} });
app.put('/api/usuarios/:id', async (req,res)=>{ const {nombre,pin,rol,activo}=req.body; const r=await pool.query("UPDATE usuarios SET nombre=COALESCE($1,nombre), pin=COALESCE($2,pin), rol=COALESCE($3,rol), activo=COALESCE($4,activo) WHERE id=$5 RETURNING *",[nombre,pin,rol,activo,req.params.id]); res.json(r.rows[0]); });
app.post('/api/usuarios/cambiar-password', async (req,res)=>{ const {id,pin_nuevo}=req.body; await pool.query("UPDATE usuarios SET pin=$1 WHERE id=$2",[pin_nuevo,id]); res.json({ok:true}); });
app.get('/api/productos', async (req,res)=>{ const r=await pool.query("SELECT * FROM productos ORDER BY id DESC"); res.json(r.rows); });
app.post('/api/productos', async (req,res)=>{ const {nombre,codigo,categoria,precio,stock}=req.body; const r=await pool.query("INSERT INTO productos(nombre,codigo,categoria,precio,stock) VALUES($1,$2,$3,$4,$5) RETURNING *",[nombre,codigo,categoria,precio,stock]); res.json(r.rows[0]); });
app.put('/api/productos/:id', async (req,res)=>{ const {nombre,codigo,categoria,precio,stock}=req.body; const r=await pool.query("UPDATE productos SET nombre=$1,codigo=$2,categoria=$3,precio=$4,stock=$5 WHERE id=$6 RETURNING *",[nombre,codigo,categoria,precio,stock,req.params.id]); res.json(r.rows[0]); });
app.delete('/api/productos/:id', async (req,res)=>{ await pool.query("DELETE FROM productos WHERE id=$1",[req.params.id]); res.json({ok:true}); });
app.get('/api/clientes', async (req,res)=>{ const r=await pool.query("SELECT * FROM clientes ORDER BY id DESC"); res.json(r.rows); });
app.post('/api/clientes', async (req,res)=>{ const {nombre,documento,telefono,direccion}=req.body; const r=await pool.query("INSERT INTO clientes(nombre,documento,telefono,direccion) VALUES($1,$2,$3,$4) RETURNING *",[nombre,documento,telefono,direccion]); res.json(r.rows[0]); });
app.get('/api/proveedores', async (req,res)=>{ const r=await pool.query("SELECT * FROM proveedores ORDER BY id DESC"); res.json(r.rows); });
app.post('/api/proveedores', async (req,res)=>{ const {nombre,documento,telefono,direccion}=req.body; const r=await pool.query("INSERT INTO proveedores(nombre,documento,telefono,direccion) VALUES($1,$2,$3,$4) RETURNING *",[nombre,documento,telefono,direccion]); res.json(r.rows[0]); });
app.get('/api/ventas', async (req,res)=>{ const {fecha}=req.query; const r= fecha? await pool.query("SELECT * FROM ventas WHERE DATE(fecha)=$1 ORDER BY id DESC",[fecha]) : await pool.query("SELECT * FROM ventas ORDER BY id DESC LIMIT 200"); res.json(r.rows); });
app.get('/api/ventas/:id', async (req,res)=>{ const r=await pool.query("SELECT * FROM ventas WHERE id=$1",[req.params.id]); res.json(r.rows[0]); });
app.post('/api/ventas', async (req,res)=>{ const {datos,total,usuario,fecha}=req.body; const carrito=datos?.carrito||[]; for(const item of carrito){ if(item.id) await pool.query("UPDATE productos SET stock=GREATEST(0,stock-$1) WHERE id=$2",[Number(item.cant)||1,item.id]); } const r=await pool.query("INSERT INTO ventas(datos,total,usuario,cliente,tipo,pagos,fecha) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[JSON.stringify(datos),total||0,usuario||'',datos?.cliente||'Mostrador',datos?.tipo||'contado',datos?.pagos?JSON.stringify(datos.pagos):null,fecha||new Date()]); res.json({ok:true, venta:r.rows[0]}); });
app.get('/api/apartados', async (req,res)=>{ const r=await pool.query("SELECT * FROM ventas WHERE tipo='apartado' ORDER BY id DESC"); res.json(r.rows); });
app.get('/api/creditos', async (req,res)=>{ const r=await pool.query("SELECT * FROM ventas WHERE tipo='credito' ORDER BY id DESC"); res.json(r.rows); });
app.get('/api/caja/resumen', async (req,res)=>{ const fecha=req.query.fecha||new Date().toISOString().slice(0,10); const ventas=await pool.query("SELECT * FROM ventas WHERE DATE(fecha)=$1 AND tipo='contado'",[fecha]); let pagos={efectivo:0,nequi:0,daviplata:0,transferencia:0}, total=0; for(const v of ventas.rows){ total+=Number(v.total)||0; let p=v.pagos; if(typeof p==='string') try{p=JSON.parse(p)}catch{}; if(p){pagos.efectivo+=Number(p.efectivo)||0; pagos.nequi+=Number(p.nequi)||0; pagos.daviplata+=Number(p.daviplata)||0; pagos.transferencia+=Number(p.transferencia)||0;} else pagos.efectivo+=Number(v.total)||0; } res.json({fecha,total_ventas:total,pagos,total_recibido:Object.values(pagos).reduce((a,b)=>a+b,0),base_inicial:0,efectivo_esperado:pagos.efectivo,saldo_esperado:pagos.efectivo,cantidad_ventas:ventas.rows.length}); });
app.post('/api/caja/cierre', async (req,res)=>{ const {fecha,efectivo_contado,base_inicial,observaciones,usuario}=req.body; const f=fecha||new Date().toISOString().slice(0,10); const ventas=await pool.query("SELECT * FROM ventas WHERE DATE(fecha)=$1",[f]); let pagos={efectivo:0,nequi:0,daviplata:0,transferencia:0}, total=0; for(const v of ventas.rows){total+=Number(v.total)||0;} const r=await pool.query(`INSERT INTO cierres(fecha,usuario,base_inicial,efectivo_esperado,efectivo_contado,total_ventas,pagos,observaciones) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(fecha) DO UPDATE SET efectivo_contado=$5, observaciones=$8 RETURNING *`,[f,usuario,base_inicial||0,total,efectivo_contado||0,total,JSON.stringify(pagos),observaciones]); res.json({ok:true,cierre:r.rows[0]}); });
app.get('/api/reportes/ventas', async (req,res)=>{ const {desde,hasta}=req.query; const r=await pool.query("SELECT * FROM ventas WHERE DATE(fecha) BETWEEN $1 AND $2",[desde,hasta]); let total=0; for(const v of r.rows) total+=Number(v.total)||0; res.json({total_ventas:total,cantidad_ventas:r.rows.length,ticket_promedio:r.rows.length?total/r.rows.length:0,pagos:{}}); });
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(process.env.PORT||3000,()=>console.log('V15.2 listo'));

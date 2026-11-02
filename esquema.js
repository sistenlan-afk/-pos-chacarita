/* ESQUEMA: define las tablas, cómo se crean y cómo se llenan desde lo que envía el POS.
   Sin dependencias externas. Cada tabla guarda columnas "consultables" + la columna `datos` (JSON original completo),
   de modo que el POS puede restaurar todo tal cual desde la nube. */
const crypto = require('crypto');
const str = v => (v === undefined || v === null || v === '' ? null : String(v));
const num = v => (Number.isFinite(+v) ? +v : 0);
const hid = o => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex');   // id estable para registros sin id

const TABLAS = [
  { nombre: 'productos', campo: 'productos', clave: ['codigo'], orden: 'codigo',
    cols: [['codigo','text'],['nombre','text'],['stock','numeric'],['costo','numeric'],['precio','numeric'],['vencimiento','text'],['proveedor','text'],['datos','jsonb']],
    fila: p => ({ codigo: str(p.codigo), nombre: str(p.nombre), stock: num(p.stock), costo: num(p.costo), precio: num(p.precio), vencimiento: str(p.vencimiento), proveedor: str(p.proveedor), datos: p }) },

  { nombre: 'proveedores', campo: 'proveedores', clave: ['nit'], orden: 'nombre',
    cols: [['nit','text'],['nombre','text'],['tel','text'],['asesor','text'],['datos','jsonb']],
    fila: p => ({ nit: str(p.nit), nombre: str(p.nombre), tel: str(p.tel), asesor: str(p.asesor), datos: p }) },

  { nombre: 'clientes', campo: 'clientes', clave: ['doc'], orden: 'nombre',
    cols: [['doc','text'],['nombre','text'],['datos','jsonb']],
    fila: c => ({ doc: str(c.doc), nombre: str(c.nombre), datos: c }) },

  { nombre: 'facturas_compra', campo: 'facturasCompra', clave: ['numero','proveedor'], orden: 'creado',
    cols: [['numero','text'],['proveedor','text'],['total','numeric'],['saldo','numeric'],['fecha','text'],['datos','jsonb']],
    fila: f => ({ numero: str(f.numero), proveedor: str(f.proveedor), total: num(f.total), saldo: num(f.saldo), fecha: str(f.fecha), datos: f }) },

  { nombre: 'facturas_venta', campo: 'facturasVenta', clave: ['numero'], orden: 'numero',
    cols: [['numero','integer'],['fecha','text'],['cliente_nombre','text'],['cliente_doc','text'],['total','numeric'],['metodo','text'],['efectivo','numeric'],['vuelto','numeric'],
           ['pago_efectivo','numeric'],['pago_digital','numeric'],['cajero','text'],['apartado_id','text'],['items','jsonb'],['datos','jsonb']],
    fila: f => ({ numero: Number.isInteger(+f.numero) ? +f.numero : null, fecha: str(f.fecha), cliente_nombre: str(f.cliente && f.cliente.nombre), cliente_doc: str(f.cliente && f.cliente.doc),
      total: num(f.total), metodo: str(f.metodo), efectivo: num(f.efectivo), vuelto: num(f.vuelto), pago_efectivo: num(f.pagoEfectivo), pago_digital: num(f.pagoDigital),
      cajero: str(f.cajero), apartado_id: str(f.apartado), items: f.items || [], datos: f }) },

  { nombre: 'pagos_proveedores', campo: 'pagosProv', clave: ['id'], orden: 'creado',
    cols: [['id','text'],['proveedor','text'],['valor','numeric'],['fecha','text'],['datos','jsonb']],
    fila: p => ({ id: hid(p), proveedor: str(p.proveedor), valor: num(p.valor), fecha: str(p.fecha), datos: p }) },

  { nombre: 'gastos', campo: 'gastos', clave: ['id'], orden: 'creado',
    cols: [['id','text'],['concepto','text'],['valor','numeric'],['fecha','text'],['datos','jsonb']],
    fila: g => ({ id: hid(g), concepto: str(g.concepto), valor: num(g.valor), fecha: str(g.fecha), datos: g }) },

  { nombre: 'devoluciones', campo: 'devoluciones', clave: ['id'], orden: 'creado',
    cols: [['id','text'],['codigo','text'],['cant','numeric'],['proveedor','text'],['fecha','text'],['datos','jsonb']],
    fila: d => ({ id: hid(d), codigo: str(d.codigo), cant: num(d.cant), proveedor: str(d.proveedor), fecha: str(d.fecha), datos: d }) },

  { nombre: 'apartados', campo: 'apartados', clave: ['id'], orden: 'creado',
    cols: [['id','text'],['cliente','text'],['documento','text'],['producto','text'],['total_original','numeric'],['total_abonado','numeric'],['saldo_debe','numeric'],
           ['estado','text'],['fecha','text'],['fecha_fin','text'],['items','jsonb'],['datos','jsonb']],
    fila: a => ({ id: str(a.id), cliente: str(a.cliente), documento: str(a.documento), producto: str(a.producto), total_original: num(a.totalOriginal), total_abonado: num(a.totalAbonado),
      saldo_debe: num(a.saldoDebe), estado: str(a.estado), fecha: str(a.fecha), fecha_fin: str(a.fechaFin), items: a.items || [], datos: a }) }
];

function ddl() {
  const sentencias = TABLAS.map(t => {
    const cols = t.cols.map(([n, tipo]) => `${n} ${tipo}`).join(', ');
    return `CREATE TABLE IF NOT EXISTS ${t.nombre} (${cols}, creado timestamptz DEFAULT now(), actualizado timestamptz DEFAULT now(), PRIMARY KEY (${t.clave.join(', ')}))`;
  });
  sentencias.push(`CREATE TABLE IF NOT EXISTS caja_estado (id integer PRIMARY KEY, datos jsonb, actualizado timestamptz DEFAULT now())`);
  sentencias.push(`CREATE TABLE IF NOT EXISTS cierres (id serial PRIMARY KEY, creado timestamptz DEFAULT now(), cajero text, efectivo_esperado numeric, datos jsonb)`);
  return sentencias;
}

function upsertSql(t) {
  const nombres = t.cols.map(c => c[0]);
  const tipos = t.cols.map(([n, tipo]) => `${n} ${tipo}`).join(', ');
  const set = nombres.filter(n => !t.clave.includes(n)).map(n => `${n} = EXCLUDED.${n}`).concat('actualizado = now()').join(', ');
  return `INSERT INTO ${t.nombre} (${nombres.join(', ')}) SELECT ${nombres.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${tipos}) ON CONFLICT (${t.clave.join(', ')}) DO UPDATE SET ${set}`;
}

// Convierte la lista del POS en filas válidas, sin repetidos por clave
function filas(t, lista) {
  const mapa = new Map();
  (Array.isArray(lista) ? lista : []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    const f = t.fila(item);
    if (t.clave.some(k => f[k] === null || f[k] === undefined)) return;
    mapa.set(t.clave.map(k => f[k]).join('|'), f);
  });
  return [...mapa.values()];
}

module.exports = { TABLAS, ddl, upsertSql, filas };

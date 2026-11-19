function ddl() {
  const sentencias = TABLAS.map(t => {
    const cols = t.cols.map(([n, tipo]) => `${n} ${tipo}`).join(', ');
    return `CREATE TABLE IF NOT EXISTS ${t.nombre} (${cols}, creado timestamptz DEFAULT now(), actualizado timestamptz DEFAULT now(), PRIMARY KEY (${t.clave.join(', ')}))`;
  });
  sentencias.push(`CREATE TABLE IF NOT EXISTS caja_estado (id integer PRIMARY KEY, datos jsonb, actualizado timestamptz DEFAULT now())`);
  sentencias.push(`CREATE TABLE IF NOT EXISTS cierres (id serial PRIMARY KEY, creado timestamptz DEFAULT now(), cajero text, efectivo_esperado numeric, datos jsonb)`);

  /* REPARA TABLAS ANTIGUAS */
  sentencias.push(`ALTER TABLE cierres ADD COLUMN IF NOT EXISTS cajero text`);
  sentencias.push(`ALTER TABLE cierres ADD COLUMN IF NOT EXISTS efectivo_esperado numeric`);
  sentencias.push(`ALTER TABLE cierres ADD COLUMN IF NOT EXISTS datos jsonb`);

  return sentencias;
}

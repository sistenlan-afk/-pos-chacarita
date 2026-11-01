LA CHACARITA POS - paquete de mejora

Instalación:
1) Haga respaldo completo de PostgreSQL antes de actualizar.
2) Despliegue index.html, server.js y package.json en el hosting.
3) Configure DATABASE_URL, DATABASE_SSL, JWT_SECRET, ADMIN_USER y ADMIN_PASSWORD.
4) Ejecute npm install y npm start.
5) Ingrese con las credenciales ADMIN_USER / ADMIN_PASSWORD configuradas.
6) Cambie la contraseña desde el menú Mi contraseña.

La primera inicialización crea el usuario administrador solo si no existe.
El servidor usa CREATE TABLE IF NOT EXISTS y ALTER TABLE ADD COLUMN IF NOT EXISTS;
no elimina ni vacía tablas. Aun así, haga copia de seguridad.

Permisos: administrador controla inventario, usuarios, directorios, cierres y reportes.
Vendedor puede registrar ventas y consultar los módulos operativos disponibles.

Escáner: la pistola USB debe comportarse como teclado y enviar Enter al terminar.
Registre en el campo Código del producto exactamente el código de barras impreso.
Luego escanee desde el campo de búsqueda del POS.

Cierre: el resumen se calcula en PostgreSQL a partir de ventas de contado y sus pagos.
Los registros antiguos sin desglose de pagos no permiten reconstruir el medio de pago real.
Solo se permite un cierre por fecha.

Alcance pendiente: esta versión lista apartados y créditos registrados, pero todavía no
implementa la entrega/cancelación de apartados ni el flujo de abonos de créditos.
Pruebe en una copia de producción antes de conectar el backend a la base activa.

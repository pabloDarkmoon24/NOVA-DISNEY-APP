const { Pool } = require('pg');

// APP_DATABASE_URL usa el rol nova_app (sujeto a RLS) — para el runtime del backend.
// DATABASE_URL es el superusuario de Railway — solo para migraciones.
// En desarrollo sin rol separado, ambas pueden apuntar al mismo URL.
const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

// Habilitar SSL para conexiones remotas (Railway, etc.)
const isRemote =
  connectionString &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1');

// Railway PostgreSQL usa certificado autofirmado internamente.
// rejectUnauthorized: false mantiene el cifrado TLS pero omite la validación de CA.
// La conexión sigue siendo cifrada — solo se omite la verificación de la cadena.
const sslConfig = isRemote ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en pool:', err.message);
});

async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');

    // Verificar que el rol NO tenga BYPASSRLS.
    // Si tiene BYPASSRLS (p.ej. superusuario), las políticas RLS son ignoradas
    // y cualquier usuario puede leer datos de otros — fallo silencioso crítico.
    const { rows } = await client.query(
      'SELECT rolbypassrls, current_user AS rol FROM pg_roles WHERE rolname = current_user'
    );
    const { rolbypassrls, rol } = rows[0] || {};

    if (rolbypassrls) {
      const msg =
        `[SEGURIDAD] El rol de DB "${rol}" tiene BYPASSRLS.\n` +
        '  Row Level Security NO está activo: cualquier usuario puede ver datos de otros.\n' +
        '  Solución: configura APP_DATABASE_URL con el rol nova_app (creado por la migración).';

      if (process.env.NODE_ENV === 'production') {
        console.error(`\n❌ ${msg}\n`);
        process.exit(1); // bloquear arranque en producción
      } else {
        console.warn(`\n⚠️  ${msg}\n`);
      }
    } else {
      console.log(`✅ PostgreSQL conectado (rol: ${rol}, RLS activo)`);
    }
  } finally {
    client.release();
  }
}

/**
 * Ejecuta un callback dentro de una transacción con contexto RLS activo.
 *
 * set_config('app.current_user_id', userId, true) equivale a SET LOCAL:
 * la variable se resetea automáticamente al terminar la transacción,
 * lo que evita que el contexto de un usuario filtre a otra request.
 *
 * Todas las políticas RLS usan current_setting('app.current_user_id', true).
 */
async function withUserScope(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ejecuta una query sin contexto RLS.
 * Usar solo para llamadas a funciones SECURITY DEFINER (operaciones de auth).
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, withUserScope, testConnection };

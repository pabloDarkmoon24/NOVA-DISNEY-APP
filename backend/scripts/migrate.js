/**
 * Ejecuta el schema SQL contra la base de datos usando DATABASE_URL (superusuario).
 * Uso: node scripts/migrate.js
 *
 * En Railway: copia el DATABASE_URL del panel y ejecútalo desde la terminal
 * o conéctate con el Railway CLI: railway run node scripts/migrate.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL no está definido en .env');
    process.exit(1);
  }

  const isRemote =
    !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

  const pool = new Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : false,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    console.log('🚀 Ejecutando migración...');
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente');
    console.log('');
    console.log('Próximo paso: actualiza APP_DATABASE_URL en .env con la contraseña del rol nova_app');
    console.log('  postgresql://nova_app:CHANGE_ME@<host>:<port>/<database>');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

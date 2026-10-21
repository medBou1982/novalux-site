import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from '../src/db.js';

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://novalux:novalux@localhost:5432/novalux';

const DROP = `
DROP TABLE IF EXISTS quote_items, quotes, order_items, orders, variants, product_images,
  products, categories, customers, admins, posts, settings CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq, quote_number_seq;
`;

/** Crée la base indiquée dans DATABASE_URL si elle n'existe pas encore. */
async function createDatabase() {
  const url = new URL(DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`Base « ${name} » créée.`);
  } finally {
    await admin.end();
  }
}

function explain(err) {
  const where = (() => { try { const u = new URL(DATABASE_URL); return `${u.hostname}:${u.port || 5432}`; } catch { return DATABASE_URL; } })();
  if (err.code === 'ECONNREFUSED') return `aucun PostgreSQL ne répond sur ${where}. Lancez « docker compose up -d » à la racine du projet, ou démarrez votre PostgreSQL.`;
  if (err.code === '28P01' || err.code === '28000') return `connexion refusée pour cet utilisateur sur ${where}. Vérifiez DATABASE_URL dans server/.env. Si un PostgreSQL installé sur Windows occupe déjà ce port, voir la section « Dépannage » du README.`;
  if (err.code === '42501') return `l'utilisateur de DATABASE_URL n'a pas le droit de créer la base. Créez-la à la main (createdb) ou utilisez un utilisateur administrateur.`;
  return err.message;
}

async function migrate() {
  if (process.argv.includes('--reset')) {
    await pool.query(DROP);
    console.log('Tables supprimées.');
  }
  await pool.query(await readFile(schemaPath, 'utf8'));
  console.log('Schéma appliqué.');
}

try {
  try {
    await migrate();
  } catch (err) {
    if (err.code !== '3D000') throw err; // 3D000 = la base n'existe pas
    await createDatabase();
    await migrate();
  }
} catch (err) {
  console.error('Échec de la migration :', explain(err));
  process.exitCode = 1;
} finally {
  await pool.end();
}

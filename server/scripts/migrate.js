import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));

const DROP = `
DROP TABLE IF EXISTS quote_items, quotes, order_items, orders, variants, product_images,
  products, categories, customers, admins, posts, settings CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq, quote_number_seq;
`;

try {
  if (process.argv.includes('--reset')) {
    await pool.query(DROP);
    console.log('Tables supprimées.');
  }
  await pool.query(await readFile(schemaPath, 'utf8'));
  console.log('Schéma appliqué.');
} catch (err) {
  console.error('Échec de la migration :', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

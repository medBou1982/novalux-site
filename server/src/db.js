import pg from 'pg';
import 'dotenv/config';

// Les colonnes BIGINT (COUNT, SUM) arrivent en texte par défaut : on les convertit en nombre.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://novalux:novalux@localhost:5432/novalux',
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

/** Exécute `fn(client)` dans une transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

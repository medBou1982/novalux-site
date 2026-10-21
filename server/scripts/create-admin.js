// Usage : npm run admin:create -- email@exemple.tn "MotDePasse" "Nom"
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const [email, password, name = 'Administrateur'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage : npm run admin:create -- email motdepasse(8 caractères min.) "Nom"');
  process.exit(1);
}
try {
  await pool.query(
    `INSERT INTO admins (email, password_hash, name) VALUES ($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
    [email.toLowerCase(), await bcrypt.hash(password, 10), name],
  );
  console.log(`Admin ${email} enregistré.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

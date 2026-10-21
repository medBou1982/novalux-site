import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import catalog from './routes/catalog.js';
import shop from './routes/shop.js';
import admin, { UPLOAD_DIR } from './routes/admin.js';
import { pool } from './db.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5175').split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/api', catalog);
app.use('/api', shop);
app.use('/api/admin', admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route d’API inconnue.' }));

// En production, l'API sert aussi le site React compilé (client/dist)
const clientDist = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Gestion centralisée des erreurs
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête mal formée.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image trop lourde (8 Mo maximum).' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Erreur interne du serveur. Réessayez dans un instant.' : err.message,
    details: err.details,
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API Novalux sur http://localhost:${port}`));
